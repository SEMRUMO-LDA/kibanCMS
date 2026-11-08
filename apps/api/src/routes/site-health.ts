/**
 * Site health + "connect your site" — per tenant, admin only.
 *
 *   GET /api/v1/site-health          → checklist (database, email, API key
 *                                      usage, media, Stripe, forms, domain)
 *   GET /api/v1/site-health/connection → what a frontend needs to connect
 *                                      (API URL, public collections)
 *
 * Every check returns a stable `id`, a `status` and machine-readable
 * `facts`. The admin UI turns that into localised text and next steps, so
 * this file stays language-neutral.
 */

import { Router, type Request, type Response } from 'express';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { tenantStore } from '../middleware/tenant.js';
import { PRIVATE_COLLECTIONS } from './entries.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

/** Must match `schema_version` in database/migrations/009_schema_status.sql. */
export const EXPECTED_SCHEMA_VERSION = 9;

export type CheckStatus = 'ok' | 'warn' | 'error' | 'info';

export interface HealthCheck {
  id: 'database' | 'email_provider' | 'email_recipients' | 'api_key_usage' | 'media_bucket' | 'stripe' | 'forms' | 'domain';
  status: CheckStatus;
  facts: Record<string, unknown>;
}

const SCHEMA_FEATURES = [
  'snapshots', 'coupon_limits', 'trash', 'addons', 'channel_manager',
  'api_key_rpc', 'role_protection', 'cookie_consents', 'media_bucket',
] as const;

const STALE_KEY_DAYS = 7;

// ── Pure evaluators (unit-tested) ──────────────────────────────

/** `status` is the JSON from kiban_schema_status(), or null if the function is missing. */
export function evaluateSchema(status: Record<string, unknown> | null): HealthCheck {
  if (!status) {
    return { id: 'database', status: 'error', facts: { version: 0, expected: EXPECTED_SCHEMA_VERSION, missing: ['schema_status'] } };
  }
  const version = Number(status.schema_version) || 0;
  const missing = SCHEMA_FEATURES.filter(f => status[f] !== true);
  const ok = version >= EXPECTED_SCHEMA_VERSION && missing.length === 0;
  return {
    id: 'database',
    status: ok ? 'ok' : 'error',
    facts: { version, expected: EXPECTED_SCHEMA_VERSION, missing },
  };
}

export function evaluateApiKeys(
  keys: Array<{ last_used_at: string | null }>,
  now: Date = new Date(),
): HealthCheck {
  if (keys.length === 0) {
    return { id: 'api_key_usage', status: 'error', facts: { activeKeys: 0, lastUsedAt: null } };
  }
  const lastUsed = keys
    .map(k => (k.last_used_at ? new Date(k.last_used_at).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  const lastUsedAt = lastUsed ? new Date(lastUsed).toISOString() : null;
  const daysSince = lastUsed ? (now.getTime() - lastUsed) / 86_400_000 : null;
  const status: CheckStatus = daysSince === null || daysSince > STALE_KEY_DAYS ? 'warn' : 'ok';
  return {
    id: 'api_key_usage',
    status,
    facts: { activeKeys: keys.length, lastUsedAt, staleAfterDays: STALE_KEY_DAYS },
  };
}

export function evaluateRecipients(settings: Record<string, any> | null, envFallback: string | undefined): HealthCheck {
  const fromSettings = String(settings?.notification_emails || settings?.contact_email || '').trim();
  const source = settings?.notification_emails ? 'notification_emails'
    : settings?.contact_email ? 'contact_email'
    : envFallback ? 'env' : null;
  const recipients = (fromSettings || envFallback || '')
    .split(',').map(e => e.trim()).filter(Boolean);
  return {
    id: 'email_recipients',
    // env-only means the agency inbox receives this client's leads: works, but rarely what the client wants
    status: recipients.length === 0 ? 'error' : source === 'env' ? 'warn' : 'ok',
    facts: { recipients, source },
  };
}

// ── Helpers ─────────────────────────────────────────────────────

async function getCollectionId(slug: string): Promise<string | null> {
  const { data } = await supabase.from('collections').select('id').eq('slug', slug).maybeSingle();
  return data?.id || null;
}

async function getSiteSettings(): Promise<Record<string, any> | null> {
  const colId = await getCollectionId('site-settings');
  if (!colId) return null;
  const { data } = await supabase
    .from('entries')
    .select('content')
    .eq('collection_id', colId)
    .eq('slug', 'global')
    .maybeSingle();
  return (data?.content as Record<string, any>) || null;
}

async function latestEntryDate(collectionSlug: string): Promise<{ exists: boolean; latest: string | null }> {
  const colId = await getCollectionId(collectionSlug);
  if (!colId) return { exists: false, latest: null };
  const { data } = await supabase
    .from('entries')
    .select('created_at')
    .eq('collection_id', colId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { exists: true, latest: data?.created_at || null };
}

function publicApiUrl(req: Request): string {
  const tenant = tenantStore.getStore()?.tenant;
  const host = tenant?.hostnames?.[0] || req.get('host') || '';
  return host ? `https://${host}` : '';
}

/** Run one check; a failing check must never break the whole page. */
async function safe(id: HealthCheck['id'], fn: () => Promise<HealthCheck>): Promise<HealthCheck> {
  try {
    return await fn();
  } catch (err: any) {
    logger.warn('Site health check failed', { check: id, error: err?.message });
    return { id, status: 'error', facts: { checkFailed: true, message: err?.message || 'unknown error' } };
  }
}

// ── Routes ──────────────────────────────────────────────────────

router.get('/', async (req: AuthRequest, res: Response) => {
  const tenant = tenantStore.getStore()?.tenant;

  const checks = await Promise.all([
    safe('database', async () => {
      const { data, error } = await supabase.rpc('kiban_schema_status' as any);
      return evaluateSchema(error ? null : (data as Record<string, unknown>));
    }),

    safe('email_provider', async () => ({
      id: 'email_provider',
      status: process.env.RESEND_API_KEY ? 'ok' : 'error',
      facts: { fromEmail: process.env.DEFAULT_FROM_EMAIL || 'noreply@kiban.pt' },
    })),

    safe('email_recipients', async () => evaluateRecipients(await getSiteSettings(), process.env.NOTIFICATION_EMAIL)),

    safe('api_key_usage', async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('last_used_at')
        .is('revoked_at', null);
      if (error) throw error;
      return evaluateApiKeys(data || []);
    }),

    safe('media_bucket', async () => {
      const { data, error } = await supabaseAdmin.storage.getBucket('media');
      return {
        id: 'media_bucket',
        status: !error && data ? (data.public ? 'ok' : 'warn') : 'error',
        facts: { exists: !error && !!data, public: !!data?.public },
      };
    }),

    safe('stripe', async () => {
      const colId = await getCollectionId('stripe-config');
      const envConfigured = !!process.env.STRIPE_SECRET_KEY;
      if (!colId && !envConfigured) return { id: 'stripe', status: 'info', facts: { configured: false } };

      let secret = envConfigured;
      let webhook = !!process.env.STRIPE_WEBHOOK_SECRET;
      if (colId) {
        const { data } = await supabase.from('entries').select('content').eq('collection_id', colId).limit(5);
        const cfg = (data || []).map(e => e.content as any).find(c => c?.stripe_secret_key);
        if (cfg) {
          secret = true;
          webhook = !!cfg.stripe_webhook_secret;
        }
      }
      const txn = await latestEntryDate('stripe-transactions');
      return {
        id: 'stripe',
        status: secret && webhook ? 'ok' : secret || colId ? 'warn' : 'info',
        facts: { configured: secret, webhookSecret: webhook, lastPaymentAt: txn.latest },
      };
    }),

    safe('forms', async () => {
      const forms = await latestEntryDate('form-submissions');
      return {
        id: 'forms',
        status: 'info',
        facts: { installed: forms.exists, lastSubmissionAt: forms.latest },
      };
    }),

    safe('domain', async () => ({
      id: 'domain',
      status: tenant?.hostnames?.length ? 'ok' : 'warn',
      facts: {
        tenantId: tenant?.id || 'default',
        hostnames: tenant?.hostnames || [],
        origins: tenant?.origins || [],
        apiUrl: publicApiUrl(req),
      },
    })),
  ]);

  const summary = {
    error: checks.filter(c => c.status === 'error').length,
    warn: checks.filter(c => c.status === 'warn').length,
    ok: checks.filter(c => c.status === 'ok').length,
  };

  res.json({ data: { checks, summary, checkedAt: new Date().toISOString() }, timestamp: new Date().toISOString() });
});

router.get('/connection', async (req: AuthRequest, res: Response) => {
  try {
    const { data: collections, error } = await supabase
      .from('collections')
      .select('slug, name')
      .order('name', { ascending: true });
    if (error) throw error;

    // Only what a public frontend (API key) can actually read.
    const publicCollections = (collections || []).filter(c => !PRIVATE_COLLECTIONS.has(c.slug));

    res.json({
      data: {
        tenantId: tenantStore.getStore()?.tenant?.id || 'default',
        apiUrl: publicApiUrl(req),
        collections: publicCollections,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Site connection info failed', { error: err?.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
