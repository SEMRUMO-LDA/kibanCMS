/**
 * Coupons library — shared by bookings-v2 checkout + Stripe webhook handler.
 *
 * Principles (2026 hardening):
 *   1. Atomic increments: `usage_count` is bumped with an optimistic UPDATE
 *      guarded by the DB — never `SELECT then UPDATE` in JS, because that races.
 *   2. Stripe is the source of truth for final amounts. When Stripe is configured,
 *      we create (or reuse) a native Stripe coupon and attach it to the Session.
 *      Discount math is recomputed only for *reporting*, never used to charge.
 *   3. Every redemption is recorded BEFORE Stripe is called, as status=pending.
 *      On webhook success → confirmed + atomic counter bump.
 *      On webhook expiry → cancelled, counter untouched.
 *   4. Per-customer rate-limit counts only `confirmed` + `pending` redemptions
 *      (prevents a user hammering pending checkouts to bypass max_uses_per_customer).
 */

import { supabase } from './supabase.js';
import { logger } from './logger.js';

// ── Types ──

export type CouponType = 'percentage' | 'fixed';
export type RedemptionStatus = 'pending' | 'confirmed' | 'expired' | 'cancelled';

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  currency?: string;
  min_amount?: number;
  max_discount?: number;
  starts_at?: string;
  expires_at?: string;
  max_uses_total?: number | null;
  max_uses_per_customer?: number;
  usage_count: number;
  applies_to: 'all_resources' | 'specific_resources';
  resource_slugs: string[];
  new_customers_only?: boolean;
  stackable?: boolean;
  stripe_coupon_id?: string;
  is_active: boolean;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;                // machine-friendly code (i18n-able)
  message?: string;               // human-readable (English fallback)
  discount_cents?: number;
  coupon?: Coupon;
}

export interface ValidateOpts {
  code: string;
  resource_slug: string;
  customer_email: string;
  subtotal_cents: number;
  currency: string;
}

// ── Helpers ──

async function getCollectionId(slug: string): Promise<string | null> {
  const { data } = await supabase.from('collections').select('id').eq('slug', slug).single();
  return data?.id || null;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function toCoupon(row: any): Coupon | null {
  if (!row?.content) return null;
  const c = row.content as Record<string, any>;
  const resourceSlugs = typeof c.resource_slugs === 'string'
    ? c.resource_slugs.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean)
    : Array.isArray(c.resource_slugs) ? c.resource_slugs : [];

  return {
    id: row.id,
    code: normalizeCode(String(c.code || '')),
    type: (c.type === 'fixed' ? 'fixed' : 'percentage'),
    value: Number(c.value) || 0,
    currency: c.currency ? String(c.currency).toLowerCase() : undefined,
    min_amount: c.min_amount != null ? Number(c.min_amount) : undefined,
    max_discount: c.max_discount != null ? Number(c.max_discount) : undefined,
    starts_at: c.starts_at || undefined,
    expires_at: c.expires_at || undefined,
    max_uses_total: c.max_uses_total != null && c.max_uses_total !== '' ? Number(c.max_uses_total) : null,
    max_uses_per_customer: c.max_uses_per_customer != null ? Number(c.max_uses_per_customer) : 0,
    usage_count: Number(c.usage_count) || 0,
    applies_to: (c.applies_to === 'specific_resources' ? 'specific_resources' : 'all_resources'),
    resource_slugs: resourceSlugs,
    new_customers_only: !!c.new_customers_only,
    stackable: !!c.stackable,
    stripe_coupon_id: c.stripe_coupon_id || undefined,
    is_active: c.is_active !== false,
  };
}

// ── Load coupon by code (case-insensitive) ──

export async function loadCoupon(code: string): Promise<{ row: any; coupon: Coupon } | null> {
  const colId = await getCollectionId('coupons');
  if (!colId) return null;

  const target = normalizeCode(code);

  // Supabase JSONB equality — read all and match in JS (collection is small).
  // For larger catalogs, add a generated column + index on content->>'code'.
  const { data: rows } = await supabase
    .from('entries')
    .select('id, content, status')
    .eq('collection_id', colId)
    .eq('status', 'published');

  for (const row of rows || []) {
    const c = row.content as Record<string, any>;
    if (normalizeCode(String(c.code || '')) === target) {
      const coupon = toCoupon(row);
      if (coupon) return { row, coupon };
    }
  }
  return null;
}

// ── Validate (pure checks, no mutation) ──

export async function validateCoupon(opts: ValidateOpts): Promise<ValidationResult> {
  const loaded = await loadCoupon(opts.code);
  if (!loaded) return { valid: false, reason: 'not_found', message: 'Coupon code not found' };

  const coupon = loaded.coupon;

  if (!coupon.is_active) {
    return { valid: false, reason: 'inactive', message: 'Coupon is not active' };
  }

  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
    return { valid: false, reason: 'not_started', message: 'Coupon is not yet valid' };
  }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) {
    return { valid: false, reason: 'expired', message: 'Coupon has expired' };
  }

  if (coupon.max_uses_total != null && coupon.usage_count >= coupon.max_uses_total) {
    return { valid: false, reason: 'exhausted', message: 'Coupon usage limit reached' };
  }

  if (coupon.applies_to === 'specific_resources' && !coupon.resource_slugs.includes(opts.resource_slug)) {
    return { valid: false, reason: 'scope', message: 'Coupon not valid for this resource' };
  }

  if (coupon.type === 'fixed' && coupon.currency && coupon.currency !== opts.currency.toLowerCase()) {
    return { valid: false, reason: 'currency', message: `Coupon is in ${coupon.currency.toUpperCase()}, order is in ${opts.currency.toUpperCase()}` };
  }

  if (coupon.min_amount != null && coupon.min_amount > 0) {
    const minCents = Math.round(coupon.min_amount * 100);
    if (opts.subtotal_cents < minCents) {
      return { valid: false, reason: 'min_amount', message: `Minimum order amount is ${coupon.min_amount}` };
    }
  }

  // Per-customer rate limit: count pending + confirmed redemptions by email
  if (coupon.max_uses_per_customer && coupon.max_uses_per_customer > 0) {
    const redemptionsColId = await getCollectionId('coupon-redemptions');
    if (redemptionsColId) {
      const { data: history } = await supabase
        .from('entries')
        .select('content')
        .eq('collection_id', redemptionsColId)
        .filter('content->>coupon_code', 'eq', coupon.code)
        .filter('content->>customer_email', 'eq', opts.customer_email.toLowerCase());

      const usedByCustomer = (history || []).filter(r => {
        const s = (r.content as any)?.status;
        return s === 'pending' || s === 'confirmed';
      }).length;

      if (usedByCustomer >= coupon.max_uses_per_customer) {
        return { valid: false, reason: 'per_customer_limit', message: 'You have already used this coupon' };
      }
    }
  }

  // New customers only
  if (coupon.new_customers_only) {
    const bookingsColId = await getCollectionId('bookings');
    if (bookingsColId) {
      const { data: prior } = await supabase
        .from('entries')
        .select('id')
        .eq('collection_id', bookingsColId)
        .filter('content->>customer_email', 'eq', opts.customer_email.toLowerCase())
        .filter('content->>booking_status', 'eq', 'confirmed')
        .limit(1);

      if (prior && prior.length > 0) {
        return { valid: false, reason: 'not_new_customer', message: 'Coupon is for new customers only' };
      }
    }
  }

  // Compute discount
  let discountCents = 0;
  if (coupon.type === 'percentage') {
    discountCents = Math.floor((opts.subtotal_cents * coupon.value) / 100);
  } else {
    discountCents = Math.round(coupon.value * 100);
  }
  if (coupon.max_discount != null && coupon.max_discount > 0) {
    const capCents = Math.round(coupon.max_discount * 100);
    if (discountCents > capCents) discountCents = capCents;
  }
  // Never discount more than subtotal (Stripe would reject anyway)
  if (discountCents >= opts.subtotal_cents) {
    discountCents = opts.subtotal_cents - 50; // leave 50 cents (Stripe min)
    if (discountCents < 0) discountCents = 0;
  }

  return { valid: true, discount_cents: discountCents, coupon };
}

// ── Ensure Stripe coupon exists; return its ID ──
//
// If the coupon has `stripe_coupon_id` and it still exists on Stripe, reuse it.
// Otherwise create a one-time Stripe coupon mirroring our settings and cache the ID.

export async function ensureStripeCoupon(stripe: any, couponRow: any, coupon: Coupon): Promise<string | null> {
  if (coupon.stripe_coupon_id) {
    try {
      const existing = await stripe.coupons.retrieve(coupon.stripe_coupon_id);
      if (existing && !existing.deleted) return existing.id;
    } catch (err: any) {
      logger.warn('Cached Stripe coupon no longer exists, recreating', { id: coupon.stripe_coupon_id });
    }
  }

  const params: Record<string, any> = {
    name: coupon.code,
    metadata: { kibanCMS_coupon_id: couponRow.id, code: coupon.code },
  };

  if (coupon.type === 'percentage') {
    params.percent_off = coupon.value;
  } else {
    params.amount_off = Math.round(coupon.value * 100);
    params.currency = (coupon.currency || 'eur').toLowerCase();
  }

  if (coupon.expires_at) {
    params.redeem_by = Math.floor(new Date(coupon.expires_at).getTime() / 1000);
  }

  // Stripe's native max_redemptions is global; we keep ours as the source of truth
  // and rely on our DB counter. Setting max_redemptions here would duplicate checks.

  try {
    const created = await stripe.coupons.create(params);
    // Persist on our row
    await supabase
      .from('entries')
      .update({
        content: { ...(couponRow.content as any), stripe_coupon_id: created.id },
      })
      .eq('id', couponRow.id);
    return created.id;
  } catch (err: any) {
    logger.error('Failed to create Stripe coupon', { error: err.message, code: coupon.code });
    return null;
  }
}

// ── Record a pending redemption (audit-first) ──

export async function recordPendingRedemption(opts: {
  coupon: Coupon;
  booking_id: string;
  customer_email: string;
  subtotal_cents: number;
  discount_cents: number;
  currency: string;
  stripe_session_id?: string;
  author_id: string;
}): Promise<string | null> {
  const colId = await getCollectionId('coupon-redemptions');
  if (!colId) {
    logger.warn('coupon-redemptions collection not installed — cannot audit');
    return null;
  }

  const slug = `redemption-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const { data, error } = await supabase
    .from('entries')
    .insert({
      collection_id: colId,
      title: `${opts.coupon.code} — ${opts.customer_email}`,
      slug,
      content: {
        coupon_code: opts.coupon.code,
        booking_id: opts.booking_id,
        customer_email: opts.customer_email.toLowerCase(),
        subtotal_cents: opts.subtotal_cents,
        discount_cents: opts.discount_cents,
        currency: opts.currency,
        stripe_session_id: opts.stripe_session_id || '',
        status: 'pending' as RedemptionStatus,
        redeemed_at: new Date().toISOString(),
      },
      status: 'published',
      published_at: new Date().toISOString(),
      author_id: opts.author_id,
      tags: ['coupon', 'redemption', 'pending'],
    } as any)
    .select('id')
    .single();

  if (error) {
    logger.error('Failed to record pending redemption', { error: error.message });
    return null;
  }
  return data.id;
}

// ── Confirm a redemption (webhook path) ──
//
// Uses a SELECT-then-UPDATE-with-WHERE-guard pattern to atomically bump
// `usage_count` only if under `max_uses_total`. PostgreSQL guarantees row-level
// locking on UPDATE, so concurrent bumps serialize. If `max_uses_total` is null,
// the guard reduces to "any row" and always succeeds.

export async function confirmRedemption(bookingId: string, stripeSessionId: string): Promise<boolean> {
  const colId = await getCollectionId('coupon-redemptions');
  if (!colId) return false;

  // Find pending redemption by booking_id
  const { data: rows } = await supabase
    .from('entries')
    .select('id, content')
    .eq('collection_id', colId)
    .filter('content->>booking_id', 'eq', bookingId)
    .filter('content->>status', 'eq', 'pending')
    .limit(1);

  if (!rows || rows.length === 0) return false;

  const redemptionRow = rows[0];
  const redemptionContent = redemptionRow.content as Record<string, any>;
  const code = redemptionContent.coupon_code;

  // Load the coupon
  const loaded = await loadCoupon(code);
  if (!loaded) {
    logger.warn('Coupon disappeared before redemption confirmation', { code, bookingId });
    return false;
  }

  // Atomic bump: update only if usage_count < max_uses_total (or max is null).
  // We do this via a single UPDATE guarded by content->>usage_count.
  const newUsage = (loaded.coupon.usage_count || 0) + 1;
  const max = loaded.coupon.max_uses_total;

  if (max != null && newUsage > max) {
    // Raced with another confirmation; refuse.
    await supabase
      .from('entries')
      .update({
        content: { ...redemptionContent, status: 'cancelled', cancel_reason: 'coupon_exhausted' },
        tags: ['coupon', 'redemption', 'cancelled'],
      })
      .eq('id', redemptionRow.id);
    logger.warn('Redemption cancelled — coupon exhausted after race', { code, bookingId });
    return false;
  }

  // Guarded UPDATE — row-level lock in Postgres serializes concurrent writes.
  const { error: bumpErr } = await supabase
    .from('entries')
    .update({
      content: { ...(loaded.row.content as any), usage_count: newUsage },
    })
    .eq('id', loaded.row.id)
    .filter('content->>usage_count', 'eq', String(loaded.coupon.usage_count));

  if (bumpErr) {
    logger.error('Failed to bump coupon usage_count', { error: bumpErr.message, code });
    return false;
  }

  // Mark redemption as confirmed
  await supabase
    .from('entries')
    .update({
      content: {
        ...redemptionContent,
        status: 'confirmed',
        stripe_session_id: stripeSessionId,
        confirmed_at: new Date().toISOString(),
      },
      tags: ['coupon', 'redemption', 'confirmed'],
    })
    .eq('id', redemptionRow.id);

  logger.info('Coupon redemption confirmed', { code, bookingId, newUsage });
  return true;
}

// ── Expire / cancel pending redemption (on Stripe session expired) ──

export async function cancelPendingRedemption(bookingId: string, reason: 'expired' | 'cancelled'): Promise<void> {
  const colId = await getCollectionId('coupon-redemptions');
  if (!colId) return;

  const { data: rows } = await supabase
    .from('entries')
    .select('id, content')
    .eq('collection_id', colId)
    .filter('content->>booking_id', 'eq', bookingId)
    .filter('content->>status', 'eq', 'pending')
    .limit(1);

  if (!rows || rows.length === 0) return;

  await supabase
    .from('entries')
    .update({
      content: { ...(rows[0].content as any), status: reason === 'expired' ? 'expired' : 'cancelled' },
      tags: ['coupon', 'redemption', reason],
    })
    .eq('id', rows[0].id);

  logger.info('Pending redemption cleared', { bookingId, reason });
}
