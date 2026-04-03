/**
 * Safe Query Wrapper
 * Wraps ALL Supabase queries with:
 * - 8-second timeout (kills hung queries)
 * - Automatic retry on failure (1 retry)
 * - Error logging for diagnostics
 * - Never throws — returns { data, error, count }
 */

import { supabase } from './supabase';

const QUERY_TIMEOUT = 8000;

interface SafeResult<T> {
  data: T | null;
  error: string | null;
  count: number;
}

/** Execute a Supabase query with timeout and retry */
export async function safeQuery<T = any>(
  queryFn: () => PromiseLike<{ data: T; error: any; count?: number | null }>,
  label?: string
): Promise<SafeResult<T>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await Promise.race([
        queryFn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout (8s)')), QUERY_TIMEOUT)
        ),
      ]);

      if (result.error) {
        if (attempt === 0) {
          console.warn(`[Query] ${label || 'unknown'} failed (attempt 1):`, result.error.message, '— retrying');
          continue;
        }
        console.error(`[Query] ${label || 'unknown'} failed:`, result.error.message);
        return { data: null, error: result.error.message, count: 0 };
      }

      return { data: result.data, error: null, count: (result as any).count || 0 };
    } catch (err: any) {
      if (attempt === 0) {
        console.warn(`[Query] ${label || 'unknown'} exception (attempt 1):`, err.message, '— retrying');
        continue;
      }
      console.error(`[Query] ${label || 'unknown'} exception:`, err.message);
      return { data: null, error: err.message, count: 0 };
    }
  }

  return { data: null, error: 'Max retries exceeded', count: 0 };
}

/** Check if Supabase is reachable and auth is valid */
export async function checkConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const { error } = await Promise.race([
      supabase.from('profiles').select('id').limit(1).single(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      ),
    ]);
    return { ok: !error, latencyMs: Date.now() - start, error: error?.message };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}
