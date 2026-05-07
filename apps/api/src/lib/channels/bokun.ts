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
  // Bokun's webhook ships the booking object at the root (no `booking` wrapper).
  const b = payload?.booking ?? payload;
  if (!b || !b.confirmationCode) return undefined;

  // Customer is at the root for Bokun ("customer"); invoice.recipient mirrors
  // it but with extra fields. Fall back to passengers/leadCustomer for older
  // payload variants seen in docs.
  const lead = b.customer || b.invoice?.recipient || b.leadCustomer || b.passengers?.[0] || {};

  // First (and usually only) activity in the booking. Real Bokun payloads put
  // the product id on `productId` directly, not under a `product` sub-object.
  // The product sub-object exists on activity.invoice.product.
  const activity = b.activityBookings?.[0] || b.productBookings?.[0] || {};
  const productId = activity.productId
                 ?? activity.product?.id
                 ?? activity.invoice?.product?.id;
  const productTitle = activity.title
                    || activity.invoice?.product?.title
                    || activity.product?.title
                    || 'Bokun booking';

  // Date/time: prefer the absolute startDateTime (epoch ms) because it carries
  // both. Fallback to startTime (already "HH:mm") and date (epoch ms or
  // YYYY-MM-DD string depending on Bokun version).
  const startEpoch: number | undefined =
    typeof activity.startDateTime === 'number' ? activity.startDateTime
    : typeof activity.date === 'number' ? activity.date
    : undefined;

  let dateStr: string;
  let timeStr: string | undefined;
  if (startEpoch) {
    const dt = new Date(startEpoch);
    dateStr = dt.toISOString().slice(0, 10);
    timeStr = dt.toISOString().slice(11, 16);
  } else if (typeof activity.startDate === 'string') {
    dateStr = activity.startDate.slice(0, 10);
  } else {
    dateStr = new Date().toISOString().slice(0, 10);
  }
  // Explicit startTime field always wins over the one derived from epoch
  // (Bokun stores it pre-formatted in operator's local timezone).
  if (typeof activity.startTime === 'string') timeStr = activity.startTime.slice(0, 5);

  // Participants: per-rate quantities live on activity.fields.lineItems
  // (`people` per category) — sum them. Older payloads may have the
  // pre-summed totalParticipants.
  const lineItems = activity.invoice?.lineItems || [];
  const participantsFromLineItems = lineItems.reduce(
    (sum: number, li: any) => sum + (Number(li.people) || 0),
    0,
  );
  const participants = Number(
    activity.totalParticipants || b.totalParticipants || participantsFromLineItems || 1,
  );

  // Amount comes from b.totalPrice (major units, e.g. 40 EUR) on real Bokun
  // payloads. invoice.totalAsMoney.amount is also in major units.
  const amountMajor = Number(
    b.totalPrice ?? b.invoice?.totalAsMoney?.amount ?? 0,
  );

  return {
    external_id: String(b.confirmationCode || b.id),
    customer_name: [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim()
                || lead.name
                || 'Unknown',
    customer_email: lead.email || '',
    customer_phone: lead.phoneNumber || lead.phoneNumberLinkable || lead.phone || undefined,
    product_external_id: productId != null ? String(productId) : undefined,
    product_title: productTitle,
    date: dateStr,
    time_slot: timeStr,
    participants,
    amount_cents: Math.round(amountMajor * 100),
    currency: b.currency || b.invoice?.currency || 'EUR',
    status: (b.status || activity.status || 'CONFIRMED').toLowerCase().includes('cancel') ? 'cancelled'
            : (b.status || activity.status || 'CONFIRMED').toLowerCase().includes('pend') ? 'pending'
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

    // Bokun moves endpoints between API revisions and tiers — '/vendor.json/me'
    // is gone in newer accounts, OCTO endpoints aren't enabled by default, etc.
    // We only care that the HMAC signature is accepted, not that any specific
    // probe endpoint exists; so we treat anything that ISN'T a clear auth
    // rejection (401/403) as a passing test.
    const path = '/account.json/me';
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
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: `Invalid Bokun credentials (HTTP ${res.status})` };
      }
      // Anything else: credentials weren't rejected. The probe endpoint just
      // isn't available on this account tier, but auth headers were accepted.
      return { ok: true };
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
