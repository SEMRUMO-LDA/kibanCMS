import { Router, type Response, type Request } from 'express';
import { supabase } from '../lib/supabase.js';

const router: Router = Router();

/**
 * GET /api/v1/redirects/resolve?path=/old-page
 * Public endpoint (no auth) — frontends call this to check if a path has a redirect.
 * Returns the redirect target or 404.
 */
router.get('/resolve', async (req: Request, res: Response) => {
  try {
    const { path } = req.query;
    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: { message: 'path query param required', status: 400 } });
    }

    // Find the 'redirects' collection
    const { data: col } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', 'redirects')
      .maybeSingle();

    if (!col) {
      return res.status(404).json({ error: { message: 'No redirect rules configured', status: 404 } });
    }

    // Search for matching redirect directly in DB (no full table scan)
    const { data: match } = await supabase
      .from('entries')
      .select('id, content')
      .eq('collection_id', col.id)
      .eq('status', 'published')
      .filter('content->>from_path', 'eq', path)
      .limit(1)
      .maybeSingle();

    if (!match) {
      return res.status(404).json({ data: null, message: 'No redirect found' });
    }

    const content = match.content as any;

    if (content?.is_active === false) {
      return res.status(404).json({ data: null, message: 'No redirect found' });
    }

    // Increment hit count (fire and forget)
    const currentCount = parseInt(content.hit_count || '0', 10);
    supabase
      .from('entries')
      .update({ content: { ...content, hit_count: currentCount + 1 } })
      .eq('id', match.id)
      .then(() => {});

    res.json({
      data: {
        from: content.from_path,
        to: content.to_path,
        type: content.type || '301',
        permanent: content.type === '301',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message, status: 500 } });
  }
});

export default router;
