import type { Request, Response, NextFunction } from 'express';
import { supabase, supabaseAdmin } from '../lib/supabase.js';

export interface AuthRequest extends Request {
  profileId?: string;
  user?: any;
}

/**
 * API Key Authentication Middleware
 * Validates the API key from Authorization header against database
 */
export async function validateApiKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get API key from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          message: 'Missing or invalid Authorization header. Use: Authorization: Bearer kiban_live_xxx',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer '

    if (!apiKey || !apiKey.startsWith('kiban_live_') || apiKey.length < 25) {
      res.status(401).json({
        error: {
          message: 'Invalid API key format',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Hash the provided key to compare with database
    const { data: hashData, error: hashError } = await supabase.rpc('hash_api_key', {
      key_value: apiKey,
    });

    if (hashError) {
      console.error('Error hashing API key:', hashError);
      res.status(500).json({
        error: {
          message: 'Internal server error',
          status: 500,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Look up the hashed key in database
    const { data: keyRecord, error: lookupError } = await supabase
      .from('api_keys')
      .select('id, profile_id, revoked_at')
      .eq('key_hash', hashData)
      .is('revoked_at', null)
      .single();

    if (lookupError || !keyRecord) {
      res.status(401).json({
        error: {
          message: 'Invalid or revoked API key',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Update last_used_at timestamp (fire and forget)
    supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRecord.id)
      .then(() => { /* no-op */ }, (err: any) => console.error('Failed to update last_used_at:', err));

    // Attach profile ID to request
    req.profileId = keyRecord.profile_id;

    next();
  } catch (error) {
    console.error('API key validation error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        status: 500,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * JWT Authentication Middleware (for Admin UI)
 * Validates Supabase JWT token from Authorization header
 */
export async function validateJWT(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          message: 'Missing or invalid Authorization header',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify JWT with Supabase (admin client needed for server-side token validation)
    console.log('[JWT] Validating token, length:', token.length);
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    console.log('[JWT] Result:', error ? `ERROR: ${error.message}` : `OK: ${data.user?.email}`);

    if (error || !data.user) {
      res.status(401).json({
        error: {
          message: 'Invalid or expired token',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Attach user to request
    req.user = data.user;
    req.profileId = data.user.id;

    next();
  } catch (error) {
    console.error('JWT validation error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        status: 500,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * CORS Middleware Helper
 */
export function configureCors(allowedOrigins: string[]) {
  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // 24 hours
  };
}
