/**
 * Channel Manager Add-on
 *
 * Liga o KIBAN a Channel Managers existentes (Bokun, FareHarbor, …) que
 * tratam da distribuição multi-canal. O CM é a fonte de verdade para
 * inventário e bookings vindos de OTAs (Viator/TripAdvisor, GetYourGuide,
 * Booking, etc.); o KIBAN actua como o backoffice que recebe e mostra.
 *
 * Sprint 1 entrega:
 *   - Webhook inbound (HMAC-verified) com normalização → entries.bookings
 *   - Bokun adapter (validateCredentials + verifyWebhook)
 *   - Admin UI para gerir conexões e ver log de eventos
 *
 * Sprint 2 (deferido): pull de produtos, push de availability, adaptadores
 * para outros providers.
 */

import type { AddonManifest } from '../../types';
// Settings UI lives in apps/admin/src/pages/ChannelManagerSettings.tsx because
// it depends on the admin's authenticated API client (JWT). The manifest only
// references it by name; the App.tsx router does the actual wiring.

export const ChannelManagerAddon: AddonManifest = {
  id: 'channel-manager',
  name: 'Channel Manager',
  version: '0.1.0',
  description: 'Recebe bookings de Channel Managers externos (Bokun, FareHarbor, …) e regista-os como bookings KIBAN.',
  author: 'Kiban Agency',
  category: 'commerce',
  icon: '🔗',

  configSchema: {
    enabled: {
      type: 'boolean',
      label: 'Enable Channel Manager',
      defaultValue: true,
    },
  },

  database: {
    tables: [
      // Schema is defined in database/migrations/007_channel_manager.sql.
      // The addon manifest declares them here for documentation.
      {
        name: 'channel_connections',
        columns: [
          { name: 'id', type: 'UUID DEFAULT uuid_generate_v4()', primary: true },
          { name: 'provider', type: 'TEXT', notNull: true },
          { name: 'enabled', type: 'BOOLEAN', notNull: true, default: 'true' },
          { name: 'credentials', type: 'JSONB', notNull: true, default: "'{}'::jsonb" },
          { name: 'webhook_secret', type: 'TEXT' },
          { name: 'last_sync_at', type: 'TIMESTAMPTZ' },
          { name: 'last_sync_status', type: 'TEXT' },
          { name: 'last_sync_error', type: 'TEXT' },
        ],
      },
      {
        name: 'channel_bookings_log',
        columns: [
          { name: 'id', type: 'UUID DEFAULT uuid_generate_v4()', primary: true },
          { name: 'provider', type: 'TEXT', notNull: true, index: true },
          { name: 'external_id', type: 'TEXT', notNull: true },
          { name: 'event_type', type: 'TEXT', notNull: true },
          { name: 'payload', type: 'JSONB', notNull: true },
          { name: 'status', type: 'TEXT', notNull: true, default: "'received'" },
          { name: 'error', type: 'TEXT' },
          { name: 'entry_id', type: 'UUID' },
          { name: 'received_at', type: 'TIMESTAMPTZ', notNull: true, default: 'NOW()' },
          { name: 'processed_at', type: 'TIMESTAMPTZ' },
        ],
      },
    ],
  },

  ui: {
    components: {
      settings: 'ChannelManagerSettings',
    },
    sidebarItems: [
      {
        id: 'channel-manager',
        label: 'Channel Manager',
        icon: '🔗',
        path: '/admin/channel-manager',
        category: 'commerce',
      },
    ],
    routes: [
      {
        path: '/admin/channel-manager',
        component: 'ChannelManagerSettingsPage',
      },
    ],
  },

  permissions: ['addon:channel-manager:manage'],

  dependencies: [],

  api: {
    endpoints: [
      { method: 'POST',   path: '/api/v1/channel-manager/webhook/:provider',     handler: 'channelManagerWebhook' },
      { method: 'GET',    path: '/api/v1/channel-manager/providers',             handler: 'listProviders' },
      { method: 'GET',    path: '/api/v1/channel-manager/connections',           handler: 'listConnections' },
      { method: 'POST',   path: '/api/v1/channel-manager/connections',           handler: 'createConnection' },
      { method: 'PUT',    path: '/api/v1/channel-manager/connections/:id',       handler: 'updateConnection' },
      { method: 'DELETE', path: '/api/v1/channel-manager/connections/:id',       handler: 'deleteConnection' },
      { method: 'POST',   path: '/api/v1/channel-manager/connections/:id/test',  handler: 'testConnection' },
      { method: 'GET',    path: '/api/v1/channel-manager/log',                   handler: 'listLog' },
    ],
  },
};
