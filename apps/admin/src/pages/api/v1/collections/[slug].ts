import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { validateApiKey, setCorsHeaders, sendError, sendSuccess } from '../auth-middleware';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/v1/collections/:slug
 * Returns a single collection with its schema
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

    const { slug } = req.query;

    if (!slug || typeof slug !== 'string') {
      return sendError(res, 400, 'Bad request', { reason: 'Missing collection slug' });
    }

    // Fetch collection
    const { data: collection, error } = await supabase
      .from('collections')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !collection) {
      return sendError(res, 404, 'Collection not found', { slug });
    }

    return sendSuccess(res, collection);
  } catch (error: any) {
    console.error('Error fetching collection:', error);
    return sendError(res, 500, 'Internal server error', { message: error.message });
  }
}
