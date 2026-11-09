/**
 * Meta Conversions API (server-side events) — SEO add-on.
 *
 * Sends Lead (forms), CompleteRegistration (newsletter) and Purchase (paid
 * Stripe checkouts) to Meta from the server, so conversions blocked in the
 * browser still count. Deduplicated with the Pixel through event_id.
 *
 * GDPR: by default an event is sent ONLY when the request says the visitor
 * gave MARKETING consent (tracking.marketing_consent === true, e.g. from
 * KibanCookieNotice.hasConsentFor('marketing')). No consent → nothing leaves
 * the server. A client with another legal basis can set consent mode to
 * "always" in the SEO settings (their responsibility). Personal data is
 * SHA-256 hashed as Meta requires; the access token is never exposed.
 *
 * Settings (seo-settings): facebook_pixel, meta_capi_enabled,
 * meta_capi_access_token, meta_capi_test_event_code, meta_capi_consent_mode.
 */

import { createHash } from 'node:crypto';
import { logger } from './logger.js';
import { tenantStore } from '../middleware/tenant.js';
import { getSingletonContent } from './sitemap.js';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

export type CapiEventName = 'Lead' | 'CompleteRegistration' | 'Purchase' | 'Contact' | 'Schedule';

export interface CapiConfig {
  enabled: boolean;
  pixelId: string;
  accessToken: string;
  testEventCode: string;
  consentMode: 'required' | 'always';
}

/** What the site sends with a conversion (body.tracking). All optional. */
export interface Tracking {
  marketing_consent?: boolean;
  event_id?: string;
  fbp?: string;
  fbc?: string;
  source_url?: string;
}

export interface CapiUser {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string;
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
}

// ── Pure helpers (unit-tested) ───────────────────────────────────────

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Meta normalisation: emails/names trimmed + lowercase; phone digits only. */
export function hashEmail(email?: string): string | undefined {
  const v = (email || '').trim().toLowerCase();
  return v && v.includes('@') ? sha256(v) : undefined;
}
export function hashPhone(phone?: string): string | undefined {
  const digits = (phone || '').replace(/\D/g, '').replace(/^00/, '');
  return digits.length >= 7 ? sha256(digits) : undefined;
}
export function hashName(name?: string): string | undefined {
  const v = (name || '').trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

/** Reads body.tracking (or legacy top-level fields) defensively. */
export function readTracking(body: any): Tracking {
  const t = (body && typeof body.tracking === 'object' && body.tracking) || {};
  const pick = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  return {
    marketing_consent: t.marketing_consent === true || body?.marketing_consent === true,
    event_id: pick(t.event_id, 100),
    fbp: pick(t.fbp, 200),
    fbc: pick(t.fbc, 400),
    source_url: pick(t.source_url ?? body?.source_url, 500),
  };
}

/** GDPR gate: required mode needs explicit marketing consent. */
export function shouldSend(cfg: CapiConfig | null, consent: boolean | undefined): { send: boolean; reason?: string } {
  if (!cfg || !cfg.enabled) return { send: false, reason: 'disabled' };
  if (!cfg.pixelId || !cfg.accessToken) return { send: false, reason: 'not_configured' };
  if (cfg.consentMode !== 'always' && consent !== true) return { send: false, reason: 'no_marketing_consent' };
  return { send: true };
}

export function buildEvent(opts: {
  name: CapiEventName;
  eventId: string;
  sourceUrl?: string;
  user: CapiUser;
  custom?: Record<string, unknown>;
  time?: Date;
}): Record<string, any> {
  const u = opts.user;
  const userData: Record<string, unknown> = {};
  const em = hashEmail(u.email); if (em) userData.em = [em];
  const ph = hashPhone(u.phone); if (ph) userData.ph = [ph];
  const fn = hashName(u.firstName); if (fn) userData.fn = [fn];
  const ln = hashName(u.lastName); if (ln) userData.ln = [ln];
  if (u.externalId) userData.external_id = [sha256(u.externalId)];
  if (u.ip) userData.client_ip_address = u.ip;
  if (u.userAgent) userData.client_user_agent = u.userAgent;
  if (u.fbp) userData.fbp = u.fbp;
  if (u.fbc) userData.fbc = u.fbc;

  const event: Record<string, any> = {
    event_name: opts.name,
    event_time: Math.floor((opts.time || new Date()).getTime() / 1000),
    event_id: opts.eventId,
    action_source: 'website',
    user_data: userData,
  };
  if (opts.sourceUrl) event.event_source_url = opts.sourceUrl;
  if (opts.custom && Object.keys(opts.custom).length) event.custom_data = opts.custom;
  return event;
}

/** Splits "Ana Maria Silva" → first "Ana", last "Silva". */
export function splitName(full?: string): { firstName?: string; lastName?: string } {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { firstName: parts[0], lastName: parts.length > 1 ? parts[parts.length - 1] : undefined };
}

// ── Config + status (per tenant) ───────────────────────────────────────

const cfgCache = new Map<string, { cfg: CapiConfig; at: number }>();

export async function getCapiConfig(): Promise<CapiConfig> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
  const hit = cfgCache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit.cfg;
  const c = await getSingletonContent('seo-settings');
  const cfg: CapiConfig = {
    enabled: c.meta_capi_enabled === true || c.meta_capi_enabled === 'true',
    pixelId: String(c.facebook_pixel || '').replace(/\D/g, ''),
    accessToken: String(c.meta_capi_access_token || '').trim(),
    testEventCode: String(c.meta_capi_test_event_code || '').trim(),
    consentMode: c.meta_capi_consent_mode === 'always' ? 'always' : 'required',
  };
  cfgCache.set(tenantId, { cfg, at: Date.now() });
  return cfg;
}

export interface CapiStatus {
  lastSentAt?: string;
  lastEvent?: string;
  lastError?: string;
  lastErrorAt?: string;
  sent: number;
  skippedNoConsent: number;
}
const status = new Map<string, CapiStatus>();
function st(): CapiStatus {
  const id = tenantStore.getStore()?.tenant?.id || 'default';
  let s = status.get(id);
  if (!s) { s = { sent: 0, skippedNoConsent: 0 }; status.set(id, s); }
  return s;
}
/** For Settings → Health (since the last restart). */
export function getCapiStatus(): CapiStatus {
  return { ...st() };
}

// ── Sending ────────────────────────────────────────────────────────────

/**
 * Sends one event if config + consent allow it. Never throws and never
 * delays the caller's response (call without await, or await safely).
 */
export async function sendCapiEvent(opts: {
  name: CapiEventName;
  eventId: string;
  tracking: Tracking;
  user: CapiUser;
  custom?: Record<string, unknown>;
}): Promise<'sent' | 'skipped' | 'error'> {
  try {
    const cfg = await getCapiConfig();
    const gate = shouldSend(cfg, opts.tracking.marketing_consent);
    if (!gate.send) {
      if (gate.reason === 'no_marketing_consent') st().skippedNoConsent++;
      return 'skipped';
    }
    const event = buildEvent({
      name: opts.name,
      eventId: opts.tracking.event_id || opts.eventId,
      sourceUrl: opts.tracking.source_url,
      user: { ...opts.user, fbp: opts.tracking.fbp, fbc: opts.tracking.fbc },
      custom: opts.custom,
    });
    const body: Record<string, unknown> = { data: [event] };
    if (cfg.testEventCode) body.test_event_code = cfg.testEventCode;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.accessToken)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal },
    ).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      const s = st(); s.lastError = `${res.status} ${text}`; s.lastErrorAt = new Date().toISOString();
      logger.warn('Meta CAPI event rejected', { event: opts.name, status: res.status, error: text });
      return 'error';
    }
    const s = st(); s.sent++; s.lastSentAt = new Date().toISOString(); s.lastEvent = opts.name;
    return 'sent';
  } catch (err: any) {
    const s = st(); s.lastError = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'unknown error'); s.lastErrorAt = new Date().toISOString();
    logger.warn('Meta CAPI event failed', { event: opts.name, error: s.lastError });
    return 'error';
  }
}

// ── Purchases: tracking captured at checkout, used by the Stripe webhook ──

export interface StoredTracking extends Tracking { ip?: string; ua?: string }

/**
 * What to keep with an order/booking for the later Purchase event. Stored
 * only when it may actually be used (consent given, or consent mode
 * "always") — data minimisation: no IP/user agent kept otherwise.
 */
export async function trackingToStore(req: { ip?: string; get?: (h: string) => string | undefined }, body: any): Promise<StoredTracking | null> {
  const tracking = readTracking(body);
  let cfg: CapiConfig | null = null;
  try { cfg = await getCapiConfig(); } catch { return null; }
  if (!shouldSend(cfg, tracking.marketing_consent).send) return null;
  return {
    ...tracking,
    ip: req.ip,
    ua: (req.get?.('user-agent') || '').slice(0, 300) || undefined,
  };
}

/** Compact form for Stripe metadata (values ≤ 500 chars). */
export function trackingToMetadata(t: StoredTracking | null): string | undefined {
  if (!t) return undefined;
  const compact = {
    c: t.marketing_consent ? 1 : 0, e: t.event_id, p: t.fbp, f: t.fbc?.slice(0, 120),
    s: t.source_url?.slice(0, 120), i: t.ip, u: t.ua?.slice(0, 150),
  };
  const json = JSON.stringify(compact);
  return json.length <= 500 ? json : JSON.stringify({ ...compact, u: undefined, s: undefined });
}

export function trackingFromMetadata(raw: unknown): StoredTracking | null {
  if (typeof raw !== 'string') return null;
  try {
    const c = JSON.parse(raw);
    return { marketing_consent: c.c === 1, event_id: c.e, fbp: c.p, fbc: c.f, source_url: c.s, ip: c.i, ua: c.u };
  } catch { return null; }
}

/** Purchase event from a paid checkout. No stored tracking → nothing sent. */
export function sendPurchase(opts: {
  stored: StoredTracking | null | undefined;
  eventId: string;
  amountCents: number;
  currency: string;
  email?: string;
  phone?: string;
  name?: string;
  orderId?: string;
  contentName?: string;
  /** Also send Schedule (a booking was confirmed by this payment). */
  schedule?: boolean;
}): void {
  const t = opts.stored;
  if (!t) return;
  const { firstName, lastName } = splitName(opts.name);
  const user = { email: opts.email, phone: opts.phone, firstName, lastName, ip: t.ip, userAgent: t.ua };
  if (opts.schedule) {
    // Meta deduplicates on event_name + event_id, so sharing the id is fine
    sendCapiEvent({
      name: 'Schedule',
      eventId: opts.eventId,
      tracking: t,
      user,
      custom: opts.contentName ? { content_name: opts.contentName } : undefined,
    }).catch(() => {});
  }
  sendCapiEvent({
    name: 'Purchase',
    eventId: opts.eventId,
    tracking: t,
    user,
    custom: {
      value: Math.round(opts.amountCents) / 100,
      currency: String(opts.currency || 'eur').toUpperCase(),
      ...(opts.orderId ? { order_id: opts.orderId } : {}),
      ...(opts.contentName ? { content_name: opts.contentName } : {}),
    },
  }).catch(() => {});
}
