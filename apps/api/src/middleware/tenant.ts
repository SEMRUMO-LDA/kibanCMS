/**
 * Tenant Resolution Middleware
 *
 * Resolves the tenant from the request hostname and sets up
 * tenant-specific Supabase clients via AsyncLocalStorage.
 *
 * All downstream code (routes, auth middleware) automatically
 * uses the correct tenant's Supabase without any changes.
 */

import type { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveTenant, type TenantConfig } from '../config/tenants.js';

export interface TenantContext {
  tenant: TenantConfig;
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
}

export const tenantStore = new AsyncLocalStorage<TenantContext>();

// Cache created clients to avoid recreating on every request
const clientCache = new Map<string, { supabase: SupabaseClient; supabaseAdmin: SupabaseClient }>();

function getOrCreateClients(tenant: TenantConfig) {
  let clients = clientCache.get(tenant.id);
  if (!clients) {
    const supabase = createClient(tenant.supabaseUrl, tenant.supabaseServiceKey || tenant.supabaseAnonKey);
    const supabaseAdmin = tenant.supabaseServiceKey
      ? createClient(tenant.supabaseUrl, tenant.supabaseServiceKey)
      : supabase;

    clients = { supabase, supabaseAdmin };
    clientCache.set(tenant.id, clients);
  }
  return clients;
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  const hostname = req.hostname || req.headers.host || 'localhost';
  const tenant = resolveTenant(hostname);

  if (!tenant) {
    res.status(500).json({
      error: {
        message: 'Could not resolve tenant for this hostname',
        status: 500,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const clients = getOrCreateClients(tenant);
  const ctx: TenantContext = { tenant, ...clients };

  tenantStore.run(ctx, () => next());
}
