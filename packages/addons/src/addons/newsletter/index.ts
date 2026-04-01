/**
 * Newsletter Add-on
 * Simple newsletter subscription and subscriber management
 */

import type { AddonManifest } from '../../types';

export const NewsletterAddon: AddonManifest = {
  id: 'newsletter',
  name: 'Newsletter',
  version: '1.0.0',
  description: 'Add a newsletter subscription form to your site and manage segments',
  author: 'Kiban Agency',
  category: 'social',
  icon: '📬',

  // Configuration schema
  configSchema: {
    doubleOptIn: {
      type: 'boolean',
      label: 'Enable Double Opt-in',
      defaultValue: true,
    },
    defaultSegment: {
      type: 'string',
      label: 'Default Segment',
      defaultValue: 'general',
    },
    successMessage: {
      type: 'string',
      label: 'Subscription Success Message',
      defaultValue: 'Welcome to our newsletter!',
    },
  },

  // Database tables
  database: {
    tables: [
      {
        name: 'subscribers',
        columns: [
          {
            name: 'id',
            type: 'UUID DEFAULT uuid_generate_v4()',
            primary: true,
          },
          {
            name: 'email',
            type: 'TEXT',
            notNull: true,
            unique: true,
          },
          {
            name: 'name',
            type: 'TEXT',
          },
          {
            name: 'status',
            type: 'TEXT',
            default: "'active'", // active, unsubscribed, pending
          },
          {
            name: 'segments',
            type: 'JSONB',
            default: "'[]'",
          },
          {
            name: 'metadata',
            type: 'JSONB',
          },
        ],
        policies: [
          {
            name: 'public_subscribe',
            operation: 'INSERT',
            using: 'true',
          },
          {
            name: 'admin_manage',
            operation: 'ALL',
            using: "auth.jwt() ->> 'role' IN ('admin')",
          },
        ],
      },
    ],
  },

  // UI items
  ui: {
    sidebarItems: [
      {
        id: 'newsletter-subscribers',
        label: 'Subscribers',
        icon: '👥',
        path: '/admin/newsletter/subscribers',
        category: 'social',
      },
    ],
  },
};
