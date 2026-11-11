/**
 * The HMAC secret behind every signed token this API issues: preview links,
 * newsletter confirm/unsubscribe links, inline-editing sessions.
 *
 * Order:
 *   1. PREVIEW_SECRET                — the setting to use (random 32+ chars)
 *   2. SUPABASE_SERVICE_ROLE_KEY     — single-tenant deployments
 *   3. the default tenant's service role key — multi-tenant deployments
 *      (TENANTS) that never set PREVIEW_SECRET. Without this fallback every
 *      signing call threw and the caller answered "Internal server error".
 *
 * Whatever is chosen, it is ONE secret per deployment: links are verified
 * before the tenant named in their payload is known.
 */

import { getDefaultTenant } from '../config/tenants.js';
import { logger } from './logger.js';

let warned = false;

export function signingSecret(): string {
  const explicit = process.env.PREVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (explicit) return explicit;

  const fallback = getDefaultTenant()?.supabaseServiceKey;
  if (fallback) {
    if (!warned) {
      warned = true;
      logger.warn('PREVIEW_SECRET is not set: signed links use the default tenant service key. Set PREVIEW_SECRET (random 32+ chars) in the environment.');
    }
    return fallback;
  }

  throw new Error('No PREVIEW_SECRET configured (and no SUPABASE_SERVICE_ROLE_KEY or default tenant to fall back to)');
}
