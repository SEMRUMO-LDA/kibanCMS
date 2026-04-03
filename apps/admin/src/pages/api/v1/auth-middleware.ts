import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * API Key Authentication Middleware
 * Validates the API key from Authorization header against database
 */
export async function validateApiKey(req: NextApiRequest): Promise<{ valid: boolean; profileId?: string; error?: string }> {
  try {
    // Get API key from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { valid: false, error: 'Missing or invalid Authorization header. Use: Authorization: Bearer kiban_live_xxx' };
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer '

    if (!apiKey || !apiKey.startsWith('kiban_live_')) {
      return { valid: false, error: 'Invalid API key format. Must start with kiban_live_' };
    }

    // Hash the provided key to compare with database
    const { data: hashData, error: hashError } = await supabase.rpc('hash_api_key', { key_value: apiKey });

    if (hashError) {
      console.error('Error hashing API key:', hashError);
      return { valid: false, error: 'Internal server error' };
    }

    // Look up the hashed key in database
    const { data: keyRecord, error: lookupError } = await supabase
      .from('api_keys')
      .select('id, profile_id, revoked_at')
      .eq('key_hash', hashData)
      .is('revoked_at', null)
      .single();

    if (lookupError || !keyRecord) {
      return { valid: false, error: 'Invalid or revoked API key' };
    }

    // Update last_used_at timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRecord.id);

    return { valid: true, profileId: keyRecord.profile_id };
  } catch (error) {
    console.error('API key validation error:', error);
    return { valid: false, error: 'Internal server error' };
  }
}

/**
 * CORS Middleware
 * Handles CORS headers for external frontend access
 */
export function setCorsHeaders(res: NextApiResponse, req: NextApiRequest) {
  // Allow all origins for now - in production, restrict this
  const origin = req.headers.origin || '*';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}

/**
 * Error Response Helper
 */
export function sendError(res: NextApiResponse, status: number, message: string, details?: any) {
  res.status(status).json({
    error: {
      message,
      details,
      status,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Success Response Helper
 */
export function sendSuccess(res: NextApiResponse, data: any, meta?: any) {
  res.status(200).json({
    data,
    meta,
    timestamp: new Date().toISOString(),
  });
}
