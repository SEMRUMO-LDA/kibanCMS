import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { sendNewsletterWelcome, sendNewsletterAdminNotification } from '../lib/email.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

/**
 * POST /api/v1/newsletter/subscribe
 *
 * Public-facing endpoint for newsletter signups.
 * Requires API Key auth. Creates entry in "newsletter-subscribers" collection.
 *
 * Body:
 *   email: string    (required)
 *   name?: string    (optional)
 *   source?: string  (optional — where did they subscribe: homepage, footer, popup)
 */
router.post('/subscribe', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.profileId) {
      return res.status(401).json({
        error: { message: 'Unauthorized: API key required', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const { email, name, source } = req.body;

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: { message: 'Valid email is required', status: 400, timestamp: new Date().toISOString() },
      });
    }

    const cleanEmail = email.trim().toLowerCase().slice(0, 320);
    const cleanName = typeof name === 'string' ? name.trim().slice(0, 200) : '';
    const cleanSource = typeof source === 'string' ? source.trim().slice(0, 100) : 'website';

    // Find newsletter-subscribers collection
    const { data: collection } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', 'newsletter-subscribers')
      .single();

    if (!collection) {
      return res.status(404).json({
        error: {
          message: 'Newsletter addon not installed. Install the "Newsletter" addon first.',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if email already subscribed (prevent duplicates)
    const { data: existing } = await supabase
      .from('entries')
      .select('id, content')
      .eq('collection_id', collection.id)
      .filter('content->>email', 'eq', cleanEmail)
      .limit(1);

    if (existing && existing.length > 0) {
      // Already subscribed — return success (don't reveal to frontend)
      return res.status(200).json({
        success: true,
        data: { subscribed: true },
        timestamp: new Date().toISOString(),
      });
    }

    const timestamp = new Date().toISOString();
    const slug = `sub-${cleanEmail.replace(/[^a-z0-9]/g, '-').slice(0, 30)}-${Date.now().toString(36)}`;

    const { data: entry, error: insertError } = await supabase
      .from('entries')
      .insert({
        collection_id: collection.id,
        title: cleanName || cleanEmail,
        slug,
        content: {
          email: cleanEmail,
          name: cleanName,
          source: cleanSource,
          subscribed_at: timestamp,
          is_active: true,
          tags: '',
        },
        status: 'published',
        published_at: timestamp,
        author_id: req.profileId,
        tags: ['newsletter', cleanSource],
      })
      .select('id')
      .single();

    if (insertError) {
      logger.error('Newsletter subscribe error', { error: insertError.message });
      throw insertError;
    }

    logger.info('Newsletter subscription', { email: cleanEmail, source: cleanSource });

    // Fire emails (non-blocking): welcome to subscriber + notification to admin
    sendNewsletterWelcome(cleanEmail).catch(err =>
      logger.warn('Newsletter welcome email failed', { email: cleanEmail, error: err.message })
    );
    sendNewsletterAdminNotification(cleanEmail, cleanSource || '').catch(err =>
      logger.warn('Newsletter admin notification failed', { email: cleanEmail, error: err.message })
    );

    res.status(201).json({
      success: true,
      data: { subscribed: true },
      timestamp,
    });
  } catch (error: any) {
    logger.error('Newsletter error', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to process subscription', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * POST /api/v1/newsletter/unsubscribe
 *
 * Marks subscriber as inactive.
 * Body: { email: string }
 */
router.post('/unsubscribe', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.profileId) {
      return res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        error: { message: 'Email is required', status: 400, timestamp: new Date().toISOString() },
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const { data: collection } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', 'newsletter-subscribers')
      .single();

    if (!collection) {
      return res.status(404).json({
        error: { message: 'Newsletter addon not installed', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const { data: entries } = await supabase
      .from('entries')
      .select('id, content')
      .eq('collection_id', collection.id)
      .filter('content->>email', 'eq', cleanEmail)
      .limit(1);

    if (entries && entries.length > 0) {
      const entry = entries[0];
      const content = entry.content as Record<string, any>;
      await supabase
        .from('entries')
        .update({ content: { ...content, is_active: false } })
        .eq('id', entry.id);
    }

    // Always return success (don't reveal if email existed)
    res.json({
      success: true,
      data: { unsubscribed: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Unsubscribe error', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to process unsubscribe', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
