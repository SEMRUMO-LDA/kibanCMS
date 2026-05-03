/**
 * Affiliates library — commission ledger writes for the Affiliates add-on.
 *
 * Principles:
 *   1. Append-only: every event (accrual, reversal, payout, adjustment) is a
 *      new ledger row. Existing rows are never mutated. Balances are derived
 *      by summing ledger entries.
 *   2. Snapshots: each accrual records the affiliate's commission_rate and
 *      the order's customer-paid total *at the time of accrual*, so that
 *      changing the rate later does not retroactively rewrite history.
 *   3. Cents only: all amounts stored as integer cents to avoid float drift.
 *   4. Best-effort: webhooks are the caller — failures are logged but never
 *      crash payment confirmation. The ledger can be reconciled offline.
 */

import { supabase } from './supabase.js';
import { logger } from './logger.js';

type LedgerType = 'accrual' | 'reversal' | 'payout' | 'adjustment';
type LedgerStatus = 'pending' | 'confirmed' | 'cancelled';

interface AccrualInput {
  couponId: string;
  couponCode: string;
  orderId?: string;
  bookingId?: string;
  orderTotalCents: number;
  currency: string;
  stripeSessionId?: string;
  stripePaymentIntent?: string;
}

interface ReversalInput {
  stripePaymentIntent: string;
  refundedCents: number;     // amount refunded in cents (may be partial)
  originalChargeCents: number; // total amount of the original charge
}

interface PayoutInput {
  affiliateId: string;
  amountCents: number;
  currency: string;
  notes?: string;
}

async function getCollectionId(slug: string): Promise<string | null> {
  const { data } = await supabase.from('collections').select('id').eq('slug', slug).single();
  return data?.id || null;
}

function periodFor(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Accrue commission for a confirmed order/booking that used an affiliate-linked coupon.
 *
 * Looks up the coupon → resolves affiliate_id → reads current commission_rate →
 * writes one ledger row of type=accrual, status=confirmed.
 *
 * No-op (returns null) if the coupon has no affiliate, the affiliate is paused/archived,
 * or the addon is not installed. Idempotent on (orderId, type=accrual) — calling twice
 * for the same order will not duplicate.
 */
export async function accrueCommission(input: AccrualInput): Promise<string | null> {
  try {
    // 1. Resolve affiliate from coupon
    const couponsColId = await getCollectionId('coupons');
    if (!couponsColId) return null;

    const { data: couponEntry } = await supabase
      .from('entries')
      .select('id, content')
      .eq('id', input.couponId)
      .single();
    if (!couponEntry) return null;

    const couponContent = couponEntry.content as Record<string, any>;
    const affiliateId = couponContent.affiliate_id;
    if (!affiliateId) return null;

    // 2. Load affiliate
    const { data: affiliateEntry } = await supabase
      .from('entries')
      .select('id, content')
      .eq('id', affiliateId)
      .single();
    if (!affiliateEntry) {
      logger.warn('Affiliate referenced by coupon not found', { couponId: input.couponId, affiliateId });
      return null;
    }

    const a = affiliateEntry.content as Record<string, any>;
    if (a.status && a.status !== 'active') {
      logger.info('Skipping accrual — affiliate not active', { affiliateId, status: a.status });
      return null;
    }

    const rate = Number(a.commission_rate) || 0;
    if (rate <= 0) {
      logger.warn('Skipping accrual — affiliate has no commission_rate', { affiliateId });
      return null;
    }

    // 3. Compute commission and check ledger collection
    const ledgerColId = await getCollectionId('commission-ledger');
    if (!ledgerColId) {
      logger.info('Skipping accrual — Affiliates add-on not installed (no commission-ledger collection)');
      return null;
    }

    // Idempotency guard — same order should never accrue twice
    if (input.orderId) {
      const { data: existing } = await supabase
        .from('entries')
        .select('id')
        .eq('collection_id', ledgerColId)
        .filter('content->>order_id', 'eq', input.orderId)
        .filter('content->>type', 'eq', 'accrual')
        .limit(1);
      if (existing && existing.length > 0) {
        logger.info('Accrual already exists for order — skipping', { orderId: input.orderId });
        return existing[0].id;
      }
    }

    const amountCents = Math.round(input.orderTotalCents * rate / 100);
    if (amountCents <= 0) return null;

    const now = new Date();
    const ledgerContent = {
      affiliate_id: affiliateId,
      type: 'accrual' as LedgerType,
      amount_cents: amountCents,
      currency: input.currency,
      commission_rate_snapshot: rate,
      order_total_cents_snapshot: input.orderTotalCents,
      order_id: input.orderId || '',
      booking_id: input.bookingId || '',
      coupon_id: input.couponId,
      coupon_code: input.couponCode,
      stripe_session_id: input.stripeSessionId || '',
      stripe_payment_intent: input.stripePaymentIntent || '',
      related_event_id: '',
      period: periodFor(now),
      status: 'confirmed' as LedgerStatus,
      notes: '',
      created_at: now.toISOString(),
    };

    const { data: inserted, error } = await supabase
      .from('entries')
      .insert({
        collection_id: ledgerColId,
        slug: `accrual-${input.orderId || input.bookingId || Date.now()}`,
        content: ledgerContent,
        tags: ['commission', 'accrual'],
      })
      .select('id')
      .single();

    if (error) {
      logger.error('Failed to write commission accrual', { error: error.message, input });
      return null;
    }

    logger.info('Commission accrued', {
      affiliateId,
      amountCents,
      rate,
      orderId: input.orderId,
      ledgerId: inserted?.id,
    });
    return inserted?.id || null;
  } catch (err: any) {
    logger.error('accrueCommission threw', { error: err.message });
    return null;
  }
}

/**
 * Reverse commission proportionally for a refunded charge.
 *
 * Finds all accrual rows tagged with the given stripe_payment_intent and writes a
 * `reversal` row for each, scaled by `refundedCents / originalChargeCents`.
 * Idempotent per (originalAccrualId × refund event) — a second call for the
 * same charge writes a NEW reversal only if the cumulative refunded amount
 * has grown (handles multiple partial refunds).
 */
export async function reverseCommissionForCharge(input: ReversalInput): Promise<void> {
  try {
    if (input.refundedCents <= 0 || input.originalChargeCents <= 0) return;

    const ledgerColId = await getCollectionId('commission-ledger');
    if (!ledgerColId) return;

    // Find all accruals for this charge
    const { data: accruals } = await supabase
      .from('entries')
      .select('id, content')
      .eq('collection_id', ledgerColId)
      .filter('content->>stripe_payment_intent', 'eq', input.stripePaymentIntent)
      .filter('content->>type', 'eq', 'accrual');

    if (!accruals || accruals.length === 0) {
      logger.info('No accruals found for refunded charge — nothing to reverse', {
        chargeId: input.stripePaymentIntent,
      });
      return;
    }

    const refundRatio = input.refundedCents / input.originalChargeCents;

    for (const accrualEntry of accruals) {
      const a = accrualEntry.content as Record<string, any>;
      const accrualAmount = Number(a.amount_cents) || 0;
      if (accrualAmount <= 0) continue;

      // Sum prior reversals for this accrual
      const { data: priorReversals } = await supabase
        .from('entries')
        .select('content')
        .eq('collection_id', ledgerColId)
        .filter('content->>related_event_id', 'eq', accrualEntry.id)
        .filter('content->>type', 'eq', 'reversal');

      const alreadyReversedCents = (priorReversals || []).reduce((sum, r) => {
        const c = r.content as Record<string, any>;
        return sum + Math.abs(Number(c.amount_cents) || 0);
      }, 0);

      // Target: cumulative reversal should equal accrual × refundRatio
      const targetReversedCents = Math.round(accrualAmount * refundRatio);
      const deltaCents = targetReversedCents - alreadyReversedCents;

      if (deltaCents <= 0) {
        logger.info('Reversal already covered for accrual', {
          accrualId: accrualEntry.id,
          alreadyReversedCents,
          targetReversedCents,
        });
        continue;
      }

      const now = new Date();
      const reversalContent = {
        affiliate_id: a.affiliate_id,
        type: 'reversal' as LedgerType,
        amount_cents: -deltaCents, // negative
        currency: a.currency,
        commission_rate_snapshot: a.commission_rate_snapshot,
        order_total_cents_snapshot: a.order_total_cents_snapshot,
        order_id: a.order_id,
        booking_id: a.booking_id,
        coupon_id: a.coupon_id,
        coupon_code: a.coupon_code,
        stripe_session_id: a.stripe_session_id,
        stripe_payment_intent: input.stripePaymentIntent,
        related_event_id: accrualEntry.id,
        period: periodFor(now),
        status: 'confirmed' as LedgerStatus,
        notes: `Proportional reversal — refunded ${input.refundedCents} of ${input.originalChargeCents} cents (${(refundRatio * 100).toFixed(2)}%)`,
        created_at: now.toISOString(),
      };

      const { error } = await supabase
        .from('entries')
        .insert({
          collection_id: ledgerColId,
          slug: `reversal-${accrualEntry.id}-${Date.now()}`,
          content: reversalContent,
          tags: ['commission', 'reversal'],
        });

      if (error) {
        logger.error('Failed to write commission reversal', { error: error.message, accrualId: accrualEntry.id });
      } else {
        logger.info('Commission reversed', {
          accrualId: accrualEntry.id,
          reversedCents: deltaCents,
          chargeId: input.stripePaymentIntent,
        });
      }
    }
  } catch (err: any) {
    logger.error('reverseCommissionForCharge threw', { error: err.message });
  }
}

/**
 * Record a payout — admin marks an affiliate's monthly balance as paid.
 *
 * Writes a single ledger row of type=payout with amount_cents NEGATIVE so that
 * sum(ledger.amount_cents) for that affiliate naturally drops to whatever
 * remains pending (carry-over below the minimum threshold).
 */
export async function recordPayout(input: PayoutInput): Promise<string | null> {
  try {
    if (input.amountCents <= 0) return null;

    const ledgerColId = await getCollectionId('commission-ledger');
    if (!ledgerColId) return null;

    const now = new Date();
    const content = {
      affiliate_id: input.affiliateId,
      type: 'payout' as LedgerType,
      amount_cents: -Math.abs(input.amountCents),
      currency: input.currency,
      commission_rate_snapshot: 0,
      order_total_cents_snapshot: 0,
      order_id: '',
      booking_id: '',
      coupon_id: '',
      coupon_code: '',
      stripe_session_id: '',
      stripe_payment_intent: '',
      related_event_id: '',
      period: periodFor(now),
      status: 'confirmed' as LedgerStatus,
      notes: input.notes || '',
      created_at: now.toISOString(),
    };

    const { data: inserted, error } = await supabase
      .from('entries')
      .insert({
        collection_id: ledgerColId,
        slug: `payout-${input.affiliateId}-${Date.now()}`,
        content,
        tags: ['commission', 'payout'],
      })
      .select('id')
      .single();

    if (error) {
      logger.error('Failed to record payout', { error: error.message, input });
      return null;
    }
    return inserted?.id || null;
  } catch (err: any) {
    logger.error('recordPayout threw', { error: err.message });
    return null;
  }
}
