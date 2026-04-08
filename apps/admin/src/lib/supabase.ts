/**
 * Supabase Client Configuration — Multi-tenant aware
 *
 * In production: fetches Supabase credentials from /api/v1/config
 * (the API resolves the correct tenant based on hostname).
 *
 * In development: uses VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * from .env as fallback.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../shared/types/supabase.types';

// ── Singleton client (initialized by initSupabase) ──

let _supabase: SupabaseClient<Database> | null = null;
let _initPromise: Promise<SupabaseClient<Database>> | null = null;

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

/**
 * Initialize the Supabase client.
 * Tries /api/v1/config first (multi-tenant), falls back to env vars (dev).
 */
export async function initSupabase(): Promise<SupabaseClient<Database>> {
  if (_supabase) return _supabase;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Try fetching config from the API (same origin in production)
    try {
      const res = await fetch('/api/v1/config');
      if (res.ok) {
        const { data } = await res.json();
        if (data?.supabaseUrl && data?.supabaseAnonKey) {
          _supabase = buildClient(data.supabaseUrl, data.supabaseAnonKey);
          return _supabase;
        }
      }
    } catch {
      // API not available (dev mode with separate servers) — fall through
    }

    // Fallback to env vars (development)
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase config. Check .env or /api/v1/config.');
    }

    _supabase = buildClient(url, key);
    return _supabase;
  })();

  return _initPromise;
}

/**
 * Get the Supabase client (must call initSupabase first).
 * Throws if not initialized — use in code that runs after app init.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!_supabase) {
    throw new Error('Supabase not initialized. Call initSupabase() first.');
  }
  return _supabase;
}

// ── Backward-compatible export ──
// Uses a proxy so existing `import { supabase }` still works.
// The proxy delegates to the initialized client.

export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop: string | symbol) {
    if (!_supabase) {
      // During init, auth listeners may fire before client is ready
      // Return a no-op for auth-related calls
      if (prop === 'auth') {
        return new Proxy({}, {
          get() {
            return () => Promise.resolve({ data: null, error: null });
          },
        });
      }
      throw new Error('Supabase not initialized yet. Ensure initSupabase() completed.');
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
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
    return { data, error };
  },

  signUp: async (email: string, password: string, metadata?: Record<string, any>) => {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { data, error };
  },

  signOut: async () => {
    const { error } = await getSupabase().auth.signOut();
    return { error };
  },

  getSession: async () => {
    const { data, error } = await getSupabase().auth.getSession();
    return { data: data?.session, error };
  },

  getUser: async () => {
    const { data: { user }, error } = await getSupabase().auth.getUser();
    return { user, error };
  },

  resetPassword: async (email: string) => {
    const { data, error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { data, error };
  },

  updatePassword: async (newPassword: string) => {
    const { data, error } = await getSupabase().auth.updateUser({ password: newPassword });
    return { data, error };
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return getSupabase().auth.onAuthStateChange(callback);
  },
};

// ============================================
// STORAGE HELPERS
// ============================================

export const storage = {
  upload: async (bucket: string, path: string, file: File, options?: { upsert?: boolean; contentType?: string }) => {
    const { data, error } = await getSupabase().storage.from(bucket).upload(path, file, options);
    return { data, error };
  },

  download: async (bucket: string, path: string) => {
    const { data, error } = await getSupabase().storage.from(bucket).download(path);
    return { data, error };
  },

  getPublicUrl: (bucket: string, path: string) => {
    const { data } = getSupabase().storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  createSignedUrl: async (bucket: string, path: string, expiresIn: number) => {
    const { data, error } = await getSupabase().storage.from(bucket).createSignedUrl(path, expiresIn);
    return { data: data?.signedUrl, error };
  },

  delete: async (bucket: string, paths: string[]) => {
    const { data, error } = await getSupabase().storage.from(bucket).remove(paths);
    return { data, error };
  },

  list: async (bucket: string, path?: string, options?: { limit?: number; offset?: number }) => {
    const { data, error } = await getSupabase().storage.from(bucket).list(path, options);
    return { data, error };
  },
};

// ============================================
// REALTIME HELPERS
// ============================================

export const realtime = {
  subscribe: (table: string, callback: (payload: any) => void, filter?: string) => {
    const channel = getSupabase()
      .channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, callback)
      .subscribe();
    return channel;
  },

  unsubscribe: async (channel: any) => {
    await getSupabase().removeChannel(channel);
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
