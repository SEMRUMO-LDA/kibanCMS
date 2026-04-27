/**
 * Scheduled Publisher Worker
 *
 * Polls every minute for entries with status='scheduled' whose published_at
 * has passed, and flips them to status='published'.
 *
 * Multi-tenant: iterates over every configured tenant and runs the publish
 * pass within that tenant's AsyncLocalStorage context, so the supabase Proxy
 * resolves to the correct per-tenant client.
 *
 * Idempotent: if a publish job runs twice (e.g. across worker restarts), the
 * second run finds no entries to flip and does nothing.
 */

import { logger } from './logger.js';
import { supabase } from './supabase.js';
import { tenantStore, getOrCreateClients } from '../middleware/tenant.js';
import { getAllTenants, getDefaultTenant } from '../config/tenants.js';

const TRASH_RETENTION_DAYS = 30;

async function publishDueEntriesForCurrentTenant(): Promise<number> {
  const nowIso = new Date().toISOString();

  // Find all entries that are scheduled and due. We pull them in one query
  // and then flip them in a second update, scoped by id list — Postgres has
  // no atomic "flip on read" primitive without a function, but the time
  // window is small enough that a duplicate flip across replicas is harmless
  // (UPDATE is idempotent: status is already 'published' on second pass).
  const { data: due, error: selectErr } = await supabase
    .from('entries')
    .select('id, title, slug, collection_id')
    .eq('status', 'scheduled')
    .lte('published_at', nowIso)
    .is('deleted_at', null) // don't accidentally publish entries in trash
    .limit(200);

  if (selectErr) {
    logger.error('Scheduled publisher: select failed', { error: selectErr.message });
    return 0;
  }

  if (!due || due.length === 0) return 0;

  const ids = due.map(e => e.id);
  const { error: updateErr } = await supabase
    .from('entries')
    .update({ status: 'published' })
    .in('id', ids)
    .eq('status', 'scheduled'); // idempotency guard — only flip if still scheduled

  if (updateErr) {
    logger.error('Scheduled publisher: update failed', { error: updateErr.message, count: ids.length });
    return 0;
  }

  logger.info('Scheduled entries published', {
    count: due.length,
    titles: due.slice(0, 5).map(e => e.title),
  });

  return due.length;
}

async function emptyExpiredTrashForCurrentTenant(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired, error: selectErr } = await supabase
    .from('entries')
    .select('id')
    .lte('deleted_at', cutoff)
    .not('deleted_at', 'is', null)
    .limit(500);

  if (selectErr) {
    // Migration 004 may not have been applied yet — log and skip silently
    if (/deleted_at/.test(selectErr.message || '')) {
      return 0;
    }
    logger.error('Trash auto-empty: select failed', { error: selectErr.message });
    return 0;
  }

  if (!expired || expired.length === 0) return 0;

  const { error: deleteErr } = await supabase
    .from('entries')
    .delete()
    .in('id', expired.map(e => e.id));

  if (deleteErr) {
    logger.error('Trash auto-empty: delete failed', { error: deleteErr.message });
    return 0;
  }

  logger.info('Trash auto-emptied (expired entries permanently removed)', {
    count: expired.length,
    cutoff,
  });

  return expired.length;
}

// Track when we last ran the trash auto-empty so we don't hammer the DB —
// once per hour is enough; trash retention is 30 days, so precision doesn't matter.
let lastTrashSweepAt = 0;
const TRASH_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function processCurrentTenant(): Promise<void> {
  await publishDueEntriesForCurrentTenant();

  // Run trash auto-empty at most once per hour per tenant
  if (Date.now() - lastTrashSweepAt > TRASH_SWEEP_INTERVAL_MS) {
    await emptyExpiredTrashForCurrentTenant();
  }
}

async function processAllTenants(): Promise<void> {
  const tenants = getAllTenants();

  // Single-tenant fallback (no TENANTS env var set) — run once against the
  // default tenant, which the supabase Proxy already resolves to.
  if (tenants.length === 0) {
    const def = getDefaultTenant();
    if (!def) return;
    try {
      const clients = getOrCreateClients(def);
      await tenantStore.run({ tenant: def, ...clients }, async () => {
        await processCurrentTenant();
      });
    } catch (err: any) {
      logger.error('Scheduled publisher: default tenant failed', { error: err.message });
    }
    lastTrashSweepAt = Date.now();
    return;
  }

  // Multi-tenant: iterate sequentially. Each tenant has its own Supabase, so
  // failures in one don't block the others.
  for (const tenant of tenants) {
    try {
      const clients = getOrCreateClients(tenant);
      await tenantStore.run({ tenant, ...clients }, async () => {
        await processCurrentTenant();
      });
    } catch (err: any) {
      logger.error('Scheduled publisher: tenant failed', {
        tenant: tenant.id,
        error: err.message,
      });
    }
  }
  lastTrashSweepAt = Date.now();
}

/**
 * Start the scheduled publisher (polls every 60s).
 * Returns a stop function for graceful shutdown.
 */
export function startScheduledPublisher(intervalMs: number = 60_000): () => void {
  logger.info('Scheduled publisher worker starting', { intervalMs });

  // Process immediately so a freshly deployed server doesn't make users wait
  // up to a minute for an entry that was due before the deploy.
  processAllTenants().catch(err =>
    logger.error('Scheduled publisher initial run failed', { error: err.message })
  );

  const interval = setInterval(() => {
    processAllTenants().catch(err =>
      logger.error('Scheduled publisher run failed', { error: err.message })
    );
  }, intervalMs);

  return () => {
    logger.info('Scheduled publisher worker stopping');
    clearInterval(interval);
  };
}
