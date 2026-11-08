/**
 * Image optimiser — real image processing with sharp, no network or storage.
 * Run with: node --import tsx --test src/__tests__/image-optimizer.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { snap, pickFormat, resolveSource, transformImage, ALLOWED_WIDTHS, ALLOWED_QUALITIES } from '../lib/image-optimizer.js';
import type { TenantConfig } from '../config/tenants.js';

const tenants: TenantConfig[] = [
  { id: 'marsolve', supabaseUrl: 'https://safikotytlxgcxcdshgb.supabase.co', supabaseAnonKey: 'a', supabaseServiceKey: 's', hostnames: [], origins: [] },
];
const PUBLIC = 'https://safikotytlxgcxcdshgb.supabase.co/storage/v1/object/public/media';

describe('snap', () => {
  it('rounds up to the next allowed value and caps at the largest', () => {
    assert.equal(snap(800, ALLOWED_WIDTHS), 828);
    assert.equal(snap(828, ALLOWED_WIDTHS), 828);
    assert.equal(snap(99999, ALLOWED_WIDTHS), 3840);
    assert.equal(snap(70, ALLOWED_QUALITIES), 75);
    assert.equal(snap(NaN, ALLOWED_QUALITIES), 85);
  });
});

describe('pickFormat', () => {
  it('prefers AVIF, then WebP, then the source family', () => {
    assert.equal(pickFormat('image/avif,image/webp,*/*', 'image/jpeg'), 'avif');
    assert.equal(pickFormat('image/webp,*/*', 'image/jpeg'), 'webp');
    assert.equal(pickFormat('*/*', 'image/png'), 'png');
    assert.equal(pickFormat(undefined, 'image/jpeg'), 'jpeg');
  });
});

describe('resolveSource (no SSRF)', () => {
  it('accepts public objects from a configured tenant', () => {
    const r = resolveSource(`${PUBLIC}/uploads/barco%201.jpg`, tenants);
    assert.equal(r?.tenant.id, 'marsolve');
    assert.equal(r?.bucket, 'media');
    assert.equal(r?.objectPath, 'uploads/barco 1.jpg');
  });

  it('rejects other hosts, private objects, traversal, http and variants', () => {
    assert.equal(resolveSource('https://evil.example/storage/v1/object/public/media/x.jpg', tenants), null);
    assert.equal(resolveSource('https://safikotytlxgcxcdshgb.supabase.co/storage/v1/object/sign/media/x.jpg', tenants), null);
    assert.equal(resolveSource(`${PUBLIC}/a/../../secret.jpg`, tenants), null);
    assert.equal(resolveSource(PUBLIC.replace('https', 'http') + '/x.jpg', tenants), null);
    assert.equal(resolveSource(`${PUBLIC}/_variants/abc/828-75.webp`, tenants), null);
    assert.equal(resolveSource('not a url', tenants), null);
  });
});

describe('transformImage', () => {
  const photo = () => sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#0891b2' } }).jpeg({ quality: 95 }).toBuffer();

  it('resizes to the requested width and converts to WebP/AVIF', async () => {
    const original = await photo();
    for (const fmt of ['webp', 'avif'] as const) {
      const out = await transformImage(original, 828, 75, fmt);
      const meta = await sharp(out).metadata();
      assert.equal(meta.width, 828);
      assert.equal(meta.height, 552);
      assert.equal(meta.format, fmt === 'avif' ? 'heif' : 'webp');
      assert.ok(out.length < original.length, `${fmt} should be smaller`);
    }
  });

  it('never enlarges small images', async () => {
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#fff' } }).png().toBuffer();
    const out = await transformImage(small, 1920, 75, 'webp');
    assert.equal((await sharp(out).metadata()).width, 300);
  });

  it('applies EXIF orientation (phone photos)', async () => {
    // Orientation 6 = rotated 90°: a 400x200 landscape must come out as portrait
    const rotated = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#000' } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await transformImage(rotated, 3840, 75, 'jpeg');
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 200);
    assert.equal(meta.height, 400);
  });
});
