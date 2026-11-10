/**
 * Author for rows the server creates on its own (orders, bookings, coupon
 * redemptions, commission ledger…): entries.author_id is NOT NULL, so we use
 * the tenant's oldest admin. Cached per tenant for 5 minutes.
 */

import { supabase } from './supabase.js';
import { logger } from './logger.js';
import { tenantStore } from '../middleware/tenant.js';

const cache = new Map<string, { id: string; at: number }>();
const TTL_MS = 5 * 60_000;

export async function getAdminProfileId(): Promise<string | null> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.id;

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['super_admin', 'admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    logger.warn('No admin profile available for server-created records', { tenant: tenantId, error: error?.message });
    return null;
  }
  cache.set(tenantId, { id: data.id, at: Date.now() });
  return data.id;
}
