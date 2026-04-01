/**
 * SEO Meta Add-on
 * Advanced SEO configuration for pages and collections
 */

import type { AddonManifest } from '../../types';

export const SEOMetaAddon: AddonManifest = {
  id: 'seo-meta',
  name: 'SEO Meta',
  version: '1.0.0',
  description: 'Global SEO settings and per-page meta tag management',
  author: 'Kiban Agency',
  category: 'seo',
  icon: '🔍',

  // Configuration schema
  configSchema: {
    siteName: {
      type: 'string',
      label: 'Site Name',
      required: true,
    },
    titleSeparator: {
      type: 'string',
      label: 'Title Separator',
      defaultValue: '|',
    },
    defaultDescription: {
      type: 'textarea',
      label: 'Default Meta Description',
    },
    twitterHandle: {
      type: 'string',
      label: 'Twitter Handle',
      placeholder: '@username',
    },
    defaultOgImage: {
      type: 'image',
      label: 'Default Social Image',
    },
  },

  // Custom UI Injection points
  ui: {
    sidebarItems: [
      {
        id: 'seo-settings',
        label: 'SEO Global Settings',
        icon: '🔍',
        path: '/admin/seo',
        category: 'seo',
      },
    ],
  },

  // Lifecycle hooks
  hooks: {
    onBeforeSave: async (data, context) => {
      // Logic to auto-generate SEO meta if missing
      console.log('SEO Hook: Processing content before save');
      return data;
    },
  },
};
