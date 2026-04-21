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

function expandTourContent(entry: any): Record<string, any> {
  const c = (entry.content as Record<string, any>) || {};
  return {
    slug: entry.slug,
    title: c.title || entry.title,
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
  };
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

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const colId = await getCollectionId('tours');
    if (!colId) {
      return res.status(404).json({
        error: { message: 'Tours collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const { data: entries, error } = await supabase
      .from('entries')
      .select('id, title, slug, content, featured_image, status')
      .eq('collection_id', colId)
      .eq('status', 'published')
      .order('created_at', { ascending: true });

    if (error) throw error;
    const tours = (entries || []).map(expandTourContent);
    res.json({ data: tours, timestamp: new Date().toISOString() });
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

    const tour = expandTourContent(entry);

    // Lazy sync: fire-and-forget so the detail endpoint stays fast
    syncTourToResource(tour).catch(err =>
      logger.warn('Tour → resource sync failed', { slug: entry.slug, error: err.message })
    );

    res.json({ data: tour, timestamp: new Date().toISOString() });
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
