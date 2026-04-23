import { Router, type Request, type Response } from 'express';
// @ts-ignore — Stripe v22 has non-standard exports
import Stripe from 'stripe';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { LRUCache } from '../lib/lru-cache.js';
import { sendBookingConfirmation, sendBookingAdminNotification, sendPaymentReceipt, sendPaymentAdminNotification } from '../lib/email.js';
import { confirmRedemption, cancelPendingRedemption } from '../lib/coupons.js';
import { tenantStore, getOrCreateClients } from '../middleware/tenant.js';
import { resolveTenantById, getDefaultTenant } from '../config/tenants.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

// ============================================
// STRIPE CONFIG — loaded from CMS (multi-client)
//
// Each kibanCMS instance stores its own Stripe keys
// in the "stripe-config" collection (entry slug: "default").
// This means each client/site has its own Stripe account.
//
// Fallback: environment variables for single-tenant setups.
// ============================================

interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  defaultCurrency: string;
  publishableKey?: string;
}

// Per-tenant config cache — keyed by tenant.id. A single global cache would
// leak keys across tenants in multi-tenant mode (the fused entry in audit v1.6).
const configCache = new Map<string, { config: StripeConfig; fetchedAt: number }>();
const CONFIG_TTL = 60_000;

async function getStripeConfig(): Promise<StripeConfig | null> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';

  const cached = configCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CONFIG_TTL) {
    return cached.config;
  }

  // Try loading from CMS (stripe-config collection, "default" entry)
  const { data: col } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', 'stripe-config')
    .single();

  if (col) {
    // Prefer the canonical "default" slug if it exists, else fall back to
    // the first published entry with a non-empty secret key. This lets
    // operators create entries with any slug (e.g. "eur", "production")
    // without having to learn the convention.
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
          publishableKey: c.stripe_publishable_key || '',
        };
        configCache.set(tenantId, { config, fetchedAt: Date.now() });
        return config;
      }
    }
  }

  // Fallback to environment variables (single-tenant / legacy)
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

// Stripe clients cached by secret key (LRU — evicts stale clients on key rotation)
const stripeClients = new LRUCache<any>({ maxSize: 20, ttlMs: 24 * 60 * 60_000 }); // 24h TTL

function getStripeClient(secretKey: string): any {
  let client = stripeClients.get(secretKey);
  if (!client) {
    // @ts-ignore — Stripe v22 constructor
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

// ============================================
// POST /api/v1/payments/create-session
//
// Creates a Stripe Checkout Session and returns the URL.
// Reads Stripe keys from CMS (multi-client) or env vars (fallback).
//
// Body:
//   product_slug?: string  — slug of a stripe-products entry
//   amount?: number        — amount in cents (if no product_slug)
//   currency?: string      — ISO 4217 (default from config)
//   name?: string          — product name shown in checkout
//   description?: string   — description in checkout
//   image_url?: string     — product image
//   customer_email?: string — pre-fill email
//   success_url: string    — redirect after payment
//   cancel_url: string     — redirect on cancel
//   metadata?: object      — custom data stored with payment
// ============================================

router.post('/create-session', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.profileId) {
      return res.status(401).json({
        error: { message: 'Unauthorized: API key required', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const config = await getStripeConfig();
    if (!config) {
      return res.status(503).json({
        error: {
          message: 'Stripe not configured. Add Stripe keys in the CMS (Stripe Config) or set STRIPE_SECRET_KEY.',
          status: 503,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const stripe = getStripeClient(config.secretKey);

    const {
      product_slug,
      amount,
      currency,
      name,
      description,
      image_url,
      customer_email,
      success_url,
      cancel_url,
      metadata,
    } = req.body;

    if (!success_url || !cancel_url) {
      return res.status(400).json({
        error: { message: 'Missing required fields: success_url, cancel_url', status: 400, timestamp: new Date().toISOString() },
      });
    }

    let lineItemName = name || 'Payment';
    let lineItemAmount: number;
    let lineItemCurrency = (currency || config.defaultCurrency).toLowerCase();
    let lineItemDescription = description || undefined;
    let lineItemImages: string[] = [];

    // Load product from CMS if slug provided
    if (product_slug) {
      const colId = await getCollectionId('stripe-products');
      if (!colId) {
        return res.status(404).json({
          error: { message: 'Stripe Products collection not found. Install the Stripe Payments addon.', status: 404, timestamp: new Date().toISOString() },
        });
      }

      const { data: product } = await supabase
        .from('entries')
        .select('content, status')
        .eq('collection_id', colId)
        .eq('slug', product_slug)
        .eq('status', 'published')
        .single();

      if (!product) {
        return res.status(404).json({
          error: { message: `Product "${product_slug}" not found or not published`, status: 404, timestamp: new Date().toISOString() },
        });
      }

      const pc = product.content as Record<string, any>;
      if (pc.is_active === false) {
        return res.status(400).json({
          error: { message: 'Product is not active', status: 400, timestamp: new Date().toISOString() },
        });
      }

      lineItemName = pc.product_name || lineItemName;
      lineItemAmount = parseInt(pc.price, 10);
      lineItemCurrency = (pc.currency || lineItemCurrency).toLowerCase();
      lineItemDescription = pc.description || lineItemDescription;
      if (pc.image_url) lineItemImages = [pc.image_url];
    } else if (amount) {
      lineItemAmount = parseInt(String(amount), 10);
    } else {
      return res.status(400).json({
        error: { message: 'Provide either product_slug or amount', status: 400, timestamp: new Date().toISOString() },
      });
    }

    if (!lineItemAmount || lineItemAmount < 50) {
      return res.status(400).json({
        error: { message: 'Amount must be at least 50 cents', status: 400, timestamp: new Date().toISOString() },
      });
    }

    if (image_url) lineItemImages = [image_url];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Omit payment_method_types to auto-detect all enabled methods
      // (card, Apple Pay, Google Pay, SEPA, etc. per the Stripe dashboard).
      line_items: [
        {
          price_data: {
            currency: lineItemCurrency,
            product_data: {
              name: lineItemName,
              ...(lineItemDescription && { description: lineItemDescription }),
              ...(lineItemImages.length > 0 && { images: lineItemImages }),
            },
            unit_amount: lineItemAmount,
          },
          quantity: 1,
        },
      ],
      success_url,
      cancel_url,
      ...(customer_email && { customer_email }),
      metadata: {
        source: 'kibanCMS',
        tenant_id: tenantStore.getStore()?.tenant?.id || 'default',
        ...(product_slug && { product_slug }),
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
      },
    });

    logger.info('Stripe Checkout session created', {
      sessionId: session.id,
      amount: lineItemAmount,
      currency: lineItemCurrency,
    });

    res.status(201).json({
      data: {
        session_id: session.id,
        checkout_url: session.url,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Stripe create-session error', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to create payment session', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// POST /api/v1/payments/webhook
//
// Receives Stripe webhook events. Public — no API key, verified via Stripe
// signature. Mounted DIRECTLY on the app in server.ts (not on this router),
// so it bypasses validateApiKey. See audit v1.6 C1 for the reason.
//
// Tenant resolution:
//   Stripe does not send X-Tenant. We embed `tenant_id` in Session metadata
//   when creating checkout, then at webhook time we peek at the raw body to
//   resolve tenant BEFORE verifying signature (so getStripeConfig reads the
//   right tenant's webhook_secret). Peeking is safe because any forged
//   tenant_id would still fail signature verification with that tenant's key.
// ============================================

export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'] as string;
  if (!sig) {
    res.status(400).json({ error: { message: 'Missing Stripe signature', status: 400 } });
    return;
  }

  // Peek at the raw body to extract tenant_id (signature re-verified below).
  let peekedTenantId: string | undefined;
  try {
    const peeked = JSON.parse((req.body as Buffer).toString('utf8'));
    peekedTenantId = peeked?.data?.object?.metadata?.tenant_id;
  } catch {
    /* malformed — signature verification below will reject */
  }

  const tenant = peekedTenantId ? resolveTenantById(peekedTenantId) : getDefaultTenant();
  if (!tenant) {
    // In single-tenant deployments with env-only Stripe config, there may be no
    // loaded tenants. Fall through without tenant context; supabase proxy will
    // use the env-var default client.
    await processWebhook(req, res, sig);
    return;
  }

  // Run the rest in tenant context so getStripeConfig reads the right keys
  // and all downstream supabase queries hit the right DB.
  const clients = getOrCreateClients(tenant);
  await tenantStore.run({ tenant, ...clients }, () => processWebhook(req, res, sig));
}

async function processWebhook(req: Request, res: Response, sig: string): Promise<void> {
  try {
    const config = await getStripeConfig();
    if (!config) {
      res.status(503).json({ error: { message: 'Stripe not configured', status: 503 } });
      return;
    }

    if (!config.webhookSecret) {
      res.status(400).json({
        error: { message: 'Webhook secret not configured', status: 400 },
      });
      return;
    }

    const stripe = getStripeClient(config.secretKey);

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, config.webhookSecret);
    } catch (err: any) {
      logger.warn('Stripe webhook signature failed', { error: err.message });
      res.status(400).json({ error: { message: 'Invalid signature', status: 400 } });
      return;
    }

    logger.info('Stripe webhook received', {
      type: event.type,
      id: event.id,
      tenant: tenantStore.getStore()?.tenant?.id || 'default',
    });

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;

      const colId = await getCollectionId('stripe-transactions');
      if (!colId) {
        logger.warn('stripe-transactions collection not found, skipping');
        res.json({ received: true });
        return;
      }

      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['super_admin', 'admin'])
        .limit(1)
        .single();

      if (!adminProfile) {
        logger.warn('No admin profile found for transaction entry');
        res.json({ received: true });
        return;
      }

      const timestamp = new Date().toISOString();
      const slug = `txn-${session.id.slice(-12)}-${Date.now().toString(36)}`;

      await supabase.from('entries').insert({
        collection_id: colId,
        title: `${session.customer_details?.name || session.customer_details?.email || 'Payment'} — ${(session.amount_total || 0) / 100} ${(session.currency || 'eur').toUpperCase()}`,
        slug,
        content: {
          stripe_session_id: session.id,
          stripe_payment_intent: session.payment_intent,
          amount: session.amount_total,
          currency: session.currency,
          payment_status: session.payment_status,
          customer_email: session.customer_details?.email || '',
          customer_name: session.customer_details?.name || '',
          product_name: session.metadata?.product_slug || 'Custom payment',
          metadata: JSON.stringify(session.metadata || {}),
          paid_at: timestamp,
        },
        status: 'published',
        published_at: timestamp,
        author_id: adminProfile.id,
        tags: ['stripe', session.payment_status || 'unknown'],
      });

      logger.info('Stripe transaction recorded', {
        sessionId: session.id,
        amount: session.amount_total,
        status: session.payment_status,
      });

      // ── UNIFIED ORDER FLOW ──
      // If session.metadata.order_id is present, this came from the unified
      // /checkout/create-session endpoint. Finalize the order + all its bookings
      // in one pass, then skip the legacy single-booking / standalone paths.
      const orderId = session.metadata?.order_id;
      if (orderId) {
        const { data: orderEntry } = await supabase
          .from('entries')
          .select('id, content')
          .eq('id', orderId)
          .single();

        if (orderEntry) {
          const orderContent = orderEntry.content as Record<string, any>;
          const paidAt = new Date().toISOString();

          // Mark order confirmed
          await supabase
            .from('entries')
            .update({
              content: {
                ...orderContent,
                status: 'confirmed',
                stripe_session_id: session.id,
                stripe_payment_intent: session.payment_intent || '',
                paid_at: paidAt,
              },
              tags: ['order', 'confirmed'],
            })
            .eq('id', orderId);

          logger.info('Order confirmed via payment', { orderId, sessionId: session.id });

          // Confirm related bookings + fire booking emails
          const bookingIds: string[] = (() => {
            try { return JSON.parse(orderContent.related_booking_ids || '[]'); } catch { return []; }
          })();

          for (const bkId of bookingIds) {
            const { data: bookingEntry } = await supabase
              .from('entries').select('id, content').eq('id', bkId).single();
            if (!bookingEntry) continue;

            const bkContent = bookingEntry.content as Record<string, any>;
            await supabase
              .from('entries')
              .update({
                content: { ...bkContent, booking_status: 'confirmed', confirmed_at: paidAt, stripe_session_id: session.id },
                tags: ['booking', 'confirmed'],
              })
              .eq('id', bkId);

            sendBookingConfirmation({ ...bkContent, booking_status: 'confirmed' }).catch(err =>
              logger.warn('Booking confirmation email failed', { bkId, error: err.message })
            );

            // Coupon redemption per booking (matches existing contract)
            if (orderContent.coupon_code) {
              confirmRedemption(bkId, session.id).catch(err =>
                logger.warn('Coupon redemption confirm failed', { bkId, error: err.message })
              );
            }
          }

          // Decrement product stock for product line items
          const lineItems = (() => {
            try { return JSON.parse(orderContent.line_items || '[]'); } catch { return []; }
          })();
          const productsColId = await getCollectionId('stripe-products');
          if (productsColId) {
            for (const li of lineItems) {
              if (li.type !== 'product' || !li.meta?.product_id) continue;
              const { data: prod } = await supabase
                .from('entries').select('content').eq('id', li.meta.product_id).single();
              if (!prod?.content) continue;
              const pc = prod.content as any;
              if (pc.stock_quantity == null || pc.stock_quantity === '') continue;
              const newStock = Math.max(0, Number(pc.stock_quantity) - Number(li.quantity));
              await supabase
                .from('entries')
                .update({ content: { ...pc, stock_quantity: newStock } })
                .eq('id', li.meta.product_id);
            }
          }

          // Admin notification (one per order)
          const adminNotifPayload = {
            amount: orderContent.total || session.amount_total || 0,
            currency: orderContent.currency || session.currency || 'eur',
            customer_name: orderContent.customer_name,
            customer_email: orderContent.customer_email,
            product_name: `Order ${orderContent.order_number} — ${lineItems.length} item${lineItems.length !== 1 ? 's' : ''}`,
            stripe_session_id: session.id,
          };
          sendPaymentAdminNotification(adminNotifPayload).catch(err =>
            logger.warn('Order admin notification failed', { orderId, error: err.message })
          );

          // Customer receipt (only if no bookings — bookings already sent their own confirmation)
          if (bookingIds.length === 0) {
            sendPaymentReceipt({ ...adminNotifPayload, customer_email: orderContent.customer_email, paid_at: paidAt }).catch(err =>
              logger.warn('Order receipt email failed', { orderId, error: err.message })
            );
          }

          // Done — skip legacy paths
          res.json({ received: true });
          return;
        }
      }

      // ── LEGACY PATHS ──
      // If this payment is for a booking, update its status to confirmed
      const bookingId = session.metadata?.booking_id;
      if (bookingId) {
        const { data: bookingEntry } = await supabase
          .from('entries')
          .select('id, content')
          .eq('id', bookingId)
          .single();

        if (bookingEntry) {
          const content = bookingEntry.content as Record<string, any>;
          await supabase
            .from('entries')
            .update({
              content: {
                ...content,
                booking_status: 'confirmed',
                confirmed_at: new Date().toISOString(),
                stripe_session_id: session.id,
              },
              tags: ['booking', 'confirmed'],
            })
            .eq('id', bookingId);

          logger.info('Booking confirmed via payment', { bookingId, sessionId: session.id });

          // Send customer confirmation + admin notification (non-blocking)
          sendBookingConfirmation({ ...content, booking_status: 'confirmed' }).catch(err =>
            logger.warn('Booking confirmation email failed', { bookingId, error: err.message })
          );
          sendBookingAdminNotification({ ...content, booking_status: 'confirmed' }, 'confirmed').catch(err =>
            logger.warn('Booking admin notification failed', { bookingId, error: err.message })
          );

          // Confirm coupon redemption + atomic usage_count bump (non-blocking).
          if (session.metadata?.coupon_code) {
            confirmRedemption(bookingId, session.id).catch(err =>
              logger.warn('Coupon redemption confirm failed', { bookingId, error: err.message })
            );
          }
        }
      } else {
        // Standalone payment (non-booking) — send receipt + admin notification
        const paymentData = {
          amount: session.amount_total || 0,
          currency: session.currency || 'eur',
          customer_name: session.customer_details?.name || '',
          customer_email: session.customer_details?.email || '',
          product_name: session.metadata?.product_slug || 'Pagamento',
          stripe_session_id: session.id,
          paid_at: new Date().toISOString(),
        };

        if (paymentData.customer_email) {
          sendPaymentReceipt(paymentData).catch(err =>
            logger.warn('Payment receipt email failed', { sessionId: session.id, error: err.message })
          );
        }
        sendPaymentAdminNotification(paymentData).catch(err =>
          logger.warn('Payment admin notification failed', { sessionId: session.id, error: err.message })
        );
      }
    }

    // Release coupon hold if Stripe session expired before payment
    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as any;
      const bookingId = session.metadata?.booking_id;
      if (bookingId && session.metadata?.coupon_code) {
        cancelPendingRedemption(bookingId, 'expired').catch(err =>
          logger.warn('Failed to expire pending redemption', { bookingId, error: err.message })
        );
      }
    }

    // Handle refunds
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as any;

      const colId = await getCollectionId('stripe-transactions');
      if (colId) {
        const { data: entries } = await supabase
          .from('entries')
          .select('id, content')
          .eq('collection_id', colId)
          .filter('content->>stripe_payment_intent', 'eq', charge.payment_intent)
          .limit(1);

        if (entries && entries.length > 0) {
          const entry = entries[0];
          const content = entry.content as Record<string, any>;
          await supabase
            .from('entries')
            .update({
              content: { ...content, payment_status: 'refunded' },
              tags: ['stripe', 'refunded'],
            })
            .eq('id', entry.id);

          logger.info('Transaction marked as refunded', { chargeId: charge.id });
        }
      }
    }

    res.json({ received: true });
  } catch (error: any) {
    logger.error('Stripe webhook error', { error: error.message });
    res.status(500).json({ error: { message: 'Webhook processing failed', status: 500 } });
  }
}

// ============================================
// GET /api/v1/payments/transactions
// ============================================

router.get('/transactions', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.profileId) {
      return res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const { status, limit = '50', offset = '0' } = req.query;

    const colId = await getCollectionId('stripe-transactions');
    if (!colId) {
      return res.status(404).json({
        error: { message: 'Stripe Payments addon not installed', status: 404, timestamp: new Date().toISOString() },
      });
    }

    let query = supabase
      .from('entries')
      .select('id, title, slug, content, status, tags, created_at', { count: 'exact' })
      .eq('collection_id', colId)
      .order('created_at', { ascending: false });

    if (status && typeof status === 'string') {
      query = query.eq('content->>payment_status', status);
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: entries, error, count } = await query;
    if (error) throw error;

    res.json({
      data: entries || [],
      meta: { pagination: { limit: limitNum, offset: offsetNum, total: count || 0 } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching transactions', { error: error.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /api/v1/payments/config (public key only)
//
// Returns the publishable key so frontends can show
// Stripe-powered UI elements. Never returns secret key.
// ============================================

router.get('/config', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.profileId) {
      return res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const config = await getStripeConfig();
    if (!config) {
      return res.status(503).json({
        error: { message: 'Stripe not configured', status: 503, timestamp: new Date().toISOString() },
      });
    }

    res.json({
      data: {
        publishable_key: config.publishableKey || null,
        default_currency: config.defaultCurrency,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching Stripe config', { error: error.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// POST /api/v1/payments/test
//
// Diagnostic endpoint — verifies Stripe config and creates a real
// test checkout session for 1.00 EUR. Returns the checkout_url so
// the admin can click through to confirm the full flow works.
//
// Mirrors the /api/v1/email/test pattern: real API call, real session,
// but a clear "test" label and minimal amount to avoid accidental charges.
// ============================================

router.post('/test', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.profileId) {
      return res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const config = await getStripeConfig();
    if (!config) {
      return res.status(400).json({
        error: {
          message: 'Stripe not configured. Add your Stripe keys in the stripe-config collection (slug: default) or set STRIPE_SECRET_KEY env var.',
          code: 'NO_CONFIG',
          diagnostic: {
            tenant_config_found: false,
            env_var_present: !!process.env.STRIPE_SECRET_KEY,
          },
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Validate the secret key by making a real Stripe API call.
    // Using checkout.sessions.create is the exact same path as production.
    const stripe = getStripeClient(config.secretKey);

    const host = req.headers.host || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${protocol}://${host}`;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: config.defaultCurrency,
            product_data: {
              name: 'kibanCMS Stripe Test',
              description: 'Diagnostic session — use card 4242 4242 4242 4242 (any future date, any CVC)',
            },
            unit_amount: 100, // 1.00
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/settings?tab=general&stripe_test=ok`,
        cancel_url: `${baseUrl}/settings?tab=general&stripe_test=cancel`,
        metadata: {
          source: 'kibanCMS-test',
          test: 'true',
        },
      });

      logger.info('Stripe test session created', { sessionId: session.id });

      const hasWebhookSecret = !!config.webhookSecret;

      res.json({
        data: {
          ok: true,
          session_id: session.id,
          checkout_url: session.url,
          amount: 100,
          currency: config.defaultCurrency,
          diagnostics: {
            secret_key_prefix: config.secretKey.slice(0, 7) + '…',
            publishable_key_set: !!config.publishableKey,
            webhook_secret_set: hasWebhookSecret,
            default_currency: config.defaultCurrency,
            mode: config.secretKey.startsWith('sk_live_') ? 'live' : 'test',
          },
          next_steps: [
            'Click the checkout_url below to open Stripe Checkout',
            'Use test card 4242 4242 4242 4242 (any future date, any CVC, any ZIP)',
            hasWebhookSecret
              ? 'After payment, check /api/v1/payments/transactions to verify webhook fired'
              : 'Webhook secret not set — payments will process but won\'t be recorded. Add stripe_webhook_secret in stripe-config.',
          ],
        },
        timestamp: new Date().toISOString(),
      });
    } catch (stripeErr: any) {
      logger.warn('Stripe test failed', { error: stripeErr.message });
      res.status(400).json({
        error: {
          message: stripeErr.message || 'Stripe rejected the test',
          code: stripeErr.code || 'STRIPE_ERROR',
          diagnostic: {
            type: stripeErr.type,
            statusCode: stripeErr.statusCode,
            secret_key_prefix: config.secretKey.slice(0, 7) + '…',
            mode: config.secretKey.startsWith('sk_live_') ? 'live' : 'test',
          },
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (err: any) {
    logger.error('Stripe test crashed', { error: err.message });
    res.status(500).json({
      error: {
        message: err.message || 'Unexpected failure',
        code: 'EXCEPTION',
        status: 500,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default router;
