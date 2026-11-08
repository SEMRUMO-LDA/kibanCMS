/**
 * Sitemap generation for the SEO add-on.
 *
 * URLs are built from Settings → General (site_url) and Settings → Permalinks
 * (entry_url_pattern, default "/{collection}/{slug}"; collection_url_pattern,
 * default "/{slug}"). Only published entries of public collections are
 * included; entries marked noindex are skipped.
 */

import { supabase } from './supabase.js';
import { PRIVATE_COLLECTIONS } from '../routes/entries.js';

/** Config/system collections that never have public pages. */
export const NON_PAGE_COLLECTIONS = new Set([
  'site-settings', 'seo-settings', 'redirects', 'whatsapp-widget',
  'i18n-config', 'i18n-translations', 'forms-config', 'post-tour-reviews',
  'addons-config',
]);

export const MAX_SITEMAP_URLS = 50_000;

export interface SitemapUrl {
  url: string;
  lastModified: string;
  collection: string;
}

export function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.trim().replace(/\/+$/, '');
}

/** Applies a permalink pattern. Unknown placeholders are left out. */
export function applyPattern(pattern: string, vars: Record<string, string>): string {
  const path = (pattern || '/{collection}/{slug}')
    .replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(vars[key] ?? ''))
    .replace(/\/{2,}/g, '/');
  return path.startsWith('/') ? path : `/${path}`;
}

export function isNoindex(entry: { content?: any; meta?: any }): boolean {
  const truthy = (v: unknown) => v === true || v === 'true';
  return truthy(entry.content?.noindex) || truthy(entry.meta?.noindex) || truthy(entry.meta?.seo?.noindex);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function toSitemapXml(urls: SitemapUrl[]): string {
  const body = urls
    .map(u => `  <url><loc>${escapeXml(u.url)}</loc><lastmod>${u.lastModified.slice(0, 10)}</lastmod></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function getSingleton(collectionSlug: string): Promise<Record<string, any>> {
  const { data: col } = await supabase.from('collections').select('id').eq('slug', collectionSlug).maybeSingle();
  if (!col) return {};
  const { data } = await supabase
    .from('entries')
    .select('content, slug')
    .eq('collection_id', col.id)
    .order('created_at', { ascending: true })
    .limit(5);
  const rows = (data || []) as Array<{ content: any; slug: string }>;
  const global = rows.find(r => r.slug === 'global') || rows[0];
  return (global?.content as Record<string, any>) || {};
}

export class SitemapConfigError extends Error {}

/** Builds the sitemap for the current tenant (uses the tenant-scoped supabase client). */
export async function buildSitemap(): Promise<SitemapUrl[]> {
  const site = await getSingleton('site-settings');
  const seo = await getSingleton('seo-settings');

  const siteUrl = normalizeSiteUrl(String(site.site_url || ''));
  if (!/^https?:\/\//.test(siteUrl)) {
    throw new SitemapConfigError('Set the site URL in Settings → General (e.g. https://www.example.com) to generate the sitemap.');
  }
  const entryPattern = String(site.entry_url_pattern || '/{collection}/{slug}');
  const collectionPattern = String(site.collection_url_pattern || '/{slug}');

  // Optional allow-list in SEO settings: "blog, tours, pages"
  const allow = String(seo.sitemap_collections || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  const { data: collections, error: colErr } = await supabase
    .from('collections')
    .select('id, slug, updated_at');
  if (colErr) throw colErr;

  const pageCollections = (collections || []).filter(c =>
    allow.length
      ? allow.includes(c.slug) && !PRIVATE_COLLECTIONS.has(c.slug)
      : !PRIVATE_COLLECTIONS.has(c.slug) && !NON_PAGE_COLLECTIONS.has(c.slug),
  );

  const urls: SitemapUrl[] = [{ url: `${siteUrl}/`, lastModified: new Date().toISOString(), collection: '' }];

  for (const col of pageCollections) {
    if (urls.length >= MAX_SITEMAP_URLS) break;

    const select = () => supabase
      .from('entries')
      .select('slug, updated_at, content, meta')
      .eq('collection_id', col.id)
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(MAX_SITEMAP_URLS - urls.length);

    let { data: entries, error } = await select().is('deleted_at', null);
    if (error?.code === '42703') ({ data: entries, error } = await select()); // tenant without Trash (migration 004)
    if (error) throw error;
    if (!entries?.length) continue;

    urls.push({
      url: siteUrl + applyPattern(collectionPattern, { slug: col.slug, collection: col.slug }),
      lastModified: entries[0].updated_at || col.updated_at,
      collection: col.slug,
    });
    for (const e of entries) {
      if (isNoindex(e)) continue;
      urls.push({
        url: siteUrl + applyPattern(entryPattern, { collection: col.slug, slug: e.slug }),
        lastModified: e.updated_at,
        collection: col.slug,
      });
    }
  }

  return urls.slice(0, MAX_SITEMAP_URLS);
}
