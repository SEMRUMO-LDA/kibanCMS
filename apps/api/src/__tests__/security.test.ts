/**
 * Security guard unit tests — no server or database needed.
 * Run with: node --import tsx --test src/__tests__/security.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiKeyReadOnly, requireAdmin, hashApiKey, type AuthRequest } from '../middleware/auth.js';
import { sanitizeClientMetadata } from '../lib/stripe-metadata.js';
import { redactForPublic, PRIVATE_COLLECTIONS } from '../routes/entries.js';

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  return res;
}

function run(mw: any, req: Partial<AuthRequest>) {
  const res = mockRes();
  let nextCalled = false;
  const out = mw(req as AuthRequest, res, () => { nextCalled = true; });
  return Promise.resolve(out).then(() => ({ res, nextCalled }));
}

describe('apiKeyReadOnly', () => {
  it('lets API keys read', async () => {
    const { nextCalled } = await run(apiKeyReadOnly, { authType: 'api_key', method: 'GET' });
    assert.equal(nextCalled, true);
  });

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    it(`blocks API-key ${method}`, async () => {
      const { res, nextCalled } = await run(apiKeyReadOnly, { authType: 'api_key', method });
      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
    });
  }

  it('lets logged-in users write', async () => {
    const { nextCalled } = await run(apiKeyReadOnly, { authType: 'jwt', method: 'DELETE' });
    assert.equal(nextCalled, true);
  });
});

describe('requireAdmin', () => {
  it('rejects API keys without touching the database', async () => {
    const { res, nextCalled } = await run(requireAdmin, { authType: 'api_key', profileId: 'x', method: 'POST' });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  it('rejects unauthenticated requests', async () => {
    const { res, nextCalled } = await run(requireAdmin, { method: 'GET' });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});

describe('sanitizeClientMetadata', () => {
  it('drops server-controlled keys', () => {
    const clean = sanitizeClientMetadata({
      order_id: 'evil', booking_id: 'evil', tenant_id: 'other', coupon_code: 'FREE',
      source: 'x', campaign: 'summer', qty: 2,
    });
    assert.deepEqual(clean, { campaign: 'summer', qty: '2' });
  });

  it('handles junk input', () => {
    assert.deepEqual(sanitizeClientMetadata(null), {});
    assert.deepEqual(sanitizeClientMetadata('x'), {});
    assert.deepEqual(sanitizeClientMetadata(['a']), {});
  });
});

describe('public entry redaction', () => {
  it('strips secret-looking fields and author email', () => {
    const out = redactForPublic({
      id: '1',
      content: {
        site_name: 'Marsolve',
        resend_api_key: 're_123',
        stripe_secret_key: 'sk_live',
        notification_emails: 'a@b.pt',
        contact_email: 'info@marsolve.pt',
      },
      author: { id: 'u1', full_name: 'Ana', email: 'ana@private.pt' },
    });
    assert.deepEqual(out.content, { site_name: 'Marsolve', contact_email: 'info@marsolve.pt' });
    assert.deepEqual(out.author, { id: 'u1', full_name: 'Ana' });
  });

  it('marks secret/PII collections as private', () => {
    for (const slug of ['stripe-config', 'orders', 'bookings', 'form-submissions', 'newsletter-subscribers', 'coupons']) {
      assert.ok(PRIVATE_COLLECTIONS.has(slug), slug);
    }
    assert.ok(!PRIVATE_COLLECTIONS.has('blog'));
  });
});

describe('hashApiKey', () => {
  it("matches Postgres encode(digest(key, 'sha256'), 'hex')", () => {
    // SELECT encode(digest('abc', 'sha256'), 'hex');
    assert.equal(hashApiKey('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes a kiban key to 64 lowercase hex chars', () => {
    assert.match(hashApiKey('kiban_live_abcdefghijklmnopqrstuvwx'), /^[0-9a-f]{64}$/);
  });
});
