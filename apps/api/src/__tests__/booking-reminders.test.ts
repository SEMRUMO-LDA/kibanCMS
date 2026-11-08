/**
 * Booking reminder timing + template — no server or database needed.
 * Run with: node --import tsx --test src/__tests__/booking-reminders.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wallClock, hoursUntilBooking } from '../lib/post-tour-reviews-worker.js';
import { bookingReminderTemplate } from '../lib/email-templates.js';

describe('reminder timing (site time zone)', () => {
  it('formats wall-clock time in the given zone', () => {
    // 2026-07-01 08:30 UTC = 09:30 in Lisbon (summer time, UTC+1)
    assert.equal(wallClock(new Date('2026-07-01T08:30:00Z'), 'Europe/Lisbon'), '2026-07-01T09:30');
    // winter: Lisbon = UTC
    assert.equal(wallClock(new Date('2026-12-01T08:30:00Z'), 'Europe/Lisbon'), '2026-12-01T08:30');
  });

  it('computes hours until a local booking slot', () => {
    const now = new Date('2026-07-01T08:00:00Z'); // 09:00 Lisbon
    assert.equal(hoursUntilBooking('2026-07-02', '10:00', now, 'Europe/Lisbon'), 25);
    assert.equal(hoursUntilBooking('2026-07-02', '9:00', now, 'Europe/Lisbon'), 24);
    assert.equal(hoursUntilBooking('2026-07-01', '10:00-12:00', now, 'Europe/Lisbon'), 1);
  });

  it('returns null for invalid dates and falls back to 09:00 without a slot', () => {
    assert.equal(hoursUntilBooking('amanhã', '10:00', new Date(), 'Europe/Lisbon'), null);
    const now = new Date('2026-12-01T09:00:00Z');
    assert.equal(hoursUntilBooking('2026-12-02', '', now, 'Europe/Lisbon'), 24);
  });

  it('survives an invalid time zone setting', () => {
    assert.match(wallClock(new Date(), 'Not/AZone'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe('bookingReminderTemplate', () => {
  const booking = { customer_name: 'Ana', resource_title: 'Passeio de Barco', date: '2026-07-02', time_slot: '10:00', total_participants: 3 };

  it('uses the defaults with placeholders filled', () => {
    const { subject, html } = bookingReminderTemplate({ booking, language: 'pt', config: {}, siteName: 'Marsolve' });
    assert.equal(subject, 'Lembrete: Passeio de Barco — 2026-07-02 às 10:00');
    assert.ok(html.includes('Olá Ana,'));
    assert.ok(html.includes('3 pessoa(s)'));
  });

  it('uses custom text, falling back to PT when EN is empty', () => {
    const config = { reminder_subject_pt: 'Até amanhã, {customer_name}!' };
    assert.equal(bookingReminderTemplate({ booking, language: 'en', config, siteName: 'X' }).subject, 'Até amanhã, Ana!');
  });

  it('escapes HTML in customer data', () => {
    const { html } = bookingReminderTemplate({ booking: { ...booking, customer_name: '<b>x</b>' }, language: 'en', config: {}, siteName: 'X' });
    assert.ok(!html.includes('<b>x</b>'));
  });
});
