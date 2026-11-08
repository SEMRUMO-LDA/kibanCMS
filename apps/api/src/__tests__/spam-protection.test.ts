/**
 * Spam protection — no server or database needed.
 * Run with: node --import tsx --test src/__tests__/spam-protection.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isHoneypotTriggered, getTurnstileToken, verifyTurnstile, checkSpam } from '../lib/spam-protection.js';

describe('honeypot', () => {
  it('is triggered when a hidden field is filled', () => {
    assert.equal(isHoneypotTriggered({ _hp: 'http://spam.example' }), true);
    assert.equal(isHoneypotTriggered({ _gotcha: 'x' }), true);
  });

  it('is not triggered by empty or absent fields', () => {
    assert.equal(isHoneypotTriggered({ _hp: '' }), false);
    assert.equal(isHoneypotTriggered({ _hp: '   ' }), false);
    assert.equal(isHoneypotTriggered({ email: 'a@b.pt' }), false);
    assert.equal(isHoneypotTriggered(undefined), false);
  });

  it('checkSpam short-circuits on the honeypot (no network or DB)', async () => {
    assert.equal(await checkSpam({ _hp: 'bot' }), 'honeypot');
  });
});

describe('turnstile', () => {
  it('reads the token from either field name', () => {
    assert.equal(getTurnstileToken({ turnstile_token: 'a' }), 'a');
    assert.equal(getTurnstileToken({ 'cf-turnstile-response': 'b' }), 'b');
    assert.equal(getTurnstileToken({}), '');
  });

  it('reports a missing token without calling Cloudflare', async () => {
    assert.equal(await verifyTurnstile('', 'secret'), 'missing');
  });
});
