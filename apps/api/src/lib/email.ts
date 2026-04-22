/**
 * Email Service — Multi-tenant Resend integration
 *
 * Config priority:
 * 1. Per-tenant: site-settings → resend_api_key
 * 2. Global fallback: RESEND_API_KEY env var
 *
 * Usage:
 *   import { sendEmail, sendFormNotification, sendFormAutoReply } from '../lib/email.js';
 */

import { Resend } from 'resend';
import { supabase } from './supabase.js';
import { logger } from './logger.js';
import { tenantStore } from '../middleware/tenant.js';
import {
  formNotificationTemplate,
  formAutoReplyTemplate,
  bookingConfirmationTemplate,
} from './email-templates.js';

// ── Types ──

interface EmailConfig {
  resendApiKey: string;
  defaultFromEmail: string;
  defaultFromName: string;
  defaultReplyTo: string;
  notificationEmails: string[];
  /**
   * How the API key was resolved:
   *   tenant-settings — the tenant filled their own resend_api_key (self-hosted, own domain)
   *   env-var         — fallback to agency-wide RESEND_API_KEY (agency-shared domain)
   * Used by the email test endpoint to explain the setup to operators.
   */
  source: 'tenant-settings' | 'env-var';
}

// ── Caches ──

const configCache = new Map<string, { config: EmailConfig; expiresAt: number }>();
const resendClients = new Map<string, Resend>();
const CONFIG_TTL = 60_000; // 1 minute

// ── Config loading ──

async function getEmailConfig(): Promise<EmailConfig | null> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';

  // Check cache
  const cached = configCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  // Load from site-settings
  try {
    const { data: settingsCol } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', 'site-settings')
      .single();

    if (settingsCol) {
      const { data: globalEntry } = await supabase
        .from('entries')
        .select('content')
        .eq('collection_id', settingsCol.id)
        .eq('slug', 'global')
        .single();

      if (globalEntry?.content) {
        const c = globalEntry.content as Record<string, any>;
        // Agency-shared mode: when the tenant leaves resend_api_key empty, fall
        // back to the platform-wide RESEND_API_KEY env var. The agency verifies
        // one domain (kiban.pt) on Resend and all tenants send from it with
        // their own `default_from_name` + `default_reply_to`. Zero DNS work on
        // the tenant side.
        const tenantApiKey = typeof c.resend_api_key === 'string' && c.resend_api_key.trim() ? c.resend_api_key.trim() : null;
        const apiKey = tenantApiKey || process.env.RESEND_API_KEY;
        const source: 'tenant-settings' | 'env-var' = tenantApiKey ? 'tenant-settings' : 'env-var';

        if (apiKey) {
          const config: EmailConfig = {
            resendApiKey: apiKey,
            // Tenant self-hosted: use their own from_email.
            // Agency-shared: use the platform default (kiban.pt) to respect DNS verification.
            defaultFromEmail: tenantApiKey
              ? (c.default_from_email || process.env.DEFAULT_FROM_EMAIL || 'noreply@kiban.pt')
              : (process.env.DEFAULT_FROM_EMAIL || 'noreply@kiban.pt'),
            defaultFromName: c.default_from_name || c.site_name || process.env.DEFAULT_FROM_NAME || 'KibanCMS',
            // reply_to ensures responses land with the tenant, not the agency mailbox.
            // Falls back to the general contact_email so the existing Settings form works out of the box.
            defaultReplyTo: c.default_reply_to || c.contact_email || '',
            notificationEmails: (c.contact_email || process.env.NOTIFICATION_EMAIL || '')
              .split(',').map((e: string) => e.trim()).filter(Boolean),
            source,
          };
          configCache.set(tenantId, { config, expiresAt: Date.now() + CONFIG_TTL });
          return config;
        }
      }
    }
  } catch (err: any) {
    logger.warn('Failed to load email config from DB', { error: err.message });
  }

  // Env-only fallback — no site-settings entry yet (new tenant, first install).
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const config: EmailConfig = {
    resendApiKey: apiKey,
    defaultFromEmail: process.env.DEFAULT_FROM_EMAIL || 'noreply@kiban.pt',
    defaultFromName: process.env.DEFAULT_FROM_NAME || 'KibanCMS',
    defaultReplyTo: '',
    notificationEmails: (process.env.NOTIFICATION_EMAIL || '').split(',').map(e => e.trim()).filter(Boolean),
    source: 'env-var',
  };
  configCache.set(tenantId, { config, expiresAt: Date.now() + CONFIG_TTL });
  return config;
}

function getResendClient(apiKey: string): Resend {
  let client = resendClients.get(apiKey);
  if (!client) {
    client = new Resend(apiKey);
    resendClients.set(apiKey, client);
  }
  return client;
}

// ── Public API ──

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  from?: string;
}): Promise<{ id: string } | null> {
  const config = await getEmailConfig();
  if (!config) {
    logger.warn('Email not sent — no Resend API key configured');
    return null;
  }

  const resend = getResendClient(config.resendApiKey);
  const from = opts.from || `${config.defaultFromName} <${config.defaultFromEmail}>`;
  // Always fall back to the tenant's default reply_to so customer replies
  // land with the operator, not the agency mailbox (agency-shared mode).
  // Resend's reply_to only accepts a bare email (unlike `from` which takes
  // "Name <email>"), so we extract the address if the operator typed the
  // compound format.
  const rawReplyTo = opts.replyTo || config.defaultReplyTo || '';
  const replyToMatch = rawReplyTo.match(/<([^>]+)>/);
  const replyTo = (replyToMatch ? replyToMatch[1].trim() : rawReplyTo.trim()) || undefined;

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      replyTo,
    });

    if (error) {
      logger.error('Resend API error', { error: error.message });
      return null;
    }

    logger.info('Email sent', { id: data?.id, to: opts.to, subject: opts.subject });
    return data || null;
  } catch (err: any) {
    logger.error('Email send failed', { error: err.message, to: opts.to });
    return null;
  }
}

/**
 * Send admin notification for a form submission.
 */
export async function sendFormNotification(
  formName: string,
  content: Record<string, any>,
  entryId: string,
  overrideRecipients?: string,
  overrideSubjectTemplate?: string,
): Promise<void> {
  const config = await getEmailConfig();
  if (!config) return;

  // Determine recipients: form-specific > global config > env
  const recipients = (overrideRecipients || '')
    .split(',').map(e => e.trim()).filter(Boolean);
  const to = recipients.length > 0 ? recipients : config.notificationEmails;

  if (to.length === 0) {
    logger.warn('Form notification skipped — no recipient emails configured', { form: formName });
    return;
  }

  const subjectTemplate = overrideSubjectTemplate || 'Nova mensagem de {name} — {form_name}';
  const subject = subjectTemplate
    .replace('{form_name}', formName)
    .replace('{name}', content.name || 'Visitante')
    .replace('{email}', content.email || '')
    .replace('{subject}', content.subject || '');

  const { html } = formNotificationTemplate(formName, content, entryId, config.defaultFromName);

  await sendEmail({ to, subject, html, replyTo: content.email });
}

/**
 * Send auto-reply to the visitor after form submission.
 */
export async function sendFormAutoReply(
  formName: string,
  content: Record<string, any>,
  autoReplyMessage: string,
): Promise<void> {
  if (!autoReplyMessage || !content.email) return;

  const config = await getEmailConfig();
  if (!config) return;

  const { subject, html } = formAutoReplyTemplate(
    formName,
    content.name || '',
    autoReplyMessage,
    config.defaultFromName,
  );

  await sendEmail({ to: content.email, subject, html });
}

/**
 * Send booking confirmation to customer.
 */
export async function sendBookingConfirmation(
  bookingContent: Record<string, any>,
): Promise<void> {
  const email = bookingContent.customer_email;
  if (!email) return;

  const config = await getEmailConfig();
  if (!config) return;

  const { subject, html } = bookingConfirmationTemplate(bookingContent, config.defaultFromName);

  await sendEmail({ to: email, subject, html });
}
