/**
 * Email test route — dedicated diagnostic endpoint for Resend configuration.
 *
 * The production email paths (form notifications, booking confirmations) all
 * swallow errors via logger + return null, so a misconfigured tenant has no
 * way to learn WHY a send failed without shell access to Railway logs.
 *
 * This endpoint exercises the exact same config loading + Resend client as the
 * real paths, but surfaces the error message back in the HTTP response so the
 * operator can self-diagnose in the admin.
 */

import { Router, type Response } from 'express';
import { Resend } from 'resend';
import { supabase } from '../lib/supabase.js';
import { tenantStore } from '../middleware/tenant.js';
import { logger } from '../lib/logger.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

interface ResolvedConfig {
  source: 'tenant-settings' | 'env-var' | 'missing';
  resendApiKey?: string;
  defaultFromEmail?: string;
  defaultFromName?: string;
  siteSettingsEntrySlug?: string | null;
  siteSettingsEntryFound?: boolean;
}

async function resolveConfig(): Promise<ResolvedConfig> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';

  // Look up the site-settings collection + global entry
  const { data: settingsCol } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', 'site-settings')
    .single();

  let siteSettingsEntryFound = false;
  let globalContent: Record<string, any> | null = null;
  let foundSlug: string | null = null;

  if (settingsCol) {
    // Try the canonical 'global' slug first
    const { data: globalEntry } = await supabase
      .from('entries')
      .select('slug, content')
      .eq('collection_id', settingsCol.id)
      .eq('slug', 'global')
      .single();

    if (globalEntry?.content) {
      siteSettingsEntryFound = true;
      foundSlug = globalEntry.slug;
      globalContent = globalEntry.content as Record<string, any>;
    } else {
      // Look for *any* entry — helps the operator understand the slug mismatch
      const { data: anyEntry } = await supabase
        .from('entries')
        .select('slug')
        .eq('collection_id', settingsCol.id)
        .limit(1)
        .maybeSingle();
      if (anyEntry) foundSlug = anyEntry.slug;
    }
  }

  const apiKey = globalContent?.resend_api_key || process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      source: 'missing',
      siteSettingsEntrySlug: foundSlug,
      siteSettingsEntryFound,
    };
  }

  logger.info('Email test: config resolved', { tenantId, source: globalContent ? 'tenant-settings' : 'env-var' });

  return {
    source: globalContent ? 'tenant-settings' : 'env-var',
    resendApiKey: apiKey,
    defaultFromEmail:
      globalContent?.default_from_email ||
      process.env.DEFAULT_FROM_EMAIL ||
      'noreply@kiban.pt',
    defaultFromName:
      globalContent?.default_from_name ||
      globalContent?.site_name ||
      process.env.DEFAULT_FROM_NAME ||
      'KibanCMS',
    siteSettingsEntrySlug: foundSlug,
    siteSettingsEntryFound,
  };
}

// ============================================
// POST /api/v1/email/test
//
// Body: { to: string, subject?: string }
// Sends a minimal test email via the tenant's configured Resend account.
// Returns structured result so the admin UI can show exactly why it failed.
// ============================================

router.post('/test', async (req: AuthRequest, res: Response) => {
  try {
    const { to, subject } = req.body || {};

    if (!to || typeof to !== 'string' || !/.+@.+\..+/.test(to)) {
      res.status(400).json({
        error: {
          message: 'Provide a valid recipient email in `to`',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const config = await resolveConfig();

    if (config.source === 'missing' || !config.resendApiKey) {
      res.status(400).json({
        error: {
          message: config.siteSettingsEntryFound
            ? 'site-settings entry exists but resend_api_key is empty.'
            : config.siteSettingsEntrySlug
            ? `site-settings has an entry with slug "${config.siteSettingsEntrySlug}" — backend expects slug "global". Rename the entry's slug to global.`
            : 'No site-settings entry found and no RESEND_API_KEY env var. Create an entry with slug "global" in the site-settings collection and fill the Resend fields.',
          code: 'NO_API_KEY',
          diagnostic: {
            site_settings_entry_found: config.siteSettingsEntryFound,
            site_settings_entry_slug: config.siteSettingsEntrySlug,
            env_var_present: !!process.env.RESEND_API_KEY,
          },
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const resend = new Resend(config.resendApiKey);
    const from = `${config.defaultFromName} <${config.defaultFromEmail}>`;

    const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
    const finalSubject = subject || `kibanCMS test email — ${tenantId}`;

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f2937;">
        <h1 style="font-size:20px;margin:0 0 16px;">kibanCMS — Email test</h1>
        <p style="font-size:15px;line-height:1.6;color:#4b5563;">This is a diagnostic message triggered from <strong>Settings → Email → Send test email</strong> in the kibanCMS admin.</p>
        <p style="font-size:13px;line-height:1.6;color:#6b7280;">If you received this, your Resend configuration is working. You can now expect form notifications, booking confirmations, and other transactional emails to deliver.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <table style="font-size:12px;color:#6b7280;width:100%;">
          <tr><td style="padding:4px 0;width:140px;">Tenant</td><td><code>${tenantId}</code></td></tr>
          <tr><td style="padding:4px 0;">Config source</td><td><code>${config.source}</code></td></tr>
          <tr><td style="padding:4px 0;">From address</td><td><code>${config.defaultFromEmail}</code></td></tr>
          <tr><td style="padding:4px 0;">Timestamp</td><td><code>${new Date().toISOString()}</code></td></tr>
        </table>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject: finalSubject,
      html,
    });

    if (error) {
      // Resend returns `error.name`, `error.message`, sometimes `statusCode`.
      logger.warn('Email test failed', { tenant: tenantId, error: error.message });
      res.status(400).json({
        error: {
          message: error.message || 'Resend rejected the send',
          code: (error as any).name || 'RESEND_ERROR',
          diagnostic: {
            from,
            to,
            config_source: config.source,
            resend_error: error,
          },
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    logger.info('Email test sent', { tenant: tenantId, id: data?.id, to });

    res.json({
      data: {
        ok: true,
        id: data?.id,
        from,
        to,
        config_source: config.source,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Email test crashed', { error: err.message });
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
