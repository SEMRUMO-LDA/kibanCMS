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
import { sendPostTourReview, sendBookingReminder } from './email.js';

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

async function getSiteSettings(): Promise<{ lang: 'pt' | 'en'; timeZone: string }> {
  try {
    const { data: settingsCol } = await supabase
      .from('collections').select('id').eq('slug', 'site-settings').single();
    if (!settingsCol) return { lang: 'pt', timeZone: 'Europe/Lisbon' };
    const { data } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', settingsCol.id)
      .eq('slug', 'global')
      .single();
    const c = (data?.content as any) || {};
    return { lang: c.language === 'en' ? 'en' : 'pt', timeZone: c.timezone || 'Europe/Lisbon' };
  } catch {
    return { lang: 'pt', timeZone: 'Europe/Lisbon' };
  }
}

async function getSiteDefaultLanguage(): Promise<'pt' | 'en'> {
  return (await getSiteSettings()).lang;
}

/** "YYYY-MM-DDTHH:MM" wall-clock time in `timeZone`. */
export function wallClock(now: Date, timeZone: string): string {
  let tz = timeZone;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { tz = 'Europe/Lisbon'; }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Hours from `now` until the booking starts, comparing wall-clock times in
 * the site's time zone (bookings store a local date + "HH:MM" slot).
 * Unknown/invalid dates → null. A slot like "10:00-12:00" uses the start.
 */
export function hoursUntilBooking(date: string, timeSlot: string, now: Date, timeZone: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec((timeSlot || '').trim());
  const time = m ? `${m[1].padStart(2, '0')}:${m[2]}` : '09:00';
  const start = Date.parse(`${date}T${time}:00Z`);
  const nowWall = Date.parse(`${wallClock(now, timeZone)}:00Z`);
  if (Number.isNaN(start) || Number.isNaN(nowWall)) return null;
  return (start - nowWall) / 3_600_000;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function processCurrentTenant(): Promise<void> {
  const config = await loadReviewConfig();
  if (!config) return;

  // Reminders are opt-in and independent of review emails.
  if (config.reminder_enabled === true || config.reminder_enabled === 'true') {
    try {
      await sendRemindersForCurrentTenant(config);
    } catch (err: any) {
      logger.error('Booking reminders pass failed', { error: err?.message });
    }
  }

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

const DEFAULT_REMINDER_HOURS = 24;

/** Sends "your tour is tomorrow" reminders; stamps reminder_sent_at (idempotent). */
async function sendRemindersForCurrentTenant(config: Record<string, any>): Promise<void> {
  const hoursBefore = (() => {
    const n = Number(config.reminder_hours_before);
    return Number.isFinite(n) && n >= 1 && n <= 168 ? n : DEFAULT_REMINDER_HOURS;
  })();

  const bookingsColId = await getCollectionId('bookings');
  if (!bookingsColId) return;

  const { lang: siteLang, timeZone } = await getSiteSettings();
  const now = new Date();
  const today = wallClock(now, timeZone).slice(0, 10);
  const horizon = new Date(now.getTime() + (hoursBefore + 48) * 3_600_000);
  const maxDate = wallClock(horizon, timeZone).slice(0, 10);

  const { data: candidates, error } = await supabase
    .from('entries')
    .select('id, content')
    .eq('collection_id', bookingsColId)
    .filter('content->>booking_status', 'eq', 'confirmed')
    .filter('content->>date', 'gte', today)
    .filter('content->>date', 'lte', maxDate)
    .limit(500);
  if (error) {
    logger.error('Booking reminders: select failed', { error: error.message });
    return;
  }

  let sent = 0;
  for (const entry of candidates || []) {
    const c = entry.content as Record<string, any>;
    if (c.reminder_sent_at || !c.customer_email || c.demo) continue;
    const h = hoursUntilBooking(c.date, c.time_slot, now, timeZone);
    if (h === null || h <= 0 || h > hoursBefore) continue;

    // Mark first (same idempotency rule as review emails).
    const { error: markErr } = await supabase
      .from('entries')
      .update({ content: { ...c, reminder_sent_at: new Date().toISOString() } })
      .eq('id', entry.id)
      .filter('content->>reminder_sent_at', 'is', null);
    if (markErr) continue;

    const lang: 'pt' | 'en' = c.customer_language === 'en' ? 'en' : c.customer_language === 'pt' ? 'pt' : siteLang;
    try {
      const result = await sendBookingReminder(c, lang, config);
      if (result?.id) sent++;
    } catch (err: any) {
      logger.error('Booking reminder: send threw', { bookingId: entry.id, error: err.message });
    }
  }
  if (sent > 0) logger.info('Booking reminders sent', { sent, hoursBefore });
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
