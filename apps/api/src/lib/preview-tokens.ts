/**
 * Preview Tokens — HMAC-signed short-lived tokens for draft entry access
 *
 * Lets editors share a preview URL that grants read-only access to a SINGLE
 * draft entry on the public-facing frontend, without exposing the entire
 * draft API. Tokens are scoped to a specific entry_id + tenant + expiry.
 *
 * Format: <base64url(payload)>.<base64url(hmac-sha256(payload, secret))>
 * Payload: { entry_id, tenant_id, exp }  (JSON, base64url-encoded)
 *
 * No external library needed — uses Node crypto. Verification is constant-time.
 */

import { createHmac, timingSafeEqual } from 'crypto';

interface PreviewPayload {
  entry_id: string;
  tenant_id: string;
  exp: number; // unix seconds
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

function base64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64url(s: string): Buffer {
  const pad = s.length % 4;
  const norm = s.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : '');
  return Buffer.from(norm, 'base64');
}

function getSecret(): string {
  // Prefer a dedicated PREVIEW_SECRET env var. Fall back to the service role
  // key (also a 64+ char secret tied to this deployment). NEVER fall back to
  // a hard-coded constant.
  const s = process.env.PREVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('No PREVIEW_SECRET (or SUPABASE_SERVICE_ROLE_KEY fallback) configured');
  return s;
}

function sign(payload: string): string {
  return base64url(createHmac('sha256', getSecret()).update(payload).digest());
}

export function generatePreviewToken(entryId: string, tenantId: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): {
  token: string;
  expiresAt: string;
} {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: PreviewPayload = { entry_id: entryId, tenant_id: tenantId, exp };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = sign(payloadB64);

  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyPreviewToken(token: string): PreviewPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;

    // Constant-time signature comparison
    const expected = sign(payloadB64);
    if (expected.length !== sig.length) return null;

    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(fromBase64url(payloadB64).toString('utf8')) as PreviewPayload;

    // Expiry check
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (!payload.entry_id || !payload.tenant_id) return null;
    return payload;
  } catch {
    return null;
  }
}
