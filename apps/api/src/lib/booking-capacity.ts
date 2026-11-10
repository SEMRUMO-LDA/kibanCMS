/**
 * Booking seats: no overbooking, no seats held forever.
 *
 * Overbooking: the capacity check used to be "count, then insert", so two
 * buyers of the last seats could both pass. Now each booking is inserted and
 * then verified: bookings in the slot are ordered by (created_at, id) and a
 * booking keeps its seat only if the seats taken before it plus its own fit
 * the capacity. Concurrent requests compute the same order, so exactly the
 * later one is released — without locks or a DB function.
 *
 * Seats held forever: abandoned checkouts stayed "pending" and counted
 * against capacity. Checkout bookings now carry `checkout_expires_at` (the
 * Stripe session expires at the same time) and a sweeper marks unpaid ones
 * "expired". Delayed payment methods (e.g. Multibanco) extend the hold.
 */

import { supabase } from './supabase.js';
import { logger } from './logger.js';
import { hasSoftDelete } from './soft-delete.js';

export const HOLD_STATUSES = ['pending', 'confirmed'] as const;
/** Stripe allows 30 min – 24 h. */
export const CHECKOUT_HOLD_MINUTES = 60;
/** Extra hold while a delayed payment method (Multibanco, SEPA…) is processing. */
export const ASYNC_PAYMENT_HOLD_DAYS = 7;

export function participantsOf(content: Record<string, any> | null | undefined): number {
  const c = content || {};
  return Number(c.total_participants) || Number(c.party_size) ||
    ((Number(c.adults) || 0) + (Number(c.children) || 0)) || 0;
}

/** Stripe `expires_at` (unix seconds) + ISO string for the booking. */
export function checkoutExpiry(now: Date = new Date()): { unix: number; iso: string } {
  const at = new Date(now.getTime() + CHECKOUT_HOLD_MINUTES * 60 * 1000);
  return { unix: Math.floor(at.getTime() / 1000), iso: at.toISOString() };
}

export interface SlotBooking {
  id: string;
  created_at: string;
  content: Record<string, any>;
}

/**
 * Pure decision: does `bookingId` keep its seat? `rows` are the slot's
 * holding bookings (any order). Unknown booking → true (nothing to release).
 */
export function keepsSeatIn(rows: SlotBooking[], bookingId: string, capacity: number): boolean {
  const ordered = [...rows].sort((a, b) =>
    a.created_at === b.created_at ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : (a.created_at < b.created_at ? -1 : 1));
  let taken = 0;
  for (const row of ordered) {
    taken += participantsOf(row.content);
    if (row.id === bookingId) return taken <= capacity;
  }
  return true;
}

/** Verifies a just-inserted booking against the slot capacity (see header). */
export async function keepsSeat(
  bookingsColId: string,
  bookingId: string,
  slot: { resource_slug: string; date: string; time_slot: string },
  capacity: number,
): Promise<boolean> {
  let slotQuery = supabase
    .from('entries')
    .select('id, created_at, content')
    .eq('collection_id', bookingsColId)
    .filter('content->>resource_slug', 'eq', slot.resource_slug)
    .filter('content->>date', 'eq', slot.date)
    .filter('content->>time_slot', 'eq', slot.time_slot)
    .filter('content->>booking_status', 'in', `(${HOLD_STATUSES.map(s => `"${s}"`).join(',')})`);
  if (await hasSoftDelete()) slotQuery = slotQuery.is('deleted_at', null); // trashed bookings hold no seat
  const { data, error } = await slotQuery;
  if (error) {
    // Can't verify → keep the booking (same behaviour as before this check).
    logger.warn('Capacity verification failed — keeping booking', { bookingId, error: error.message });
    return true;
  }
  return keepsSeatIn((data || []) as SlotBooking[], bookingId, capacity);
}

/** Releases a booking that lost the race for the last seats. */
export async function releaseBooking(bookingId: string, reason: string): Promise<void> {
  const { data } = await supabase.from('entries').select('content').eq('id', bookingId).single();
  await supabase
    .from('entries')
    .update({
      content: { ...((data?.content as any) || {}), booking_status: 'cancelled', cancel_reason: reason, cancelled_at: new Date().toISOString() },
      tags: ['booking', 'cancelled'],
    } as any)
    .eq('id', bookingId);
}

/** Sets a status on bookings (and keeps tags in sync). Used by the webhook and the sweeper. */
export async function setBookingsStatus(
  bookingIds: string[],
  status: 'expired' | 'cancelled',
  extra: Record<string, unknown> = {},
  onlyIfPending = true,
): Promise<number> {
  let changed = 0;
  for (const id of bookingIds) {
    const { data } = await supabase.from('entries').select('content').eq('id', id).single();
    const c = (data?.content as Record<string, any>) || null;
    if (!c) continue;
    if (onlyIfPending && c.booking_status !== 'pending') continue;
    const { error } = await supabase
      .from('entries')
      .update({ content: { ...c, booking_status: status, ...extra }, tags: ['booking', status] } as any)
      .eq('id', id);
    if (!error) changed++;
  }
  return changed;
}

/**
 * Sweeper (runs from the scheduled publisher, per tenant): expires unpaid
 * checkout bookings so their seats return to the pool.
 *  - bookings with checkout_expires_at in the past (10 min grace)
 *  - legacy bookings (no checkout_expires_at) that went through Stripe
 *    (stripe_session_id) and are older than 25 h — Stripe's default session
 *    lifetime is 24 h, so they can no longer be paid
 */
export async function expireUnpaidBookingsForCurrentTenant(now: Date = new Date()): Promise<number> {
  const { data: col } = await supabase.from('collections').select('id').eq('slug', 'bookings').maybeSingle();
  if (!col) return 0;

  let pendingQuery = supabase
    .from('entries')
    .select('id, created_at, content')
    .eq('collection_id', col.id)
    .filter('content->>booking_status', 'eq', 'pending')
    .order('created_at', { ascending: true }) // oldest first, so a backlog can't starve newer holds
    .limit(500);
  if (await hasSoftDelete()) pendingQuery = pendingQuery.is('deleted_at', null);
  const { data, error } = await pendingQuery;
  if (error) {
    logger.warn('Booking expiry sweep: select failed', { error: error.message });
    return 0;
  }

  const graceMs = 10 * 60 * 1000;
  const legacyMs = 25 * 60 * 60 * 1000;
  const toExpire = ((data || []) as SlotBooking[]).filter(b => {
    const c = b.content || {};
    if (c.checkout_expires_at) return new Date(c.checkout_expires_at).getTime() + graceMs < now.getTime();
    return !!c.stripe_session_id && new Date(b.created_at).getTime() + legacyMs < now.getTime();
  }).map(b => b.id);

  if (!toExpire.length) return 0;
  const n = await setBookingsStatus(toExpire, 'expired', { expired_at: now.toISOString(), expire_reason: 'checkout_not_paid' });
  if (n) logger.info('Expired unpaid checkout bookings', { count: n });
  return n;
}

/**
 * A delayed payment method (Multibanco, SEPA…) completed the checkout but the
 * money hasn't arrived: keep the seats for longer instead of expiring them.
 */
export async function extendBookingHold(bookingIds: string[], now: Date = new Date()): Promise<number> {
  const until = new Date(now.getTime() + ASYNC_PAYMENT_HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let changed = 0;
  for (const id of bookingIds) {
    const { data } = await supabase.from('entries').select('content').eq('id', id).single();
    const c = (data?.content as Record<string, any>) || null;
    if (!c || c.booking_status !== 'pending') continue;
    const { error } = await supabase
      .from('entries')
      .update({ content: { ...c, checkout_expires_at: until, payment_status: 'awaiting_async_payment' } } as any)
      .eq('id', id);
    if (!error) changed++;
  }
  return changed;
}
