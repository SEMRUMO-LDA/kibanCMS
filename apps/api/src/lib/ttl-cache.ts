/**
 * Tiny in-process TTL cache, namespaced by the current tenant.
 *
 * For values read on every visitor page view (captured site texts, popup
 * campaigns) where a minute of staleness is fine and a Supabase round-trip
 * per view is not. One process = one cache; Railway runs one instance.
 */

import { tenantStore } from '../middleware/tenant.js';

const store = new Map<string, { value: unknown; expires: number }>();
const MAX_ENTRIES = 5000;

function tenantKey(key: string): string {
  return `${tenantStore.getStore()?.tenant?.id || 'default'}:${key}`;
}

export function cacheGet<T>(key: string): T | undefined {
  const k = tenantKey(key);
  const hit = store.get(k);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) { store.delete(k); return undefined; }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(tenantKey(key), { value, expires: Date.now() + ttlMs });
  if (store.size > MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of store) if (v.expires < now) store.delete(k);
    if (store.size > MAX_ENTRIES) store.clear();
  }
  return value;
}

/** Drops every key of the current tenant that starts with `prefix`. */
export function cacheDelete(prefix: string): void {
  const p = tenantKey(prefix);
  for (const k of store.keys()) if (k.startsWith(p)) store.delete(k);
}
