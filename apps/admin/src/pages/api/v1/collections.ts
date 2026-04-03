import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { validateApiKey, setCorsHeaders, sendError, sendSuccess } from './auth-middleware';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/v1/collections
 * Returns all collections
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

    // Fetch collections
    const { data: collections, error } = await supabase
      .from('collections')
      .select('id, name, slug, description, type, icon, color, created_at, updated_at')
      .order('name', { ascending: true });

    if (error) throw error;

    return sendSuccess(res, collections, {
      count: collections?.length || 0,
    });
  } catch (error: any) {
    console.error('Error fetching collections:', error);
    return sendError(res, 500, 'Internal server error', { message: error.message });
  }
}
