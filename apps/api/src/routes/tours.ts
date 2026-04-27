/**
 * Tours — rich tour catalog with TripAdvisor-style fields.
 *
 * Delegates all booking/checkout/availability to the Bookings addon via
 * syncResource (mirrors a tour into a bookable_resource on read). Keeps Tours
 * focused on content (itinerary, highlights, policies) and Bookings on slot
 * logic + payments.
 */

import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

// ── Helpers ──

async function getCollectionId(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', slug)
    .single();
  return data?.id || null;
}

async function getAdminProfileId(): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['super_admin', 'admin'])
    .limit(1)
    .single();
  return data?.id || null;
}

function splitLines(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  return value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function parseJsonSafe<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Highlights can be:
 *   - New shape: Array<{ image: string, caption: string }> (media_caption_list field)
 *   - Legacy:    newline-separated string from the old textarea field
 *   - Legacy:    string[]
 * Returns always the new shape so frontends have one consistent API.
 */
function parseHighlights(value: unknown): Array<{ image: string; caption: string }> {
  if (Array.isArray(value)) {
    return value.map(v => {
      if (v && typeof v === 'object') {
        return {
          image: String((v as any).image || ''),
          caption: String((v as any).caption || ''),
        };
      }
      return { image: '', caption: String(v || '') };
    });
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(caption => ({ image: '', caption }));
  }
  return [];
}

/**
 * Apply meta.translations[lang] overlay on top of the raw content.
 * Returns a new content map where translatable string fields are replaced
 * with their translated counterparts (when present). Non-string fields
 * (numbers, booleans, JSON arrays for slots/highlights/etc.) are left
 * untouched. The entry title is overlaid via the `_title` translation key
 * — same convention used by entries.ts.
 */
function applyLangOverlay(entry: any, lang: string | undefined): { content: Record<string, any>; title: string } {
  const rawContent = (entry.content as Record<string, any>) || {};
  const meta = (entry.meta as Record<string, any>) || {};
  const baseTitle = rawContent.title || entry.title || '';

  if (!lang) return { content: rawContent, title: baseTitle };

  const translations = meta?.translations?.[lang];
  if (!translations || typeof translations !== 'object') {
    return { content: rawContent, title: baseTitle };
  }

  const merged = { ...rawContent };
  for (const [key, value] of Object.entries(translations)) {
    if (key === '_title') continue;
    if (typeof value === 'string') merged[key] = value;
  }
  return {
    content: merged,
    title: typeof translations._title === 'string' && translations._title ? translations._title : baseTitle,
  };
}

function expandTourContent(entry: any, lang?: string): Record<string, any> {
  const { content: c, title: localizedTitle } = applyLangOverlay(entry, lang);
  return {
    slug: entry.slug,
    title: c.title || localizedTitle,
    subtitle: c.subtitle || '',
    short_description: c.short_description || '',
    full_description: c.full_description || '',
    product_code: c.product_code || '',
    tour_type: c.tour_type || '',
    categories: splitLines(c.categories),
    difficulty_level: c.difficulty_level || '',
    duration_minutes: Number(c.duration_minutes) || 0,
    capacity: Number(c.capacity ?? c.max_participants) || 0,
    min_age: c.min_age != null ? Number(c.min_age) : null,
    max_age: c.max_age != null ? Number(c.max_age) : null,
    languages: Array.isArray(c.languages) ? c.languages.map(String) : splitLines(c.languages),
    price_adult: Number(c.price_adult) || 0,
    price_child: Number(c.price_child) || 0,
    child_age_range: c.child_age_range || '',
    currency: (c.currency || 'eur').toLowerCase(),
    schedule_type: c.schedule_type || 'fixed_slots',
    fixed_slots: parseJsonSafe<string[]>(c.fixed_slots, []),
    weekly_schedule: parseJsonSafe<Record<string, any>>(c.weekly_schedule, {}),
    slot_interval_minutes: Number(c.slot_interval_minutes) || 30,
    cover_image: c.cover_image || entry.featured_image || '',
    gallery: parseJsonSafe<string[]>(c.gallery, []),
    highlights: parseHighlights(c.highlights),
    itinerary: typeof c.itinerary === 'string' ? c.itinerary : '',
    meeting_point: typeof c.meeting_point === 'string' ? c.meeting_point : '',
    pickup_zones: splitLines(c.pickup_zones),
    inclusions: splitLines(c.inclusions),
    exclusions: splitLines(c.exclusions),
    what_to_bring: splitLines(c.what_to_bring),
    additional_info: typeof c.additional_info === 'string' ? c.additional_info : '',
    accessibility_info: parseJsonSafe<Record<string, any>>(c.accessibility_info, {}),
    health_restrictions: splitLines(c.health_restrictions),
    physical_requirements: c.physical_requirements || '',
    cancellation_policy: parseJsonSafe<any[]>(c.cancellation_policy, []),
    weather_policy: c.weather_policy || '',
    faq: parseJsonSafe<any[]>(c.faq, []),
    fine_print: c.fine_print || '',
    is_digital_ticket: !!c.is_digital_ticket,
    instant_confirmation: !!c.instant_confirmation,
    travellers_choice: !!c.travellers_choice,
    likely_to_sell_out: !!c.likely_to_sell_out,
    rating: Number(c.rating) || 0,
    rating_count: Number(c.rating_count) || 0,
    resource_slug: c.resource_slug || entry.slug,
    // External booking support — when set, the kibanCMS checkout is bypassed
    // and the tour delegates to an external platform (Bókun, FareHarbor, etc.)
    external_booking_url: typeof c.external_booking_url === 'string' ? c.external_booking_url.trim() : '',
    external_booking_label: typeof c.external_booking_label === 'string' ? c.external_booking_label.trim() : '',
  };
}

/**
 * Compute the booking mode for a tour. Single source of truth used by both
 * the list and detail endpoints — frontends key their CTA off this field
 * instead of probing collection installs themselves.
 *
 *   "external"  — tour has an external_booking_url; show only that CTA
 *   "kiban"     — Bookings add-on installed AND no external URL; use kibanCMS checkout
 *   "disabled"  — Bookings add-on NOT installed AND no external URL; hide CTA
 */
function computeBookingMode(tour: ReturnType<typeof expandTourContent>, hasBookingsAddon: boolean): 'external' | 'kiban' | 'disabled' {
  if (tour.external_booking_url) return 'external';
  if (hasBookingsAddon) return 'kiban';
  return 'disabled';
}

async function isBookingsAddonInstalled(): Promise<boolean> {
  // The Bookings add-on creates the bookable-resources collection. If it
  // exists, the add-on is installed and tours can route through internal
  // checkout. Cached per request would be ideal, but a lookup is cheap.
  const id = await getCollectionId('bookable-resources');
  return !!id;
}

// ── Sync tour → bookable_resource ──
//
// Keeps the Bookings collection (bookable-resources) in sync with the Tour entry
// so the generic Bookings API can handle availability + checkout for tours
// without knowing anything about tour-specific content.

async function syncTourToResource(tour: ReturnType<typeof expandTourContent>): Promise<string | null> {
  const resourcesColId = await getCollectionId('bookable-resources');
  if (!resourcesColId) {
    logger.warn('syncTourToResource: bookable-resources collection not installed');
    return null;
  }

  const targetSlug = tour.resource_slug || tour.slug;

  // Find existing resource with this slug
  const { data: existing } = await supabase
    .from('entries')
    .select('id, content')
    .eq('collection_id', resourcesColId)
    .eq('slug', targetSlug)
    .maybeSingle();

  const resourceContent = {
    title: tour.title,
    description: tour.short_description || tour.full_description || '',
    image: tour.cover_image,
    duration_minutes: tour.duration_minutes,
    capacity: tour.capacity || 1,
    price: tour.price_adult,
    price_secondary: tour.price_child || 0,
    price_secondary_label: tour.price_child ? `Child${tour.child_age_range ? ` (${tour.child_age_range})` : ''}` : '',
    currency: tour.currency,
    schedule_type: tour.schedule_type,
    fixed_slots: JSON.stringify(tour.fixed_slots),
    weekly_schedule: JSON.stringify(tour.weekly_schedule),
    slot_interval_minutes: tour.slot_interval_minutes,
    buffer_minutes: 0,
    booking_window_days: 60,
    min_notice_hours: 2,
    is_active: true,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('entries')
      .update({ content: { ...(existing.content as any), ...resourceContent } } as any)
      .eq('id', existing.id);
    if (error) {
      logger.error('syncTourToResource: update failed', { error: error.message });
      return null;
    }
    return targetSlug;
  }

  const adminId = await getAdminProfileId();
  if (!adminId) {
    logger.warn('syncTourToResource: no admin profile for insert');
    return null;
  }

  const { error } = await supabase
    .from('entries')
    .insert({
      collection_id: resourcesColId,
      title: tour.title,
      slug: targetSlug,
      content: resourceContent,
      status: 'published',
      published_at: new Date().toISOString(),
      author_id: adminId,
      tags: ['tour', 'auto-synced'],
    } as any);

  if (error) {
    logger.error('syncTourToResource: insert failed', { error: error.message });
    return null;
  }
  return targetSlug;
}

// ============================================
// GET /tours
// List published tours
// ============================================

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const colId = await getCollectionId('tours');
    if (!colId) {
      return res.status(404).json({
        error: { message: 'Tours collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    // Include meta so we can overlay translations. lang query param
    // controls which language the response is rendered in.
    const lang = (req.query.lang as string | undefined)?.toLowerCase();

    const { data: entries, error } = await supabase
      .from('entries')
      .select('id, title, slug, content, featured_image, status, meta')
      .eq('collection_id', colId)
      .eq('status', 'published')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const hasBookings = await isBookingsAddonInstalled();
    const tours = (entries || []).map(e => expandTourContent(e, lang)).map(tour => ({
      ...tour,
      booking_mode: computeBookingMode(tour, hasBookings),
    }));

    res.json({
      data: tours,
      meta: lang ? { lang } : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching tours', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch tours', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /tours/:slug
// Tour detail — lazy-syncs bookable_resource on first read
// ============================================

router.get('/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const colId = await getCollectionId('tours');
    if (!colId) {
      return res.status(404).json({
        error: { message: 'Tours collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const lang = (req.query.lang as string | undefined)?.toLowerCase();

    const { data: entry, error } = await supabase
      .from('entries')
      .select('id, title, slug, content, featured_image, status, meta')
      .eq('collection_id', colId)
      .eq('slug', req.params.slug)
      .single();

    if (error || !entry) {
      return res.status(404).json({
        error: { message: 'Tour not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const tour = expandTourContent(entry, lang);
    const hasBookings = await isBookingsAddonInstalled();
    const booking_mode = computeBookingMode(tour, hasBookings);

    // Only mirror to bookable-resources when the tour actually uses the
    // internal checkout. External-URL tours don't need a resource entry,
    // and creating one would waste storage + confuse capacity reports.
    if (booking_mode === 'kiban') {
      syncTourToResource(tour).catch(err =>
        logger.warn('Tour → resource sync failed', { slug: entry.slug, error: err.message })
      );
    }

    res.json({
      data: { ...tour, booking_mode },
      meta: lang ? { lang } : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching tour', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch tour', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// POST /tours/:slug/sync
// Manually sync a tour to its bookable_resource (admin-triggered from UI)
// ============================================

router.post('/:slug/sync', async (req: AuthRequest, res: Response) => {
  try {
    const colId = await getCollectionId('tours');
    if (!colId) {
      return res.status(404).json({
        error: { message: 'Tours collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const { data: entry, error } = await supabase
      .from('entries')
      .select('id, title, slug, content, featured_image, status')
      .eq('collection_id', colId)
      .eq('slug', req.params.slug)
      .single();

    if (error || !entry) {
      return res.status(404).json({
        error: { message: 'Tour not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const resourceSlug = await syncTourToResource(expandTourContent(entry));
    if (!resourceSlug) {
      return res.status(500).json({
        error: { message: 'Sync failed — check that the Bookings addon is installed', status: 500, timestamp: new Date().toISOString() },
      });
    }

    res.json({
      data: { tour_slug: entry.slug, resource_slug: resourceSlug },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error syncing tour', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to sync tour', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
