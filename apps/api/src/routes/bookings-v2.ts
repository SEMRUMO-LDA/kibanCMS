/**
 * Bookings v2 — generic resource-based booking API.
 *
 * Decoupled from tours. Handles any bookable_resource (appointments, rentals,
 * classes, services). Supports two schedule modes per resource:
 *   - fixed_slots: JSON array of start times (e.g. ["10:00","14:00"])
 *   - recurring:   weekly schedule with interval-generated slots
 *
 * Old /api/v1/bookings/* routes remain mounted for back-compat with tour data.
 * The Tours addon delegates booking/checkout to these endpoints.
 */

import { Router, type Response } from 'express';
// @ts-ignore — Stripe v22 has non-standard exports
import Stripe from 'stripe';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { LRUCache } from '../lib/lru-cache.js';
import { sendBookingConfirmation } from '../lib/email.js';
import { validateCoupon, ensureStripeCoupon, recordPendingRedemption, loadCoupon } from '../lib/coupons.js';
import { tenantStore } from '../middleware/tenant.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

// ── Stripe config (mirrors bookings.ts — could be extracted later) ──

interface StripeConfig {
  secretKey: string;
  defaultCurrency: string;
}

// Per-tenant cache. Mirrors the pattern in payments.ts so a request from
// tenant B never receives tenant A's Stripe credentials within the TTL window.
const configCache = new Map<string, { config: StripeConfig; fetchedAt: number }>();
const CONFIG_TTL = 60_000;

async function getStripeConfig(): Promise<StripeConfig | null> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';

  const cached = configCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CONFIG_TTL) {
    return cached.config;
  }

  const { data: col } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', 'stripe-config')
    .single();

  if (col) {
    // Prefer slug "default", else first published entry with a secret key.
    const { data: preferred } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', col.id)
      .eq('slug', 'default')
      .eq('status', 'published')
      .maybeSingle();

    let entry = preferred;
    if (!entry?.content || !(entry.content as any).stripe_secret_key) {
      const { data: fallback } = await supabase
        .from('entries')
        .select('content')
        .eq('collection_id', col.id)
        .eq('status', 'published')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      entry = fallback;
    }

    if (entry?.content) {
      const c = entry.content as Record<string, any>;
      if (c.stripe_secret_key) {
        const config: StripeConfig = {
          secretKey: c.stripe_secret_key,
          defaultCurrency: (c.default_currency || 'eur').toLowerCase(),
        };
        configCache.set(tenantId, { config, fetchedAt: Date.now() });
        return config;
      }
    }
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (secretKey) {
    const config: StripeConfig = {
      secretKey,
      defaultCurrency: (process.env.STRIPE_DEFAULT_CURRENCY || 'eur').toLowerCase(),
    };
    configCache.set(tenantId, { config, fetchedAt: Date.now() });
    return config;
  }

  return null;
}

const stripeClients = new LRUCache<any>({ maxSize: 20, ttlMs: 24 * 60 * 60_000 });
function getStripeClient(secretKey: string): any {
  let client = stripeClients.get(secretKey);
  if (!client) {
    // @ts-ignore
    client = new Stripe(secretKey);
    stripeClients.set(secretKey, client);
  }
  return client;
}

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

function parseJsonSafe<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = (typeof DAY_KEYS)[number];

interface WeeklyWindow { start: string; end: string }
type WeeklySchedule = Partial<Record<DayKey, WeeklyWindow[]>>;

function minutesFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function hhmmFromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function generateRecurringSlots(
  schedule: WeeklySchedule,
  dayKey: DayKey,
  intervalMinutes: number,
  durationMinutes: number,
  bufferMinutes: number,
): string[] {
  const windows = schedule[dayKey] || [];
  const slots: string[] = [];
  const step = Math.max(intervalMinutes || durationMinutes || 30, 5);
  const footprint = (durationMinutes || 0) + (bufferMinutes || 0);

  for (const w of windows) {
    const start = minutesFromHHMM(w.start);
    const end = minutesFromHHMM(w.end);
    for (let t = start; t + footprint <= end; t += step) {
      slots.push(hhmmFromMinutes(t));
    }
  }
  return slots;
}

function dayKeyFromDateStr(dateStr: string): DayKey {
  // dateStr YYYY-MM-DD — parse as UTC midnight to avoid TZ skew
  const d = new Date(`${dateStr}T00:00:00Z`);
  return DAY_KEYS[d.getUTCDay()];
}

async function loadResource(slug: string): Promise<Record<string, any> | null> {
  // Prefer the generic bookable-resources collection, but fall back to the
  // legacy tours collection so existing tenants (built around Tours & Bookings
  // add-on v2.0) keep working without migrating their data.
  let colId = await getCollectionId('bookable-resources');
  let isTours = false;

  if (!colId) {
    colId = await getCollectionId('tours');
    isTours = true;
  }
  if (!colId) return null;

  // Tolerant lookup. Frontends sometimes pass the title ("Rio Arade") or a
  // URL-encoded value instead of the canonical slug — handle all three:
  //   1. exact slug match
  //   2. case-insensitive slug match (handles "Rio-Arade" vs "rio-arade")
  //   3. title ilike match (handles "Rio Arade" when stored slug is "rio-arade")
  const decoded = (() => { try { return decodeURIComponent(slug); } catch { return slug; } })();

  const { data: exact } = await supabase
    .from('entries')
    .select('title, slug, content, featured_image, status')
    .eq('collection_id', colId)
    .eq('slug', decoded)
    .maybeSingle();

  let entry: any = exact;

  if (!entry) {
    const { data: ci } = await supabase
      .from('entries')
      .select('title, slug, content, featured_image, status')
      .eq('collection_id', colId)
      .ilike('slug', decoded)
      .limit(1)
      .maybeSingle();
    entry = ci;
  }

  if (!entry) {
    const { data: byTitle } = await supabase
      .from('entries')
      .select('title, slug, content, featured_image, status')
      .eq('collection_id', colId)
      .ilike('title', decoded)
      .limit(1)
      .maybeSingle();
    entry = byTitle;
  }

  if (!entry) return null;
  const c = (entry.content as Record<string, any>) || {};

  // Tours collection maps slightly different field names. Normalize to the
  // resource shape the v2 routes expect.
  if (isTours) {
    const fixedSlots = parseJsonSafe<string[]>(c.time_slots, []);
    return {
      external_booking_url: c.external_booking_url || '',
      external_booking_label: c.external_booking_label || '',
      slug: entry.slug,
      title: c.title || entry.title,
      description: c.description || '',
      image: c.image || entry.featured_image || '',
      duration_minutes: Number(c.duration_minutes) || 60,
      capacity: Number(c.max_capacity) || 1,
      price: Number(c.price_adult) || 0,
      price_secondary: Number(c.price_child) || 0,
      price_secondary_label: c.child_age_range || 'Criança',
      currency: (c.currency || 'eur').toLowerCase(),
      schedule_type: 'fixed_slots',
      fixed_slots: fixedSlots,
      weekly_schedule: {},
      slot_interval_minutes: 30,
      buffer_minutes: 0,
      booking_window_days: 60,
      min_notice_hours: 0,
      is_active: entry.status === 'published',
      status: entry.status,
    };
  }

  return {
    slug: entry.slug,
    title: c.title || entry.title,
    description: c.description || '',
    image: c.image || entry.featured_image || '',
    duration_minutes: Number(c.duration_minutes) || 60,
    capacity: Number(c.capacity) || 1,
    price: Number(c.price) || 0,
    price_secondary: Number(c.price_secondary) || 0,
    price_secondary_label: c.price_secondary_label || '',
    currency: (c.currency || 'eur').toLowerCase(),
    schedule_type: c.schedule_type || 'fixed_slots',
    fixed_slots: parseJsonSafe<string[]>(c.fixed_slots, []),
    weekly_schedule: parseJsonSafe<WeeklySchedule>(c.weekly_schedule, {}),
    slot_interval_minutes: Number(c.slot_interval_minutes) || 30,
    buffer_minutes: Number(c.buffer_minutes) || 0,
    booking_window_days: Number(c.booking_window_days) || 60,
    min_notice_hours: Number(c.min_notice_hours) || 0,
    is_active: c.is_active !== false,
    status: entry.status,
  };
}

// ============================================
// GET /v2/resources
// List active bookable resources
// ============================================

// Legacy /tours endpoint — preserves the v1 response shape so existing
// frontends (lunes, solfil) keep working without changes. Pulls from the
// tours collection directly.
router.get('/tours', async (_req: AuthRequest, res: Response) => {
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

    const tours = (entries || []).map((entry: any) => {
      const c = entry.content || {};
      return {
        slug: entry.slug,
        title: c.title || entry.title,
        description: c.description || '',
        duration: c.duration || '',
        image: c.image || entry.featured_image || '',
        price_adult: Number(c.price_adult) || 0,
        price_child: Number(c.price_child) || 0,
        child_age_range: c.child_age_range || '4-12 anos',
        max_capacity: Number(c.max_capacity) || 16,
        time_slots: parseJsonSafe<string[]>(c.time_slots, ['10:00', '14:00', '17:00']),
        currency: (c.currency || 'eur').toLowerCase(),
        rating: c.rating || 5,
        highlights: c.highlights || '',
        meeting_point: c.meeting_point || '',
        includes: c.includes || '',
        external_booking_url: c.external_booking_url || '',
        external_booking_label: c.external_booking_label || '',
      };
    });

    res.json({ data: tours, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error fetching tours', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch tours', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

router.get('/resources', async (_req: AuthRequest, res: Response) => {
  try {
    // Prefer bookable-resources, fall back to tours collection so sites
    // built around the Tours & Bookings add-on still get a resource list.
    let colId = await getCollectionId('bookable-resources');
    let isTours = false;
    if (!colId) {
      colId = await getCollectionId('tours');
      isTours = true;
    }
    if (!colId) {
      return res.status(404).json({
        error: { message: 'No bookable resources or tours collection found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const { data: entries, error } = await supabase
      .from('entries')
      .select('id, title, slug, content, featured_image, status')
      .eq('collection_id', colId)
      .eq('status', 'published')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const resources = (entries || [])
      .map((entry: any) => {
        const c = entry.content || {};
        if (isTours) {
          return {
            slug: entry.slug,
            title: c.title || entry.title,
            description: c.description || '',
            image: c.image || entry.featured_image || '',
            duration_minutes: Number(c.duration_minutes) || 60,
            capacity: Number(c.max_capacity) || 1,
            price: Number(c.price_adult) || 0,
            price_secondary: Number(c.price_child) || 0,
            price_secondary_label: c.child_age_range || 'Criança',
            currency: (c.currency || 'eur').toLowerCase(),
            schedule_type: 'fixed_slots',
            is_active: entry.status === 'published',
          };
        }
        return {
          slug: entry.slug,
          title: c.title || entry.title,
          description: c.description || '',
          image: c.image || entry.featured_image || '',
          duration_minutes: Number(c.duration_minutes) || 60,
          capacity: Number(c.capacity) || 1,
          price: Number(c.price) || 0,
          price_secondary: Number(c.price_secondary) || 0,
          price_secondary_label: c.price_secondary_label || '',
          currency: (c.currency || 'eur').toLowerCase(),
          schedule_type: c.schedule_type || 'fixed_slots',
          is_active: c.is_active !== false,
        };
      })
      .filter(r => r.is_active);

    res.json({ data: resources, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error fetching resources', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch resources', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /v2/resources/:slug
// ============================================

router.get('/resources/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const resource = await loadResource(req.params.slug);
    if (!resource) {
      return res.status(404).json({
        error: { message: 'Resource not found', status: 404, timestamp: new Date().toISOString() },
      });
    }
    res.json({ data: resource, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error fetching resource', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch resource', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /v2/resources/:slug/availability?date=YYYY-MM-DD
// Returns bookable time slots for a given date, with remaining capacity
// ============================================

router.get('/resources/:slug/availability', async (req: AuthRequest, res: Response) => {
  try {
    const { slug } = req.params;
    const { date } = req.query as { date?: string };

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: { message: 'Missing or invalid date (YYYY-MM-DD)', status: 400, timestamp: new Date().toISOString() },
      });
    }

    const resource = await loadResource(slug);
    if (!resource || !resource.is_active) {
      return res.status(404).json({
        error: { message: 'Resource not found or inactive', status: 404, timestamp: new Date().toISOString() },
      });
    }

    // Enforce booking window
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const requested = new Date(`${date}T00:00:00Z`);
    const daysAhead = Math.floor((requested.getTime() - today.getTime()) / (24 * 60 * 60_000));
    if (daysAhead < 0 || daysAhead > resource.booking_window_days) {
      return res.json({
        data: { date, resource: slug, slots: [] },
        timestamp: new Date().toISOString(),
      });
    }

    // Generate slot candidates based on schedule type
    let candidateSlots: string[] = [];
    if (resource.schedule_type === 'recurring') {
      candidateSlots = generateRecurringSlots(
        resource.weekly_schedule,
        dayKeyFromDateStr(date),
        resource.slot_interval_minutes,
        resource.duration_minutes,
        resource.buffer_minutes,
      );
    } else {
      candidateSlots = Array.isArray(resource.fixed_slots) ? resource.fixed_slots : [];
    }

    // Min-notice filter (drop slots too soon)
    if (resource.min_notice_hours > 0) {
      const minAllowed = Date.now() + resource.min_notice_hours * 60 * 60_000;
      candidateSlots = candidateSlots.filter(t => {
        const slotTs = new Date(`${date}T${t}:00Z`).getTime();
        return slotTs >= minAllowed;
      });
    }

    // Count bookings per slot
    const bookedBySlot: Record<string, number> = {};
    const bookingsColId = await getCollectionId('bookings');
    if (bookingsColId && candidateSlots.length > 0) {
      const { data: bookings } = await supabase
        .from('entries')
        .select('content')
        .eq('collection_id', bookingsColId)
        .filter('content->>resource_slug', 'eq', slug)
        .filter('content->>date', 'eq', date)
        .filter('content->>booking_status', 'in', '("pending","confirmed")');

      for (const b of bookings || []) {
        const c = b.content as Record<string, any>;
        const time = c.time_slot || '';
        const count = Number(c.total_participants) || Number(c.party_size) || 0;
        bookedBySlot[time] = (bookedBySlot[time] || 0) + count;
      }
    }

    const slots = candidateSlots.map(time => ({
      time,
      total: resource.capacity,
      booked: bookedBySlot[time] || 0,
      available: Math.max(0, resource.capacity - (bookedBySlot[time] || 0)),
    }));

    res.json({
      data: { date, resource: slug, slots },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error checking availability', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to check availability', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// POST /v2/checkout
// Creates booking (status=pending) + Stripe Checkout session
// ============================================

router.post('/checkout', async (req: AuthRequest, res: Response) => {
  try {
    const {
      resource_slug,
      date,
      time_slot,
      party_size,
      party_size_secondary,
      customer_name,
      customer_email,
      customer_phone,
      notes,
      metadata,
      coupon_code,
      success_url,
      cancel_url,
    } = req.body || {};

    if (!resource_slug || !date || !time_slot || !party_size || !customer_name || !customer_email || !success_url || !cancel_url) {
      return res.status(400).json({
        error: { message: 'Missing required fields', status: 400, timestamp: new Date().toISOString() },
      });
    }

    const resource = await loadResource(resource_slug);
    if (!resource || !resource.is_active) {
      return res.status(404).json({
        error: { message: 'Resource not found or inactive', status: 404, timestamp: new Date().toISOString() },
      });
    }

    // External booking — tour is managed on another platform (Bókun, FareHarbor, etc.)
    // Return the redirect URL so the frontend can open it instead of creating a booking here.
    if (resource.external_booking_url) {
      return res.status(409).json({
        error: {
          message: 'This tour uses an external booking platform. Redirect to the provided URL instead.',
          code: 'EXTERNAL_BOOKING',
          status: 409,
          timestamp: new Date().toISOString(),
        },
        data: {
          external_booking_url: resource.external_booking_url,
          external_booking_label: resource.external_booking_label || '',
        },
      });
    }

    const primary = Number(party_size);
    const secondary = Number(party_size_secondary || 0);
    const total = primary + secondary;

    // Check remaining capacity for that slot
    const bookingsColId = await getCollectionId('bookings');
    if (!bookingsColId) {
      return res.status(500).json({
        error: { message: 'Bookings collection not found', status: 500, timestamp: new Date().toISOString() },
      });
    }

    const { data: existing } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', bookingsColId)
      .filter('content->>resource_slug', 'eq', resource_slug)
      .filter('content->>date', 'eq', date)
      .filter('content->>time_slot', 'eq', time_slot)
      .filter('content->>booking_status', 'in', '("pending","confirmed")');

    let booked = 0;
    for (const b of existing || []) {
      const c = b.content as Record<string, any>;
      booked += Number(c.total_participants) || Number(c.party_size) || 0;
    }

    if (booked + total > resource.capacity) {
      return res.status(409).json({
        error: {
          message: `Only ${resource.capacity - booked} spots left in this slot`,
          status: 409,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const totalCents =
      primary * (Number(resource.price) || 0) * 100 +
      secondary * (Number(resource.price_secondary) || 0) * 100;

    if (totalCents < 50) {
      return res.status(400).json({
        error: { message: 'Total amount too low', status: 400, timestamp: new Date().toISOString() },
      });
    }

    // Optional: validate coupon BEFORE creating the booking, so we can reject fast.
    let couponValidation: Awaited<ReturnType<typeof validateCoupon>> | null = null;
    if (coupon_code && typeof coupon_code === 'string' && coupon_code.trim()) {
      couponValidation = await validateCoupon({
        code: coupon_code.trim(),
        resource_slug,
        customer_email: String(customer_email).toLowerCase(),
        subtotal_cents: totalCents,
        currency: resource.currency,
      });
      if (!couponValidation.valid) {
        return res.status(400).json({
          error: {
            message: couponValidation.message || 'Coupon is not valid',
            code: couponValidation.reason,
            status: 400,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    const adminId = await getAdminProfileId();
    if (!adminId) {
      return res.status(500).json({
        error: { message: 'No admin profile found', status: 500, timestamp: new Date().toISOString() },
      });
    }

    const bookingSlug = `booking-${Date.now().toString(36)}`;
    const { data: booking, error: insertError } = await supabase
      .from('entries')
      .insert({
        collection_id: bookingsColId,
        title: `${customer_name} — ${resource.title} (${date})`,
        slug: bookingSlug,
        content: {
          customer_name,
          customer_email,
          customer_phone: customer_phone || '',
          resource_slug,
          resource_title: resource.title,
          date,
          time_slot,
          party_size: primary,
          party_size_secondary: secondary,
          total_participants: total,
          amount: totalCents,
          currency: resource.currency,
          booking_status: 'pending',
          source: (metadata && metadata.source) || 'direct',
          metadata: metadata || {},
          notes: notes || '',
        },
        status: 'published',
        published_at: new Date().toISOString(),
        author_id: adminId,
        tags: ['booking', 'pending'],
      } as any)
      .select('id')
      .single();

    if (insertError) throw insertError;

    const stripeConfig = await getStripeConfig();

    // Demo mode — the tenant has the Bookings add-on live but hasn't yet
    // plugged in Stripe keys. Rather than refusing the checkout (breaking the
    // onboarding demo for sales calls), confirm the booking immediately with
    // a `demo: true` flag and redirect to success_url. Operators can tell demo
    // bookings apart by the flag + zero stripe_session_id. Coupon redemption
    // and email confirmation still run so the end-to-end flow is exercised.
    if (!stripeConfig) {
      logger.info('Booking v2 created in demo mode (Stripe not configured)', {
        bookingId: booking.id,
        resource_slug,
      });

      await supabase
        .from('entries')
        .update({
          content: {
            ...((await supabase.from('entries').select('content').eq('id', booking.id).single()).data?.content as any || {}),
            booking_status: 'confirmed',
            confirmed_at: new Date().toISOString(),
            demo: true,
          },
          tags: ['booking', 'confirmed', 'demo'],
        } as any)
        .eq('id', booking.id);

      // Send confirmation email (non-blocking, matches the Stripe webhook path)
      sendBookingConfirmation({
        customer_name,
        customer_email,
        resource_title: resource.title,
        date,
        time_slot,
        total_participants: total,
        amount: totalCents,
        currency: resource.currency,
        booking_status: 'confirmed',
        demo: true,
      }).catch(err =>
        logger.warn('Demo booking confirmation email failed', { bookingId: booking.id, error: err.message })
      );

      // Best-effort success URL — append demo+booking markers so the frontend
      // can show a demo banner if it wants.
      const successRedirect = (() => {
        try {
          const url = new URL(success_url);
          url.searchParams.set('demo', '1');
          url.searchParams.set('booking_id', booking.id);
          return url.toString();
        } catch { return success_url; }
      })();

      return res.status(201).json({
        data: {
          booking_id: booking.id,
          checkout_url: successRedirect,
          subtotal_cents: totalCents,
          discount_cents: couponValidation?.discount_cents || 0,
          total_cents: totalCents - (couponValidation?.discount_cents || 0),
          coupon_applied: couponValidation?.valid ? couponValidation.coupon?.code : null,
          demo: true,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const stripe = getStripeClient(stripeConfig.secretKey);

    // Resolve Stripe coupon ID if a coupon was validated. We look up the DB row
    // fresh to get the current `stripe_coupon_id` cache field.
    let stripeCouponId: string | null = null;
    if (couponValidation?.valid && couponValidation.coupon) {
      const loaded = await loadCoupon(couponValidation.coupon.code);
      if (loaded) {
        stripeCouponId = await ensureStripeCoupon(stripe, loaded.row, loaded.coupon);
      }
    }

    const session = await stripe.checkout.sessions.create({
      // Omit payment_method_types — Stripe auto-detects all methods enabled
      // in the dashboard (card, Apple Pay, Google Pay, SEPA, Multibanco, etc.)
      mode: 'payment',
      customer_email,
      line_items: [{
        price_data: {
          currency: resource.currency,
          product_data: {
            name: resource.title,
            description: `${date} @ ${time_slot} — ${primary} × ${resource.title}${secondary > 0 ? ` + ${secondary}` : ''}`,
          },
          unit_amount: totalCents,
        },
        quantity: 1,
      }],
      ...(stripeCouponId && { discounts: [{ coupon: stripeCouponId }] }),
      metadata: {
        source: 'kibanCMS-bookings-v2',
        tenant_id: tenantStore.getStore()?.tenant?.id || 'default',
        booking_id: booking.id,
        resource_slug,
        date,
        time_slot,
        ...(couponValidation?.valid && couponValidation.coupon && {
          coupon_code: couponValidation.coupon.code,
          discount_cents: String(couponValidation.discount_cents || 0),
        }),
      },
      success_url,
      cancel_url,
    });

    // Audit: record pending redemption (reconciled by webhook on success/expiry).
    if (couponValidation?.valid && couponValidation.coupon && couponValidation.discount_cents != null) {
      await recordPendingRedemption({
        coupon: couponValidation.coupon,
        booking_id: booking.id,
        customer_email: String(customer_email),
        subtotal_cents: totalCents,
        discount_cents: couponValidation.discount_cents,
        currency: resource.currency,
        stripe_session_id: session.id,
        author_id: adminId,
      });
    }

    // Persist stripe_session_id on the booking
    const { data: cur } = await supabase
      .from('entries')
      .select('content')
      .eq('id', booking.id)
      .single();

    await supabase
      .from('entries')
      .update({
        content: { ...((cur?.content as any) || {}), stripe_session_id: session.id },
      } as any)
      .eq('id', booking.id);

    logger.info('Booking v2 created', { bookingId: booking.id, sessionId: session.id, resource_slug });

    res.status(201).json({
      data: {
        booking_id: booking.id,
        checkout_url: session.url,
        subtotal_cents: totalCents,
        discount_cents: couponValidation?.discount_cents || 0,
        total_cents: totalCents - (couponValidation?.discount_cents || 0),
        coupon_applied: couponValidation?.valid ? couponValidation.coupon?.code : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error creating booking', { error: error.message });
    res.status(500).json({
      error: { message: error.message || 'Failed to create booking', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /v2/:bookingId/status
// ============================================

router.get('/:bookingId/status', async (req: AuthRequest, res: Response) => {
  try {
    const { data: entry, error } = await supabase
      .from('entries')
      .select('id, title, slug, content, created_at, updated_at')
      .eq('id', req.params.bookingId)
      .single();

    if (error || !entry) {
      return res.status(404).json({
        error: { message: 'Booking not found', status: 404, timestamp: new Date().toISOString() },
      });
    }
    res.json({ data: entry, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error fetching booking', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch booking', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// POST /v2/:bookingId/confirm
// ============================================

router.post('/:bookingId/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { data: entry, error: fetchErr } = await supabase
      .from('entries')
      .select('id, content')
      .eq('id', bookingId)
      .single();

    if (fetchErr || !entry) {
      return res.status(404).json({
        error: { message: 'Booking not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const content = entry.content as Record<string, any>;
    if (content.booking_status === 'confirmed') {
      return res.json({ data: { message: 'Already confirmed' }, timestamp: new Date().toISOString() });
    }

    const { error: updateErr } = await supabase
      .from('entries')
      .update({
        content: { ...content, booking_status: 'confirmed', confirmed_at: new Date().toISOString() },
        tags: ['booking', 'confirmed'],
      })
      .eq('id', bookingId);

    if (updateErr) throw updateErr;

    logger.info('Booking v2 confirmed', { bookingId });

    sendBookingConfirmation({ ...content, booking_status: 'confirmed' }).catch(err =>
      logger.warn('Booking confirmation email failed', { bookingId, error: err.message })
    );

    res.json({ data: { message: 'Booking confirmed' }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error confirming booking', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to confirm booking', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// POST /v2/:bookingId/cancel
// ============================================

router.post('/:bookingId/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { data: entry, error: fetchErr } = await supabase
      .from('entries')
      .select('id, content')
      .eq('id', bookingId)
      .single();

    if (fetchErr || !entry) {
      return res.status(404).json({
        error: { message: 'Booking not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const content = entry.content as Record<string, any>;
    if (content.booking_status === 'cancelled') {
      return res.json({ data: { message: 'Already cancelled' }, timestamp: new Date().toISOString() });
    }

    const { error: updateErr } = await supabase
      .from('entries')
      .update({
        content: { ...content, booking_status: 'cancelled', cancelled_at: new Date().toISOString() },
        tags: ['booking', 'cancelled'],
      })
      .eq('id', bookingId);

    if (updateErr) throw updateErr;
    logger.info('Booking v2 cancelled', { bookingId });
    res.json({ data: { message: 'Booking cancelled' }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error cancelling booking', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to cancel booking', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /v2/list
// Admin list with filters
// ============================================

router.get('/list', async (req: AuthRequest, res: Response) => {
  try {
    const {
      status: statusFilter,
      resource,
      date_from,
      date_to,
      limit = '50',
      offset = '0',
    } = req.query as Record<string, string | undefined>;

    const bookingsColId = await getCollectionId('bookings');
    if (!bookingsColId) {
      return res.status(404).json({
        error: { message: 'Bookings collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    let query = supabase
      .from('entries')
      .select('id, title, slug, content, status, tags, created_at, updated_at', { count: 'exact' })
      .eq('collection_id', bookingsColId)
      .order('created_at', { ascending: false });

    if (statusFilter) query = query.filter('content->>booking_status', 'eq', statusFilter);
    if (resource) query = query.filter('content->>resource_slug', 'eq', resource);
    if (date_from) query = query.filter('content->>date', 'gte', date_from);
    if (date_to) query = query.filter('content->>date', 'lte', date_to);

    const limitNum = Math.min(parseInt(limit || '50', 10) || 50, 200);
    const offsetNum = parseInt(offset || '0', 10) || 0;
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: entries, error, count } = await query;
    if (error) throw error;

    res.json({
      data: entries || [],
      meta: { pagination: { limit: limitNum, offset: offsetNum, total: count || 0 } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error listing bookings', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to list bookings', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /v2/stats
// ============================================

router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const bookingsColId = await getCollectionId('bookings');
    if (!bookingsColId) {
      return res.json({
        data: { total: 0, pending: 0, confirmed: 0, cancelled: 0, revenue: 0 },
        timestamp: new Date().toISOString(),
      });
    }

    const { data: all, error } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', bookingsColId);

    if (error) throw error;

    let total = 0, pending = 0, confirmed = 0, cancelled = 0, revenue = 0;
    for (const entry of all || []) {
      const c = entry.content as Record<string, any>;
      total++;
      const st = c.booking_status || 'pending';
      if (st === 'pending') pending++;
      else if (st === 'confirmed') {
        confirmed++;
        revenue += Number(c.amount) || 0;
      } else if (st === 'cancelled') cancelled++;
    }

    res.json({
      data: { total, pending, confirmed, cancelled, revenue },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching booking stats', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch stats', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
