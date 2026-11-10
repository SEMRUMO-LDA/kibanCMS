/**
 * GDPR add-on improvements — pure functions (no network, no DB).
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { signLink, verifyLink } from '../lib/signed-links.js';
import { newsletterConfirmTemplate, newsletterUnsubscribeConfirmTemplate, newsletterWelcomeTemplate } from '../lib/email-templates.js';

before(() => { process.env.PREVIEW_SECRET = process.env.PREVIEW_SECRET || 'test-secret-for-signed-links'; });

describe('signed links', () => {
  it('round-trips a payload', () => {
    const token = signLink({ t: 'confirm', e: 'abc', email: 'a@b.pt', tenant: 'x' }, 60);
    const p = verifyLink<{ t: string; e: string; email: string }>(token);
    assert.equal(p?.t, 'confirm');
    assert.equal(p?.email, 'a@b.pt');
  });

  it('rejects tampering, garbage and expiry', () => {
    const token = signLink({ t: 'unsub', e: 'abc' }, 60);
    const [payload, sig] = token.split('.');
    assert.equal(verifyLink(`${payload}x.${sig}`), null);
    assert.equal(verifyLink(`${payload}.${sig.slice(0, -2)}zz`), null);
    assert.equal(verifyLink('not-a-token'), null);
    assert.equal(verifyLink(null), null);
    assert.equal(verifyLink(signLink({ t: 'unsub' }, -10)), null);
  });
});

describe('newsletter email templates', () => {
  it('confirmation carries the link and escapes the address', () => {
    const { html, subject } = newsletterConfirmTemplate('a<b@x.pt', 'Site', 'https://kiban.pt/api/v1/newsletter/confirm?token=T.S');
    assert.match(html, /href="https:\/\/kiban\.pt\/api\/v1\/newsletter\/confirm\?token=T\.S"/);
    assert.match(html, /a&lt;b@x\.pt/);
    assert.match(subject, /Confirm/i);
  });

  it('welcome includes the signed unsubscribe link when given', () => {
    const { html } = newsletterWelcomeTemplate('a@b.pt', 'Site', 'https://kiban.pt/api/v1/newsletter/unsubscribe?token=U.S');
    assert.match(html, /unsubscribe\?token=U\.S/);
    const { html: plain } = newsletterWelcomeTemplate('a@b.pt', 'Site');
    assert.doesNotMatch(plain, /unsubscribe\?token/);
  });

  it('unsubscribe confirmation carries the link', () => {
    const { html } = newsletterUnsubscribeConfirmTemplate('a@b.pt', 'Site', 'https://kiban.pt/u?token=1.2');
    assert.match(html, /href="https:\/\/kiban\.pt\/u\?token=1\.2"/);
  });
});
