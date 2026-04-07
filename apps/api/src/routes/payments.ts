import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

// ============================================
// STRIPE CLIENT (lazy init — only when keys exist)
// ============================================

let stripeClient: Stripe | null = null;

async function getStripe(): Promise<Stripe | null> {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  stripeClient = new Stripe(secretKey, { apiVersion: '2025-03-31.basil' });
  return stripeClient;
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
// The frontend redirects the customer to this URL.
//
// Body:
//   product_slug?: string  — slug of a stripe-products entry (uses its price/name)
//   amount?: number        — amount in cents (required if no product_slug)
//   currency?: string      — ISO 4217 code (default: eur)
//   name?: string          — product/service name shown in checkout
//   description?: string   — description shown in checkout
//   image_url?: string     — product image
//   customer_email?: string — pre-fill customer email
//   success_url: string    — redirect after successful payment
//   cancel_url: string     — redirect if customer cancels
//   metadata?: object      — custom key-value pairs stored with the payment
// ============================================

router.post('/create-session', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.profileId) {
      return res.status(401).json({
        error: { message: 'Unauthorized: API key required', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const stripe = await getStripe();
    if (!stripe) {
      return res.status(503).json({
        error: {
          message: 'Stripe not configured. Set STRIPE_SECRET_KEY in environment variables.',
          status: 503,
          timestamp: new Date().toISOString(),
        },
      });
    }

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

    // Validate required URLs
    if (!success_url || !cancel_url) {
      return res.status(400).json({
        error: { message: 'Missing required fields: success_url, cancel_url', status: 400, timestamp: new Date().toISOString() },
      });
    }

    let lineItemName = name || 'Payment';
    let lineItemAmount: number;
    let lineItemCurrency = (currency || process.env.STRIPE_DEFAULT_CURRENCY || 'eur').toLowerCase();
    let lineItemDescription = description || undefined;
    let lineItemImages: string[] = [];

    // If product_slug provided, load from CMS
    if (product_slug) {
      const colId = await getCollectionId('stripe-products');
      if (!colId) {
        return res.status(404).json({
          error: { message: 'Stripe Products collection not found. Install the Stripe Payments addon first.', status: 404, timestamp: new Date().toISOString() },
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

    // Create Stripe Checkout Session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
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
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

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
// Receives Stripe webhook events (checkout.session.completed, etc.)
// Public endpoint — no API key auth, verified via Stripe signature.
// ============================================

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return res.status(503).json({ error: { message: 'Stripe not configured', status: 503 } });
    }

    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return res.status(400).json({
        error: { message: 'Missing Stripe signature or webhook secret', status: 400 },
      });
    }

    // Verify event signature
    let event: Stripe.Event;
    try {
      // req.body must be raw buffer for signature verification
      // Express raw body is handled via middleware in server.ts
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      logger.warn('Stripe webhook signature verification failed', { error: err.message });
      return res.status(400).json({ error: { message: 'Invalid signature', status: 400 } });
    }

    logger.info('Stripe webhook received', { type: event.type, id: event.id });

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const colId = await getCollectionId('stripe-transactions');
      if (!colId) {
        logger.warn('stripe-transactions collection not found, skipping');
        return res.json({ received: true });
      }

      // Find admin profile for author_id
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
      const charge = event.data.object as Stripe.Charge;

      const colId = await getCollectionId('stripe-transactions');
      if (colId) {
        // Find and update the transaction entry
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

          logger.info('Stripe transaction marked as refunded', { chargeId: charge.id });
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
//
// List payment transactions (admin).
// Query: status, limit, offset
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

export default router;
