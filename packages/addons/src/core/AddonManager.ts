/**
 * AddonManager - High-level service for add-on management
 * Handles installation, activation, and UI state
 */

import { AddonRegistry } from './AddonRegistry';
import type { AddonContext, AddonManifest, AddonStatus } from '../types';

export class AddonManager {
  private registry: AddonRegistry;
  private context: AddonContext;

  constructor(context: AddonContext) {
    this.context = context;
    this.registry = new AddonRegistry(context);
  }

  /**
   * Initialize manager and load states
   */
  async initialize(): Promise<void> {
    await this.registry.loadFromDatabase();
    console.log('🚀 AddonManager initialized');
  }

  /**
   * Get all available add-ons
   */
  getAvailableAddons(): AddonManifest[] {
    return this.registry.getAllAddons();
  }

  /**
   * Get enabled add-ons
   */
  getEnabledAddons(): AddonManifest[] {
    return this.registry.getEnabledAddons();
  }

  /**
   * Enable an add-on
   */
  async enableAddon(addonId: string, config?: any): Promise<void> {
    const addon = this.registry.getAllAddons().find(a => a.id === addonId);
    if (!addon) throw new Error(`Add-on ${addonId} not found`);

    // Check dependencies
    if (addon.dependencies) {
      for (const depId of addon.dependencies) {
        if (!this.registry.isEnabled(depId)) {
          throw new Error(`dependency_missing: Add-on ${addonId} requires ${depId}`);
        }
      }
    }

    await this.registry.enable(addonId, config);
  }

  /**
   * Disable an add-on
   */
  async disableAddon(addonId: string): Promise<void> {
    // Check if other enabled add-ons depend on this one
    const dependents = this.registry.getEnabledAddons().filter(
      a => a.dependencies?.includes(addonId)
    );

    if (dependents.length > 0) {
      const dependentNames = dependents.map(a => a.name).join(', ');
      throw new Error(`dependency_conflict: Cannot disable ${addonId} because these add-ons depend on it: ${dependentNames}`);
    }

    await this.registry.disable(addonId);
  }

  /**
   * Update add-on configuration
   */
  async updateAddonConfig(addonId: string, config: any): Promise<void> {
    await this.registry.updateConfig(addonId, config);
  }

  /**
   * Get add-on status
   */
  getAddonStatus(addonId: string): AddonStatus | undefined {
    return this.registry.getStatus(addonId);
  }

  /**
   * Get UI items for injection
   */
  getUIInjection(): {
    components: Map<string, any>;
    sidebarItems: any[];
    routes: any[];
  } {
    return {
      components: this.registry.getUIComponents(),
      sidebarItems: this.registry.getSidebarItems(),
      routes: this.registry.getRoutes(),
    };
  }

  /**
   * Get the registry instance (for advanced use)
   */
  getRegistry(): AddonRegistry {
    return this.registry;
  }
}
