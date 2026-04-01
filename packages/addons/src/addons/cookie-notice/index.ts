/**
 * Cookie Notice Add-on
 * GDPR-compliant cookie consent management
 */

import type { AddonManifest } from '../../types';
import { CookieNoticeComponent } from './CookieNotice';
import { CookieSettingsPage } from './CookieSettingsPage';

export const CookieNoticeAddon: AddonManifest = {
  id: 'cookie-notice',
  name: 'Cookie Notice',
  version: '1.0.0',
  description: 'GDPR-compliant cookie consent banner with customizable design',
  author: 'Kiban Agency',
  category: 'compliance',
  icon: '🍪',

  // Configuration schema
  configSchema: {
    enabled: {
      type: 'boolean',
      label: 'Enable Cookie Notice',
      defaultValue: true,
      required: true,
    },
    theme: {
      type: 'select',
      label: 'Theme',
      options: ['light', 'dark'],
      defaultValue: 'dark',
    },
    position: {
      type: 'select',
      label: 'Position',
      options: ['top', 'bottom', 'center'],
      defaultValue: 'bottom',
    },
    message: {
      type: 'text',
      label: 'Consent Message',
      defaultValue: 'We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies.',
      localized: true,
    },
    buttonText: {
      type: 'text',
      label: 'Accept Button Text',
      defaultValue: 'Accept',
      localized: true,
    },
    declineText: {
      type: 'text',
      label: 'Decline Button Text',
      defaultValue: 'Decline',
      localized: true,
    },
    policyUrl: {
      type: 'url',
      label: 'Privacy Policy URL',
      defaultValue: '/privacy-policy',
    },
    cookieTypes: {
      type: 'object',
      label: 'Cookie Categories',
      fields: {
        necessary: {
          type: 'boolean',
          label: 'Necessary Cookies',
          defaultValue: true,
          disabled: true, // Always enabled
        },
        analytics: {
          type: 'boolean',
          label: 'Analytics Cookies',
          defaultValue: false,
        },
        marketing: {
          type: 'boolean',
          label: 'Marketing Cookies',
          defaultValue: false,
        },
        preferences: {
          type: 'boolean',
          label: 'Preference Cookies',
          defaultValue: false,
        },
      },
    },
    customCSS: {
      type: 'textarea',
      label: 'Custom CSS',
      placeholder: '.cookie-notice { ... }',
    },
  },

  // Database tables
  database: {
    tables: [
      {
        name: 'consents',
        columns: [
          {
            name: 'id',
            type: 'UUID DEFAULT uuid_generate_v4()',
            primary: true,
          },
          {
            name: 'visitor_id',
            type: 'TEXT',
            notNull: true,
            index: true,
          },
          {
            name: 'ip_address',
            type: 'INET',
          },
          {
            name: 'user_agent',
            type: 'TEXT',
          },
          {
            name: 'consent_given',
            type: 'BOOLEAN',
            notNull: true,
          },
          {
            name: 'categories',
            type: 'JSONB',
            notNull: true,
          },
          {
            name: 'consent_date',
            type: 'TIMESTAMPTZ',
            notNull: true,
            default: 'NOW()',
          },
        ],
        policies: [
          {
            name: 'public_insert',
            operation: 'INSERT',
            using: 'true', // Public can insert consent records
          },
          {
            name: 'admin_select',
            operation: 'SELECT',
            using: "auth.jwt() ->> 'role' IN ('admin', 'editor')",
          },
        ],
      },
    ],
  },

  // UI components
  ui: {
    components: {
      banner: CookieNoticeComponent,
      settings: CookieSettingsPage,
    },
    sidebarItems: [
      {
        id: 'cookie-settings',
        label: 'Cookie Settings',
        icon: '🍪',
        path: '/admin/cookie-notice',
        category: 'compliance',
      },
      {
        id: 'cookie-consents',
        label: 'Cookie Consents',
        icon: '📊',
        path: '/admin/cookie-notice/consents',
        category: 'compliance',
      },
    ],
    routes: [
      {
        path: '/admin/cookie-notice',
        component: 'CookieSettingsPage',
      },
      {
        path: '/admin/cookie-notice/consents',
        component: 'CookieConsentsPage',
      },
    ],
  },

  // Lifecycle hooks
  hooks: {
    onActivate: async (context) => {
      console.log('Cookie Notice activated');
      // Initialize default settings
      await context.supabase
        .from('addon_configs')
        .upsert({
          addon_id: 'cookie-notice',
          config: {
            enabled: true,
            theme: 'dark',
            position: 'bottom',
          },
        });
    },

    onDeactivate: async (context) => {
      console.log('Cookie Notice deactivated');
    },

    onConfigUpdate: async (config, context) => {
      console.log('Cookie Notice config updated:', config);
      // Invalidate cache
      await context.cache?.invalidate('cookie-notice-config');
    },
  },

  // Permissions required
  permissions: ['addon:cookie-notice:manage'],

  // Dependencies
  dependencies: [],

  // API endpoints
  api: {
    endpoints: [
      {
        method: 'POST',
        path: '/api/cookie-consent',
        handler: 'handleCookieConsent',
      },
      {
        method: 'GET',
        path: '/api/cookie-consent/:visitorId',
        handler: 'getCookieConsent',
      },
    ],
  },
};

// Export component for direct use
export { CookieNoticeComponent as KibanCookieNotice } from './CookieNotice';
export { useCookieConsent } from './hooks/useCookieConsent';