/**
 * Channel Manager routes.
 *
 * Public surface:
 *   POST /api/v1/channel-manager/webhook/:provider   raw-body, HMAC-verified
 *
 * Admin surface (JWT):
 *   GET    /api/v1/channel-manager/connections
 *   POST   /api/v1/channel-manager/connections
 *   PUT    /api/v1/channel-manager/connections/:id
 *   DELETE /api/v1/channel-manager/connections/:id
 *   POST   /api/v1/channel-manager/connections/:id/test
 *   GET    /api/v1/channel-manager/log?limit=50
 *
 * Bookings received via webhook are written into the existing `entries`
 * table (collection slug `bookings`), tagged with metadata.source so the
 * normal bookings UI surfaces them without code changes.
 */

import express, { type Request, type Response, type Router as ExpressRouter } from 'express';
import crypto from 'node:crypto';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { getAdapter, listAdapters } from '../lib/channels/index.js';
import type { NormalizedBooking } from '../lib/channels/index.js';

// Explicit annotation: with `declaration: true`, the inferred Router type
// references @pnpm/-internal paths which TS2742s the build. Annotating with
// the public `Router` symbol keeps the .d.ts portable.
export const channelManagerRouter: ExpressRouter = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────

async function getBookingsCollectionId(): Promise<string | null> {
  const { data } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', 'bookings')
    .maybeSingle();
  return data?.id || null;
}

async function getAdminProfileId(): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['super_admin', 'admin'])
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

// Strip secrets before sending connection rows to the admin UI. We let the
// admin see "is set / not set" but never the raw key.
function redactConnection(row: any) {
  if (!row) return row;
  const creds = row.credentials || {};
  const redacted: Record<string, any> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (typeof v === 'string' && v.length > 0) {
      redacted[k] = v.length > 8 ? `${v.slice(0, 4)}…${v.slice(-4)}` : '••••';
    } else {
      redacted[k] = v;
    }
  }
  return {
    ...row,
    credentials: redacted,
    webhook_secret: row.webhook_secret ? `${row.webhook_secret.slice(0, 6)}…` : null,
  };
}

// ── Webhook (public) ─────────────────────────────────────────────────
// Two paths supported:
//   /webhook/:provider/:token  — url-token auth (Bokun Push notifications)
//   /webhook/:provider         — hmac auth (FareHarbor, Cloudbeds, …)
// Both need raw body, mounted before express.json() in server.ts.

async function handleWebhook(req: Request, res: Response, urlToken: string | null) {
  const provider = req.params.provider;
  const adapter = getAdapter(provider);
  if (!adapter) {
    return res.status(404).json({ error: { message: `Unknown provider: ${provider}` } });
  }

  const rawBody = (req as any).rawBody?.toString('utf8')
                 ?? (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  if (!rawBody) {
    return res.status(400).json({ error: { message: 'Empty body' } });
  }

  const { data: conn } = await supabase
    .from('channel_connections')
    .select('id, webhook_secret, enabled')
    .eq('provider', provider)
    .maybeSingle();

  if (!conn || !conn.enabled || !conn.webhook_secret) {
    // Don't leak whether the provider is configured — opaque 401.
    return res.status(401).json({ error: { message: 'Webhook rejected' } });
  }

  // Path 1: url-token auth — compare URL-supplied token to stored secret.
  if (adapter.webhookAuthMode === 'url-token') {
    if (!urlToken) return res.status(401).json({ error: { message: 'Missing token' } });
    const expected = Buffer.from(conn.webhook_secret);
    const provided = Buffer.from(urlToken);
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
      return res.status(401).json({ error: { message: 'Invalid token' } });
    }
  }
  // Path 2: hmac auth — adapter handles signature verification inside parseWebhook.

  const event = adapter.parseWebhook({
    rawBody,
    headers: req.headers as any,
    secret: conn.webhook_secret,
  });
  if (!event) {
    return res.status(401).json({ error: { message: 'Webhook payload rejected' } });
  }

  // Idempotency: log row uniqueness covers (provider, external_id, event_type).
  // If we've seen this exact event before, return 200 without re-processing.
  const { data: existing } = await supabase
    .from('channel_bookings_log')
    .select('id, status, entry_id')
    .eq('provider', provider)
    .eq('external_id', event.external_id)
    .eq('event_type', event.event_type)
    .maybeSingle();

  if (existing) {
    return res.status(200).json({
      status: 'duplicate',
      log_id: existing.id,
      entry_id: existing.entry_id,
    });
  }

  // Insert log row first so we always have an audit trail even if booking
  // upsert later fails.
  const { data: logRow } = await supabase
    .from('channel_bookings_log')
    .insert({
      provider,
      external_id: event.external_id,
      event_type: event.event_type,
      payload: JSON.parse(rawBody),
      status: 'received',
    })
    .select('id')
    .single();

  // Map to entries (only for create/update events with a normalized booking).
  let entryId: string | null = null;
  let processError: string | null = null;

  if (event.booking && /booking\.(created|updated|confirmed)/i.test(event.event_type)) {
    try {
      entryId = await upsertBookingEntry(provider, event.booking);
    } catch (err: any) {
      processError = err?.message || String(err);
      logger.error('channel-manager: failed to upsert booking', { err: String(err), provider, external_id: event.external_id });
    }
  } else if (/booking\.(cancel|delete)/i.test(event.event_type)) {
    try {
      entryId = await markBookingCancelled(provider, event.external_id);
    } catch (err: any) {
      processError = err?.message || String(err);
    }
  }

  if (logRow) {
    await supabase
      .from('channel_bookings_log')
      .update({
        status: processError ? 'error' : 'processed',
        error: processError,
        entry_id: entryId,
        processed_at: new Date().toISOString(),
      })
      .eq('id', logRow.id);
  }

  return res.status(200).json({
    status: processError ? 'error' : 'processed',
    log_id: logRow?.id,
    entry_id: entryId,
    error: processError,
  });
}

channelManagerRouter.post('/webhook/:provider/:token',
  (req, res) => handleWebhook(req, res, req.params.token));
channelManagerRouter.post('/webhook/:provider',
  (req, res) => handleWebhook(req, res, null));

async function upsertBookingEntry(provider: string, b: NormalizedBooking): Promise<string | null> {
  const colId = await getBookingsCollectionId();
  if (!colId) {
    throw new Error("Tenant has no `bookings` collection — Channel Manager can't land bookings");
  }
  const adminId = await getAdminProfileId();

  const slug = `${provider}-${b.external_id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Look up an existing entry by metadata.source + external_id so re-deliveries
  // (e.g. a Bokun booking.updated) update the same row instead of creating dupes.
  const { data: prior } = await supabase
    .from('entries')
    .select('id')
    .eq('collection_id', colId)
    .eq('slug', slug)
    .maybeSingle();

  const content = {
    customer_name: b.customer_name,
    customer_email: b.customer_email,
    customer_phone: b.customer_phone || '',
    resource_slug: b.product_external_id || '',
    resource_title: b.product_title,
    date: b.date,
    time_slot: b.time_slot || '',
    party_size: b.participants,
    total_participants: b.participants,
    amount: b.amount_cents,
    currency: b.currency,
    booking_status: b.status,
    source: provider,
    metadata: { source: provider, external_id: b.external_id, raw: b.raw },
    notes: b.notes || '',
  };

  if (prior) {
    const { data, error } = await supabase
      .from('entries')
      .update({ content, status: 'published' } as any)
      .eq('id', prior.id)
      .select('id')
      .single();
    if (error) throw error;
    return data?.id || null;
  }

  const { data, error } = await supabase
    .from('entries')
    .insert({
      collection_id: colId,
      title: `${b.customer_name} — ${b.product_title} (${b.date})`,
      slug,
      content,
      status: 'published',
      published_at: new Date().toISOString(),
      author_id: adminId,
      tags: ['booking', `source:${provider}`, b.status],
    } as any)
    .select('id')
    .single();
  if (error) throw error;
  return data?.id || null;
}

async function markBookingCancelled(provider: string, externalId: string): Promise<string | null> {
  const colId = await getBookingsCollectionId();
  if (!colId) return null;
  const slug = `${provider}-${externalId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const { data: prior } = await supabase
    .from('entries')
    .select('id, content')
    .eq('collection_id', colId)
    .eq('slug', slug)
    .maybeSingle();

  if (!prior) return null;

  const newContent = { ...(prior.content as any || {}), booking_status: 'cancelled' };
  const { data, error } = await supabase
    .from('entries')
    .update({ content: newContent } as any)
    .eq('id', prior.id)
    .select('id')
    .single();
  if (error) throw error;
  return data?.id || null;
}

// ── Admin (JWT-protected — wired in server.ts) ───────────────────────

channelManagerRouter.get('/providers', async (_req, res) => {
  res.json({
    data: listAdapters().map(a => ({ id: a.id, displayName: a.displayName })),
  });
});

channelManagerRouter.get('/connections', async (_req, res) => {
  const { data, error } = await supabase
    .from('channel_connections')
    .select('id, provider, enabled, credentials, webhook_secret, last_sync_at, last_sync_status, last_sync_error, metadata, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: { message: error.message } });
  res.json({ data: (data || []).map(redactConnection) });
});

channelManagerRouter.post('/connections', async (req, res) => {
  const { provider, credentials, enabled, metadata } = req.body || {};
  if (!provider || !getAdapter(provider)) {
    return res.status(400).json({ error: { message: `Unknown provider: ${provider}` } });
  }
  const webhookSecret = crypto.randomBytes(24).toString('hex');
  const { data, error } = await supabase
    .from('channel_connections')
    .upsert({
      provider,
      enabled: enabled !== false,
      credentials: credentials || {},
      webhook_secret: webhookSecret,
      metadata: metadata || {},
    }, { onConflict: 'provider' })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: { message: error.message } });
  // Return the raw webhook secret ONCE on creation. For url-token providers
  // we also return the full webhook URL with the secret already embedded —
  // the admin only has to copy one string into the provider's dashboard.
  const adapter = getAdapter(provider);
  // Behind Railway's proxy, req.protocol is 'http' even though the public
  // hostname is HTTPS — providers like Bokun reject http:// webhook URLs,
  // so trust X-Forwarded-Proto when present.
  const fwdProto = req.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto)?.split(',')[0]?.trim() || req.protocol;
  const baseUrl = `${protocol}://${req.get('host')}/api/v1/channel-manager/webhook/${provider}`;
  const webhookUrl = adapter?.webhookAuthMode === 'url-token'
    ? `${baseUrl}/${webhookSecret}`
    : baseUrl;
  res.json({
    data: {
      ...redactConnection(data),
      webhook_secret: webhookSecret,
      webhook_url: webhookUrl,
    },
  });
});

channelManagerRouter.put('/connections/:id', async (req, res) => {
  const { credentials, enabled, metadata } = req.body || {};
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (credentials !== undefined) patch.credentials = credentials;
  if (enabled !== undefined) patch.enabled = enabled;
  if (metadata !== undefined) patch.metadata = metadata;

  const { data, error } = await supabase
    .from('channel_connections')
    .update(patch)
    .eq('id', req.params.id)
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: { message: error.message } });
  res.json({ data: redactConnection(data) });
});

channelManagerRouter.delete('/connections/:id', async (req, res) => {
  const { error } = await supabase
    .from('channel_connections')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: { message: error.message } });
  res.json({ ok: true });
});

channelManagerRouter.post('/connections/:id/test', async (req, res) => {
  const { data: conn, error } = await supabase
    .from('channel_connections')
    .select('provider, credentials')
    .eq('id', req.params.id)
    .single();
  if (error || !conn) return res.status(404).json({ error: { message: 'Connection not found' } });

  const adapter = getAdapter(conn.provider);
  if (!adapter) return res.status(400).json({ error: { message: 'Adapter not registered' } });

  const result = await adapter.validateCredentials(conn.credentials);
  await supabase
    .from('channel_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: result.ok ? 'ok' : 'error',
      last_sync_error: result.ok ? null : (result.error || 'Unknown error'),
    })
    .eq('id', req.params.id);
  res.json({ data: result });
});

channelManagerRouter.get('/log', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || '50'), 10), 200);
  const { data, error } = await supabase
    .from('channel_bookings_log')
    .select('id, provider, external_id, event_type, status, error, entry_id, received_at, processed_at')
    .order('received_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: { message: error.message } });
  res.json({ data: data || [] });
});
