/**
 * Bokun adapter — first implementation of the ChannelAdapter contract.
 *
 * Bokun docs: https://bokun.dev/
 *   - REST API base:  https://api.bokun.io
 *   - Auth:           HMAC-SHA1 signature over (date + method + path + access_key)
 *                     using the secret key as the HMAC key, base64-encoded.
 *   - Webhooks:       POST with header `X-Bokun-Signature` containing
 *                     base64 HMAC-SHA1 of the raw request body.
 *
 * For sprint 1 we only need:
 *   - validateCredentials: ping a cheap endpoint to confirm key/secret
 *   - verifyWebhook:       check the signature and normalize the payload
 *
 * Pulling product catalogs and pushing availability are sprint 2.
 */

import crypto from 'node:crypto';
import type {
  ChannelAdapter,
  ChannelCredentials,
  NormalizedBooking,
  WebhookAuthMode,
  WebhookEvent,
} from './types.js';

const BOKUN_API_BASE = 'https://api.bokun.io';

interface BokunCredentials extends ChannelCredentials {
  access_key: string;
  secret_key: string;
  /**
   * Optional — Bokun vendor id, used as a discriminator when one
   * tenant has multiple Bokun accounts. Not required for HMAC.
   */
  vendor_id?: string;
}

function signRequest(secretKey: string, date: string, method: string, path: string, accessKey: string): string {
  const toSign = `${date}${accessKey}${method}${path}`;
  return crypto.createHmac('sha1', secretKey).update(toSign).digest('base64');
}

function bokunDate(): string {
  // Bokun expects "yyyy-MM-dd HH:mm:ss" in UTC.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
       + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Map a Bokun booking webhook payload into the KIBAN normalized shape.
 * Bokun's payload schema is documented in their developer portal; we
 * only consume the fields we know we need and stash the rest under `raw`.
 */
function normalizeBokunBooking(payload: any): NormalizedBooking | undefined {
  const b = payload?.booking ?? payload;
  if (!b || !b.confirmationCode) return undefined;

  // Bokun structures customer info on the lead passenger.
  const lead = b.customer || b.leadCustomer || b.passengers?.[0] || {};

  // Pick the first product activity (most bookings are single-product).
  const activity = b.activityBookings?.[0] || b.productBookings?.[0] || {};
  const product = activity.product || activity.experience || {};

  const startDate = activity.startDate || activity.date || b.startDate;
  const startTime = activity.startTime || b.startTime;

  return {
    external_id: String(b.confirmationCode || b.id),
    customer_name: [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() || lead.name || 'Unknown',
    customer_email: lead.email || '',
    customer_phone: lead.phoneNumber || lead.phone || undefined,
    product_external_id: product.id ? String(product.id) : undefined,
    product_title: product.title || activity.title || 'Bokun booking',
    date: typeof startDate === 'string' ? startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    time_slot: typeof startTime === 'string' ? startTime.slice(0, 5) : undefined,
    participants: Number(activity.totalParticipants || b.totalParticipants || 1),
    amount_cents: Math.round(Number(b.totalPrice || 0) * 100),
    currency: b.currency || 'EUR',
    status: (b.status || 'CONFIRMED').toLowerCase().includes('cancel') ? 'cancelled'
            : (b.status || 'CONFIRMED').toLowerCase().includes('pend') ? 'pending'
            : 'confirmed',
    notes: b.note || b.customerComment || undefined,
    raw: payload,
  };
}

export const BokunAdapter: ChannelAdapter = {
  id: 'bokun',
  displayName: 'Bokun',
  // Bokun's "Push notifications" feature (Settings → Connections → Push
  // notifications) does not sign payloads. We embed the webhook secret in
  // the URL path and validate it server-side before parsing.
  webhookAuthMode: 'url-token' as WebhookAuthMode,

  async validateCredentials(creds: ChannelCredentials) {
    const c = creds as BokunCredentials;
    if (!c.access_key || !c.secret_key) {
      return { ok: false, error: 'Missing access_key or secret_key' };
    }

    // Cheapest authenticated endpoint: GET /vendor.json/me
    const path = '/vendor.json/me';
    const date = bokunDate();
    const signature = signRequest(c.secret_key, date, 'GET', path, c.access_key);

    try {
      const res = await fetch(BOKUN_API_BASE + path, {
        method: 'GET',
        headers: {
          'X-Bokun-AccessKey': c.access_key,
          'X-Bokun-Date': date,
          'X-Bokun-Signature': signature,
          'Accept': 'application/json',
        },
      });
      if (res.ok) return { ok: true };
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Network error' };
    }
  },

  parseWebhook({ rawBody }): WebhookEvent | null {
    if (!rawBody) return null;

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    // Bokun's Push notifications use a `triggerType` (e.g. "BOOKING_CONFIRMED",
    // "PRODUCT_UPDATED"). The body shape varies; older docs use `eventType`.
    const rawType = payload.triggerType || payload.eventType || payload.notification?.type;
    const eventType = mapBokunTrigger(rawType);

    const booking = normalizeBokunBooking(payload);
    const externalId = booking?.external_id
                     || String(payload.booking?.confirmationCode
                            || payload.confirmationCode
                            || payload.bookingId
                            || payload.id
                            || '');
    if (!externalId) return null;

    return { event_type: eventType, external_id: externalId, booking };
  },
};

function mapBokunTrigger(raw: string | undefined): string {
  if (!raw) return 'booking.created';
  const t = String(raw).toUpperCase();
  if (t.includes('CANCEL')) return 'booking.cancelled';
  if (t.includes('UPDATE')) return 'booking.updated';
  if (t.includes('CONFIRM') || t.includes('CREATE') || t.includes('BOOKING'))
    return 'booking.created';
  return raw.toLowerCase();
}
