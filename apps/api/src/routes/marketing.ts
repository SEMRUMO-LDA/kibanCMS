/**
 * Marketing — dashboard numbers, consent log export, browser-side events.
 *
 *   GET  /api/v1/marketing/overview      (JWT, editor+)  dashboard card
 *   GET  /api/v1/marketing/consents.csv  (JWT, admin)    GDPR proof export
 *   POST /api/v1/marketing/track         (API key)       Contact events from
 *        the widgets script (WhatsApp / phone / email clicks) → Meta CAPI
 */

import { Router, type Request, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { getSingletonContent } from '../lib/sitemap.js';
import { getCapiConfig, getCapiStatus, readTracking, sendCapiEvent } from '../lib/meta-capi.js';
import { requireAdmin, type AuthRequest } from '../middleware/auth.js';

// ── Pure helpers (unit-tested) ───────────────────────────────────────

export type ConsentKind = 'all' | 'rejected' | 'custom';

/** Classifies one consent record by what the visitor chose. */
export function classifyConsent(row: { consent_given: boolean; categories: Record<string, unknown> | null }, offered: string[]): ConsentKind {
  const cats = row.categories || {};
  const optional = offered.filter(c => c !== 'necessary');
  const accepted = optional.filter(c => cats[c] === true);
  if (!row.consent_given || accepted.length === 0) return 'rejected';
  return accepted.length === optional.length ? 'all' : 'custom';
}

const CSV_SAFE = /^[=+\-@\t\r]/;
/** CSV cell: quoted, and neutralised against spreadsheet formula injection. */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  if (CSV_SAFE.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getCookieConfig(): Promise<Record<string, any>> {
  const { data } = await supabase.from('addon_configs').select('config').eq('addon_id', 'cookie-notice').maybeSingle();
  return (data?.config as Record<string, any>) || { enabled: true };
}

function offeredFrom(cfg: Record<string, any>): string[] {
  const t = cfg.cookieTypes || {};
  return ['necessary', ...['analytics', 'marketing', 'preferences'].filter(k => !!t[k])];
}

async function countEntries(slug: string, since: string, dateField: 'created_at' | 'content->>paid_at' = 'created_at'): Promise<number | null> {
  const { data: col } = await supabase.from('collections').select('id').eq('slug', slug).maybeSingle();
  if (!col) return null;
  let q = supabase.from('entries').select('id', { count: 'exact', head: true }).eq('collection_id', col.id).gte(dateField, since);
  q = q.is('deleted_at', null);
  const { count, error } = await q;
  return error ? null : (count ?? 0);
}

// ── Admin routes (mounted behind validateJWT) ────────────────────────

export const marketingAdminRouter: Router = Router();

marketingAdminRouter.get('/overview', async (_req: AuthRequest, res: Response) => {
  try {
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const monthStart = monthStartIso();
    const [cookieCfg, seo, capiCfg] = await Promise.all([getCookieConfig(), getSingletonContent('seo-settings'), getCapiConfig()]);
    const offered = offeredFrom(cookieCfg);

    // Consent choices, last 30 days (latest choice per visitor)
    const { data: rows, error } = await supabase
      .from('addon_cookie_notice_consents')
      .select('visitor_id, consent_given, categories, consent_date')
      .gte('consent_date', since30)
      .order('consent_date', { ascending: false })
      .limit(20000);
    const latest = new Map<string, any>();
    for (const r of rows || []) if (!latest.has(r.visitor_id)) latest.set(r.visitor_id, r);
    const consent = { visitors: latest.size, all: 0, rejected: 0, custom: 0, marketing: 0, analytics: 0 };
    for (const r of latest.values()) {
      consent[classifyConsent(r, offered)]++;
      if (r.categories?.marketing === true) consent.marketing++;
      if (r.categories?.analytics === true) consent.analytics++;
    }

    const [leads, signups, orders] = await Promise.all([
      countEntries('form-submissions', monthStart),
      countEntries('newsletter-subscribers', monthStart),
      countEntries('orders', monthStart, 'content->>paid_at'),
    ]);

    const capi = getCapiStatus();
    const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    res.json({
      data: {
        consent: { ...consent, available: !error, banner: cookieCfg.enabled !== false, offered },
        conversions: { since: monthStart, leads, signups, orders },
        meta: {
          pixelId: capiCfg.pixelId || null,
          pixelAutoload: !(seo.meta_pixel_autoload === false || seo.meta_pixel_autoload === 'false'),
          capiEnabled: capiCfg.enabled,
          capiConfigured: !!(capiCfg.pixelId && capiCfg.accessToken),
          sentSinceRestart: capi.sent,
          skippedNoConsent: capi.skippedNoConsent,
          lastSentAt: capi.lastSentAt || null,
          lastError: capi.lastError || null,
          lastErrorAt: capi.lastErrorAt || null,
        },
        google: {
          analytics: clean(seo.google_analytics) || null,
          ads: clean(seo.google_ads_id) || null,
          tagManager: clean(seo.google_tag_manager) || null,
          autoload: !(seo.google_autoload === false || seo.google_autoload === 'false'),
          consentMode: seo.google_consent_mode === 'advanced' ? 'advanced' : 'basic',
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Marketing overview failed', { error: err.message });
    res.status(500).json({ error: { message: 'Could not load marketing overview', status: 500 } });
  }
});

marketingAdminRouter.get('/consents.csv', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const from = typeof req.query.from === 'string' && !isNaN(Date.parse(req.query.from)) ? new Date(req.query.from).toISOString() : null;
    const to = typeof req.query.to === 'string' && !isNaN(Date.parse(req.query.to)) ? new Date(req.query.to).toISOString() : null;
    const lines = ['date,visitor_id,consent_given,necessary,analytics,marketing,preferences,ip_address,user_agent'];
    const PAGE = 1000;
    for (let offset = 0; offset < 100_000; offset += PAGE) {
      let q = supabase.from('addon_cookie_notice_consents')
        .select('consent_date, visitor_id, consent_given, categories, ip_address, user_agent')
        .order('consent_date', { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (from) q = q.gte('consent_date', from);
      if (to) q = q.lte('consent_date', to);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      for (const r of data || []) {
        const c = (r.categories || {}) as Record<string, unknown>;
        lines.push([r.consent_date, r.visitor_id, r.consent_given, true, c.analytics === true, c.marketing === true, c.preferences === true, r.ip_address, r.user_agent].map(csvCell).join(','));
      }
      if (!data || data.length < PAGE) break;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cookie-consents-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
  } catch (err: any) {
    logger.error('Consent export failed', { error: err.message });
    res.status(500).json({ error: { message: 'Could not export consents', status: 500 } });
  }
});

// ── Public route (mounted behind validateApiKey + rate limit) ────────

const TRACKABLE = new Set(['Contact']);

export async function trackHandler(req: Request, res: Response) {
  const event = String(req.body?.event || '');
  if (!TRACKABLE.has(event)) return res.status(400).json({ error: { message: 'Unsupported event', status: 400 } });
  const tracking = readTracking(req.body);
  if (!tracking.event_id) return res.status(400).json({ error: { message: 'Missing tracking.event_id', status: 400 } });
  const method = String(req.body?.method || '').slice(0, 30);
  // Consent is enforced inside sendCapiEvent (nothing is sent without it)
  sendCapiEvent({
    name: 'Contact',
    eventId: tracking.event_id,
    tracking,
    user: { ip: req.ip, userAgent: (req.get('user-agent') || '').slice(0, 300) || undefined },
    custom: method ? { content_category: method } : undefined,
  }).catch(() => {});
  res.status(202).json({ data: { ok: true }, timestamp: new Date().toISOString() });
}

// ── Retention (called by the scheduled worker) ───────────────────────

/** Deletes consent records older than the configured retention (0 = keep). */
export async function purgeOldConsentsForCurrentTenant(): Promise<number> {
  const cfg = await getCookieConfig();
  let months = Number(cfg.consentRetentionMonths ?? 24);
  if (!Number.isFinite(months) || months <= 0) return 0;
  // Proof must outlive the consent itself (visitors are re-asked after maxAge)
  const maxAge = Number(cfg.consentMaxAgeMonths ?? 12);
  if (Number.isFinite(maxAge) && maxAge > 0) months = Math.max(months, maxAge + 1);
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const { count, error } = await supabase
    .from('addon_cookie_notice_consents')
    .delete({ count: 'exact' })
    .lt('consent_date', cutoff.toISOString());
  if (error) throw new Error(error.message);
  if (count) logger.info('Old cookie consents deleted', { count, months });
  return count || 0;
}
