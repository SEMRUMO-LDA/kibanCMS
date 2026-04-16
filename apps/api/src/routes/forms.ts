import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { sendFormNotification, sendFormAutoReply } from '../lib/email.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

/**
 * Fire all notifications for a form submission:
 * 1. Email notification to admin(s) via Resend
 * 2. Auto-reply to visitor via Resend
 * 3. Webhook to external service (Make.com, Zapier, etc.)
 */
async function fireFormNotifications(
  formName: string,
  content: Record<string, any>,
  entryId: string
): Promise<void> {
  // 1. Look for form-specific config in forms-config collection
  const { data: configCollection } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', 'forms-config')
    .single();

  let webhookUrl: string | null = null;
  let notificationEmails: string | null = null;
  let emailSubjectTemplate: string | null = null;
  let autoReply: string | null = null;

  if (configCollection) {
    const { data: formConfig } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', configCollection.id)
      .eq('status', 'published')
      .filter('content->>form_name', 'eq', formName)
      .single();

    if (formConfig?.content) {
      const cfg = formConfig.content as Record<string, any>;
      if (cfg.is_active === false) return;
      webhookUrl = cfg.webhook_url || null;
      notificationEmails = cfg.notification_emails || null;
      emailSubjectTemplate = cfg.email_subject_template || null;
      autoReply = cfg.auto_reply || null;
    }
  }

  // 2. Fallback: check global site-settings
  if (!webhookUrl || !notificationEmails) {
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
        const sc = globalEntry.content as Record<string, any>;
        if (!webhookUrl) webhookUrl = sc.forms_webhook_url || null;
        if (!notificationEmails) notificationEmails = sc.contact_email || null;
      }
    }
  }

  // 3. Fire email + webhook in parallel
  const promises: Promise<any>[] = [];

  // Email notification to admin(s)
  promises.push(
    sendFormNotification(formName, content, entryId, notificationEmails || undefined, emailSubjectTemplate || undefined)
      .catch(err => logger.warn('Form email notification failed', { form: formName, error: err.message }))
  );

  // Auto-reply to visitor
  if (autoReply && content.email) {
    promises.push(
      sendFormAutoReply(formName, content, autoReply)
        .catch(err => logger.warn('Form auto-reply failed', { form: formName, error: err.message }))
    );
  }

  // Webhook (existing behavior)
  if (webhookUrl) {
    const payload = {
      event: 'form.submitted',
      form_name: formName,
      entry_id: entryId,
      submission: content,
      notification: { to: notificationEmails, auto_reply: autoReply },
      timestamp: new Date().toISOString(),
    };

    promises.push(
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      }).then(response => {
        if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
        logger.info('Form webhook dispatched', { form: formName, url: webhookUrl, status: response.status });
      })
    );
  }

  await Promise.allSettled(promises);
}

/**
 * POST /api/v1/forms/submit
 *
 * Public-facing endpoint for frontend form submissions.
 * Requires API Key authentication (same key used to fetch content).
 *
 * Creates an entry in the "form-submissions" collection automatically.
 * The existing webhook trigger on entries fires "entry.created",
 * which can be routed to an external email service (Resend, Mailgun, Zapier, Make, etc.)
 *
 * Body:
 *   form_name: string   (required) — identifies which form (contact, feedback, etc.)
 *   name: string         (optional)
 *   email: string        (required)
 *   phone: string        (optional)
 *   subject: string      (optional)
 *   message: string      (required)
 *   source_url: string   (optional) — page where form was submitted
 *   extra: object        (optional) — any additional fields
 */
router.post('/submit', async (req: AuthRequest, res: Response) => {
  try {
    // Auth is handled by middleware (API Key) — profileId is set
    if (!req.profileId) {
      return res.status(401).json({
        error: { message: 'Unauthorized: API key required', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const { form_name, name, email, phone, subject, message, source_url, extra } = req.body;

    // Validate required fields
    if (!form_name || typeof form_name !== 'string' || form_name.trim().length === 0) {
      return res.status(400).json({
        error: { message: 'Missing required field: form_name', status: 400, timestamp: new Date().toISOString() },
      });
    }

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: { message: 'Missing or invalid required field: email', status: 400, timestamp: new Date().toISOString() },
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: { message: 'Missing required field: message', status: 400, timestamp: new Date().toISOString() },
      });
    }

    // Sanitize inputs
    const sanitize = (val: any): string => (typeof val === 'string' ? val.trim().slice(0, 2000) : '');
    const cleanName = sanitize(name);
    const cleanEmail = email.trim().toLowerCase().slice(0, 320);
    const cleanPhone = sanitize(phone);
    const cleanSubject = sanitize(subject);
    const cleanMessage = sanitize(message).slice(0, 10000);
    const cleanFormName = form_name.trim().slice(0, 100);
    const cleanSourceUrl = sanitize(source_url).slice(0, 500);

    // Find form-submissions collection
    const { data: collection, error: colError } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', 'form-submissions')
      .single();

    if (colError || !collection) {
      return res.status(404).json({
        error: {
          message: 'Forms addon not installed. Install the "Forms" addon in your CMS first.',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Auto-generate slug and title
    const timestamp = new Date().toISOString();
    const slugSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const slug = `${cleanFormName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${slugSuffix}`;
    const title = `${cleanFormName} — ${cleanName || cleanEmail}`;

    // Build content matching the Forms addon schema
    const content: Record<string, any> = {
      form_name: cleanFormName,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      subject: cleanSubject,
      message: cleanMessage,
      submitted_at: timestamp,
      is_read: false,
      source_url: cleanSourceUrl,
    };

    // Merge extra fields into meta (not content — keeps schema clean)
    const meta = extra && typeof extra === 'object' ? { extra_fields: extra } : {};

    // Create entry — DB webhook trigger fires automatically (entry.created)
    const { data: entry, error: insertError } = await supabase
      .from('entries')
      .insert({
        collection_id: collection.id,
        title,
        slug,
        content,
        status: 'published',
        published_at: timestamp,
        author_id: req.profileId,
        meta,
        tags: [cleanFormName],
      })
      .select('id, title, slug, created_at')
      .single();

    if (insertError) {
      logger.error('Error creating form submission', { error: insertError.message });
      throw insertError;
    }

    logger.info('Form submission received', {
      form: cleanFormName,
      email: cleanEmail,
      entryId: entry.id,
    });

    // Fire email + webhook notifications (non-blocking)
    fireFormNotifications(cleanFormName, content, entry.id).catch(err =>
      logger.warn('Form notification dispatch failed', { error: err.message })
    );

    // Return minimal response (don't leak internal data to public frontends)
    res.status(201).json({
      success: true,
      data: {
        id: entry.id,
        form: cleanFormName,
        received_at: timestamp,
      },
      timestamp,
    });
  } catch (error: any) {
    logger.error('Form submission error', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to process form submission', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * GET /api/v1/forms/submissions
 *
 * List form submissions (admin only, JWT auth).
 * Convenience wrapper — same data as GET /api/v1/entries/form-submissions
 * but with form-specific filters.
 *
 * Query params:
 *   form_name: filter by form name
 *   is_read: "true" or "false"
 *   limit: number (default 50, max 200)
 *   offset: number (default 0)
 */
router.get('/submissions', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.profileId) {
      return res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const { form_name, is_read, limit = '50', offset = '0' } = req.query;

    // Find collection
    const { data: collection, error: colError } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', 'form-submissions')
      .single();

    if (colError || !collection) {
      return res.status(404).json({
        error: { message: 'Forms addon not installed', status: 404, timestamp: new Date().toISOString() },
      });
    }

    let query = supabase
      .from('entries')
      .select('id, title, slug, content, status, tags, meta, created_at, updated_at', { count: 'exact' })
      .eq('collection_id', collection.id)
      .order('created_at', { ascending: false });

    // Filter by form name (stored in tags)
    if (form_name && typeof form_name === 'string') {
      query = query.contains('tags', [form_name]);
    }

    // Filter by read status (stored in content->is_read)
    if (is_read === 'true') {
      query = query.eq('content->>is_read', 'true');
    } else if (is_read === 'false') {
      query = query.eq('content->>is_read', 'false');
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: entries, error, count } = await query;

    if (error) throw error;

    res.json({
      data: entries || [],
      meta: {
        pagination: { limit: limitNum, offset: offsetNum, total: count || 0 },
        unread: undefined as number | undefined,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching form submissions', { error: error.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
