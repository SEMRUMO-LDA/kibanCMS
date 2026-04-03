import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

/**
 * GET /api/v1/dashboard/stats
 * Returns all dashboard data in a single request.
 * Service role key bypasses RLS — always returns complete data.
 */
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const [entriesR, collectionsR, mediaR, usersR, colsR, draftsR, scheduledR, keysR, recentR] = await Promise.all([
      supabase.from('entries').select('id', { count: 'exact', head: true }),
      supabase.from('collections').select('id', { count: 'exact', head: true }),
      supabase.from('media').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('collections').select('id, name, slug'),
      supabase.from('entries').select('id, title, slug, collection_id, updated_at').eq('status', 'draft').order('updated_at', { ascending: false }).limit(5),
      supabase.from('entries').select('id, title, collection_id, published_at').eq('status', 'scheduled').order('published_at', { ascending: true }).limit(5),
      supabase.from('api_keys').select('id', { count: 'exact', head: true }).is('revoked_at', null),
      supabase.from('entries').select('id, title, status, created_at, updated_at, author_id').order('updated_at', { ascending: false }).limit(8),
    ]);

    // Collection stats — entry count per collection
    const { data: allEntries } = await supabase.from('entries').select('collection_id');
    const countMap = new Map<string, number>();
    (allEntries || []).forEach(e => {
      countMap.set(e.collection_id, (countMap.get(e.collection_id) || 0) + 1);
    });

    const cols = colsR.data || [];
    const colMap = new Map(cols.map(c => [c.id, c.slug]));

    const collectionStats = cols.map(col => ({
      name: col.name, slug: col.slug, count: countMap.get(col.id) || 0,
    })).sort((a, b) => b.count - a.count);

    res.json({
      data: {
        metrics: {
          entries: entriesR.count || 0,
          collections: collectionsR.count || 0,
          media: mediaR.count || 0,
          users: usersR.count || 0,
          apiKeys: keysR.count || 0,
        },
        collectionStats,
        drafts: (draftsR.data || []).map(d => ({
          ...d, collection_slug: colMap.get(d.collection_id) || '',
        })),
        scheduled: (scheduledR.data || []).map(s => ({
          ...s, collection_slug: colMap.get(s.collection_id) || '',
        })),
        activity: recentR.data || [],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      error: { message: 'Failed to load dashboard stats', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
