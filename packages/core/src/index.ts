/**
 * @kiban/core - Data Access Layer & Business Logic
 * Framework-agnostic core functionality
 */

// ============================================
// SCHEMA ENGINE
// ============================================

export { SchemaProvider } from './schema/SchemaProvider';

// ============================================
// TYPES (Re-export from @kiban/types)
// ============================================

export type {
  // Content
  ContentNode,
  ContentBlock,
  ContentStatus,
  ContentTranslation,
  ContentVersion,

  // Media
  MediaAsset,
  MediaVariant,
  MediaMetadata,
  MediaProcessingQueue,

  // Organization
  Organization,
  Profile,
  UserRole,

  // Taxonomy
  Taxonomy,
  TaxonomyTranslation,

  // Webhooks
  WebhookEndpoint,
  WebhookEvent,
  WebhookLog,

  // Audit
  AuditLog,
  AuditAction,

  // AI
  AITask,
  AITaskType,

  // Common
  Locale,
  QueryFilters,
  PaginatedResponse,

} from '@kiban/types';
