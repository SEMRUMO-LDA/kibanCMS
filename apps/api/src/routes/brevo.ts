/**
 * Brevo admin endpoints (JWT only).
 *
 * Exposed under /api/v1/brevo:
 *   GET  /account         — test connection (returns Brevo account info)
 *   GET  /lists           — list available Brevo contact lists
 *   POST /sync-all        — re-sync all kiban subscribers to Brevo
 *
 * Configuration is read from the `addon_configs` row with addon_id='newsletter'.
 * That row stores: { brevo_api_key, brevo_list_id, brevo_double_opt_in, ... }
 *
 * The sync logic itself (per-subscribe sync) lives in the newsletter route.
 */

import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import {
  brevoGetAccount, brevoGetLists, brevoUpsertContact,
  buildBrevoAttributes, BrevoError, type BrevoConfig,
} from '../lib/brevo.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

interface NewsletterAddonConfig {
  brevo_api_key?: string;
  brevo_list_id?: number | string;
  brevo_double_opt_in?: boolean;
  brevo_redirect_url?: string;
  brevo_template_id?: number | string;
  enabled?: boolean;
  sync_mode?: 'realtime' | 'manual';
}

async function loadNewsletterConfig(): Promise<NewsletterAddonConfig | null> {
  const { data } = await supabase
    .from('addon_configs')
    .select('config')
    .eq('addon_id', 'newsletter')
    .maybeSingle();
  return (data?.config as NewsletterAddonConfig) || null;
}

function configToBrevoConfig(cfg: NewsletterAddonConfig | null): BrevoConfig | null {
  if (!cfg?.brevo_api_key) return null;
  return {
    apiKey: cfg.brevo_api_key,
    listId: cfg.brevo_list_id,
    doubleOptIn: !!cfg.brevo_double_opt_in,
    redirectUrl: cfg.brevo_redirect_url,
    templateId: cfg.brevo_template_id,
  };
}

/** GET /api/v1/brevo/account — test connection */
router.get('/account', async (req: AuthRequest, res: Response) => {
  try {
    const apiKey = (req.query.api_key as string) || (await loadNewsletterConfig())?.brevo_api_key;
    if (!apiKey) {
      return res.status(400).json({
        error: { message: 'No Brevo API key configured. Save your key in Newsletter Configuration first.', status: 400 },
      });
    }
    const info = await brevoGetAccount(apiKey);
    res.json({ data: info, timestamp: new Date().toISOString() });
  } catch (err: any) {
    const status = err instanceof BrevoError ? (err.status || 500) : 500;
    res.status(status).json({
      error: { message: err.message || 'Failed to reach Brevo', status, code: err.code },
    });
  }
});

/** GET /api/v1/brevo/lists — list contact lists */
router.get('/lists', async (req: AuthRequest, res: Response) => {
  try {
    const apiKey = (req.query.api_key as string) || (await loadNewsletterConfig())?.brevo_api_key;
    if (!apiKey) {
      return res.status(400).json({
        error: { message: 'No Brevo API key configured', status: 400 },
      });
    }
    const lists = await brevoGetLists(apiKey);
    res.json({ data: lists, timestamp: new Date().toISOString() });
  } catch (err: any) {
    const status = err instanceof BrevoError ? (err.status || 500) : 500;
    res.status(status).json({
      error: { message: err.message || 'Failed to fetch lists', status },
    });
  }
});

/**
 * POST /api/v1/brevo/sync-all
 *
 * Re-syncs every subscriber in newsletter-subscribers to Brevo.
 * Useful after first configuring Brevo (existing subscribers) or after a
 * batch of failures. Updates each subscriber's sync_* fields in place.
 *
 * Returns: { total, synced, failed, errors[] }
 */
router.post('/sync-all', async (_req: AuthRequest, res: Response) => {
  try {
    const cfg = await loadNewsletterConfig();
    const brevo = configToBrevoConfig(cfg);
    if (!brevo) {
      return res.status(400).json({
        error: { message: 'Brevo is not configured. Add an API key first.', status: 400 },
      });
    }

    const { data: collection } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', 'newsletter-subscribers')
      .maybeSingle();
    if (!collection) {
      return res.status(404).json({
        error: { message: 'Newsletter add-on not installed', status: 404 },
      });
    }

    const { data: entries } = await supabase
      .from('entries')
      .select('id, content')
      .eq('collection_id', collection.id);

    const subs = entries || [];
    let synced = 0;
    let failed = 0;
    const errors: Array<{ email: string; message: string }> = [];

    for (const entry of subs) {
      const content = (entry.content as Record<string, any>) || {};
      const email = (content.email as string)?.toLowerCase().trim();
      if (!email) continue;

      try {
        const contactId = await brevoUpsertContact(brevo, {
          email,
          attributes: buildBrevoAttributes({
            name: content.name,
            source: content.source,
            tags: content.tags,
          }),
        });

        await supabase
          .from('entries')
          .update({
            content: {
              ...content,
              synced_to_brevo: true,
              brevo_contact_id: contactId ? String(contactId) : (content.brevo_contact_id || ''),
              sync_error: '',
              sync_attempts: (Number(content.sync_attempts) || 0) + 1,
              last_synced_at: new Date().toISOString(),
            },
          })
          .eq('id', entry.id);
        synced++;
      } catch (err: any) {
        const message = err instanceof BrevoError ? err.message : (err.message || 'Sync failed');
        await supabase
          .from('entries')
          .update({
            content: {
              ...content,
              synced_to_brevo: false,
              sync_error: message,
              sync_attempts: (Number(content.sync_attempts) || 0) + 1,
              last_synced_at: new Date().toISOString(),
            },
          })
          .eq('id', entry.id);
        errors.push({ email, message });
        failed++;
      }
    }

    logger.info('Brevo sync-all complete', { total: subs.length, synced, failed });

    res.json({
      data: { total: subs.length, synced, failed, errors: errors.slice(0, 50) },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Brevo sync-all failed', { error: err.message });
    res.status(500).json({
      error: { message: err.message || 'Sync failed', status: 500 },
    });
  }
});

export default router;
