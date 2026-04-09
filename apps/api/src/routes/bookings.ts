import { Router, type Response } from 'express';
// @ts-ignore — Stripe v22 has non-standard exports
import Stripe from 'stripe';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

const MAX_CAPACITY = 16;

// ============================================
// STRIPE CONFIG (reuse same pattern as payments.ts)
// ============================================

interface StripeConfig {
  secretKey: string;
  defaultCurrency: string;
}

let configCache: { config: StripeConfig; fetchedAt: number } | null = null;
const CONFIG_TTL = 60_000;

async function getStripeConfig(): Promise<StripeConfig | null> {
  if (configCache && Date.now() - configCache.fetchedAt < CONFIG_TTL) {
    return configCache.config;
  }

  const { data: col } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', 'stripe-config')
    .single();

  if (col) {
    const { data: entry } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', col.id)
      .eq('slug', 'default')
      .eq('status', 'published')
      .single();

    if (entry?.content) {
      const c = entry.content as Record<string, any>;
      if (c.stripe_secret_key) {
        const config: StripeConfig = {
          secretKey: c.stripe_secret_key,
          defaultCurrency: (c.default_currency || 'eur').toLowerCase(),
        };
        configCache = { config, fetchedAt: Date.now() };
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
    configCache = { config, fetchedAt: Date.now() };
    return config;
  }

  return null;
}

const stripeClients = new Map<string, any>();
function getStripeClient(secretKey: string): any {
  let client = stripeClients.get(secretKey);
  if (!client) {
    // @ts-ignore
    client = new Stripe(secretKey);
    stripeClients.set(secretKey, client);
  }
  return client;
}

// ============================================
// HELPERS
// ============================================

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

// ============================================
// GET /api/v1/bookings/tours
// Returns published tours with time_slots and pricing
// ============================================

router.get('/tours', async (req: AuthRequest, res: Response) => {
  try {
    const colId = await getCollectionId('tours');
    if (!colId) {
      return res.status(404).json({
        error: { message: 'Tours collection not found', status: 404, timestamp: new Date().toISOString() }
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
        price_total: c.price || '',
        capacity: c.capacity || '',
        max_capacity: Number(c.max_capacity) || MAX_CAPACITY,
        time_slots: c.time_slots || ['10:00', '14:00', '17:00'],
        rating: c.rating || 5,
      };
    });

    res.json({ data: tours, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error fetching tours', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch tours', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// GET /api/v1/bookings/availability
// Query: tour (slug), date (YYYY-MM-DD)
// Returns slots with available capacity
// ============================================

router.get('/availability', async (req: AuthRequest, res: Response) => {
  try {
    const { tour, date } = req.query as { tour?: string; date?: string };

    if (!tour || !date) {
      return res.status(400).json({
        error: { message: 'Missing required params: tour, date', status: 400, timestamp: new Date().toISOString() }
      });
    }

    // Get tour to read time_slots and max_capacity
    const toursColId = await getCollectionId('tours');
    let timeSlots = ['10:00', '14:00', '17:00'];
    let maxCapacity = MAX_CAPACITY;

    if (toursColId) {
      const { data: tourEntry } = await supabase
        .from('entries')
        .select('content')
        .eq('collection_id', toursColId)
        .eq('slug', tour)
        .single();

      if (tourEntry?.content) {
        const c = tourEntry.content as Record<string, any>;
        if (Array.isArray(c.time_slots) && c.time_slots.length > 0) {
          timeSlots = c.time_slots;
        }
        if (c.max_capacity) maxCapacity = Number(c.max_capacity);
      }
    }

    // Count bookings per slot for this tour/date
    const bookingsColId = await getCollectionId('bookings');
    const bookedBySlot: Record<string, number> = {};

    if (bookingsColId) {
      const { data: bookings } = await supabase
        .from('entries')
        .select('content')
        .eq('collection_id', bookingsColId)
        .in('status', ['published', 'draft'])
        .filter('content->>tour_slug', 'eq', tour)
        .filter('content->>date', 'eq', date)
        .filter('content->>booking_status', 'in', '("pending","confirmed")');

      if (bookings) {
        for (const b of bookings) {
          const c = b.content as Record<string, any>;
          const slot = c.time_slot || '';
          const guests = Number(c.total_guests) || 0;
          bookedBySlot[slot] = (bookedBySlot[slot] || 0) + guests;
        }
      }
    }

    const slots = timeSlots.map((time: string) => ({
      time,
      total: maxCapacity,
      booked: bookedBySlot[time] || 0,
      available: maxCapacity - (bookedBySlot[time] || 0),
    }));

    res.json({ data: { date, tour, slots }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error checking availability', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to check availability', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// POST /api/v1/bookings/create
// Creates booking + Stripe checkout session
// ============================================

router.post('/create', async (req: AuthRequest, res: Response) => {
  try {
    const {
      tour_slug, date, time_slot, adults, children,
      customer_name, customer_email, customer_phone,
      notes, success_url, cancel_url,
    } = req.body;

    // Validate required fields
    if (!tour_slug || !date || !time_slot || !adults || !customer_name || !customer_email || !success_url || !cancel_url) {
      return res.status(400).json({
        error: { message: 'Missing required fields', status: 400, timestamp: new Date().toISOString() }
      });
    }

    const totalGuests = Number(adults) + Number(children || 0);

    // Check availability
    const toursColId = await getCollectionId('tours');
    let maxCapacity = MAX_CAPACITY;
    let priceAdult = 0;
    let priceChild = 0;
    let tourTitle = tour_slug;
    let currency = 'eur';

    if (toursColId) {
      const { data: tourEntry } = await supabase
        .from('entries')
        .select('content, title')
        .eq('collection_id', toursColId)
        .eq('slug', tour_slug)
        .single();

      if (tourEntry) {
        const c = tourEntry.content as Record<string, any>;
        maxCapacity = Number(c.max_capacity) || MAX_CAPACITY;
        priceAdult = Number(c.price_adult) || 0;
        priceChild = Number(c.price_child) || 0;
        tourTitle = c.title || tourEntry.title || tour_slug;
        currency = (c.currency || 'eur').toLowerCase();
      }
    }

    // Check slot capacity
    const bookingsColId = await getCollectionId('bookings');
    let booked = 0;

    if (bookingsColId) {
      const { data: existing } = await supabase
        .from('entries')
        .select('content')
        .eq('collection_id', bookingsColId)
        .filter('content->>tour_slug', 'eq', tour_slug)
        .filter('content->>date', 'eq', date)
        .filter('content->>time_slot', 'eq', time_slot)
        .filter('content->>booking_status', 'in', '("pending","confirmed")');

      if (existing) {
        for (const b of existing) {
          booked += Number((b.content as any).total_guests) || 0;
        }
      }
    }

    if (booked + totalGuests > maxCapacity) {
      return res.status(409).json({
        error: {
          message: `Apenas ${maxCapacity - booked} lugares disponíveis neste horário`,
          status: 409,
          timestamp: new Date().toISOString(),
        }
      });
    }

    // Calculate total (in cents)
    const totalCents = (Number(adults) * priceAdult * 100) + (Number(children || 0) * priceChild * 100);

    if (totalCents < 50) {
      return res.status(400).json({
        error: { message: 'Total amount too low', status: 400, timestamp: new Date().toISOString() }
      });
    }

    // Create booking entry with status pending
    if (!bookingsColId) {
      return res.status(500).json({
        error: { message: 'Bookings collection not found. Please create it in the CMS.', status: 500, timestamp: new Date().toISOString() }
      });
    }

    const adminId = await getAdminProfileId();
    if (!adminId) {
      return res.status(500).json({
        error: { message: 'No admin profile found', status: 500, timestamp: new Date().toISOString() }
      });
    }

    const bookingSlug = `booking-${Date.now().toString(36)}`;
    const { data: booking, error: insertError } = await supabase
      .from('entries')
      .insert({
        collection_id: bookingsColId,
        title: `${customer_name} — ${tourTitle} (${date})`,
        slug: bookingSlug,
        content: {
          customer_name,
          customer_email,
          customer_phone: customer_phone || '',
          tour_slug,
          tour_title: tourTitle,
          date,
          time_slot,
          adults: Number(adults),
          children: Number(children || 0),
          total_guests: totalGuests,
          amount: totalCents,
          currency,
          booking_status: 'pending',
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

    // Create Stripe checkout session
    const stripeConfig = await getStripeConfig();
    if (!stripeConfig) {
      return res.status(500).json({
        error: { message: 'Stripe not configured', status: 500, timestamp: new Date().toISOString() }
      });
    }

    const stripe = getStripeClient(stripeConfig.secretKey);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email,
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: tourTitle,
            description: `${date} às ${time_slot} — ${adults} adulto(s)${Number(children) > 0 ? `, ${children} criança(s)` : ''}`,
          },
          unit_amount: totalCents,
        },
        quantity: 1,
      }],
      metadata: {
        source: 'kibanCMS-bookings',
        booking_id: booking.id,
        tour_slug,
        date,
        time_slot,
      },
      success_url,
      cancel_url,
    });

    // Store stripe session ID on the booking
    await supabase
      .from('entries')
      .update({
        content: {
          ...((await supabase.from('entries').select('content').eq('id', booking.id).single()).data?.content as any || {}),
          stripe_session_id: session.id,
        },
      } as any)
      .eq('id', booking.id);

    logger.info('Booking created', { bookingId: booking.id, sessionId: session.id });

    res.status(201).json({
      data: {
        booking_id: booking.id,
        checkout_url: session.url,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error creating booking', { error: error.message });
    res.status(500).json({
      error: { message: error.message || 'Failed to create booking', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// GET /api/v1/bookings/status/:bookingId
// Returns booking details
// ============================================

router.get('/status/:bookingId', async (req: AuthRequest, res: Response) => {
  try {
    const { bookingId } = req.params;

    const { data: entry, error } = await supabase
      .from('entries')
      .select('id, title, slug, content, created_at, updated_at')
      .eq('id', bookingId)
      .single();

    if (error || !entry) {
      return res.status(404).json({
        error: { message: 'Booking not found', status: 404, timestamp: new Date().toISOString() }
      });
    }

    res.json({ data: entry, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error fetching booking status', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch booking', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// GET /api/v1/bookings/list
// Admin list with filters, pagination, and sorting
// Query: status, tour, date_from, date_to, limit, offset
// ============================================

router.get('/list', async (req: AuthRequest, res: Response) => {
  try {
    const {
      status: statusFilter,
      tour,
      date_from,
      date_to,
      limit = '50',
      offset = '0',
    } = req.query as Record<string, string | undefined>;

    const bookingsColId = await getCollectionId('bookings');
    if (!bookingsColId) {
      return res.status(404).json({
        error: { message: 'Bookings collection not found', status: 404, timestamp: new Date().toISOString() }
      });
    }

    let query = supabase
      .from('entries')
      .select('id, title, slug, content, status, tags, created_at, updated_at', { count: 'exact' })
      .eq('collection_id', bookingsColId)
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.filter('content->>booking_status', 'eq', statusFilter);
    }
    if (tour) {
      query = query.filter('content->>tour_slug', 'eq', tour);
    }
    if (date_from) {
      query = query.filter('content->>date', 'gte', date_from);
    }
    if (date_to) {
      query = query.filter('content->>date', 'lte', date_to);
    }

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
      error: { message: 'Failed to list bookings', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// GET /api/v1/bookings/stats
// Dashboard stats: totals by status + revenue
// ============================================

router.get('/stats', async (req: AuthRequest, res: Response) => {
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
      }
      else if (st === 'cancelled') cancelled++;
    }

    res.json({
      data: { total, pending, confirmed, cancelled, revenue },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching booking stats', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch stats', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// POST /api/v1/bookings/:bookingId/confirm
// Manually confirm a booking (without Stripe)
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
        error: { message: 'Booking not found', status: 404, timestamp: new Date().toISOString() }
      });
    }

    const content = entry.content as Record<string, any>;
    if (content.booking_status === 'confirmed') {
      return res.json({ data: { message: 'Already confirmed' }, timestamp: new Date().toISOString() });
    }

    const { error: updateErr } = await supabase
      .from('entries')
      .update({
        content: {
          ...content,
          booking_status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        },
        tags: ['booking', 'confirmed'],
      })
      .eq('id', bookingId);

    if (updateErr) throw updateErr;

    logger.info('Booking manually confirmed', { bookingId });
    res.json({ data: { message: 'Booking confirmed' }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error confirming booking', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to confirm booking', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// POST /api/v1/bookings/:bookingId/cancel
// Cancel a booking
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
        error: { message: 'Booking not found', status: 404, timestamp: new Date().toISOString() }
      });
    }

    const content = entry.content as Record<string, any>;
    if (content.booking_status === 'cancelled') {
      return res.json({ data: { message: 'Already cancelled' }, timestamp: new Date().toISOString() });
    }

    const { error: updateErr } = await supabase
      .from('entries')
      .update({
        content: {
          ...content,
          booking_status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        },
        tags: ['booking', 'cancelled'],
      })
      .eq('id', bookingId);

    if (updateErr) throw updateErr;

    logger.info('Booking cancelled', { bookingId });
    res.json({ data: { message: 'Booking cancelled' }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error cancelling booking', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to cancel booking', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

export default router;
