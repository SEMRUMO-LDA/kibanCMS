/**
 * Soft-delete availability probe.
 *
 * Migration 004 adds entries.deleted_at. Tenants that haven't run it yet
 * cannot be filtered with .is('deleted_at', null) — the query 500s with a
 * "column does not exist" error. We probe once per tenant, cache the result,
 * and callers only apply the filter when the column is known to exist:
 *
 *   let q = supabase.from('entries').select(...);
 *   if (await hasSoftDelete()) q = q.is('deleted_at', null);
 */

import { supabase } from './supabase.js';
import { logger } from './logger.js';
import { tenantStore } from '../middleware/tenant.js';

const availability = new Map<string, boolean>();

export async function hasSoftDelete(): Promise<boolean> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
  const cached = availability.get(tenantId);
  if (cached !== undefined) return cached;

  const { error } = await supabase.from('entries').select('deleted_at').limit(1);
  const available = !error;
  availability.set(tenantId, available);

  if (!available) {
    logger.warn('Migration 004 not applied for tenant — Trash disabled', {
      tenant: tenantId,
      hint: "Run database/UPGRADE_TENANT.sql on this tenant's Supabase to enable Trash.",
    });
  }
  return available;
}
