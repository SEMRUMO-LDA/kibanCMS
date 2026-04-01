/**
 * Add-on Types
 * Central definitions for the kibanCMS Add-on System
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AddonCategory =
  | 'content'
  | 'media'
  | 'seo'
  | 'analytics'
  | 'forms'
  | 'compliance'
  | 'social'
  | 'commerce'
  | 'developer';

export interface AddonManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  category: AddonCategory;
  icon?: string;
  configSchema?: Record<string, any>;
  database?: {
    tables: AddonTable[];
  };
  ui?: {
    components?: Record<string, any>;
    sidebarItems?: AddonSidebarItem[];
    routes?: AddonRoute[];
  };
  hooks?: AddonHooks;
  permissions?: string[];
  dependencies?: string[];
  api?: {
    endpoints: AddonAPIEndpoint[];
  };
}

export interface AddonTable {
  name: string;
  columns: AddonColumn[];
  policies?: AddonPolicy[];
  indexes?: string[];
}

export interface AddonColumn {
  name: string;
  type: string;
  primary?: boolean;
  unique?: boolean;
  notNull?: boolean;
  default?: string;
  index?: boolean;
}

export interface AddonPolicy {
  name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using: string;
  check?: string;
}

export interface AddonSidebarItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  category: string;
  parent?: string;
}

export interface AddonRoute {
  path: string;
  component: string;
  layout?: string;
}

export interface AddonAPIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: string;
}

export interface AddonHooks {
  onActivate?: (context: AddonContext) => Promise<void>;
  onDeactivate?: (context: AddonContext) => Promise<void>;
  onConfigUpdate?: (config: AddonConfig, context: AddonContext) => Promise<void>;
  onBeforeSave?: (data: any, context: AddonContext) => Promise<any>;
  onAfterSave?: (data: any, context: AddonContext) => Promise<void>;
}

export interface AddonStatus {
  installed: boolean;
  enabled: boolean;
  version: string;
  lastUpdated: string;
  enabledAt?: string;
  disabledAt?: string;
}

export type AddonConfig = Record<string, any>;

export interface AddonContext {
  supabase: SupabaseClient;
  user?: any;
  organization?: any;
  cache?: any;
  events?: any;
}
