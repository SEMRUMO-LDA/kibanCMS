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
import type { AuthRequest } from '../middleware/auth.js';

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
    // Tenant cache — avoid the per-render DB hit.
    const tenantId = (req as any).tenantId || 'default';
    const cached = cache.get(tenantId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return res.json({ data: cached.data, timestamp: new Date().toISOString() });
    }

    const { data: col } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', 'seo-settings')
      .single();

    if (!col) {
      return res.json({ data: emptyConfig(), timestamp: new Date().toISOString() });
    }

    // Prefer slug "global" (canonical), fall back to first published entry.
    const { data: preferred } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', col.id)
      .eq('slug', 'global')
      .eq('status', 'published')
      .maybeSingle();

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

    if (!entry?.content) {
      const empty = emptyConfig();
      cache.set(tenantId, { data: empty, fetchedAt: Date.now() });
      return res.json({ data: empty, timestamp: new Date().toISOString() });
    }

    const c = entry.content as Record<string, any>;

    // Normalise into a flat shape the frontend can consume directly.
    // Empty strings are returned as undefined so frontends can short-circuit
    // rendering with truthy checks.
    const clean = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

    const data = {
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

    cache.set(tenantId, { data, fetchedAt: Date.now() });

    res.json({ data, timestamp: new Date().toISOString() });
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
    const { data: col } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', 'seo-settings')
      .single();

    let robots = 'User-agent: *\nAllow: /\n';

    if (col) {
      const { data: entry } = await supabase
        .from('entries')
        .select('content')
        .eq('collection_id', col.id)
        .eq('status', 'published')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const c = (entry?.content as Record<string, any>) || {};
      if (typeof c.robots_txt === 'string' && c.robots_txt.trim()) {
        robots = c.robots_txt.trim() + '\n';
      } else if (c.noindex_default === true || c.noindex_default === 'true') {
        robots = 'User-agent: *\nDisallow: /\n';
      }
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(robots);
  } catch (error: any) {
    logger.error('Error generating robots.txt', { error: error.message });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('User-agent: *\nAllow: /\n');
  }
});

export default router;
