/**
 * Unified Checkout
 *
 * Single entry point for all Stripe-backed purchases. Accepts a heterogeneous
 * list of line items (bookings, inventory products, custom amounts) and
 * creates:
 *   1. An "order" entry (source of truth for the whole transaction)
 *   2. A "booking" entry per booking-typed line item (for capacity / admin UI)
 *   3. A Stripe Checkout Session with the combined total
 *
 * The Stripe webhook (handled in payments.ts) reads the order_id from session
 * metadata and finalizes everything atomically: order → confirmed, each
 * booking → confirmed, stock decremented, emails sent.
 *
 * Contract: /api/v1/checkout/create-session
 * Auth: API key (frontend) or JWT (admin)
 */

import { Router, type Response } from 'express';
// @ts-ignore — Stripe v22 has non-standard exports
import Stripe from 'stripe';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { tenantStore } from '../middleware/tenant.js';
import type { AuthRequest } from '../middleware/auth.js';
import {
  loadCoupon,
  validateCoupon,
  ensureStripeCoupon,
  recordPendingRedemption,
} from '../lib/coupons.js';

const router: Router = Router();

// ============================================
// TYPES
// ============================================

interface BookingLineItem {
  type: 'booking';
  resource_slug: string;
  date: string;
  time_slot: string;
  adults: number;
  children?: number;
  notes?: string;
}

interface ProductLineItem {
  type: 'product';
  slug: string;
  quantity: number;
}

interface CustomLineItem {
  type: 'custom';
  name: string;
  description?: string;
  amount: number;
  currency?: string;
  quantity?: number;
}

type LineItemInput = BookingLineItem | ProductLineItem | CustomLineItem;

interface ResolvedLineItem {
  type: 'booking' | 'product' | 'custom';
  label: string;
  description?: string;
  unit_amount: number;
  quantity: number;
  total: number;
  currency: string;
  // Type-specific metadata persisted on the order + used to finalize on webhook
  meta: Record<string, any>;
  // Stripe line_items entry
  stripeLineItem: any;
}

interface CheckoutBody {
  line_items: LineItemInput[];
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  coupon_code?: string;
  success_url: string;
  cancel_url: string;
  metadata?: Record<string, any>;
}

// ============================================
// STRIPE CONFIG — mirrors payments.ts (single source of truth)
// ============================================

interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
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
    // Prefer slug "default", fall back to first published entry with a key
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
          webhookSecret: c.stripe_webhook_secret || '',
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
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      defaultCurrency: (process.env.STRIPE_DEFAULT_CURRENCY || 'eur').toLowerCase(),
    };
    configCache.set(tenantId, { config, fetchedAt: Date.now() });
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

function parseJsonSafe<T>(value: any, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function shortOrderId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'ORD-';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// ============================================
// LINE ITEM RESOLVERS
// Each returns a ResolvedLineItem or throws a descriptive Error.
// ============================================

async function resolveBookingLineItem(item: BookingLineItem, idx: number, defaultCurrency: string): Promise<{ resolved: ResolvedLineItem; resource: any }> {
  const prefix = `line_items[${idx}] (booking)`;

  if (!item.resource_slug) throw new Error(`${prefix}: resource_slug is required`);
  if (!item.date) throw new Error(`${prefix}: date is required`);
  if (!item.time_slot) throw new Error(`${prefix}: time_slot is required`);
  if (!item.adults || item.adults < 1) throw new Error(`${prefix}: adults must be >= 1`);

  // Load the resource (bookable-resources → tours fallback, same as v2)
  let colId = await getCollectionId('bookable-resources');
  let isTours = false;
  if (!colId) { colId = await getCollectionId('tours'); isTours = true; }
  if (!colId) throw new Error(`${prefix}: no bookable-resources or tours collection found`);

  // Tolerant lookup: exact slug → case-insensitive slug → title ilike.
  const decoded = (() => { try { return decodeURIComponent(item.resource_slug); } catch { return item.resource_slug; } })();

  const { data: exact } = await supabase
    .from('entries')
    .select('id, title, slug, content, status')
    .eq('collection_id', colId)
    .eq('slug', decoded)
    .maybeSingle();

  let entry: any = exact;
  if (!entry) {
    const { data: ci } = await supabase
      .from('entries')
      .select('id, title, slug, content, status')
      .eq('collection_id', colId)
      .ilike('slug', decoded)
      .limit(1)
      .maybeSingle();
    entry = ci;
  }
  if (!entry) {
    const { data: byTitle } = await supabase
      .from('entries')
      .select('id, title, slug, content, status')
      .eq('collection_id', colId)
      .ilike('title', decoded)
      .limit(1)
      .maybeSingle();
    entry = byTitle;
  }

  if (!entry) throw new Error(`${prefix}: resource "${item.resource_slug}" not found`);
  if (entry.status !== 'published') throw new Error(`${prefix}: resource "${item.resource_slug}" is not active`);

  const c = (entry.content as Record<string, any>) || {};

  // External booking platforms (Bókun, FareHarbor, GetYourGuide, Viator, etc.)
  // — tour is sold elsewhere, not through kibanCMS checkout.
  if (c.external_booking_url) {
    throw new Error(`${prefix}: resource "${entry.slug}" uses an external booking platform (${c.external_booking_url}). Redirect the customer there instead of checking out here.`);
  }
  const resource = {
    id: entry.id,
    slug: entry.slug,
    title: c.title || entry.title,
    currency: (c.currency || defaultCurrency).toLowerCase(),
    capacity: Number(isTours ? c.max_capacity : c.capacity) || 1,
    priceAdult: Number(isTours ? c.price_adult : c.price) || 0,
    priceChild: Number(isTours ? c.price_child : c.price_secondary) || 0,
  };

  // Capacity check — how many guests already booked for this slot.
  // Use the resolved canonical slug (not the user-supplied one) so mixed
  // spellings don't bypass the capacity limit.
  const bookingsColId = await getCollectionId('bookings');
  let booked = 0;
  if (bookingsColId) {
    const { data: existing } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', bookingsColId)
      .filter('content->>resource_slug', 'eq', resource.slug)
      .filter('content->>date', 'eq', item.date)
      .filter('content->>time_slot', 'eq', item.time_slot)
      .filter('content->>booking_status', 'in', '("pending","confirmed")');

    if (existing) {
      for (const b of existing) {
        const bc = b.content as any;
        booked += Number(bc.party_size) || (Number(bc.adults) || 0) + (Number(bc.children) || 0);
      }
    }
  }

  const adults = Number(item.adults);
  const children = Number(item.children || 0);
  const partySize = adults + children;

  if (booked + partySize > resource.capacity) {
    throw new Error(`${prefix}: only ${Math.max(0, resource.capacity - booked)} seats left for ${item.date} ${item.time_slot}`);
  }

  // Price in cents (prices in collection are in currency units)
  const unitAmount = Math.round(
    (adults * resource.priceAdult * 100) + (children * resource.priceChild * 100)
  );

  if (unitAmount < 50) throw new Error(`${prefix}: total is too low (min 0.50 ${resource.currency.toUpperCase()})`);

  const label = `${resource.title} — ${item.date} ${item.time_slot}`;
  const partyDesc = `${adults} adulto${adults !== 1 ? 's' : ''}${children > 0 ? `, ${children} criança${children !== 1 ? 's' : ''}` : ''}`;

  return {
    resource,
    resolved: {
      type: 'booking',
      label,
      description: partyDesc,
      unit_amount: unitAmount,
      quantity: 1,
      total: unitAmount,
      currency: resource.currency,
      meta: {
        resource_slug: resource.slug,
        resource_title: resource.title,
        date: item.date,
        time_slot: item.time_slot,
        adults,
        children,
        party_size: partySize,
        notes: item.notes || '',
      },
      stripeLineItem: {
        price_data: {
          currency: resource.currency,
          product_data: { name: label, description: partyDesc },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    },
  };
}

async function resolveProductLineItem(item: ProductLineItem, idx: number, defaultCurrency: string): Promise<ResolvedLineItem> {
  const prefix = `line_items[${idx}] (product)`;

  if (!item.slug) throw new Error(`${prefix}: slug is required`);
  const quantity = Math.floor(Number(item.quantity) || 0);
  if (quantity < 1) throw new Error(`${prefix}: quantity must be >= 1`);

  const colId = await getCollectionId('stripe-products');
  if (!colId) throw new Error(`${prefix}: stripe-products collection not found. Install the Stripe Payments add-on.`);

  const { data: entry } = await supabase
    .from('entries')
    .select('id, title, slug, content, status')
    .eq('collection_id', colId)
    .eq('slug', item.slug)
    .single();

  if (!entry) throw new Error(`${prefix}: product "${item.slug}" not found`);
  if (entry.status !== 'published') throw new Error(`${prefix}: product "${item.slug}" is not published`);

  const c = (entry.content as Record<string, any>) || {};
  if (c.is_active === false) throw new Error(`${prefix}: product "${item.slug}" is not active`);

  const unitAmount = parseInt(c.price, 10);
  if (!unitAmount || unitAmount < 50) throw new Error(`${prefix}: product has invalid price`);

  const currency = (c.currency || defaultCurrency).toLowerCase();
  const label = c.product_name || entry.title || item.slug;
  const description = c.description || undefined;

  // Optional stock check — if product has stock_quantity, enforce it
  if (c.stock_quantity != null && c.stock_quantity !== '') {
    const stock = Number(c.stock_quantity);
    if (quantity > stock) throw new Error(`${prefix}: only ${stock} in stock`);
  }

  const total = unitAmount * quantity;

  return {
    type: 'product',
    label,
    description,
    unit_amount: unitAmount,
    quantity,
    total,
    currency,
    meta: {
      product_slug: item.slug,
      product_id: entry.id,
      product_name: label,
    },
    stripeLineItem: {
      price_data: {
        currency,
        product_data: {
          name: label,
          ...(description && { description }),
          ...(c.image_url && { images: [c.image_url] }),
        },
        unit_amount: unitAmount,
      },
      quantity,
    },
  };
}

function resolveCustomLineItem(item: CustomLineItem, idx: number, defaultCurrency: string): ResolvedLineItem {
  const prefix = `line_items[${idx}] (custom)`;

  if (!item.name || typeof item.name !== 'string') throw new Error(`${prefix}: name is required`);
  const unitAmount = Math.floor(Number(item.amount) || 0);
  if (unitAmount < 50) throw new Error(`${prefix}: amount must be >= 50 cents`);
  const quantity = Math.floor(Number(item.quantity) || 1);
  if (quantity < 1) throw new Error(`${prefix}: quantity must be >= 1`);

  const currency = (item.currency || defaultCurrency).toLowerCase();
  const total = unitAmount * quantity;

  return {
    type: 'custom',
    label: item.name,
    description: item.description,
    unit_amount: unitAmount,
    quantity,
    total,
    currency,
    meta: {
      custom_name: item.name,
    },
    stripeLineItem: {
      price_data: {
        currency,
        product_data: {
          name: item.name,
          ...(item.description && { description: item.description }),
        },
        unit_amount: unitAmount,
      },
      quantity,
    },
  };
}

// ============================================
// POST /api/v1/checkout/create-session
// ============================================

router.post('/create-session', async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as CheckoutBody;

    // ── Input validation ──
    if (!Array.isArray(body.line_items) || body.line_items.length === 0) {
      return res.status(400).json({
        error: { message: 'line_items must be a non-empty array', status: 400, timestamp: new Date().toISOString() },
      });
    }

    if (!body.customer?.name || !body.customer?.email) {
      return res.status(400).json({
        error: { message: 'customer.name and customer.email are required', status: 400, timestamp: new Date().toISOString() },
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer.email)) {
      return res.status(400).json({
        error: { message: 'customer.email is invalid', status: 400, timestamp: new Date().toISOString() },
      });
    }

    if (!body.success_url || !body.cancel_url) {
      return res.status(400).json({
        error: { message: 'success_url and cancel_url are required', status: 400, timestamp: new Date().toISOString() },
      });
    }

    const stripeConfig = await getStripeConfig();
    if (!stripeConfig) {
      return res.status(503).json({
        error: { message: 'Stripe not configured', status: 503, timestamp: new Date().toISOString() },
      });
    }

    const stripe = getStripeClient(stripeConfig.secretKey);

    // ── Resolve all line items ──
    const resolvedItems: ResolvedLineItem[] = [];
    const bookingResources: Array<{ idx: number; resource: any }> = [];

    for (let i = 0; i < body.line_items.length; i++) {
      const raw = body.line_items[i];
      if (!raw || typeof raw !== 'object' || !('type' in raw)) {
        return res.status(400).json({
          error: { message: `line_items[${i}]: missing or invalid type`, status: 400, timestamp: new Date().toISOString() },
        });
      }

      try {
        if (raw.type === 'booking') {
          const { resolved, resource } = await resolveBookingLineItem(raw as BookingLineItem, i, stripeConfig.defaultCurrency);
          resolvedItems.push(resolved);
          bookingResources.push({ idx: resolvedItems.length - 1, resource });
        } else if (raw.type === 'product') {
          resolvedItems.push(await resolveProductLineItem(raw as ProductLineItem, i, stripeConfig.defaultCurrency));
        } else if (raw.type === 'custom') {
          resolvedItems.push(resolveCustomLineItem(raw as CustomLineItem, i, stripeConfig.defaultCurrency));
        } else {
          return res.status(400).json({
            error: { message: `line_items[${i}]: unsupported type "${(raw as any).type}"`, status: 400, timestamp: new Date().toISOString() },
          });
        }
      } catch (e: any) {
        return res.status(400).json({
          error: { message: e.message, code: 'LINE_ITEM_INVALID', status: 400, timestamp: new Date().toISOString() },
        });
      }
    }

    // ── Single currency guard (Stripe Checkout requires one currency per session) ──
    const currencies = Array.from(new Set(resolvedItems.map(r => r.currency)));
    if (currencies.length > 1) {
      return res.status(400).json({
        error: { message: `All line items must share the same currency (got: ${currencies.join(', ')})`, status: 400, timestamp: new Date().toISOString() },
      });
    }
    const currency = currencies[0];

    // ── Compute subtotal ──
    const subtotal = resolvedItems.reduce((sum, r) => sum + r.total, 0);

    // ── Coupon (optional) ──
    let couponRow: any = null;
    let couponMeta: { code: string; discount_cents: number } | null = null;
    let stripeCouponId: string | null = null;

    if (body.coupon_code && body.coupon_code.trim()) {
      const bookingPresent = resolvedItems.find(r => r.type === 'booking');
      const couponResourceSlug = bookingPresent?.meta?.resource_slug || '__non_booking__';

      const validation = await validateCoupon({
        code: body.coupon_code,
        resource_slug: couponResourceSlug,
        customer_email: body.customer.email,
        subtotal_cents: subtotal,
        currency,
      });

      if (!validation.valid) {
        return res.status(400).json({
          error: { message: validation.message || 'Coupon invalid', code: validation.reason || 'COUPON_INVALID', status: 400, timestamp: new Date().toISOString() },
        });
      }

      const loaded = await loadCoupon(body.coupon_code);
      if (loaded) {
        couponRow = loaded.row;
        couponMeta = { code: loaded.coupon.code, discount_cents: validation.discount_cents || 0 };
        stripeCouponId = await ensureStripeCoupon(stripe, couponRow, loaded.coupon);
      }
    }

    const total = Math.max(0, subtotal - (couponMeta?.discount_cents || 0));

    // ── Persist the order (status: pending) ──
    const ordersColId = await getCollectionId('orders');
    if (!ordersColId) {
      return res.status(500).json({
        error: { message: 'Orders collection not found. Install/update the Stripe Payments add-on to create it.', status: 500, timestamp: new Date().toISOString() },
      });
    }

    const adminId = await getAdminProfileId();
    if (!adminId) {
      return res.status(500).json({
        error: { message: 'No admin profile found', status: 500, timestamp: new Date().toISOString() },
      });
    }

    const orderNumber = shortOrderId();
    const orderSlug = `ord-${orderNumber.toLowerCase().replace(/-/g, '')}-${Date.now().toString(36)}`;

    // Summarised line items for storage
    const lineItemsForStorage = resolvedItems.map(r => ({
      type: r.type,
      label: r.label,
      description: r.description,
      unit_amount: r.unit_amount,
      quantity: r.quantity,
      total: r.total,
      currency: r.currency,
      meta: r.meta,
    }));

    const { data: order, error: orderErr } = await supabase
      .from('entries')
      .insert({
        collection_id: ordersColId,
        title: `${orderNumber} — ${body.customer.name}`,
        slug: orderSlug,
        content: {
          order_number: orderNumber,
          status: 'pending',
          customer_name: body.customer.name,
          customer_email: body.customer.email,
          customer_phone: body.customer.phone || '',
          line_items: JSON.stringify(lineItemsForStorage),
          subtotal,
          discount_amount: couponMeta?.discount_cents || 0,
          total,
          currency,
          coupon_code: couponMeta?.code || '',
          metadata: body.metadata ? JSON.stringify(body.metadata) : '',
          related_booking_ids: '[]',
        },
        status: 'published',
        published_at: new Date().toISOString(),
        author_id: adminId,
        tags: ['order', 'pending'],
      } as any)
      .select('id')
      .single();

    if (orderErr) throw orderErr;

    // ── Create booking entries (one per booking line item) linked to order ──
    const bookingIds: string[] = [];
    const bookingsColId = await getCollectionId('bookings');

    if (bookingsColId) {
      for (let i = 0; i < resolvedItems.length; i++) {
        const r = resolvedItems[i];
        if (r.type !== 'booking') continue;

        const m = r.meta;
        const bookingSlug = `bk-${order.id.slice(0, 8)}-${i}-${Date.now().toString(36)}`;

        const { data: bk, error: bkErr } = await supabase
          .from('entries')
          .insert({
            collection_id: bookingsColId,
            title: `${body.customer.name} — ${m.resource_title} (${m.date})`,
            slug: bookingSlug,
            content: {
              order_id: order.id,
              order_number: orderNumber,
              customer_name: body.customer.name,
              customer_email: body.customer.email,
              customer_phone: body.customer.phone || '',
              resource_slug: m.resource_slug,
              tour_slug: m.resource_slug, // legacy compat for BookingsManager filters
              tour_title: m.resource_title,
              date: m.date,
              time_slot: m.time_slot,
              adults: m.adults,
              children: m.children,
              party_size: m.party_size,
              total_guests: m.party_size, // legacy compat
              amount: r.total,
              currency: r.currency,
              booking_status: 'pending',
              notes: m.notes,
            },
            status: 'published',
            published_at: new Date().toISOString(),
            author_id: adminId,
            tags: ['booking', 'pending'],
          } as any)
          .select('id')
          .single();

        if (bkErr) throw bkErr;
        bookingIds.push(bk.id);
      }

      // Update order with linked booking IDs
      if (bookingIds.length > 0) {
        const { data: currentOrder } = await supabase
          .from('entries').select('content').eq('id', order.id).single();
        await supabase
          .from('entries')
          .update({
            content: {
              ...(currentOrder?.content as any || {}),
              related_booking_ids: JSON.stringify(bookingIds),
            },
          } as any)
          .eq('id', order.id);
      }
    }

    // ── Create Stripe Checkout Session ──
    const sessionParams: any = {
      mode: 'payment',
      customer_email: body.customer.email,
      line_items: resolvedItems.map(r => r.stripeLineItem),
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      metadata: {
        source: 'kibanCMS-checkout',
        order_id: order.id,
        order_number: orderNumber,
        ...(couponMeta?.code ? { coupon_code: couponMeta.code } : {}),
        ...(body.metadata || {}),
      },
    };

    if (stripeCouponId) {
      sessionParams.discounts = [{ coupon: stripeCouponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Store Stripe session ID on the order
    const { data: freshOrder } = await supabase
      .from('entries').select('content').eq('id', order.id).single();
    await supabase
      .from('entries')
      .update({
        content: {
          ...(freshOrder?.content as any || {}),
          stripe_session_id: session.id,
        },
      } as any)
      .eq('id', order.id);

    // Mirror session ID on bookings too (BookingsManager + coupon redemption flow rely on it)
    for (const bkId of bookingIds) {
      const { data: curBk } = await supabase
        .from('entries').select('content').eq('id', bkId).single();
      await supabase
        .from('entries')
        .update({
          content: {
            ...(curBk?.content as any || {}),
            stripe_session_id: session.id,
          },
        } as any)
        .eq('id', bkId);
    }

    // Record coupon pending redemption (one per booking, matches existing contract)
    if (couponRow && couponMeta && bookingIds.length > 0) {
      const loaded = await loadCoupon(body.coupon_code || '');
      if (loaded) {
        for (const bkId of bookingIds) {
          await recordPendingRedemption({
            coupon: loaded.coupon,
            booking_id: bkId,
            customer_email: body.customer.email,
            subtotal_cents: subtotal,
            discount_cents: couponMeta.discount_cents,
            currency,
            stripe_session_id: session.id,
            author_id: adminId,
          });
        }
      }
    }

    logger.info('Unified checkout session created', {
      orderId: order.id,
      orderNumber,
      sessionId: session.id,
      lineItems: resolvedItems.length,
      bookings: bookingIds.length,
      total,
      currency,
    });

    res.status(201).json({
      data: {
        order_id: order.id,
        order_number: orderNumber,
        session_id: session.id,
        checkout_url: session.url,
        subtotal,
        discount_amount: couponMeta?.discount_cents || 0,
        total,
        currency,
        line_items: lineItemsForStorage.map(li => ({
          type: li.type,
          label: li.label,
          quantity: li.quantity,
          total: li.total,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Unified checkout error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message || 'Failed to create checkout session', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /api/v1/checkout/orders/:id
// Order status (for success page)
// ============================================

router.get('/orders/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: entry, error } = await supabase
      .from('entries')
      .select('id, title, slug, content, status, tags, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !entry) {
      return res.status(404).json({
        error: { message: 'Order not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    res.json({ data: entry, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error fetching order', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch order', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /api/v1/checkout/orders
// Admin list of orders (paginated, filterable by status)
// ============================================

router.get('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query as Record<string, string | undefined>;

    const colId = await getCollectionId('orders');
    if (!colId) {
      return res.json({
        data: [],
        meta: { pagination: { limit: 50, offset: 0, total: 0 } },
        timestamp: new Date().toISOString(),
      });
    }

    let query = supabase
      .from('entries')
      .select('id, title, slug, content, status, tags, created_at, updated_at', { count: 'exact' })
      .eq('collection_id', colId)
      .order('created_at', { ascending: false });

    if (status) query = query.filter('content->>status', 'eq', status);

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
    logger.error('Error listing orders', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to list orders', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /api/v1/checkout/stats
// ============================================

router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const colId = await getCollectionId('orders');
    if (!colId) {
      return res.json({
        data: { total: 0, pending: 0, confirmed: 0, cancelled: 0, revenue: 0 },
        timestamp: new Date().toISOString(),
      });
    }

    const { data: all, error } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', colId);

    if (error) throw error;

    let total = 0, pending = 0, confirmed = 0, cancelled = 0, revenue = 0;
    for (const entry of all || []) {
      const c = entry.content as Record<string, any>;
      total++;
      const st = c.status || 'pending';
      if (st === 'pending') pending++;
      else if (st === 'confirmed') { confirmed++; revenue += Number(c.total) || 0; }
      else if (st === 'cancelled' || st === 'expired') cancelled++;
    }

    res.json({
      data: { total, pending, confirmed, cancelled, revenue },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching checkout stats', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch stats', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
