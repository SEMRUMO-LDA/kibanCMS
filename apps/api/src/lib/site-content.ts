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

export interface SiteContentItem {
  id: string;
  slug: string;
  kind: 'text' | 'image';
  /** CSS path recorded at capture time; the loader falls back to the original text when it no longer matches. */
  selector: string;
  original: string;
  value: string;
}

async function siteContentCollectionId(): Promise<string | null> {
  const { data } = await supabase.from('collections').select('id').eq('slug', SITE_CONTENT_SLUG).maybeSingle();
  return data?.id || null;
}

async function featureOn(): Promise<boolean> {
  const site = await getSingletonContent('site-settings');
  return parseMode(site.inline_editing) !== 'off';
}

function imageUrl(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof (v as any).url === 'string') return (v as any).url;
  return '';
}

/** For the bootstrap: whether the loader should ask for this page's content at all. */
export async function siteContentEnabled(): Promise<boolean> {
  if (!(await featureOn())) return false;
  const colId = await siteContentCollectionId();
  if (!colId) return false;
  let q = supabase.from('entries').select('id', { count: 'exact', head: true }).eq('collection_id', colId).eq('status', 'published');
  if (await hasSoftDelete()) q = q.is('deleted_at', null);
  const { count } = await q;
  return (count || 0) > 0;
}

/** Published captures of one page, ready for the loader. */
export async function siteContentForPage(rawPath: unknown): Promise<{ path: string; items: SiteContentItem[] }> {
  const path = normalizePagePath(rawPath);
  if (!(await featureOn())) return { path, items: [] };
  const colId = await siteContentCollectionId();
  if (!colId) return { path, items: [] };
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
    items.push({ id: row.id, slug: row.slug, kind, selector: String(c.selector || ''), original, value });
  }
  return { path, items };
}
