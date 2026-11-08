/**
 * Booking seat rules — no server or database needed.
 * Run with: node --import tsx --test src/__tests__/booking-capacity.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { keepsSeatIn, participantsOf, checkoutExpiry, CHECKOUT_HOLD_MINUTES, type SlotBooking } from '../lib/booking-capacity.js';

const row = (id: string, created_at: string, n: number): SlotBooking => ({ id, created_at, content: { total_participants: n } });

describe('participantsOf', () => {
  it('reads every spelling used by the two checkout flows', () => {
    assert.equal(participantsOf({ total_participants: 4 }), 4);
    assert.equal(participantsOf({ party_size: 3 }), 3);
    assert.equal(participantsOf({ adults: 2, children: 1 }), 3);
    assert.equal(participantsOf({}), 0);
  });
});

describe('keepsSeatIn (insert-then-verify)', () => {
  it('keeps a booking that fits', () => {
    const rows = [row('a', '2026-11-08T10:00:00Z', 6), row('b', '2026-11-08T10:01:00Z', 4)];
    assert.equal(keepsSeatIn(rows, 'b', 10), true);
  });

  it('releases the later of two concurrent buyers of the last seats', () => {
    // capacity 10, 8 already taken, two buyers of 2 seats arrive at once
    const rows = [
      row('old', '2026-11-08T09:00:00Z', 8),
      row('x', '2026-11-08T10:00:00.100Z', 2),
      row('y', '2026-11-08T10:00:00.200Z', 2),
    ];
    assert.equal(keepsSeatIn(rows, 'x', 10), true);
    assert.equal(keepsSeatIn(rows, 'y', 10), false);
  });

  it('breaks timestamp ties by id, identically for both requests', () => {
    const rows = [row('old', '2026-11-08T09:00:00Z', 9), row('b2', 'T', 1), row('a1', 'T', 1)];
    assert.equal(keepsSeatIn(rows, 'a1', 10), true);
    assert.equal(keepsSeatIn(rows, 'b2', 10), false);
  });

  it('is order-independent (rows may come back in any order)', () => {
    const rows = [row('y', '2', 2), row('old', '0', 8), row('x', '1', 2)];
    assert.equal(keepsSeatIn(rows, 'x', 10), true);
    assert.equal(keepsSeatIn(rows, 'y', 10), false);
  });

  it('keeps unknown bookings (nothing to release)', () => {
    assert.equal(keepsSeatIn([], 'ghost', 1), true);
  });
});

describe('checkoutExpiry', () => {
  it('is CHECKOUT_HOLD_MINUTES ahead, within Stripe limits (30 min – 24 h)', () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const { unix, iso } = checkoutExpiry(now);
    assert.equal(iso, new Date(now.getTime() + CHECKOUT_HOLD_MINUTES * 60_000).toISOString());
    const minutes = (unix * 1000 - now.getTime()) / 60_000;
    assert.ok(minutes >= 30 && minutes <= 24 * 60);
  });
});
