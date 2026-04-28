import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { sendNewsletterWelcome, sendNewsletterAdminNotification } from '../lib/email.js';
import { brevoUpsertContact, buildBrevoAttributes, BrevoError, type BrevoConfig } from '../lib/brevo.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

/**
 * Load Brevo config from addon_configs (newsletter row). Returns null when
 * Brevo is not configured — sync is skipped silently in that case so the
 * subscribe endpoint stays usable even before the agency wires up Brevo.
 */
async function loadBrevoConfig(): Promise<BrevoConfig | null> {
  try {
    const { data } = await supabase
      .from('addon_configs')
      .select('config')
      .eq('addon_id', 'newsletter')
      .maybeSingle();
    const cfg = (data?.config as Record<string, any>) || {};
    if (!cfg.brevo_api_key || cfg.sync_mode === 'manual') return null;
    return {
      apiKey: cfg.brevo_api_key,
      listId: cfg.brevo_list_id,
      doubleOptIn: !!cfg.brevo_double_opt_in,
      redirectUrl: cfg.brevo_redirect_url,
      templateId: cfg.brevo_template_id,
    };
  } catch {
    return null;
  }
}

/**
 * Push a subscriber to Brevo and update their entry with sync metadata.
 * Non-blocking caller responsibility: this is awaited inside the route but
 * any error is captured into the entry, never propagated to the public API.
 */
async function syncSubscriberToBrevo(params: {
  entryId: string;
  email: string;
  name: string;
  source: string;
  tags: string;
  baseContent: Record<string, any>;
}): Promise<void> {
  const cfg = await loadBrevoConfig();
  if (!cfg) return; // Not configured — kiban-only mode

  const now = new Date().toISOString();
  const previousAttempts = Number(params.baseContent.sync_attempts) || 0;

  try {
    const contactId = await brevoUpsertContact(cfg, {
      email: params.email,
      attributes: buildBrevoAttributes({
        name: params.name,
        source: params.source,
        tags: params.tags,
      }),
    });

    await supabase
      .from('entries')
      .update({
        content: {
          ...params.baseContent,
          synced_to_brevo: true,
          brevo_contact_id: contactId ? String(contactId) : '',
          sync_error: '',
          sync_attempts: previousAttempts + 1,
          last_synced_at: now,
        },
      })
      .eq('id', params.entryId);
  } catch (err: any) {
    const message = err instanceof BrevoError ? err.message : (err.message || 'Brevo sync failed');
    logger.warn('Brevo sync failed for subscriber', { email: params.email, error: message });
    await supabase
      .from('entries')
      .update({
        content: {
          ...params.baseContent,
          synced_to_brevo: false,
          sync_error: message,
          sync_attempts: previousAttempts + 1,
          last_synced_at: now,
        },
      })
      .eq('id', params.entryId);
  }
}

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

    const baseContent = {
      email: cleanEmail,
      name: cleanName,
      source: cleanSource,
      subscribed_at: timestamp,
      is_active: true,
      tags: '',
      // Brevo sync metadata — populated by syncSubscriberToBrevo below
      synced_to_brevo: false,
      brevo_contact_id: '',
      sync_error: '',
      sync_attempts: 0,
      last_synced_at: '',
    };

    const { data: entry, error: insertError } = await supabase
      .from('entries')
      .insert({
        collection_id: collection.id,
        title: cleanName || cleanEmail,
        slug,
        content: baseContent,
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

    // Push to Brevo if configured (sync_mode=realtime). Awaited so the
    // sync_* fields are persisted before we respond, but failures never
    // block the subscribe (errors captured in the entry's sync_error).
    if (entry?.id) {
      await syncSubscriberToBrevo({
        entryId: entry.id,
        email: cleanEmail,
        name: cleanName,
        source: cleanSource,
        tags: '',
        baseContent,
      });
    }

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
