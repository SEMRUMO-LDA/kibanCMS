/**
 * Preview Routes
 *
 * - POST /api/v1/preview/token (JWT auth) — admin generates a preview token
 *   for a specific entry. Returns the token + ready-to-share URL stub.
 *
 * - GET /api/v1/preview/entry?token=... (public, no auth) — frontends fetch
 *   a draft entry using the token. The token's signature + expiry + tenant
 *   binding gates access to that single entry.
 */

import { Router, type Request, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { tenantStore, getOrCreateClients } from '../middleware/tenant.js';
import { resolveTenantById } from '../config/tenants.js';
import { generatePreviewToken, verifyPreviewToken } from '../lib/preview-tokens.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

// ============================================
// POST /api/v1/preview/token
// Body: { entry_id: string }
// Auth: JWT (admin)
// Returns: { token, expires_at }
// ============================================

router.post('/token', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.profileId) {
      return res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const { entry_id } = req.body || {};
    if (!entry_id || typeof entry_id !== 'string') {
      return res.status(400).json({
        error: { message: 'entry_id is required', status: 400, timestamp: new Date().toISOString() },
      });
    }

    // Verify the entry exists in the current tenant (prevents cross-tenant tokens)
    const { data: entry, error } = await supabase
      .from('entries')
      .select('id, slug, collection_id')
      .eq('id', entry_id)
      .single();

    if (error || !entry) {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
    const { token, expiresAt } = generatePreviewToken(entry_id, tenantId);

    logger.info('Preview token generated', { entryId: entry_id, tenantId, expiresAt });

    res.json({
      data: { token, expires_at: expiresAt, entry_id: entry.id },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Preview token generation failed', { error: err.message });
    res.status(500).json({
      error: { message: 'Failed to generate preview token', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// GET /api/v1/preview/entry?token=...
// Public — token is the gate. No JWT/API-key required.
// Returns the entry (even if draft/scheduled) with full content.
// ============================================
//
// Note: this endpoint is registered OUTSIDE the validateAny middleware in
// server.ts so that public frontends can call it without an API key.

router.get('/entry', async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string | undefined;
    if (!token) {
      return res.status(400).json({
        error: { message: 'token query param is required', status: 400, timestamp: new Date().toISOString() },
      });
    }

    const payload = verifyPreviewToken(token);
    if (!payload) {
      return res.status(401).json({
        error: { message: 'Invalid or expired preview token', status: 401, timestamp: new Date().toISOString() },
      });
    }

    // Switch to the token's tenant context so the supabase Proxy resolves to
    // the correct database. Critical: a preview token issued for tenant A
    // must read from tenant A's DB, not whatever tenant the request resolved to.
    const tenant = resolveTenantById(payload.tenant_id);
    if (!tenant) {
      return res.status(404).json({
        error: { message: 'Token tenant no longer exists', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const clients = getOrCreateClients(tenant);

    await tenantStore.run({ tenant, ...clients }, async () => {
      const { data: entry, error } = await supabase
        .from('entries')
        .select('id, title, slug, content, status, tags, created_at, updated_at, published_at, meta, collection_id')
        .eq('id', payload.entry_id)
        .single();

      if (error || !entry) {
        return res.status(404).json({
          error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
        });
      }

      // Resolve collection slug for the response
      const { data: col } = await supabase
        .from('collections')
        .select('slug, name, fields')
        .eq('id', entry.collection_id)
        .single();

      // i18n overlay: same as the public entries route, support ?lang=
      const lang = req.query.lang as string | undefined;
      let responseEntry: any = entry;
      const meta = (entry.meta || {}) as Record<string, any>;
      if (lang && meta.translations?.[lang]) {
        const translations = meta.translations[lang];
        responseEntry = {
          ...entry,
          title: translations._title || entry.title,
          content: { ...(entry.content || {}), ...translations },
          meta: { ...meta, _served_lang: lang },
        };
      }

      res.json({
        data: {
          ...responseEntry,
          _preview: {
            is_preview: true,
            served_status: entry.status,
            expires_at: new Date(payload.exp * 1000).toISOString(),
          },
        },
        meta: col ? { collection: { slug: col.slug, name: col.name } } : undefined,
        timestamp: new Date().toISOString(),
      });
    });
  } catch (err: any) {
    logger.error('Preview entry fetch failed', { error: err.message });
    res.status(500).json({
      error: { message: 'Failed to fetch preview entry', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
