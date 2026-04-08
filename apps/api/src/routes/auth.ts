/**
 * Auth Routes — Multi-tenant login
 *
 * POST /api/v1/auth/login
 * Tries email+password against all tenants' Supabase instances.
 * Returns the matching tenant config + session tokens.
 */

import { Router, type Request, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getAllTenants, type TenantConfig } from '../config/tenants.js';

const router: Router = Router();

// Cache anon clients (for auth — use anon key, not service key)
const anonClientCache = new Map<string, ReturnType<typeof createClient>>();

function getAnonClient(tenant: TenantConfig) {
  let client = anonClientCache.get(tenant.id);
  if (!client) {
    client = createClient(tenant.supabaseUrl, tenant.supabaseAnonKey);
    anonClientCache.set(tenant.id, client);
  }
  return client;
}

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 * Returns: { tenantId, supabaseUrl, supabaseAnonKey, session }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: {
          message: 'Email and password are required',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const tenants = getAllTenants();

    if (tenants.length === 0) {
      res.status(500).json({
        error: {
          message: 'No tenants configured',
          status: 500,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Try all tenants in parallel
    const results = await Promise.allSettled(
      tenants.map(async (tenant) => {
        const client = getAnonClient(tenant);
        const { data, error } = await client.auth.signInWithPassword({ email, password });

        if (error || !data.session) {
          throw new Error(error?.message || 'Auth failed');
        }

        return { tenant, session: data.session };
      })
    );

    // Find the first successful auth
    const success = results.find(
      (r): r is PromiseFulfilledResult<{ tenant: TenantConfig; session: any }> =>
        r.status === 'fulfilled'
    );

    if (!success) {
      res.status(401).json({
        error: {
          message: 'Invalid email or password',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { tenant, session } = success.value;

    res.json({
      data: {
        tenantId: tenant.id,
        supabaseUrl: tenant.supabaseUrl,
        supabaseAnonKey: tenant.supabaseAnonKey,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          user: session.user,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Auth] Login error:', error.message);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        status: 500,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default router;
