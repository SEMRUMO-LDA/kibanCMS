/**
 * Multi-tenant Configuration
 *
 * Reads tenant config from TENANTS env var (JSON).
 * Each tenant maps hostnames to Supabase credentials.
 *
 * Format:
 * {
 *   "lunes": {
 *     "supabaseUrl": "https://xxx.supabase.co",
 *     "supabaseAnonKey": "eyJ...",
 *     "supabaseServiceKey": "eyJ...",
 *     "hostnames": ["lunes.kiban.pt"]
 *   }
 * }
 *
 * If TENANTS is not set, falls back to single-tenant mode
 * using SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
 */

export interface TenantConfig {
  id: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  hostnames: string[];
}

let tenants: TenantConfig[] = [];
let hostnameMap: Map<string, TenantConfig> = new Map();
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
      };
      console.log('[Tenants] Single-tenant mode (using env vars)');
    }
    return;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, Omit<TenantConfig, 'id'>>;

    for (const [id, config] of Object.entries(parsed)) {
      const tenant: TenantConfig = { id, ...config };
      tenants.push(tenant);

      for (const hostname of tenant.hostnames) {
        hostnameMap.set(hostname.toLowerCase(), tenant);
      }
    }

    // First tenant is the default fallback
    if (tenants.length > 0) {
      defaultTenant = tenants[0];
    }

    console.log(`[Tenants] Multi-tenant mode: ${tenants.length} tenant(s) loaded`);
    tenants.forEach(t => console.log(`  - ${t.id}: ${t.hostnames.join(', ')}`));
  } catch (err) {
    console.error('[Tenants] Failed to parse TENANTS env var:', err);
    throw new Error('Invalid TENANTS configuration');
  }
}

export function resolveTenant(hostname: string): TenantConfig | null {
  // Strip port from hostname
  const host = hostname.toLowerCase().split(':')[0];

  return hostnameMap.get(host) || defaultTenant;
}

export function getTenants(): TenantConfig[] {
  return tenants;
}

export function getDefaultTenant(): TenantConfig | null {
  return defaultTenant;
}
