/**
 * useAddons - Hook for UI Injection
 * Provides access to enabled add-ons UI components and sidebar items
 */

import { useMemo } from 'react';
import type { AddonManager } from '../core/AddonManager';

export function useAddons(manager: AddonManager) {
  const injection = useMemo(() => manager.getUIInjection(), [manager]);

  return {
    components: injection.components,
    sidebarItems: injection.sidebarItems,
    routes: injection.routes,
    
    // Helper to get a component by ID and key
    getComponent: (addonId: string, componentKey: string) => {
      const addonComponents = injection.components.get(addonId);
      return addonComponents ? addonComponents[componentKey] : null;
    },
    
    // Helper to get all components for a specific injection point (e.g., 'dashboard')
    getComponentsForPoint: (point: string) => {
      const components: any[] = [];
      injection.components.forEach((addonComponents) => {
        if (addonComponents[point]) {
          components.push(addonComponents[point]);
        }
      });
      return components;
    }
  };
}
