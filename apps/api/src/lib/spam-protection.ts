/**
 * Spam protection for public form endpoints (forms/submit, newsletter/subscribe).
 *
 * 1. Honeypot — the site renders a hidden field named `_hp` (or `_gotcha`).
 *    Humans never fill it; bots that fill every input do. Triggered requests
 *    get a normal-looking success response but nothing is stored or emailed,
 *    so bots don't learn they were caught.
 * 2. Cloudflare Turnstile (optional, per tenant) — when a secret key is set in
 *    Settings → Email ("turnstile_secret_key"), requests must include the
 *    widget token (`turnstile_token` or `cf-turnstile-response`).
 */

import { supabase } from './supabase.js';
import { logger } from './logger.js';
import { tenantStore } from '../middleware/tenant.js';

const HONEYPOT_FIELDS = ['_hp', '_gotcha'] as const;

export function isHoneypotTriggered(body: Record<string, unknown> | undefined): boolean {
  if (!body) return false;
  return HONEYPOT_FIELDS.some(f => {
    const v = body[f];
    return typeof v === 'string' ? v.trim().length > 0 : v !== undefined && v !== null && v !== false;
  });
}

export function getTurnstileToken(body: Record<string, unknown> | undefined): string {
  const v = body?.turnstile_token ?? body?.['cf-turnstile-response'];
  return typeof v === 'string' ? v : '';
}

const secretCache = new Map<string, { secret: string; fetchedAt: number }>();
const SECRET_TTL = 60_000;

/** Turnstile secret from Settings (site-settings "global"), per tenant. Empty = disabled. */
export async function getTurnstileSecret(): Promise<string> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
  const cached = secretCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < SECRET_TTL) return cached.secret;

  let secret = '';
  try {
    const { data: col } = await supabase.from('collections').select('id').eq('slug', 'site-settings').maybeSingle();
    if (col) {
      const { data: entry } = await supabase
        .from('entries').select('content').eq('collection_id', col.id).eq('slug', 'global').maybeSingle();
      secret = String((entry?.content as any)?.turnstile_secret_key || '').trim();
    }
  } catch (err: any) {
    logger.warn('Could not load Turnstile secret', { tenant: tenantId, error: err?.message });
  }
  secretCache.set(tenantId, { secret, fetchedAt: Date.now() });
  return secret;
}

export type TurnstileResult = 'ok' | 'missing' | 'invalid' | 'unavailable';

/**
 * Verifies a Turnstile token. Network failures return 'unavailable' (callers
 * let the request through: a Cloudflare outage must not take forms down).
 */
export async function verifyTurnstile(token: string, secret: string, remoteIp?: string): Promise<TurnstileResult> {
  if (!token) return 'missing';
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (json.success) return 'ok';
    logger.info('Turnstile rejected a submission', { errors: json['error-codes'] });
    return 'invalid';
  } catch (err: any) {
    logger.warn('Turnstile verification unavailable — letting the request through', { error: err?.message });
    return 'unavailable';
  }
}

/**
 * Runs both checks. Returns:
 *  - 'honeypot' → respond with a fake success, store nothing
 *  - 'captcha'  → respond 400 (missing/invalid token)
 *  - 'ok'       → continue
 */
export async function checkSpam(body: Record<string, unknown> | undefined, remoteIp?: string): Promise<'ok' | 'honeypot' | 'captcha'> {
  if (isHoneypotTriggered(body)) return 'honeypot';
  const secret = await getTurnstileSecret();
  if (!secret) return 'ok';
  const result = await verifyTurnstile(getTurnstileToken(body), secret, remoteIp);
  return result === 'missing' || result === 'invalid' ? 'captcha' : 'ok';
}

export function captchaFailed(res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  return res.status(400).json({
    error: {
      message: 'Anti-spam check failed. Please reload the page and try again.',
      code: 'CAPTCHA_FAILED',
      status: 400,
      timestamp: new Date().toISOString(),
    },
  });
}
