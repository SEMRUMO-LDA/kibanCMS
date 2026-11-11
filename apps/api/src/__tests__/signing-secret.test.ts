/**
 * signingSecret() — the one secret behind preview links, newsletter links
 * and inline-editing sessions. Multi-tenant deployments (TENANTS) often have
 * neither PREVIEW_SECRET nor a global SUPABASE_SERVICE_ROLE_KEY; signing must
 * still work there (default tenant key) instead of answering 500.
 *
 * loadTenants() only ever adds state, so the "nothing configured" case runs
 * first, before any tenant is loaded.
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { signingSecret } from '../lib/signing-secret.js';
import { loadTenants } from '../config/tenants.js';
import { signLink, verifyLink } from '../lib/signed-links.js';

const ENV_KEYS = ['PREVIEW_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TENANTS'] as const;
const saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));

describe('signingSecret', () => {
  beforeEach(() => { for (const k of ENV_KEYS) delete process.env[k]; });
  after(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  });

  it('throws only when there is nothing to sign with', () => {
    assert.throws(() => signingSecret(), /PREVIEW_SECRET/);
    assert.equal(verifyLink('abc.def'), null); // verification never throws
  });

  it('prefers PREVIEW_SECRET', () => {
    process.env.PREVIEW_SECRET = 'explicit-secret';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    assert.equal(signingSecret(), 'explicit-secret');
  });

  it('falls back to the global service role key (single tenant)', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    assert.equal(signingSecret(), 'service-key');
  });

  it('falls back to the default tenant key in multi-tenant mode', () => {
    process.env.TENANTS = JSON.stringify({
      lunes: { supabaseUrl: 'https://a.supabase.co', supabaseAnonKey: 'anon-a', supabaseServiceKey: 'service-a', hostnames: ['kiban.pt'] },
      hakura: { supabaseUrl: 'https://b.supabase.co', supabaseAnonKey: 'anon-b', supabaseServiceKey: 'service-b', hostnames: [] },
    });
    loadTenants();
    assert.equal(signingSecret(), 'service-a');

    // The whole signing round trip works without any secret env var.
    const token = signLink({ t: 'edit', uid: 'u1', tenant: 'hakura' }, 60);
    assert.equal(verifyLink<{ t: string; tenant: string }>(token)?.tenant, 'hakura');
  });
});
