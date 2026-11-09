import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyConsent, csvCell, monthStartIso } from '../routes/marketing.js';

const offered = ['necessary', 'analytics', 'marketing'];

test('classifyConsent: all offered categories accepted → all', () => {
  assert.equal(classifyConsent({ consent_given: true, categories: { necessary: true, analytics: true, marketing: true } }, offered), 'all');
});

test('classifyConsent: some accepted → custom', () => {
  assert.equal(classifyConsent({ consent_given: true, categories: { necessary: true, analytics: true, marketing: false } }, offered), 'custom');
});

test('classifyConsent: nothing optional / not given → rejected', () => {
  assert.equal(classifyConsent({ consent_given: false, categories: { necessary: true } }, offered), 'rejected');
  assert.equal(classifyConsent({ consent_given: true, categories: { necessary: true, analytics: false, marketing: false } }, offered), 'rejected');
  assert.equal(classifyConsent({ consent_given: true, categories: null }, offered), 'rejected');
});

test('classifyConsent: categories not offered are ignored', () => {
  assert.equal(classifyConsent({ consent_given: true, categories: { analytics: true, marketing: true, preferences: false } }, offered), 'all');
});

test('csvCell quotes and neutralises formulas', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+351 912'), `"'+351 912"`);
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(true), '"true"');
});

test('monthStartIso is the first day of the month (UTC)', () => {
  assert.equal(monthStartIso(new Date('2026-11-09T15:00:00Z')), '2026-11-01T00:00:00.000Z');
});
