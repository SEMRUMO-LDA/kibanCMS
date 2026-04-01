/**
 * Supabase Client Configuration
 * Centralized configuration for all Supabase operations
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../shared/types/supabase.types';

// Environment variables (configure in .env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file.'
  );
}

// Create Supabase client with type safety
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'kibanCMS-auth',
    flowType: 'pkce',
  },
  global: {
    headers: {
      'x-application': 'kibanCMS',
    },
  },
  db: {
    schema: 'public',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// ============================================
// AUTH HELPERS
// ============================================

export const auth = {
  /**
   * Sign in with email and password
   */
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  /**
   * Sign up with email and password
   */
  signUp: async (email: string, password: string, metadata?: Record<string, any>) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { data, error };
  },

  /**
   * Sign out
   */
  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  /**
   * Get current session
   */
  getSession: async () => {
    const { data, error } = await supabase.auth.getSession();
    return { data: data?.session, error };
  },

  /**
   * Get current user
   */
  getUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
  },

  /**
   * Reset password
   */
  resetPassword: async (email: string) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { data, error };
  },

  /**
   * Update password
   */
  updatePassword: async (newPassword: string) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { data, error };
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  },
};

// ============================================
// STORAGE HELPERS
// ============================================

export const storage = {
  /**
   * Upload file to storage
   */
  upload: async (
    bucket: string,
    path: string,
    file: File,
    options?: { upsert?: boolean; contentType?: string }
  ) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, options);
    return { data, error };
  },

  /**
   * Download file from storage
   */
  download: async (bucket: string, path: string) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);
    return { data, error };
  },

  /**
   * Get public URL for file
   */
  getPublicUrl: (bucket: string, path: string) => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  /**
   * Create signed URL for private file
   */
  createSignedUrl: async (bucket: string, path: string, expiresIn: number) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    return { data: data?.signedUrl, error };
  },

  /**
   * Delete file from storage
   */
  delete: async (bucket: string, paths: string[]) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .remove(paths);
    return { data, error };
  },

  /**
   * List files in a folder
   */
  list: async (bucket: string, path?: string, options?: { limit?: number; offset?: number }) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path, options);
    return { data, error };
  },
};

// ============================================
// REALTIME HELPERS
// ============================================

export const realtime = {
  /**
   * Subscribe to table changes
   */
  subscribe: (
    table: string,
    callback: (payload: any) => void,
    filter?: string
  ) => {
    const channel = supabase
      .channel(`public:${table}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter,
        },
        callback
      )
      .subscribe();

    return channel;
  },

  /**
   * Unsubscribe from channel
   */
  unsubscribe: async (channel: any) => {
    await supabase.removeChannel(channel);
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
  if (error.code === 'PGRST116') {
    return new SupabaseError('No data found', error.code, error);
  }
  if (error.code === '23505') {
    return new SupabaseError('Duplicate entry', error.code, error);
  }
  if (error.code === '23503') {
    return new SupabaseError('Foreign key constraint violation', error.code, error);
  }
  if (error.code === '22P02') {
    return new SupabaseError('Invalid input syntax', error.code, error);
  }

  return new SupabaseError(
    error.message || 'An unexpected error occurred',
    error.code,
    error
  );
};

export default supabase;