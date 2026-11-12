/**
 * Popups add-on — pure helpers (no network, no DB).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePopup, isActive, matchesPage, parsePages } from '../lib/popups.js';

const base = {
  name: 'Natal', kind: 'bar', title: 'Promoção de Natal', text: '20% em massagens', button_label: 'Ver', button_action: 'link', button_url: 'https://x.pt/natal',
  pages: '/, /tours/*', trigger: 'delay', trigger_value: '3', frequency: 'days', frequency_days: 2, start_at: '2026-12-01', end_at: '2026-12-25',
  accent_color: '#C0FFEE', theme: 'dark', priority: '1', enabled: true,
};

describe('popups: normalize', () => {
  it('cleans every field and never trusts markup, colours or URLs', () => {
    const p = normalizePopup({ id: 'p1', content: { ...base, title: 'Olá <b>mundo</b>', button_url: 'javascript:alert(1)', accent_color: 'red', whatsapp_number: '+351 912 345 678' } });
    assert.equal(p.title, 'Olá mundo');
    assert.equal(p.url, '');
    assert.equal(p.accent, '');
    assert.equal(p.whatsapp, '+351912345678');
    assert.deepEqual(p.pages, ['/', '/tours/*']);
    assert.equal(p.trigger_value, 3);
    assert.equal(p.frequency_days, 2);
    assert.equal(p.priority, 1);
    assert.equal(p.start_at, '2026-12-01T00:00:00.000Z');
    assert.ok(p.end_at && p.end_at > '2026-12-25T20:00:00.000Z', 'a bare end date lasts until the end of that day');
    assert.equal(normalizePopup({ id: 'x', content: { kind: 'weird', trigger: 'never', frequency: 'nope' } }).kind, 'popup');
    assert.equal(normalizePopup({ id: 'x', content: { kind: 'bar', image: 'https://x.pt/a.png' } }).image, '', 'bars have no image');
    assert.equal(normalizePopup({ id: 'x', content: { button_url: '/promo' } }).url, '/promo');
    assert.equal(normalizePopup({ id: 'x', content: { button_url: '//evil.com' } }).url, '');
  });

  it('reads bare campaign dates as whole days in the site time zone', () => {
    const lisbonSummer = normalizePopup({ id: 'x', content: { ...base, start_at: '2026-07-01', end_at: '2026-07-10' } }, 'Europe/Lisbon');
    assert.equal(lisbonSummer.start_at, '2026-06-30T23:00:00.000Z'); // 00:00 WEST
    assert.equal(lisbonSummer.end_at, '2026-07-10T22:59:59.000Z');   // 23:59:59 WEST
    const lisbonWinter = normalizePopup({ id: 'x', content: { ...base, start_at: '2026-12-01' } }, 'Europe/Lisbon');
    assert.equal(lisbonWinter.start_at, '2026-12-01T00:00:00.000Z'); // WET = UTC
    const unknownZone = normalizePopup({ id: 'x', content: { ...base, start_at: '2026-12-01' } }, 'Mars/Olympus');
    assert.equal(unknownZone.start_at, '2026-12-01T00:00:00.000Z');   // falls back to UTC, never throws
    assert.equal(normalizePopup({ id: 'x', content: { ...base, start_at: '2026-12-01T10:30:00Z' } }, 'Europe/Lisbon').start_at, '2026-12-01T10:30:00.000Z');
  });
});

describe('popups: active window and requirements', () => {
  const dec10 = Date.parse('2026-12-10T12:00:00Z');
  it('respects enabled, dates and the data each action needs', () => {
    const p = normalizePopup({ id: 'p1', content: base });
    assert.equal(isActive(p, true, dec10), true);
    assert.equal(isActive(p, false, dec10), false);
    assert.equal(isActive(p, true, Date.parse('2026-11-30T12:00:00Z')), false);
    assert.equal(isActive(p, true, Date.parse('2026-12-25T22:00:00Z')), true, 'still on during the last day');
    assert.equal(isActive(p, true, Date.parse('2026-12-26T01:00:00Z')), false);
    assert.equal(isActive(normalizePopup({ id: 'x', content: { ...base, button_url: '' } }), true, dec10), false, 'link without URL');
    assert.equal(isActive(normalizePopup({ id: 'x', content: { ...base, button_action: 'coupon' } }), true, dec10), false, 'coupon without code');
    assert.equal(isActive(normalizePopup({ id: 'x', content: { ...base, title: '', text: '' } }), true, dec10), false, 'nothing to show');
    assert.equal(isActive(normalizePopup({ id: 'x', content: { ...base, button_action: 'close' } }), undefined, dec10), true);
  });
});

describe('popups: page targeting', () => {
  it('matches exact paths, prefixes with /* and everything with *', () => {
    assert.equal(matchesPage([], '/anything'), true);
    assert.equal(matchesPage(['*'], '/anything'), true);
    assert.equal(matchesPage(['/'], '/'), true);
    assert.equal(matchesPage(['/'], '/sobre'), false);
    assert.equal(matchesPage(['/tours/*'], '/tours'), true);
    assert.equal(matchesPage(['/tours/*'], '/tours/lisboa?x=1'), true);
    assert.equal(matchesPage(['/tours/*'], '/toursx'), false);
    assert.equal(matchesPage(['/sobre/'], '/sobre'), true);
    assert.deepEqual(parsePages(' /a ,\n/b/* ,, '), ['/a', '/b/*']);
  });
});
