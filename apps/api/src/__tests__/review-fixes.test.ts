/**
 * Regression tests for the Nov 2026 holistic review — pure functions only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bookingConfirmationTemplate } from '../lib/email-templates.js';
import { redactForPublic } from '../routes/entries.js';
import { participantsOf } from '../lib/booking-capacity.js';

describe('bookingConfirmationTemplate accepts every producer shape', () => {
  it('bookings v2: resource_title / party_size / amount in cents', () => {
    const { html } = bookingConfirmationTemplate({
      customer_name: 'Ana', resource_title: 'Rio Arade Sunset', resource_slug: 'rio-arade',
      date: '2026-12-01', time_slot: '17:00', party_size: 2, party_size_secondary: 1, amount: 5997, currency: 'eur',
    }, 'Hakura');
    assert.match(html, /Rio Arade Sunset/);
    assert.match(html, /59\.97 €/);
    assert.match(html, />2</);
    assert.match(html, />1</);
    assert.doesNotMatch(html, /rio-arade/);
  });

  it('unified checkout: tour_title / adults / children', () => {
    const { html } = bookingConfirmationTemplate({
      customer_name: 'Rui', tour_title: 'Kayak', tour_slug: 'kayak', date: '2026-12-02', time_slot: '10:00',
      adults: 3, children: 0, amount: 12000, currency: 'eur',
    }, 'Site');
    assert.match(html, /Kayak/);
    assert.match(html, /120\.00 €/);
    assert.doesNotMatch(html, /Crianças/); // 0 children → row omitted
  });

  it('legacy: tour_name / total_amount in euros', () => {
    const { html } = bookingConfirmationTemplate({ tour_name: 'Old', total_amount: 45, date: '2026-01-01' }, 'Site');
    assert.match(html, /Old/);
    assert.match(html, /45€/);
  });

  it('escapes customer-controlled values', () => {
    const { html } = bookingConfirmationTemplate({ customer_name: '<img src=x onerror=alert(1)>', resource_title: 'T', date: 'd' }, 'S');
    assert.doesNotMatch(html, /<img src=x/);
  });
});

describe('redactForPublic', () => {
  it('strips credential-like keys added in the review', () => {
    const out = redactForPublic({ content: {
      title: 'ok', webhook_url: 'https://x', smtp_password: 'p', service_role_key: 'k', crm_credential: 'c', dsn: 'd', public_note: 'n',
    } });
    assert.deepEqual(Object.keys(out.content).sort(), ['public_note', 'title']);
  });
});

describe('participantsOf', () => {
  it('prefers total_participants, then party sizes, then adults+children', () => {
    assert.equal(participantsOf({ total_participants: 4, party_size: 1 }), 4);
    assert.equal(participantsOf({ party_size: 2 }), 2); // legacy rows: party_size only
    assert.equal(participantsOf({ adults: 2, children: 2 }), 4);
    assert.equal(participantsOf(null), 0);
  });
});
