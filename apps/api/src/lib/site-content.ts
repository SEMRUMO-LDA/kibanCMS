/**
 * Site content — texts and images captured on the live site ("Editar no site"
 * → Capturar). This is what the widgets loader needs to swap the current
 * values into the page for every visitor. Read-only: captures are created by
 * routes/inline-edit.ts, edited like any entry.
 *
 * Kill switch: "Edição no site" = Desligado (site-settings.inline_editing)
 * also stops the swaps, so the site is exactly as it was built.
 */

import { supabase } from './supabase.js';
import { getSingletonContent } from './sitemap.js';
import { hasSoftDelete } from './soft-delete.js';
import { parseMode, normalizePagePath, SITE_CONTENT_SLUG, MAX_SITE_CONTENT_PER_PAGE, ALL_PAGES } from './inline-edit.js';
import { cacheGet, cacheSet, cacheDelete } from './ttl-cache.js';

export interface SiteContentItem {
  id: string;
  slug: string;
  kind: 'text' | 'image';
  /** '*' = site-wide capture (header, footer…): the loader swaps every occurrence. */
  page: string;
  /** CSS path recorded at capture time; the loader falls back to the original text when it no longer matches. */
  selector: string;
  original: string;
  value: string;
}

// Read on every visitor page view: cached per tenant for a minute (a capture,
// an approved edit or a live save clears it; the kill switch takes ≤ 60 s).
const CACHE_TTL_MS = 60_000;
const META_KEY = 'site-content:meta';
const PAGE_KEY = 'site-content:page:';

export function invalidateSiteContentCache(): void {
  cacheDelete('site-content:');
}

/** Feature switch + collection id, one cached lookup. */
async function meta(): Promise<{ on: boolean; colId: string | null }> {
  const hit = cacheGet<{ on: boolean; colId: string | null }>(META_KEY);
  if (hit) return hit;
  const site = await getSingletonContent('site-settings');
  const on = parseMode(site.inline_editing) !== 'off';
  let colId: string | null = null;
  if (on) {
    const { data } = await supabase.from('collections').select('id').eq('slug', SITE_CONTENT_SLUG).maybeSingle();
    colId = data?.id || null;
  }
  return cacheSet(META_KEY, { on, colId }, CACHE_TTL_MS);
}

function imageUrl(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof (v as any).url === 'string') return (v as any).url;
  return '';
}

/** For the bootstrap: whether the loader should ask for this page's content at all. */
export async function siteContentEnabled(): Promise<boolean> {
  const { on, colId } = await meta();
  if (!on || !colId) return false;
  const hit = cacheGet<boolean>('site-content:enabled');
  if (hit !== undefined) return hit;
  let q = supabase.from('entries').select('id', { count: 'exact', head: true }).eq('collection_id', colId).eq('status', 'published');
  if (await hasSoftDelete()) q = q.is('deleted_at', null);
  const { count } = await q;
  return cacheSet('site-content:enabled', (count || 0) > 0, CACHE_TTL_MS);
}

/** Published captures of one page, ready for the loader. */
export async function siteContentForPage(rawPath: unknown): Promise<{ path: string; items: SiteContentItem[] }> {
  const path = normalizePagePath(rawPath);
  const { on, colId } = await meta();
  if (!on || !colId) return { path, items: [] };
  const cached = cacheGet<{ path: string; items: SiteContentItem[] }>(PAGE_KEY + path);
  if (cached) return cached;
  const softDelete = await hasSoftDelete();
  // This page's captures, then the site-wide ones (header, footer…)
  const rows: any[] = [];
  for (const page of [path, ALL_PAGES]) {
    let q = supabase.from('entries').select('id, slug, content').eq('collection_id', colId).eq('status', 'published')
      .eq('content->>page', page).order('created_at', { ascending: true }).limit(MAX_SITE_CONTENT_PER_PAGE);
    if (softDelete) q = q.is('deleted_at', null);
    const { data } = await q;
    rows.push(...((data || []) as any[]));
  }
  const items: SiteContentItem[] = [];
  for (const row of rows) {
    const c = row.content || {};
    const kind: 'text' | 'image' = c.kind === 'image' ? 'image' : 'text';
    const value = kind === 'image' ? imageUrl(c.image) : String(c.text ?? '');
    const original = String(c.original ?? '');
    if (!original || !value) continue;
    items.push({ id: row.id, slug: row.slug, kind, page: String(c.page || path), selector: String(c.selector || ''), original, value });
  }
  return cacheSet(PAGE_KEY + path, { path, items }, CACHE_TTL_MS);
}
