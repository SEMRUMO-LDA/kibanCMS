/**
 * SEO Routes — exposes the SEO & Analytics add-on settings to public frontends.
 *
 * The add-on creates a `seo-settings` collection with one entry. Frontends
 * fetch this endpoint once on render to inject meta tags, social cards,
 * analytics scripts, structured data, and custom head/body HTML.
 *
 * Auth: validateAny (JWT + API key). Frontends use API key.
 */

import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { withFallbackCache } from '../lib/redis.js';
import type { AuthRequest } from '../middleware/auth.js';
import { tenantStore } from '../middleware/tenant.js';
import { buildSitemap, toSitemapXml, SitemapConfigError, getSingletonContent, normalizeSiteUrl, type SitemapUrl } from '../lib/sitemap.js';
import { buildRobotsTxt, normalizePolicy } from '../lib/ai-crawlers.js';
import { getSiteContext, organizationJsonLd, websiteJsonLd, buildLlmsTxt } from '../lib/structured-data.js';

const router: Router = Router();

// 60-second per-tenant cache so high-traffic frontends don't hammer the DB
// for the same SEO settings on every page render.
const cache = new Map<string, { data: any; fetchedAt: number }>();
const CACHE_TTL = 60_000;

function emptyConfig() {
  return {
    enabled: false,
    meta: {},
    og: {},
    twitter: {},
    analytics: {},
    indexing: {},
    verifications: {},
    structured_data: '',
    custom_head_code: '',
    custom_body_code: '',
  };
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    // req.tenantId is never set — resolve from the request's tenant context,
    // otherwise every tenant shares one cache slot and gets another site's SEO.
    const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
    const cached = cache.get(tenantId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return res.json({ data: cached.data, timestamp: new Date().toISOString() });
    }

    const { data: seoData, fromCache: fromRedis } = await withFallbackCache(`seo:settings`, async () => {
      const { data: col, error: colErr } = await supabase
        .from('collections')
        .select('id')
        .eq('slug', 'seo-settings')
        .maybeSingle();

      // supabase-js returns errors instead of throwing: rethrow so an outage
      // falls back to the Redis snapshot instead of overwriting it with an
      // empty config.
      if (colErr) throw colErr;
      if (!col) return emptyConfig();

      // Prefer slug "global" (canonical), fall back to first published entry.
      const { data: preferred, error: prefErr } = await supabase
        .from('entries')
        .select('content')
        .eq('collection_id', col.id)
        .eq('slug', 'global')
        .eq('status', 'published')
        .maybeSingle();
      if (prefErr) throw prefErr;

      let entry = preferred;
      if (!entry?.content) {
        const { data: fallback } = await supabase
          .from('entries')
          .select('content')
          .eq('collection_id', col.id)
          .eq('status', 'published')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        entry = fallback;
      }

      if (!entry?.content) return emptyConfig();

      const c = entry.content as Record<string, any>;
      const clean = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

      return {
        enabled: true,
        meta: {
          title: clean(c.meta_title),
          description: clean(c.meta_description),
          favicon_url: clean(c.favicon_url),
          canonical_url: clean(c.canonical_url),
        },
        og: {
          title: clean(c.og_title),
          description: clean(c.og_description),
          image: clean(c.og_image),
          type: clean(c.og_type),
        },
        twitter: {
          card: clean(c.twitter_card),
          handle: clean(c.twitter_handle),
        },
        analytics: {
          google_analytics: clean(c.google_analytics),
          google_tag_manager: clean(c.google_tag_manager),
          facebook_pixel: clean(c.facebook_pixel),
        },
        indexing: {
          robots_txt: clean(c.robots_txt),
          noindex_default: c.noindex_default === true || c.noindex_default === 'true',
          sitemap_url: clean(c.sitemap_url),
          hreflang: clean(c.hreflang),
        },
        verifications: {
          google: clean(c.google_site_verification),
          bing: clean(c.bing_site_verification),
          pinterest: clean(c.pinterest_verification),
        },
        structured_data: clean(c.structured_data) || '',
        custom_head_code: clean(c.custom_head_code) || '',
        custom_body_code: clean(c.custom_body_code) || '',
      };
    });

    cache.set(tenantId, { data: seoData, fetchedAt: Date.now() });

    res.json({ data: seoData, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error fetching SEO settings', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch SEO settings', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /api/v1/seo/robots.txt — Plain-text robots.txt for search engines.
// Public, no auth.
// ============================================

router.get('/robots.txt', async (_req: AuthRequest, res: Response) => {
  try {
    const seo = await getSingletonContent('seo-settings');
    const site = await getSingletonContent('site-settings');

    let base = 'User-agent: *\nAllow: /';
    if (typeof seo.robots_txt === 'string' && seo.robots_txt.trim()) {
      base = seo.robots_txt.trim();
    } else if (seo.noindex_default === true || seo.noindex_default === 'true') {
      base = 'User-agent: *\nDisallow: /';
    }

    const siteUrl = normalizeSiteUrl(String(site.site_url || ''));
    const sitemapUrl = String(seo.sitemap_url || '').trim() || (/^https?:\/\//.test(siteUrl) ? `${siteUrl}/sitemap.xml` : '');

    const robots = buildRobotsTxt({
      base,
      // Settings → AI & Performance
      search: normalizePolicy(site.ai_search_bots),
      training: normalizePolicy(site.ai_training_bots),
      sitemapUrl,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(robots);
  } catch (error: any) {
    logger.error('Error generating robots.txt', { error: error.message });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('User-agent: *\nAllow: /\n');
  }
});

// ============================================
// GET /api/v1/seo/sitemap.xml  — XML sitemap
// GET /api/v1/seo/sitemap      — same URLs as JSON (e.g. Next.js app/sitemap.ts)
// API key or JWT. The site serves it from its own domain (/sitemap.xml),
// fetching it server-side with its key + X-Tenant header.
// ============================================

const sitemapCache = new Map<string, { urls: SitemapUrl[]; fetchedAt: number }>();
const SITEMAP_TTL = 10 * 60 * 1000;

async function getSitemap(): Promise<SitemapUrl[]> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
  const cached = sitemapCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < SITEMAP_TTL) return cached.urls;
  const urls = await buildSitemap();
  sitemapCache.set(tenantId, { urls, fetchedAt: Date.now() });
  return urls;
}

function sitemapError(res: Response, error: any) {
  if (error instanceof SitemapConfigError) {
    return res.status(400).json({ error: { message: error.message, status: 400, timestamp: new Date().toISOString() } });
  }
  logger.error('Error generating sitemap', { error: error?.message });
  return res.status(500).json({ error: { message: 'Failed to generate sitemap', status: 500, timestamp: new Date().toISOString() } });
}

router.get('/sitemap.xml', async (_req: AuthRequest, res: Response) => {
  try {
    const urls = await getSitemap();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.send(toSitemapXml(urls));
  } catch (error: any) {
    sitemapError(res, error);
  }
});

router.get('/sitemap', async (_req: AuthRequest, res: Response) => {
  try {
    const urls = await getSitemap();
    res.json({ data: urls, meta: { total: urls.length }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sitemapError(res, error);
  }
});

// ============================================
// GET /api/v1/seo/jsonld — site-wide JSON-LD (business + website)
// Render once in the site layout: <script type="application/ld+json">
// Entry-level JSON-LD: GET /api/v1/entries/:collection/:slug?jsonld=1 → meta.jsonld
// ============================================
router.get('/jsonld', async (_req: AuthRequest, res: Response) => {
  try {
    const ctx = await getSiteContext();
    const graph: any[] = [organizationJsonLd(ctx), websiteJsonLd(ctx)];
    // Hand-written JSON-LD in SEO settings is kept as an extra node
    const custom = typeof ctx.seo.structured_data === 'string' ? ctx.seo.structured_data.trim() : '';
    if (custom) {
      try { graph.push(JSON.parse(custom)); } catch { /* invalid JSON in settings — ignored */ }
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ data: graph, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error building JSON-LD', { error: error?.message });
    res.status(500).json({ error: { message: 'Failed to build structured data', status: 500, timestamp: new Date().toISOString() } });
  }
});

// ============================================
// GET /api/v1/seo/llms.txt — summary of the site for AI assistants
// (llmstxt.org format). The site serves it at /llms.txt.
// ============================================
const llmsCache = new Map<string, { text: string; at: number }>();

router.get('/llms.txt', async (_req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
    const hit = llmsCache.get(tenantId);
    const text = hit && Date.now() - hit.at < SITEMAP_TTL ? hit.text : await buildLlmsTxt();
    if (!hit || hit.text !== text) llmsCache.set(tenantId, { text, at: Date.now() });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.send(text);
  } catch (error: any) {
    const msg = error?.message || '';
    if (/site URL/.test(msg)) return res.status(400).json({ error: { message: msg, status: 400, timestamp: new Date().toISOString() } });
    logger.error('Error building llms.txt', { error: msg });
    res.status(500).json({ error: { message: 'Failed to build llms.txt', status: 500, timestamp: new Date().toISOString() } });
  }
});

export default router;
