import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

/**
 * GET /api/v1/activity
 * Returns recent activity across the CMS — entries created/updated/deleted.
 * Query params: limit (default 50), offset (default 0)
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    // Get recent entries with author info
    const { data: entries, error, count } = await supabase
      .from('entries')
      .select(`
        id, title, slug, status, created_at, updated_at,
        author_id, collection_id,
        author:profiles!author_id(id, full_name, email)
      `, { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get collection names
    const colIds = [...new Set((entries || []).map(e => e.collection_id))];
    const { data: cols } = await supabase
      .from('collections')
      .select('id, name, slug')
      .in('id', colIds.length > 0 ? colIds : ['_none_']);

    const colMap = new Map((cols || []).map(c => [c.id, c]));

    // Build activity items
    const activity = (entries || []).map(entry => {
      const isNew = Math.abs(new Date(entry.created_at).getTime() - new Date(entry.updated_at).getTime()) < 2000;
      const col = colMap.get(entry.collection_id);
      return {
        id: entry.id,
        action: isNew ? 'created' : 'updated',
        entry_title: entry.title || 'Untitled',
        entry_slug: entry.slug,
        entry_status: entry.status,
        collection_name: col?.name || 'Unknown',
        collection_slug: col?.slug || '',
        author: entry.author || null,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
      };
    });

    res.json({
      data: activity,
      meta: { pagination: { limit, offset, total: count || 0 } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      error: { message: error.message || 'Failed to load activity', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * GET /api/v1/activity/audit
 * Returns the full audit log (admin only).
 * Query params: limit, offset, resource, action
 */
router.get('/audit', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const { resource, action } = req.query;

    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (resource && typeof resource === 'string') {
      query = query.eq('resource', resource);
    }
    if (action && typeof action === 'string') {
      query = query.eq('action', action);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      data: data || [],
      meta: { pagination: { limit, offset, total: count || 0 } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      error: { message: error.message || 'Failed to load audit log', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
