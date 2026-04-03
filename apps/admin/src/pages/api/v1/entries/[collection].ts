import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { validateApiKey, setCorsHeaders, sendError, sendSuccess } from '../auth-middleware';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/v1/entries/:collection
 * Returns all entries for a collection
 *
 * Query params:
 * - status: filter by status (draft, published, archived)
 * - limit: number of results (default 100)
 * - offset: pagination offset (default 0)
 * - sort: sort field (default: created_at)
 * - order: asc or desc (default: desc)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle CORS
  if (setCorsHeaders(res, req)) return;

  // Only allow GET
  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed', { allowedMethods: ['GET'] });
  }

  try {
    // Validate API key
    const auth = await validateApiKey(req);
    if (!auth.valid) {
      return sendError(res, 401, 'Unauthorized', { reason: auth.error });
    }

    const { collection: collectionSlug } = req.query;
    const { status, limit = '100', offset = '0', sort = 'created_at', order = 'desc' } = req.query;

    if (!collectionSlug || typeof collectionSlug !== 'string') {
      return sendError(res, 400, 'Bad request', { reason: 'Missing collection slug' });
    }

    // First, get the collection to get its ID
    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('slug', collectionSlug)
      .single();

    if (collectionError || !collection) {
      return sendError(res, 404, 'Collection not found', { slug: collectionSlug });
    }

    // Build query
    let query = supabase
      .from('entries')
      .select('id, title, slug, content, excerpt, status, published_at, created_at, updated_at, author_id, tags, meta', { count: 'exact' })
      .eq('collection_id', collection.id);

    // Filter by status if provided
    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    // Sort
    query = query.order(sort as string, { ascending: order === 'asc' });

    // Pagination
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: entries, error, count } = await query;

    if (error) throw error;

    return sendSuccess(res, entries, {
      collection: {
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
      },
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: count || 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching entries:', error);
    return sendError(res, 500, 'Internal server error', { message: error.message });
  }
}
