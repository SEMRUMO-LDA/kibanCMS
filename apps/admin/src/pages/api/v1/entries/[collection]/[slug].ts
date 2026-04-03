import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { validateApiKey, setCorsHeaders, sendError, sendSuccess } from '../../auth-middleware';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/v1/entries/:collection/:slug
 * Returns a single entry by slug
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

    const { collection: collectionSlug, slug: entrySlug } = req.query;

    if (!collectionSlug || typeof collectionSlug !== 'string') {
      return sendError(res, 400, 'Bad request', { reason: 'Missing collection slug' });
    }

    if (!entrySlug || typeof entrySlug !== 'string') {
      return sendError(res, 400, 'Bad request', { reason: 'Missing entry slug' });
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

    // Get the entry
    const { data: entry, error } = await supabase
      .from('entries')
      .select('*')
      .eq('collection_id', collection.id)
      .eq('slug', entrySlug)
      .single();

    if (error || !entry) {
      return sendError(res, 404, 'Entry not found', { collection: collectionSlug, slug: entrySlug });
    }

    return sendSuccess(res, entry, {
      collection: {
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
      },
    });
  } catch (error: any) {
    console.error('Error fetching entry:', error);
    return sendError(res, 500, 'Internal server error', { message: error.message });
  }
}
