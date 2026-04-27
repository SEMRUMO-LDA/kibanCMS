/**
 * Trash Routes — Soft-deleted entries (v1.6)
 *
 * - GET    /api/v1/trash               List entries with deleted_at IS NOT NULL
 * - POST   /api/v1/trash/:id/restore   Set deleted_at = NULL (un-delete)
 * - DELETE /api/v1/trash/:id           Hard delete (irreversible)
 * - POST   /api/v1/trash/empty         Hard-delete everything older than 30 days
 *
 * All routes require admin/super_admin role. Editors can soft-delete their own
 * entries via the regular DELETE /entries/... but cannot bypass to hard delete.
 */

import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

const TRASH_RETENTION_DAYS = 30;

async function requireAdmin(req: AuthRequest, res: Response): Promise<boolean> {
  if (!req.profileId) {
    res.status(401).json({
      error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
    });
    return false;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', req.profileId)
    .single();
  const role = profile?.role;
  if (!role || !['super_admin', 'admin'].includes(role)) {
    res.status(403).json({
      error: { message: 'Admin role required', status: 403, timestamp: new Date().toISOString() },
    });
    return false;
  }
  return true;
}

// ============================================
// GET /api/v1/trash
// Returns soft-deleted entries with collection info, paginated.
// Query: limit, offset
// ============================================

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { limit = '50', offset = '0' } = req.query as Record<string, string | undefined>;
    const limitNum = Math.min(parseInt(limit || '50', 10) || 50, 200);
    const offsetNum = parseInt(offset || '0', 10) || 0;

    const { data: entries, error, count } = await supabase
      .from('entries')
      .select('id, title, slug, status, collection_id, deleted_at, created_at', { count: 'exact' })
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (error) throw error;

    // Resolve collection name/slug for each entry (single query)
    const colIds = Array.from(new Set((entries || []).map((e: any) => e.collection_id)));
    let collectionsById: Record<string, { name: string; slug: string }> = {};
    if (colIds.length > 0) {
      const { data: cols } = await supabase
        .from('collections')
        .select('id, name, slug')
        .in('id', colIds);
      for (const c of cols || []) {
        collectionsById[c.id] = { name: c.name, slug: c.slug };
      }
    }

    const enriched = (entries || []).map((e: any) => {
      const expiresAt = new Date(new Date(e.deleted_at).getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      return {
        ...e,
        collection: collectionsById[e.collection_id] || null,
        days_left: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))),
        expires_at: expiresAt.toISOString(),
      };
    });

    res.json({
      data: enriched,
      meta: {
        pagination: { limit: limitNum, offset: offsetNum, total: count || 0 },
        retention_days: TRASH_RETENTION_DAYS,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Trash list failed', { error: err.message });
    res.status(500).json({
      error: { message: 'Failed to load trash', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// POST /api/v1/trash/:id/restore
// ============================================

router.post('/:id/restore', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const { data: existing, error: fetchErr } = await supabase
      .from('entries')
      .select('id, title, slug, deleted_at')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    if (!existing.deleted_at) {
      return res.json({
        data: { message: 'Entry is not in trash', id },
        timestamp: new Date().toISOString(),
      });
    }

    const { error } = await supabase
      .from('entries')
      .update({ deleted_at: null })
      .eq('id', id);

    if (error) throw error;

    audit(req, 'restore', 'entry', id, { title: existing.title });
    logger.info('Entry restored from trash', { id, title: existing.title });

    res.json({
      data: { id, title: existing.title, slug: existing.slug },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Trash restore failed', { error: err.message });
    res.status(500).json({
      error: { message: 'Failed to restore entry', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// DELETE /api/v1/trash/:id   (hard delete, irreversible)
// ============================================

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const { data: existing, error: fetchErr } = await supabase
      .from('entries')
      .select('id, title, slug, deleted_at')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    if (!existing.deleted_at) {
      return res.status(400).json({
        error: {
          message: 'Entry must be in trash before permanent delete. Soft-delete it first.',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id);

    if (error) throw error;

    audit(req, 'hard_delete', 'entry', id, { title: existing.title });
    logger.info('Entry hard-deleted', { id, title: existing.title });

    res.json({
      data: { id, title: existing.title, message: 'Entry permanently deleted' },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Trash hard delete failed', { error: err.message });
    res.status(500).json({
      error: { message: 'Failed to delete entry', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

// ============================================
// POST /api/v1/trash/empty
// Hard-delete everything in trash older than retention_days.
// Manual trigger for admins; the scheduled-publisher worker also calls this
// automatically once per day.
// ============================================

router.post('/empty', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: due, error: selectErr } = await supabase
      .from('entries')
      .select('id, title')
      .lte('deleted_at', cutoff)
      .not('deleted_at', 'is', null);

    if (selectErr) throw selectErr;

    if (!due || due.length === 0) {
      return res.json({
        data: { count: 0, message: 'Nothing older than retention window' },
        timestamp: new Date().toISOString(),
      });
    }

    const { error: deleteErr } = await supabase
      .from('entries')
      .delete()
      .in('id', due.map(e => e.id));

    if (deleteErr) throw deleteErr;

    audit(req, 'hard_delete_bulk', 'entry', 'trash-empty', { count: due.length });
    logger.info('Trash emptied', { count: due.length, cutoff });

    res.json({
      data: { count: due.length, cutoff },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Trash empty failed', { error: err.message });
    res.status(500).json({
      error: { message: 'Failed to empty trash', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
