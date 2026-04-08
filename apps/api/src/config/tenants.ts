/**
 * Multi-tenant Configuration
 *
 * Reads tenant config from TENANTS env var (JSON).
 * Each tenant maps hostnames and origins to Supabase credentials.
 *
 * Format:
 * {
 *   "lunes": {
 *     "supabaseUrl": "https://xxx.supabase.co",
 *     "supabaseAnonKey": "eyJ...",
 *     "supabaseServiceKey": "eyJ...",
 *     "hostnames": ["lunes.kiban.pt"],
 *     "origins": ["https://be-lunes.pt"]
 *   }
 * }
 *
 * Resolution order:
 * 1. X-Tenant header (admin panel after login)
 * 2. Origin header (client website API calls)
 * 3. Hostname (legacy/subdomain mode)
 * 4. Default tenant (fallback)
 */

export interface TenantConfig {
  id: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  hostnames: string[];
  origins: string[];
}

let tenants: TenantConfig[] = [];
let hostnameMap: Map<string, TenantConfig> = new Map();
let originMap: Map<string, TenantConfig> = new Map();
let tenantIdMap: Map<string, TenantConfig> = new Map();
let defaultTenant: TenantConfig | null = null;

export function loadTenants(): void {
  const raw = process.env.TENANTS;

  if (!raw) {
    // Single-tenant fallback
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (url && (serviceKey || anonKey)) {
      defaultTenant = {
        id: 'default',
        supabaseUrl: url,
        supabaseAnonKey: anonKey || '',
        supabaseServiceKey: serviceKey || anonKey || '',
        hostnames: [],
        origins: [],
      };
      console.log('[Tenants] Single-tenant mode (using env vars)');
    }
    return;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, Omit<TenantConfig, 'id'>>;

    for (const [id, config] of Object.entries(parsed)) {
      const tenant: TenantConfig = { ...config, id, origins: config.origins || [] };
      tenants.push(tenant);
      tenantIdMap.set(id.toLowerCase(), tenant);

      for (const hostname of tenant.hostnames) {
        hostnameMap.set(hostname.toLowerCase(), tenant);
      }

      for (const origin of tenant.origins) {
        originMap.set(origin.toLowerCase(), tenant);
      }
    }

    // First tenant is the default fallback
    if (tenants.length > 0) {
      defaultTenant = tenants[0];
    }

    console.log(`[Tenants] Multi-tenant mode: ${tenants.length} tenant(s) loaded`);
    tenants.forEach(t => console.log(`  - ${t.id}: hostnames=[${t.hostnames.join(', ')}] origins=[${t.origins.join(', ')}]`));
  } catch (err) {
    console.error('[Tenants] Failed to parse TENANTS env var:', err);
    throw new Error('Invalid TENANTS configuration');
  }
}

export function resolveTenantByOrigin(origin: string): TenantConfig | null {
  return originMap.get(origin.toLowerCase()) || null;
}

export function resolveTenantById(id: string): TenantConfig | null {
  return tenantIdMap.get(id.toLowerCase()) || null;
}

export function resolveTenant(hostname: string): TenantConfig | null {
  const host = hostname.toLowerCase().split(':')[0];
  return hostnameMap.get(host) || defaultTenant;
}

export function getAllTenants(): TenantConfig[] {
  // Return all tenants including default
  if (tenants.length > 0) return tenants;
  if (defaultTenant) return [defaultTenant];
  return [];
}

export function getDefaultTenant(): TenantConfig | null {
  return defaultTenant;
}
