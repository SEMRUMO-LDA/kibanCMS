/**
 * Meta Conversions API — pure functions (no network, no DB).
 * Run with: node --import tsx --test src/__tests__/meta-capi.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashEmail, hashPhone, hashName, readTracking, shouldSend, buildEvent, splitName,
  trackingToMetadata, trackingFromMetadata, type CapiConfig,
} from '../lib/meta-capi.js';

const cfg: CapiConfig = { enabled: true, pixelId: '123', accessToken: 'tok', testEventCode: '', consentMode: 'required' };

describe('hashing (Meta normalisation)', () => {
  it('hashes a normalised email', () => {
    // sha256("test@example.com")
    assert.equal(hashEmail('  Test@Example.com '), '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b');
    assert.equal(hashEmail('not-an-email'), undefined);
  });
  it('keeps only phone digits (and drops a leading 00)', () => {
    assert.equal(hashPhone('+351 912 345 678'), hashPhone('00351912345678'));
    assert.equal(hashPhone('123'), undefined);
  });
  it('lowercases names', () => {
    assert.equal(hashName('Ana'), hashName(' ana '));
    assert.deepEqual(splitName('Ana Maria Silva'), { firstName: 'Ana', lastName: 'Silva' });
  });
});

describe('GDPR consent gate', () => {
  it('sends only with explicit marketing consent by default', () => {
    assert.equal(shouldSend(cfg, true).send, true);
    assert.deepEqual(shouldSend(cfg, false), { send: false, reason: 'no_marketing_consent' });
    assert.deepEqual(shouldSend(cfg, undefined), { send: false, reason: 'no_marketing_consent' });
  });
  it('"always" mode sends without consent; disabled/unconfigured never sends', () => {
    assert.equal(shouldSend({ ...cfg, consentMode: 'always' }, undefined).send, true);
    assert.equal(shouldSend({ ...cfg, enabled: false }, true).send, false);
    assert.equal(shouldSend({ ...cfg, accessToken: '' }, true).send, false);
    assert.equal(shouldSend(null, true).send, false);
  });
  it('readTracking only accepts boolean true as consent', () => {
    assert.equal(readTracking({ tracking: { marketing_consent: 'yes' } }).marketing_consent, false);
    assert.equal(readTracking({ tracking: { marketing_consent: true } }).marketing_consent, true);
    assert.equal(readTracking({}).marketing_consent, false);
    assert.equal(readTracking({ source_url: 'https://x.pt/contacto' }).source_url, 'https://x.pt/contacto');
  });
});

describe('event payload', () => {
  it('builds a deduplicable event with hashed user data', () => {
    const ev = buildEvent({
      name: 'Purchase', eventId: 'order_1', sourceUrl: 'https://x.pt/checkout',
      user: { email: 'a@b.pt', phone: '+351912345678', ip: '1.2.3.4', userAgent: 'UA', fbp: 'fb.1.1.1', fbc: 'fb.1.1.abc' },
      custom: { value: 35, currency: 'EUR' }, time: new Date('2027-01-01T00:00:00Z'),
    });
    assert.equal(ev.event_name, 'Purchase');
    assert.equal(ev.event_id, 'order_1');
    assert.equal(ev.action_source, 'website');
    assert.equal(ev.event_time, 1798761600);
    assert.equal(ev.user_data.em[0].length, 64);
    assert.ok(!JSON.stringify(ev).includes('a@b.pt'), 'raw email must never be sent');
    assert.equal(ev.user_data.fbp, 'fb.1.1.1');
    assert.deepEqual(ev.custom_data, { value: 35, currency: 'EUR' });
  });
});

describe('checkout → webhook tracking (Stripe metadata)', () => {
  it('round-trips within the 500-char limit', () => {
    const t = { marketing_consent: true, event_id: 'e1', fbp: 'fb.1.1.1', fbc: 'fb.1.1.' + 'x'.repeat(300), source_url: 'https://x.pt/' + 'y'.repeat(300), ip: '1.2.3.4', ua: 'Mozilla/5.0 '.repeat(40) };
    const meta = trackingToMetadata(t)!;
    assert.ok(meta.length <= 500);
    const back = trackingFromMetadata(meta)!;
    assert.equal(back.marketing_consent, true);
    assert.equal(back.event_id, 'e1');
    assert.equal(back.ip, '1.2.3.4');
    assert.equal(trackingToMetadata(null), undefined);
    assert.equal(trackingFromMetadata('not json'), null);
  });
});
