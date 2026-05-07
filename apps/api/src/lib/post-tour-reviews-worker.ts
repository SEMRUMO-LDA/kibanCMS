/**
 * Post-Tour Reviews Worker
 *
 * Once per hour, scans every tenant for confirmed bookings whose tour date
 * was N days ago (N from add-on config) and that haven't yet been emailed.
 * Sends the bilingual review-request and stamps `review_email_sent_at` on
 * the booking so the next pass skips it (idempotent).
 *
 * No-op when:
 *   • the add-on isn't installed (no `post-tour-reviews` collection)
 *   • config.enabled is false
 *   • the booking is cancelled / refunded
 */

import { logger } from './logger.js';
import { supabase } from './supabase.js';
import { tenantStore, getOrCreateClients } from '../middleware/tenant.js';
import { getAllTenants, getDefaultTenant } from '../config/tenants.js';
import { sendPostTourReview } from './email.js';

const DEFAULT_DELAY_DAYS = 2;
const QUERY_LOOKBACK_DAYS = 30; // hard window so the query stays bounded

async function getCollectionId(slug: string): Promise<string | null> {
  const { data } = await supabase.from('collections').select('id').eq('slug', slug).single();
  return data?.id || null;
}

async function loadReviewConfig(): Promise<Record<string, any> | null> {
  const colId = await getCollectionId('post-tour-reviews');
  if (!colId) return null; // add-on not installed

  const { data } = await supabase
    .from('entries')
    .select('content')
    .eq('collection_id', colId)
    .eq('slug', 'config')
    .single();

  return (data?.content as Record<string, any>) || null;
}

async function getSiteDefaultLanguage(): Promise<'pt' | 'en'> {
  try {
    const { data: settingsCol } = await supabase
      .from('collections').select('id').eq('slug', 'site-settings').single();
    if (!settingsCol) return 'pt';
    const { data } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', settingsCol.id)
      .eq('slug', 'global')
      .single();
    const lang = (data?.content as any)?.language;
    return lang === 'en' ? 'en' : 'pt';
  } catch {
    return 'pt';
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function processCurrentTenant(): Promise<void> {
  const config = await loadReviewConfig();
  if (!config) return;

  if (config.enabled === false || config.enabled === 'false') {
    return;
  }

  const delayDays = (() => {
    const n = Number(config.delay_days);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DELAY_DAYS;
  })();

  const bookingsColId = await getCollectionId('bookings');
  if (!bookingsColId) return; // bookings add-on not installed

  // Window: tour date between (today - lookback) and (today - delayDays).
  // Stored as YYYY-MM-DD strings in content.date — Postgres lexicographic
  // compare works correctly for ISO dates.
  const today = new Date();
  const cutoff = new Date(today); cutoff.setUTCDate(cutoff.getUTCDate() - delayDays);
  const floor = new Date(today); floor.setUTCDate(floor.getUTCDate() - QUERY_LOOKBACK_DAYS);

  const cutoffIso = isoDate(cutoff);
  const floorIso = isoDate(floor);

  const { data: candidates, error } = await supabase
    .from('entries')
    .select('id, content')
    .eq('collection_id', bookingsColId)
    .filter('content->>booking_status', 'eq', 'confirmed')
    .filter('content->>date', 'gte', floorIso)
    .filter('content->>date', 'lte', cutoffIso)
    .limit(200);

  if (error) {
    logger.error('Post-tour reviews: select failed', { error: error.message });
    return;
  }

  if (!candidates || candidates.length === 0) return;

  const siteLang = await getSiteDefaultLanguage();
  let sent = 0;
  let skipped = 0;

  for (const entry of candidates) {
    const c = entry.content as Record<string, any>;
    if (c.review_email_sent_at) { skipped++; continue; }
    if (!c.customer_email) { skipped++; continue; }

    // Pick language: explicit on booking, else site default.
    const lang: 'pt' | 'en' = c.customer_language === 'en' ? 'en' :
                              c.customer_language === 'pt' ? 'pt' : siteLang;

    // Mark BEFORE sending so a transient send error doesn't cause re-sends
    // on every poll. If the send fails, the operator can clear the field
    // manually to retry.
    const sentAt = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('entries')
      .update({ content: { ...c, review_email_sent_at: sentAt } })
      .eq('id', entry.id)
      .filter('content->>review_email_sent_at', 'is', null);
    if (updateErr) {
      // Either the row was just stamped by another replica, or the filter
      // missed because the DB stored "" instead of null — either way, skip
      // to avoid a duplicate send.
      logger.warn('Post-tour reviews: skipping (mark failed)', { bookingId: entry.id, error: updateErr.message });
      skipped++;
      continue;
    }

    try {
      const result = await sendPostTourReview(c, lang, config);
      if (result?.id) {
        sent++;
      } else {
        logger.warn('Post-tour reviews: send returned null', { bookingId: entry.id });
      }
    } catch (err: any) {
      logger.error('Post-tour reviews: send threw', { bookingId: entry.id, error: err.message });
      // Already stamped — caller must manually clear to retry.
    }
  }

  if (sent > 0 || skipped > 0) {
    logger.info('Post-tour reviews pass complete', { sent, skipped, candidates: candidates.length });
  }
}

async function processAllTenants(): Promise<void> {
  const tenants = getAllTenants();

  if (tenants.length === 0) {
    const def = getDefaultTenant();
    if (!def) return;
    try {
      const clients = getOrCreateClients(def);
      await tenantStore.run({ tenant: def, ...clients }, async () => {
        await processCurrentTenant();
      });
    } catch (err: any) {
      logger.error('Post-tour reviews: default tenant failed', { error: err.message });
    }
    return;
  }

  for (const tenant of tenants) {
    try {
      const clients = getOrCreateClients(tenant);
      await tenantStore.run({ tenant, ...clients }, async () => {
        await processCurrentTenant();
      });
    } catch (err: any) {
      logger.error('Post-tour reviews: tenant failed', { tenant: tenant.id, error: err.message });
    }
  }
}

/**
 * Start the post-tour review worker. Polls every hour by default.
 * Returns a stop function for graceful shutdown.
 */
export function startPostTourReviewWorker(intervalMs: number = 60 * 60 * 1000): () => void {
  logger.info('Post-tour review worker starting', { intervalMs });

  // Run once immediately so a freshly deployed server doesn't make the operator
  // wait an hour for emails that were already due.
  processAllTenants().catch(err =>
    logger.error('Post-tour reviews initial run failed', { error: err.message })
  );

  const interval = setInterval(() => {
    processAllTenants().catch(err =>
      logger.error('Post-tour reviews run failed', { error: err.message })
    );
  }, intervalMs);

  return () => {
    logger.info('Post-tour review worker stopping');
    clearInterval(interval);
  };
}
