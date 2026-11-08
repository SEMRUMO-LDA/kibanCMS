/**
 * On-the-fly image optimisation for client sites.
 *
 *   GET /api/v1/img?src=<public storage URL>&w=828&q=75
 *
 * Images used to be served as uploaded (often multi-MB phone photos), the
 * main cause of slow pages. This resizes to the requested width, converts to
 * AVIF/WebP when the browser supports it, and caches:
 *   1. in memory (recent variants)
 *   2. in the tenant's storage: media/_variants/<hash>/<w>-<q>.<fmt>
 * so each variant is generated once, even across deploys.
 *
 * Safety: only images from a configured tenant's PUBLIC storage are fetched
 * (no arbitrary URLs → no SSRF); widths/qualities snap to a fixed set so the
 * number of variants per image is bounded.
 */

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { logger } from './logger.js';
import { LRUCache } from './lru-cache.js';
import { getAllTenants, type TenantConfig } from '../config/tenants.js';
import { getOrCreateClients } from '../middleware/tenant.js';

// Small container: one image at a time, no libvips cache, bounded input.
sharp.concurrency(1);
sharp.cache(false);

/** Same breakpoints next/image uses by default. */
export const ALLOWED_WIDTHS = [64, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];
export const ALLOWED_QUALITIES = [50, 60, 75, 85];
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_INPUT_PIXELS = 60_000_000;

export type OutputFormat = 'avif' | 'webp' | 'jpeg' | 'png';

export function snap(value: number, allowed: number[]): number {
  if (!Number.isFinite(value) || value <= 0) return allowed[allowed.length - 1];
  return allowed.find(a => a >= value) ?? allowed[allowed.length - 1];
}

/** Best format the browser accepts; keeps PNG for PNG sources without modern support. */
export function pickFormat(accept: string | undefined, sourceMime: string): OutputFormat {
  const a = (accept || '').toLowerCase();
  if (a.includes('image/avif')) return 'avif';
  if (a.includes('image/webp')) return 'webp';
  return sourceMime.includes('png') ? 'png' : 'jpeg';
}

export interface ResolvedSource {
  tenant: TenantConfig;
  bucket: string;
  objectPath: string;
  url: string;
}

/**
 * Accepts only `<tenant supabaseUrl>/storage/v1/object/public/<bucket>/<path>`.
 * Returns null for anything else (other hosts, private objects, traversal).
 */
export function resolveSource(src: string, tenants: TenantConfig[] = getAllTenants()): ResolvedSource | null {
  let u: URL;
  try { u = new URL(src); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const tenant = tenants.find(t => {
    try { return new URL(t.supabaseUrl).host === u.host; } catch { return false; }
  });
  if (!tenant) return null;
  const m = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(u.pathname);
  if (!m) return null;
  const bucket = decodeURIComponent(m[1]);
  const objectPath = decodeURIComponent(m[2]);
  if (objectPath.split('/').some(seg => seg === '..' || seg === '')) return null;
  if (objectPath.startsWith('_variants/')) return null; // never re-process variants
  return { tenant, bucket, objectPath, url: `${u.origin}${u.pathname}` };
}

function variantPath(src: ResolvedSource, w: number, q: number, fmt: OutputFormat): string {
  const h = createHash('sha1').update(src.url).digest('hex').slice(0, 20);
  return `_variants/${h}/${w}-${q}.${fmt}`;
}

/** Resize (never enlarge), honour EXIF orientation, encode. */
export async function transformImage(original: Buffer, w: number, q: number, fmt: OutputFormat): Promise<Buffer> {
  let pipeline = sharp(original, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .rotate() // respect EXIF orientation from phones
    .resize({ width: w, withoutEnlargement: true });
  pipeline =
    fmt === 'avif' ? pipeline.avif({ quality: Math.max(30, q - 20), effort: 3 }) :
    fmt === 'webp' ? pipeline.webp({ quality: q }) :
    fmt === 'png' ? pipeline.png({ compressionLevel: 9, palette: true }) :
    pipeline.jpeg({ quality: q, mozjpeg: true });
  return pipeline.toBuffer();
}

const memory = new LRUCache<{ body: Buffer; type: string }>({ maxSize: 150, ttlMs: 6 * 60 * 60 * 1000 });

export interface OptimizedImage {
  body: Buffer;
  contentType: string;
  /** 'memory' | 'storage' | 'generated' — exposed as a response header for debugging */
  source: string;
}

export class ImageError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function getOptimizedImage(
  srcParam: string,
  widthParam: number,
  qualityParam: number,
  accept: string | undefined,
): Promise<OptimizedImage | { redirect: string }> {
  const src = resolveSource(srcParam);
  if (!src) throw new ImageError(400, 'src must be a public image URL from this CMS storage');

  const w = snap(widthParam, ALLOWED_WIDTHS);
  const q = snap(qualityParam || 75, ALLOWED_QUALITIES);

  // Guess the source type from the extension to pick the format before fetching
  const ext = (src.objectPath.split('.').pop() || '').toLowerCase();
  if (ext === 'svg' || ext === 'gif') return { redirect: src.url }; // vectors / animations: serve as-is
  const sourceMime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const fmt = pickFormat(accept, sourceMime);
  const vPath = variantPath(src, w, q, fmt);
  const memKey = `${src.tenant.id}:${src.bucket}:${vPath}`;
  const contentType = `image/${fmt}`;

  const cached = memory.get(memKey);
  if (cached) return { body: cached.body, contentType: cached.type, source: 'memory' };

  const { supabaseAdmin } = getOrCreateClients(src.tenant);

  // Tier 2: previously generated variant in storage
  try {
    const { data } = await supabaseAdmin.storage.from(src.bucket).download(vPath);
    if (data) {
      const body = Buffer.from(await data.arrayBuffer());
      memory.set(memKey, { body, type: contentType });
      return { body, contentType, source: 'storage' };
    }
  } catch { /* not generated yet */ }

  // Tier 3: generate from the original
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let original: Buffer;
  try {
    const res = await fetch(src.url, { signal: controller.signal });
    if (!res.ok) throw new ImageError(res.status === 404 ? 404 : 502, `Original image not available (${res.status})`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_SOURCE_BYTES) throw new ImageError(413, 'Original image too large');
    original = Buffer.from(await res.arrayBuffer());
    if (original.length > MAX_SOURCE_BYTES) throw new ImageError(413, 'Original image too large');
  } finally {
    clearTimeout(timer);
  }

  let body: Buffer;
  try {
    body = await transformImage(original, w, q, fmt);
  } catch (err: any) {
    throw new ImageError(422, `Could not process image: ${err?.message || 'unknown error'}`);
  }

  memory.set(memKey, { body, type: contentType });
  // Persist for next time (don't delay the response)
  supabaseAdmin.storage.from(src.bucket)
    .upload(vPath, body, { contentType, upsert: true, cacheControl: '31536000' })
    .then(({ error }) => { if (error) logger.warn('Image variant not stored', { path: vPath, error: error.message }); })
    .catch(() => {});

  return { body, contentType, source: 'generated' };
}
