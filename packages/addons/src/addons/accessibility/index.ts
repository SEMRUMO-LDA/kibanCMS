/**
 * Accessibility Add-on
 * Visual preferences widget for WCAG compliance (European Accessibility Act 2025)
 */

import type { AddonManifest } from '../../types';
import { AccessibilityWidget } from './AccessibilityWidget';
import { AccessibilitySettingsPage } from './AccessibilitySettingsPage';

export const AccessibilityAddon: AddonManifest = {
  id: 'accessibility',
  name: 'Accessibility',
  version: '1.0.0',
  description: 'Visual preferences widget — font size, contrast, reduced motion, line spacing',
  author: 'Kiban Agency',
  category: 'compliance',
  icon: '♿',

  configSchema: {
    enabled: {
      type: 'boolean',
      label: 'Enable Accessibility Widget',
      defaultValue: true,
      required: true,
    },
    position: {
      type: 'select',
      label: 'Widget Position',
      options: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
      defaultValue: 'bottom-left',
    },
    features: {
      type: 'object',
      label: 'Available Features',
      fields: {
        fontSize: {
          type: 'boolean',
          label: 'Font Size Adjustment',
          defaultValue: true,
        },
        contrast: {
          type: 'boolean',
          label: 'High Contrast Mode',
          defaultValue: true,
        },
        reducedMotion: {
          type: 'boolean',
          label: 'Reduce Animations',
          defaultValue: true,
        },
        lineSpacing: {
          type: 'boolean',
          label: 'Line Spacing Adjustment',
          defaultValue: true,
        },
        largeCursor: {
          type: 'boolean',
          label: 'Large Cursor',
          defaultValue: true,
        },
        textAlign: {
          type: 'boolean',
          label: 'Readable Text Alignment',
          defaultValue: false,
        },
      },
    },
    theme: {
      type: 'select',
      label: 'Widget Theme',
      options: ['auto', 'light', 'dark'],
      defaultValue: 'auto',
    },
    buttonLabel: {
      type: 'text',
      label: 'Button Aria Label',
      defaultValue: 'Accessibility settings',
      localized: true,
    },
    customCSS: {
      type: 'textarea',
      label: 'Custom CSS',
      placeholder: '.a11y-widget { ... }',
    },
  },

  // No database tables needed — preferences stored in localStorage
  database: { tables: [] },

  ui: {
    components: {
      widget: AccessibilityWidget,
      settings: AccessibilitySettingsPage,
    },
    sidebarItems: [
      {
        id: 'a11y-settings',
        label: 'Accessibility',
        icon: '♿',
        path: '/admin/accessibility',
        category: 'compliance',
      },
    ],
    routes: [
      {
        path: '/admin/accessibility',
        component: 'AccessibilitySettingsPage',
      },
    ],
  },

  hooks: {
    onActivate: async (context) => {
      console.log('Accessibility addon activated');
      await context.supabase
        .from('addon_configs')
        .upsert({
          addon_id: 'accessibility',
          config: {
            enabled: true,
            position: 'bottom-left',
            features: {
              fontSize: true,
              contrast: true,
              reducedMotion: true,
              lineSpacing: true,
              largeCursor: true,
              textAlign: false,
            },
            theme: 'auto',
          },
        });
    },
    onDeactivate: async () => {
      console.log('Accessibility addon deactivated');
    },
  },

  permissions: ['addon:accessibility:manage'],
  dependencies: [],
};

export { AccessibilityWidget as KibanAccessibilityWidget } from './AccessibilityWidget';
