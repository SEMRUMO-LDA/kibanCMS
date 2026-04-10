/**
 * AddonRegistry - Central registry for all add-ons
 * Manages registration, activation, and configuration
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type {
  AddonManifest,
  AddonConfig,
  AddonHooks,
  AddonStatus,
  AddonContext,
} from '../types';

export class AddonRegistry {
  private addons: Map<string, AddonManifest>;
  private configs: Map<string, AddonConfig>;
  private hooks: Map<string, AddonHooks>;
  private status: Map<string, AddonStatus>;
  private context: AddonContext;

  constructor(context: AddonContext) {
    this.addons = new Map();
    this.configs = new Map();
    this.hooks = new Map();
    this.status = new Map();
    this.context = context;

    // Register core add-ons
    this.registerCoreAddons();
  }

  /**
   * Register an add-on
   */
  register(manifest: AddonManifest): void {
    // Validate manifest
    this.validateManifest(manifest);

    // Check for conflicts
    if (this.addons.has(manifest.id)) {
      throw new Error(`Add-on ${manifest.id} is already registered`);
    }

    // Register the add-on
    this.addons.set(manifest.id, manifest);
    this.status.set(manifest.id, {
      installed: true,
      enabled: false,
      version: manifest.version,
      lastUpdated: new Date().toISOString(),
    });

    console.log(`✅ Add-on registered: ${manifest.id} v${manifest.version}`);
  }

  /**
   * Enable an add-on
   */
  async enable(addonId: string, config?: AddonConfig): Promise<void> {
    const manifest = this.addons.get(addonId);
    if (!manifest) {
      throw new Error(`Add-on ${addonId} not found`);
    }

    try {
      // Validate configuration
      if (config && manifest.configSchema) {
        const schema = this.buildConfigSchema(manifest.configSchema);
        schema.parse(config);
      }

      // Store configuration
      this.configs.set(addonId, config || {});

      // Create database tables if needed
      if (manifest.database?.tables) {
        await this.createAddonTables(addonId, manifest.database.tables);
      }

      // Run activation hook
      if (manifest.hooks?.onActivate) {
        await manifest.hooks.onActivate(this.context);
      }

      // Update status
      this.status.set(addonId, {
        ...this.status.get(addonId)!,
        enabled: true,
        enabledAt: new Date().toISOString(),
      });

      // Store in database
      await this.saveAddonState(addonId);

      console.log(`✅ Add-on enabled: ${addonId}`);
    } catch (error) {
      console.error(`Failed to enable add-on ${addonId}:`, error);
      throw error;
    }
  }

  /**
   * Disable an add-on
   */
  async disable(addonId: string): Promise<void> {
    const manifest = this.addons.get(addonId);
    if (!manifest) {
      throw new Error(`Add-on ${addonId} not found`);
    }

    try {
      // Run deactivation hook
      if (manifest.hooks?.onDeactivate) {
        await manifest.hooks.onDeactivate(this.context);
      }

      // Update status
      this.status.set(addonId, {
        ...this.status.get(addonId)!,
        enabled: false,
        disabledAt: new Date().toISOString(),
      });

      // Update database
      await this.saveAddonState(addonId);

      console.log(`✅ Add-on disabled: ${addonId}`);
    } catch (error) {
      console.error(`Failed to disable add-on ${addonId}:`, error);
      throw error;
    }
  }

  /**
   * Get add-on configuration
   */
  getConfig(addonId: string): AddonConfig | undefined {
    return this.configs.get(addonId);
  }

  /**
   * Update add-on configuration
   */
  async updateConfig(addonId: string, config: AddonConfig): Promise<void> {
    const manifest = this.addons.get(addonId);
    if (!manifest) {
      throw new Error(`Add-on ${addonId} not found`);
    }

    // Validate new configuration
    if (manifest.configSchema) {
      const schema = this.buildConfigSchema(manifest.configSchema);
      schema.parse(config);
    }

    // Update configuration
    this.configs.set(addonId, config);

    // Save to database
    await this.saveAddonConfig(addonId, config);

    // Run configuration update hook
    if (manifest.hooks?.onConfigUpdate) {
      await manifest.hooks.onConfigUpdate(config, this.context);
    }
  }

  /**
   * Get all registered add-ons
   */
  getAllAddons(): AddonManifest[] {
    return Array.from(this.addons.values());
  }

  /**
   * Get enabled add-ons
   */
  getEnabledAddons(): AddonManifest[] {
    return Array.from(this.addons.values()).filter(
      addon => this.status.get(addon.id)?.enabled
    );
  }

  /**
   * Check if add-on is enabled
   */
  isEnabled(addonId: string): boolean {
    return this.status.get(addonId)?.enabled || false;
  }

  /**
   * Get add-on status
   */
  getStatus(addonId: string): AddonStatus | undefined {
    return this.status.get(addonId);
  }

  /**
   * Get UI components for enabled add-ons
   */
  getUIComponents(): Map<string, any> {
    const components = new Map();

    for (const [id, manifest] of this.addons) {
      if (this.isEnabled(id) && manifest.ui?.components) {
        components.set(id, manifest.ui.components);
      }
    }

    return components;
  }

  /**
   * Get sidebar items for enabled add-ons
   */
  getSidebarItems(): any[] {
    const items = [];

    for (const [id, manifest] of this.addons) {
      if (this.isEnabled(id) && manifest.ui?.sidebarItems) {
        items.push(...manifest.ui.sidebarItems.map(item => ({
          ...item,
          addonId: id,
        })));
      }
    }

    return items;
  }

  /**
   * Get routes for enabled add-ons
   */
  getRoutes(): any[] {
    const routes = [];

    for (const [id, manifest] of this.addons) {
      if (this.isEnabled(id) && manifest.ui?.routes) {
        routes.push(...manifest.ui.routes.map(route => ({
          ...route,
          addonId: id,
        })));
      }
    }

    return routes;
  }

  /**
   * Create database tables for add-on
   */
  private async createAddonTables(addonId: string, tables: any[]): Promise<void> {
    for (const table of tables) {
      const tableName = `addon_${addonId}_${table.name}`;

      // Build CREATE TABLE query
      const columns = table.columns.map((col: any) => {
        let def = `${col.name} ${col.type}`;
        if (col.primary) def += ' PRIMARY KEY';
        if (col.unique) def += ' UNIQUE';
        if (col.notNull) def += ' NOT NULL';
        if (col.default) def += ` DEFAULT ${col.default}`;
        return def;
      }).join(', ');

      const query = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          ${columns},
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
      `;

      // Execute via Supabase RPC or direct connection
      await this.context.supabase.rpc('execute_sql', { query });

      // Enable RLS
      const rlsQuery = `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`;
      await this.context.supabase.rpc('execute_sql', { query: rlsQuery });

      // Create RLS policies
      if (table.policies) {
        for (const policy of table.policies) {
          const policyQuery = `
            CREATE POLICY "${policy.name}"
            ON ${tableName}
            FOR ${policy.operation}
            TO authenticated
            USING (${policy.using});
          `;
          await this.context.supabase.rpc('execute_sql', { query: policyQuery });
        }
      }

      console.log(`📊 Created table: ${tableName}`);
    }
  }

  /**
   * Save add-on state to database
   */
  private async saveAddonState(addonId: string): Promise<void> {
    const status = this.status.get(addonId);
    const config = this.configs.get(addonId);

    await this.context.supabase
      .from('addon_registry')
      .upsert({
        addon_id: addonId,
        status: status,
        config: config,
        updated_at: new Date().toISOString(),
      });
  }

  /**
   * Save add-on configuration
   */
  private async saveAddonConfig(addonId: string, config: AddonConfig): Promise<void> {
    await this.context.supabase
      .from('addon_configs')
      .upsert({
        addon_id: addonId,
        config: config,
        updated_at: new Date().toISOString(),
      });
  }

  /**
   * Load add-on states from database
   */
  async loadFromDatabase(): Promise<void> {
    const { data: addons } = await this.context.supabase
      .from('addon_registry')
      .select('*');

    if (addons) {
      for (const addon of addons) {
        if (addon.status?.enabled) {
          await this.enable(addon.addon_id, addon.config);
        }
      }
    }
  }

  /**
   * Validate add-on manifest
   */
  private validateManifest(manifest: AddonManifest): void {
    const schema = z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      version: z.string().regex(/^\d+\.\d+\.\d+$/),
      description: z.string(),
      author: z.string().optional(),
      category: z.enum([
        'content',
        'media',
        'seo',
        'analytics',
        'forms',
        'compliance',
        'social',
        'commerce',
        'developer',
      ]),
      permissions: z.array(z.string()).optional(),
      dependencies: z.array(z.string()).optional(),
    });

    schema.parse(manifest);
  }

  /**
   * Build Zod schema from config schema
   */
  private buildConfigSchema(configSchema: any): z.ZodSchema {
    const shape: Record<string, any> = {};

    for (const [key, field] of Object.entries(configSchema)) {
      const fieldDef = field as any;
      let validator: any;

      switch (fieldDef.type) {
        case 'string':
          validator = z.string();
          break;
        case 'number':
          validator = z.number();
          break;
        case 'boolean':
          validator = z.boolean();
          break;
        case 'array':
          validator = z.array(z.any());
          break;
        case 'object':
          validator = z.object({});
          break;
        default:
          validator = z.any();
      }

      if (!fieldDef.required) {
        validator = validator.optional();
      }

      shape[key] = validator;
    }

    return z.object(shape);
  }

  /**
   * Register core add-ons
   */
  private registerCoreAddons(): void {
    // Import core add-ons
    const { CookieNoticeAddon } = require('../addons/cookie-notice');
    const { ContactFormAddon } = require('../addons/contact-form');
    const { NewsletterAddon } = require('../addons/newsletter');
    const { SEOMetaAddon } = require('../addons/seo-meta');
    const { AccessibilityAddon } = require('../addons/accessibility');

    // Register them
    this.register(CookieNoticeAddon);
    this.register(ContactFormAddon);
    this.register(NewsletterAddon);
    this.register(SEOMetaAddon);
    this.register(AccessibilityAddon);
  }
}