import { Router, type Request, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { sendNewsletterWelcome, sendNewsletterAdminNotification, sendNewsletterConfirmation, sendNewsletterUnsubscribeConfirm } from '../lib/email.js';
import { signLink, verifyLink } from '../lib/signed-links.js';
import { getSingletonContent } from '../lib/sitemap.js';
import { trackingToStore, type StoredTracking } from '../lib/meta-capi.js';
import { tenantStore, getOrCreateClients } from '../middleware/tenant.js';
import { resolveTenantById, getDefaultTenant } from '../config/tenants.js';
import { brevoUpsertContact, buildBrevoAttributes, BrevoError, type BrevoConfig } from '../lib/brevo.js';
import type { AuthRequest } from '../middleware/auth.js';
import { checkSpam, captchaFailed } from '../lib/spam-protection.js';
import { readTracking, sendCapiEvent, splitName, sha256 } from '../lib/meta-capi.js';

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
 * Newsletter settings that are ours (not Brevo's). Double opt-in is ON unless
 * the admin turned it off: without a confirmation the site has no proof of
 * consent, and anyone could subscribe somebody else's address.
 */
async function loadNewsletterSettings(): Promise<{ doubleOptIn: boolean }> {
  try {
    const { data } = await supabase.from('addon_configs').select('config').eq('addon_id', 'newsletter').maybeSingle();
    const cfg = (data?.config as Record<string, any>) || {};
    return { doubleOptIn: cfg.double_opt_in !== false };
  } catch {
    return { doubleOptIn: true };
  }
}

const LINK_TTL_CONFIRM = 7 * 24 * 3600;
const LINK_TTL_UNSUBSCRIBE = 90 * 24 * 3600;

type LinkPayload = { t: 'confirm' | 'unsub'; e: string; email: string; tenant: string };

/** Signed one-click URL back to this API (the email client follows it; no API key involved). */
function buildLinkUrl(req: Request, kind: 'confirm' | 'unsub', entryId: string, email: string): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const base = `${proto}://${req.headers.host || 'localhost'}`;
  const tenant = tenantStore.getStore()?.tenant?.id || 'default';
  const token = signLink<LinkPayload>({ t: kind, e: entryId, email, tenant }, kind === 'confirm' ? LINK_TTL_CONFIRM : LINK_TTL_UNSUBSCRIBE);
  return `${base}/api/v1/newsletter/${kind === 'confirm' ? 'confirm' : 'unsubscribe'}?token=${encodeURIComponent(token)}`;
}

function htmlPage(title: string, message: string, siteUrl: string): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const back = siteUrl ? `<p><a href="${esc(siteUrl)}" style="color:#1a1a1a;">Voltar ao site</a></p>` : '';
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2c2c2c;">
<div style="max-width:520px;margin:64px auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.06);">
<h1 style="font-size:20px;margin:0 0 12px;">${esc(title)}</h1><p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${esc(message)}</p>${back}</div></body></html>`;
}

/**
 * Runs `fn` in the tenant named by a signed link. Links are opened from an
 * email client — no X-Tenant header, no Origin — so the host-based resolver
 * would land on the default tenant.
 */
async function runInLinkTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const tenant = resolveTenantById(tenantId) || getDefaultTenant();
  if (!tenant) return fn();
  const clients = getOrCreateClients(tenant);
  return tenantStore.run({ tenant, ...clients }, fn);
}

async function findSubscriberById(entryId: string): Promise<{ id: string; content: Record<string, any> } | null> {
  const { data: col } = await supabase.from('collections').select('id').eq('slug', 'newsletter-subscribers').maybeSingle();
  if (!col) return null;
  const { data } = await supabase.from('entries').select('id, content').eq('id', entryId).eq('collection_id', col.id).maybeSingle();
  return data ? (data as any) : null;
}

/** GET /api/v1/newsletter/confirm?token=… (public — mounted in server.ts before the API-key router). */
export async function newsletterConfirmHandler(req: Request, res: Response): Promise<void> {
  const payload = verifyLink<LinkPayload>(req.query.token);
  if (!payload || payload.t !== 'confirm') {
    res.status(400).type('html').send(htmlPage('Link inválido ou expirado', 'Este link de confirmação já não é válido. Volte a subscrever a newsletter no site para receber um novo.', ''));
    return;
  }
  await runInLinkTenant(payload.tenant, async () => {
    const site = await getSingletonContent('site-settings');
    const siteUrl = String(site.site_url || '');
    const row = await findSubscriberById(payload.e);
    if (!row || String(row.content.email || '').toLowerCase() !== payload.email.toLowerCase()) {
      res.status(404).type('html').send(htmlPage('Subscrição não encontrada', 'Não encontrámos esta subscrição. Volte a subscrever no site.', siteUrl));
      return;
    }
    const now = new Date().toISOString();
    const alreadyConfirmed = row.content.confirmed === true && row.content.is_active === true;
    if (!alreadyConfirmed) {
      const content = { ...row.content, is_active: true, confirmed: true, confirmed_at: now };
      await supabase.from('entries').update({ content }).eq('id', row.id);
      const unsubscribeUrl = buildLinkUrl(req, 'unsub', row.id, payload.email);
      sendNewsletterWelcome(payload.email, unsubscribeUrl).catch(err => logger.warn('Newsletter welcome email failed', { error: err.message }));
      sendNewsletterAdminNotification(payload.email, String(row.content.source || '')).catch(() => {});
      await syncSubscriberToBrevo({ entryId: row.id, email: payload.email, name: String(row.content.name || ''), source: String(row.content.source || ''), tags: String(row.content.tags || ''), baseContent: content });
      const stored = row.content.tracking as StoredTracking | undefined;
      if (stored) {
        sendCapiEvent({
          name: 'CompleteRegistration',
          eventId: `sub_${sha256(payload.email).slice(0, 24)}`,
          tracking: stored,
          user: { email: payload.email, ...splitName(String(row.content.name || '')), ip: stored.ip, userAgent: stored.ua },
          custom: { content_name: 'newsletter' },
        }).catch(() => {});
      }
      logger.info('Newsletter subscription confirmed', { email: payload.email });
    }
    res.type('html').send(htmlPage('Subscrição confirmada', `Obrigado! O email ${payload.email} passa a receber a newsletter.`, siteUrl));
  });
}

/** GET /api/v1/newsletter/unsubscribe?token=… (public — the link in every newsletter email). */
export async function newsletterUnsubscribeLinkHandler(req: Request, res: Response): Promise<void> {
  const payload = verifyLink<LinkPayload>(req.query.token);
  if (!payload || payload.t !== 'unsub') {
    res.status(400).type('html').send(htmlPage('Link inválido ou expirado', 'Este link já não é válido. Use o link de cancelamento do email mais recente que recebeu.', ''));
    return;
  }
  await runInLinkTenant(payload.tenant, async () => {
    const site = await getSingletonContent('site-settings');
    const siteUrl = String(site.site_url || '');
    const row = await findSubscriberById(payload.e);
    if (row && String(row.content.email || '').toLowerCase() === payload.email.toLowerCase() && row.content.is_active !== false) {
      await supabase.from('entries').update({ content: { ...row.content, is_active: false, unsubscribed_at: new Date().toISOString() } }).eq('id', row.id);
      logger.info('Newsletter unsubscribed via signed link', { email: payload.email });
    }
    res.type('html').send(htmlPage('Subscrição cancelada', `O email ${payload.email} deixa de receber a newsletter.`, siteUrl));
  });
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

    // Spam protection: honeypot (fake success, nothing stored) + optional Turnstile
    const spam = await checkSpam(req.body, req.ip);
    if (spam === 'honeypot') {
      return res.status(201).json({ success: true, data: { subscribed: true }, timestamp: new Date().toISOString() });
    }
    if (spam === 'captcha') return captchaFailed(res);

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

    const { doubleOptIn } = await loadNewsletterSettings();

    if (existing && existing.length > 0) {
      // Already subscribed — return success (don't reveal to frontend).
      // Someone who unsubscribed (or never confirmed) and signs up again:
      // with double opt-in they get a fresh confirmation link, otherwise
      // they are re-activated.
      const row = existing[0] as { id: string; content: Record<string, any> };
      if (row.content?.is_active === false) {
        const lastSent = Date.parse(String(row.content.confirmation_sent_at || ''));
        const recentlySent = Number.isFinite(lastSent) && Date.now() - lastSent < 10 * 60_000;
        const sent = doubleOptIn && !recentlySent
          ? await sendNewsletterConfirmation(cleanEmail, buildLinkUrl(req, 'confirm', row.id, cleanEmail))
          : null;
        if (sent) {
          await supabase.from('entries').update({ content: { ...row.content, confirmation_sent_at: new Date().toISOString() } }).eq('id', row.id);
          return res.status(200).json({ success: true, data: { subscribed: true, pending_confirmation: true }, timestamp: new Date().toISOString() });
        }
        if (!doubleOptIn) {
          await supabase
            .from('entries')
            .update({ content: { ...row.content, is_active: true, resubscribed_at: new Date().toISOString() } })
            .eq('id', row.id);
          logger.info('Newsletter re-subscription', { email: cleanEmail });
        }
      }
      return res.status(200).json({
        success: true,
        data: { subscribed: true, ...(doubleOptIn && row.content?.is_active === false ? { pending_confirmation: true } : {}) },
        timestamp: new Date().toISOString(),
      });
    }

    const timestamp = new Date().toISOString();
    const slug = `sub-${cleanEmail.replace(/[^a-z0-9]/g, '-').slice(0, 30)}-${Date.now().toString(36)}`;

    const baseContent: Record<string, any> = {
      email: cleanEmail,
      name: cleanName,
      source: cleanSource,
      subscribed_at: timestamp,
      // Double opt-in: inactive until the confirmation link is clicked
      is_active: !doubleOptIn,
      confirmed: !doubleOptIn,
      confirmed_at: doubleOptIn ? '' : timestamp,
      confirmation_sent_at: '',
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

    logger.info('Newsletter subscription', { email: cleanEmail, source: cleanSource, doubleOptIn });

    if (doubleOptIn && entry?.id) {
      // Keep the Meta tracking (only with marketing consent) for the
      // CompleteRegistration event sent when the subscriber confirms.
      const stored = await trackingToStore(req, req.body);
      const sent = await sendNewsletterConfirmation(cleanEmail, buildLinkUrl(req, 'confirm', entry.id, cleanEmail));
      if (sent) {
        await supabase.from('entries').update({
          content: { ...baseContent, confirmation_sent_at: new Date().toISOString(), ...(stored ? { tracking: stored } : {}) },
        }).eq('id', entry.id);
        return res.status(201).json({ success: true, data: { subscribed: true, pending_confirmation: true }, timestamp });
      }
      // No email provider configured for this tenant: a confirmation can't be
      // sent, so the subscription is activated at once (and logged).
      logger.warn('Newsletter double opt-in skipped — no email provider configured', { email: cleanEmail });
      Object.assign(baseContent, { is_active: true, confirmed: true, confirmed_at: timestamp });
      await supabase.from('entries').update({ content: baseContent }).eq('id', entry.id);
    }

    // Fire emails (non-blocking): welcome to subscriber + notification to admin
    const unsubscribeUrl = entry?.id ? buildLinkUrl(req, 'unsub', entry.id, cleanEmail) : undefined;
    sendNewsletterWelcome(cleanEmail, unsubscribeUrl).catch(err =>
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

    // Meta Conversions API — only with marketing consent (see lib/meta-capi.ts)
    sendCapiEvent({
      name: 'CompleteRegistration',
      eventId: `sub_${sha256(cleanEmail).slice(0, 24)}`,
      tracking: readTracking(req.body),
      user: { email: cleanEmail, ...splitName(cleanName), ip: req.ip, userAgent: req.get('user-agent') },
      custom: { content_name: 'newsletter' },
    }).catch(() => {});

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

    // Anyone holding the public API key could unsubscribe anyone, so the
    // address owner confirms by email (signed link). Direct removal only when
    // this tenant has no email provider at all.
    let pendingConfirmation = false;
    if (entries && entries.length > 0) {
      const entry = entries[0];
      const content = entry.content as Record<string, any>;
      if (content.is_active !== false) {
        const sent = await sendNewsletterUnsubscribeConfirm(cleanEmail, buildLinkUrl(req, 'unsub', entry.id, cleanEmail));
        if (sent) {
          pendingConfirmation = true;
        } else {
          await supabase
            .from('entries')
            .update({ content: { ...content, is_active: false, unsubscribed_at: new Date().toISOString() } })
            .eq('id', entry.id);
        }
      }
    }

    // Never reveal whether the email existed
    res.json({
      success: true,
      data: pendingConfirmation
        ? { unsubscribed: false, pending_confirmation: true, message: 'Enviámos um email para confirmar o cancelamento.' }
        : { unsubscribed: true },
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
