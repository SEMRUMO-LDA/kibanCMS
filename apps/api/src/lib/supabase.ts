/**
 * Supabase Client — Multi-tenant aware
 *
 * Uses AsyncLocalStorage to resolve the correct Supabase client
 * per request. Routes import { supabase, supabaseAdmin } as before —
 * no code changes needed in route handlers.
 *
 * In single-tenant mode (no TENANTS env var), falls back to
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { tenantStore } from '../middleware/tenant.js';

dotenv.config();

// ── Default clients (backward compat / fallback) ──

let defaultSupabase: SupabaseClient | null = null;
let defaultSupabaseAdmin: SupabaseClient | null = null;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && (supabaseServiceKey || supabaseAnonKey)) {
  defaultSupabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey!);
  defaultSupabaseAdmin = supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : defaultSupabase;
}

// ── Tenant-aware proxy ──
// When code does `supabase.from('table')`, the proxy intercepts
// and delegates to the current tenant's client automatically.

function createTenantProxy(key: 'supabase' | 'supabaseAdmin'): SupabaseClient {
  const fallback = key === 'supabase' ? defaultSupabase : defaultSupabaseAdmin;

  return new Proxy({} as SupabaseClient, {
    get(_, prop: string | symbol) {
      const store = tenantStore.getStore();
      const client = store ? store[key] : fallback;

      if (!client) {
        throw new Error(
          `No Supabase client available. Set SUPABASE_URL env var or configure TENANTS.`
        );
      }

      const value = (client as any)[prop];
      if (typeof value === 'function') {
        return value.bind(client);
      }
      return value;
    },
  });
}

export const supabase: SupabaseClient = createTenantProxy('supabase');
export const supabaseAdmin: SupabaseClient = createTenantProxy('supabaseAdmin');
