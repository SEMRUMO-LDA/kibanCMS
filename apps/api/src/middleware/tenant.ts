/**
 * Tenant Resolution Middleware
 *
 * Resolution order:
 * 1. X-Tenant header (admin panel sends this after login)
 * 2. Origin header (client websites — be-lunes.pt, solfil.pt)
 * 3. Hostname (subdomain mode — lunes.kiban.pt)
 * 4. Default tenant (fallback)
 */

import type { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  resolveTenant,
  resolveTenantById,
  resolveTenantByOrigin,
  getDefaultTenant,
  type TenantConfig,
} from '../config/tenants.js';

export interface TenantContext {
  tenant: TenantConfig;
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
}

export const tenantStore = new AsyncLocalStorage<TenantContext>();

// Cache created clients to avoid recreating on every request
const clientCache = new Map<string, { supabase: SupabaseClient; supabaseAdmin: SupabaseClient }>();

export function getOrCreateClients(tenant: TenantConfig) {
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
  // 1. X-Tenant header (admin panel after login)
  const tenantHeader = req.headers['x-tenant'] as string | undefined;
  if (tenantHeader) {
    const tenant = resolveTenantById(tenantHeader);
    if (tenant) {
      const clients = getOrCreateClients(tenant);
      return tenantStore.run({ tenant, ...clients }, () => next());
    }
  }

  // 2. Origin header (client website API calls)
  const origin = req.headers.origin as string | undefined;
  if (origin) {
    const tenant = resolveTenantByOrigin(origin);
    if (tenant) {
      const clients = getOrCreateClients(tenant);
      return tenantStore.run({ tenant, ...clients }, () => next());
    }
  }

  // 3. Hostname (subdomain mode)
  const hostname = req.hostname || req.headers.host || 'localhost';
  const tenant = resolveTenant(hostname);

  if (!tenant) {
    // 4. Absolute fallback to default
    const def = getDefaultTenant();
    if (def) {
      const clients = getOrCreateClients(def);
      return tenantStore.run({ tenant: def, ...clients }, () => next());
    }

    res.status(500).json({
      error: {
        message: 'Could not resolve tenant',
        status: 500,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const clients = getOrCreateClients(tenant);
  tenantStore.run({ tenant, ...clients }, () => next());
}
