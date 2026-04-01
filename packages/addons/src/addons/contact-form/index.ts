/**
 * Contact Form Add-on
 * Flexible contact form with submission management
 */

import type { AddonManifest } from '../../types';

export const ContactFormAddon: AddonManifest = {
  id: 'contact-form',
  name: 'Contact Form',
  version: '1.0.0',
  description: 'Create and manage contact forms with custom fields and email notifications',
  author: 'Kiban Agency',
  category: 'forms',
  icon: '📩',

  // Configuration schema
  configSchema: {
    enabled: {
      type: 'boolean',
      label: 'Enable Contact Form',
      defaultValue: true,
      required: true,
    },
    notificationEmail: {
      type: 'string',
      label: 'Notification Email',
      placeholder: 'admin@yoursite.com',
      required: true,
    },
    fields: {
      type: 'array',
      label: 'Form Fields',
      defaultValue: [
        { name: 'name', type: 'text', label: 'Name', required: true },
        { name: 'email', type: 'email', label: 'Email', required: true },
        { name: 'message', type: 'textarea', label: 'Message', required: true },
      ],
    },
    submitButtonText: {
      type: 'string',
      label: 'Submit Button Text',
      defaultValue: 'Send Message',
    },
    successMessage: {
      type: 'string',
      label: 'Success Message',
      defaultValue: 'Thank you! Your message has been sent.',
    },
  },

  // Database tables
  database: {
    tables: [
      {
        name: 'submissions',
        columns: [
          {
            name: 'id',
            type: 'UUID DEFAULT uuid_generate_v4()',
            primary: true,
          },
          {
            name: 'form_id',
            type: 'TEXT',
            notNull: true,
          },
          {
            name: 'data',
            type: 'JSONB',
            notNull: true,
          },
          {
            name: 'ip_address',
            type: 'INET',
          },
          {
            name: 'read',
            type: 'BOOLEAN',
            default: 'false',
          },
        ],
        policies: [
          {
            name: 'public_insert',
            operation: 'INSERT',
            using: 'true',
          },
          {
            name: 'admin_all',
            operation: 'ALL',
            using: "auth.jwt() ->> 'role' IN ('admin', 'editor')",
          },
        ],
      },
    ],
  },

  // UI components
  ui: {
    sidebarItems: [
      {
        id: 'contact-submissions',
        label: 'Form Submissions',
        icon: '📩',
        path: '/admin/contact-form/submissions',
        category: 'forms',
      },
    ],
    routes: [
      {
        path: '/admin/contact-form/submissions',
        component: 'ContactSubmissionsPage',
      },
    ],
  },

  // Lifecycle hooks
  hooks: {
    onActivate: async (context) => {
      console.log('Contact Form activated');
    },
  },
};
