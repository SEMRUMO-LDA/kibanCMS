/**
 * Signed links — HMAC-SHA256 tokens for one-click actions sent by email
 * (confirm a newsletter subscription, unsubscribe). Nobody can forge or
 * replay them for another address, and they expire.
 *
 * Format: <base64url(payload)>.<base64url(hmac)>   payload = JSON { ..., exp }
 * Same secret policy as preview tokens: PREVIEW_SECRET, else the service
 * role key of this deployment. Never a hard-coded fallback.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { signingSecret } from './signing-secret.js';

function base64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64url(s: string): Buffer {
  const pad = s.length % 4;
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : ''), 'base64');
}

function sign(payloadB64: string): string {
  return base64url(createHmac('sha256', signingSecret()).update(payloadB64).digest());
}

export function signLink<T extends Record<string, unknown>>(payload: T, ttlSeconds: number): string {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadB64 = base64url(JSON.stringify(body));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Returns the payload, or null when the token is malformed, tampered with or expired. */
export function verifyLink<T extends Record<string, unknown>>(token: unknown): (T & { exp: number }) | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try { expected = sign(payloadB64); } catch { return null; }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromBase64url(payloadB64).toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
