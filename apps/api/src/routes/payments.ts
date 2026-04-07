import { Router, type Request, type Response } from 'express';
// @ts-ignore — Stripe v22 has non-standard exports
import Stripe from 'stripe';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
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

// Cache to avoid DB lookup on every request (TTL 60s)
let configCache: { config: StripeConfig; fetchedAt: number } | null = null;
const CONFIG_TTL = 60_000;

async function getStripeConfig(): Promise<StripeConfig | null> {
  // Return cached if fresh
  if (configCache && Date.now() - configCache.fetchedAt < CONFIG_TTL) {
    return configCache.config;
  }

  // Try loading from CMS (stripe-config collection, "default" entry)
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
          webhookSecret: c.stripe_webhook_secret || '',
          defaultCurrency: (c.default_currency || 'eur').toLowerCase(),
          publishableKey: c.stripe_publishable_key || '',
        };
        configCache = { config, fetchedAt: Date.now() };
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
    configCache = { config, fetchedAt: Date.now() };
    return config;
  }

  return null;
}

// Stripe clients cached by secret key (supports config changes without restart)
const stripeClients = new Map<string, any>();

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
      payment_method_types: ['card'],
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
// Receives Stripe webhook events.
// Public — no API key, verified via Stripe signature.
// ============================================

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const config = await getStripeConfig();
    if (!config) {
      return res.status(503).json({ error: { message: 'Stripe not configured', status: 503 } });
    }

    const stripe = getStripeClient(config.secretKey);
    const sig = req.headers['stripe-signature'] as string;

    if (!sig || !config.webhookSecret) {
      return res.status(400).json({
        error: { message: 'Missing Stripe signature or webhook secret not configured', status: 400 },
      });
    }

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, config.webhookSecret);
    } catch (err: any) {
      logger.warn('Stripe webhook signature failed', { error: err.message });
      return res.status(400).json({ error: { message: 'Invalid signature', status: 400 } });
    }

    logger.info('Stripe webhook received', { type: event.type, id: event.id });

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;

      const colId = await getCollectionId('stripe-transactions');
      if (!colId) {
        logger.warn('stripe-transactions collection not found, skipping');
        return res.json({ received: true });
      }

      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['super_admin', 'admin'])
        .limit(1)
        .single();

      if (!adminProfile) {
        logger.warn('No admin profile found for transaction entry');
        return res.json({ received: true });
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
});

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

export default router;
