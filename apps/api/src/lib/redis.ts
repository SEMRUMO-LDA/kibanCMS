/**
 * Redis Cache — Fallback layer for high availability
 *
 * Provides a `withFallbackCache` helper that wraps any async data-fetcher:
 *  1. Tries the primary source (Supabase).
 *  2. On success → stores a snapshot in Redis (fire-and-forget).
 *  3. On failure → serves the last-known snapshot from Redis.
 *
 * If REDIS_URL is not set or Redis is unreachable, the helper gracefully
 * degrades to a no-op — the app behaves exactly as before.
 */

import Redis from 'ioredis';
import { logger } from './logger.js';
import { tenantStore } from '../middleware/tenant.js';

// ── Redis connection (lazy, optional) ──

let redis: Redis | null = null;
let redisReady = false;

const REDIS_URL = process.env.REDIS_URL;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
      enableReadyCheck: true,
    });

    redis.on('ready', () => {
      redisReady = true;
      logger.info('Redis connected — fallback cache active');
    });

    redis.on('error', (err) => {
      redisReady = false;
      // Don't spam logs — one line is enough
      logger.warn('Redis error (fallback cache disabled)', { error: err.message });
    });

    redis.on('close', () => {
      redisReady = false;
    });

    // Connect (non-blocking)
    redis.connect().catch(() => {
      // Swallow — the 'error' handler already logs it
    });
  } catch {
    logger.warn('Redis init failed — fallback cache disabled');
  }
}

// ── Helpers ──

/** Default TTL for cached snapshots: 24 hours. Stale data is better than no data. */
const DEFAULT_TTL_SECONDS = 86400;

/** Build a namespaced cache key scoped to the current tenant. */
function buildKey(namespace: string): string {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
  return `kiban:${tenantId}:${namespace}`;
}

/**
 * Try to fetch from the primary source. On success, cache the result in Redis.
 * On failure, attempt to serve the last cached snapshot from Redis.
 *
 * @param cacheKey   A stable, descriptive key (e.g. "entries:blog:list:status=published")
 * @param fetcher    The async function that hits the primary DB (Supabase)
 * @param ttl        TTL in seconds for the cached snapshot (default 24h)
 */
export async function withFallbackCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL_SECONDS,
): Promise<{ data: T; fromCache: boolean }> {
  const fullKey = buildKey(cacheKey);

  try {
    // ── Primary path: hit the database ──
    const data = await fetcher();

    // Store snapshot in Redis (fire-and-forget — never delay the response)
    if (redis && redisReady) {
      redis.set(fullKey, JSON.stringify(data), 'EX', ttl).catch(() => {
        // Swallow — Redis being down shouldn't affect the response
      });
    }

    return { data, fromCache: false };
  } catch (primaryError: any) {
    // ── Fallback path: try Redis ──
    logger.warn('Primary DB failed, attempting Redis fallback', {
      key: cacheKey,
      error: primaryError.message,
    });

    if (redis && redisReady) {
      try {
        const cached = await redis.get(fullKey);
        if (cached) {
          logger.info('Serving stale data from Redis fallback', { key: cacheKey });
          return { data: JSON.parse(cached) as T, fromCache: true };
        }
      } catch (redisError: any) {
        logger.error('Redis fallback also failed', { error: redisError.message });
      }
    }

    // Both paths failed — re-throw the original error so the route handler
    // can return its normal 500 response.
    throw primaryError;
  }
}

/**
 * Invalidate (delete) a cached key. Call this after write operations
 * (POST/PUT/DELETE) so the next read fetches fresh data.
 */
export async function invalidateCache(cacheKey: string): Promise<void> {
  if (!redis || !redisReady) return;
  const fullKey = buildKey(cacheKey);
  redis.del(fullKey).catch(() => {});
}

/**
 * Invalidate all keys matching a pattern for the current tenant.
 * Useful after bulk operations (e.g. delete collection → all entries gone).
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  if (!redis || !redisReady) return;
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
  const fullPattern = `kiban:${tenantId}:${pattern}`;

  try {
    const keys = await redis.keys(fullPattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Swallow — cache invalidation failures are non-critical
  }
}

/** Check if Redis is currently connected and usable. */
export function isRedisAvailable(): boolean {
  return redisReady;
}
