/**
 * Supabase Client Configuration — Multi-tenant aware
 *
 * Flow:
 * 1. Check localStorage for saved tenant config (returning user)
 * 2. If found → init Supabase with saved config
 * 3. If not → no Supabase init (login page will handle it)
 * 4. After login → initSupabaseWithConfig() saves config and inits client
 *
 * In development: uses VITE_ env vars as fallback.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../shared/types/supabase.types';

const TENANT_STORAGE_KEY = 'kiban_tenant';

// ── Singleton client ──

let _supabase: SupabaseClient<Database> | null = null;
let _tenantId: string | null = null;

function buildClient(url: string, anonKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
    global: {
      headers: { 'x-application': 'kibanCMS' },
    },
    db: { schema: 'public' },
  });
}

interface TenantConfig {
  tenantId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Get saved tenant config from localStorage.
 */
function getSavedTenant(): TenantConfig | null {
  try {
    const raw = localStorage.getItem(TENANT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save tenant config to localStorage.
 */
function saveTenant(config: TenantConfig): void {
  localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(config));
}

/**
 * Clear tenant config (on logout).
 */
export function clearTenant(): void {
  localStorage.removeItem(TENANT_STORAGE_KEY);
  _supabase = null;
  _tenantId = null;
}

/**
 * Initialize Supabase from saved config or env vars.
 * Returns true if client is ready, false if login is needed.
 */
export async function initSupabase(): Promise<boolean> {
  if (_supabase) return true;

  // 1. Check localStorage for saved tenant
  const saved = getSavedTenant();
  if (saved) {
    _supabase = buildClient(saved.supabaseUrl, saved.supabaseAnonKey);
    _tenantId = saved.tenantId;
    return true;
  }

  // 2. Fallback to env vars (development)
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (url && key) {
    _supabase = buildClient(url, key);
    _tenantId = 'default';
    return true;
  }

  // 3. No config available — login will provide it
  return false;
}

/**
 * Initialize Supabase with config from login response.
 * Called after successful POST /api/v1/auth/login.
 */
export function initSupabaseWithConfig(config: TenantConfig): SupabaseClient<Database> {
  saveTenant(config);
  _supabase = buildClient(config.supabaseUrl, config.supabaseAnonKey);
  _tenantId = config.tenantId;
  return _supabase;
}

/**
 * Get the current tenant ID (for X-Tenant header).
 */
export function getTenantId(): string | null {
  return _tenantId;
}

/**
 * Get the Supabase client. Returns null if not initialized.
 */
export function getSupabase(): SupabaseClient<Database> | null {
  return _supabase;
}

// ── Backward-compatible export ──
// Proxy delegates to the initialized client.

export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop: string | symbol) {
    if (!_supabase) {
      if (prop === 'auth') {
        return new Proxy({}, {
          get() {
            return () => Promise.resolve({ data: null, error: null });
          },
        });
      }
      return undefined;
    }
    const value = (_supabase as any)[prop];
    if (typeof value === 'function') {
      return value.bind(_supabase);
    }
    return value;
  },
});

// ============================================
// AUTH HELPERS
// ============================================

export const auth = {
  signIn: async (email: string, password: string) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    return { data, error };
  },

  signOut: async () => {
    const client = getSupabase();
    if (!client) return { error: null };
    const { error } = await client.auth.signOut();
    return { error };
  },

  getSession: async () => {
    const client = getSupabase();
    if (!client) return { data: null, error: null };
    const { data, error } = await client.auth.getSession();
    return { data: data?.session, error };
  },

  getUser: async () => {
    const client = getSupabase();
    if (!client) return { user: null, error: null };
    const { data: { user }, error } = await client.auth.getUser();
    return { user, error };
  },

  resetPassword: async (email: string) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { data, error };
  },

  updatePassword: async (newPassword: string) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.auth.updateUser({ password: newPassword });
    return { data, error };
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    const client = getSupabase();
    if (!client) return { data: { subscription: { unsubscribe: () => {} } } };
    return client.auth.onAuthStateChange(callback);
  },
};

// ============================================
// STORAGE HELPERS
// ============================================

export const storage = {
  upload: async (bucket: string, path: string, file: File, options?: { upsert?: boolean; contentType?: string }) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.storage.from(bucket).upload(path, file, options);
    return { data, error };
  },

  download: async (bucket: string, path: string) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.storage.from(bucket).download(path);
    return { data, error };
  },

  getPublicUrl: (bucket: string, path: string) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  createSignedUrl: async (bucket: string, path: string, expiresIn: number) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
    return { data: data?.signedUrl, error };
  },

  delete: async (bucket: string, paths: string[]) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.storage.from(bucket).remove(paths);
    return { data, error };
  },

  list: async (bucket: string, path?: string, options?: { limit?: number; offset?: number }) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.storage.from(bucket).list(path, options);
    return { data, error };
  },
};

// ============================================
// REALTIME HELPERS
// ============================================

export const realtime = {
  subscribe: (table: string, callback: (payload: any) => void, filter?: string) => {
    const client = getSupabase();
    if (!client) throw new Error('Supabase not initialized');
    const channel = client
      .channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, callback)
      .subscribe();
    return channel;
  },

  unsubscribe: async (channel: any) => {
    const client = getSupabase();
    if (!client) return;
    await client.removeChannel(channel);
  },
};

// ============================================
// ERROR HANDLING
// ============================================

export class SupabaseError extends Error {
  code?: string;
  details?: any;

  constructor(message: string, code?: string, details?: any) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
    this.details = details;
  }
}

export const handleSupabaseError = (error: any): SupabaseError => {
  if (error.code === 'PGRST116') return new SupabaseError('No data found', error.code, error);
  if (error.code === '23505') return new SupabaseError('Duplicate entry', error.code, error);
  if (error.code === '23503') return new SupabaseError('Foreign key constraint violation', error.code, error);
  if (error.code === '22P02') return new SupabaseError('Invalid input syntax', error.code, error);
  return new SupabaseError(error.message || 'An unexpected error occurred', error.code, error);
};

export default supabase;
