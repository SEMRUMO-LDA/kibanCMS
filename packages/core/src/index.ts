/**
 * @kiban/core - Data Access Layer & Business Logic
 * Framework-agnostic core functionality
 */

// ============================================
// MAIN CLIENT
// ============================================

export { KibanClient } from './client/KibanClient';
export { KibanConfig, createKibanClient } from './client/config';

// ============================================
// SERVICES (Business Logic)
// ============================================

export { ContentService } from './services/ContentService';
export { MediaService } from './services/MediaService';
export { TaxonomyService } from './services/TaxonomyService';
export { AuthService } from './services/AuthService';
export { OrganizationService } from './services/OrganizationService';
export { WebhookService } from './services/WebhookService';
export { AuditService } from './services/AuditService';
export { AIService } from './services/AIService';
export { GeoService } from './services/GeoService';
export { I18nService } from './services/I18nService';
export { SEOService } from './services/SEOService';
export { AnalyticsService } from './services/AnalyticsService';

// ============================================
// REPOSITORIES (Data Access)
// ============================================

export { ContentRepository } from './repositories/ContentRepository';
export { MediaRepository } from './repositories/MediaRepository';
export { TaxonomyRepository } from './repositories/TaxonomyRepository';
export { ProfileRepository } from './repositories/ProfileRepository';
export { OrganizationRepository } from './repositories/OrganizationRepository';
export { WebhookRepository } from './repositories/WebhookRepository';
export { AuditRepository } from './repositories/AuditRepository';

// ============================================
// UTILITIES
// ============================================

export { Cache, CacheStrategy } from './utils/cache';
export { EventBus } from './utils/events';
export { Logger } from './utils/logger';
export { Validator } from './utils/validator';
export { Sanitizer } from './utils/sanitizer';
export { Slugify } from './utils/slugify';
export { RateLimiter } from './utils/rate-limiter';
export { Queue } from './utils/queue';

// ============================================
// MIDDLEWARE
// ============================================

export { SecurityMiddleware } from './middleware/security';
export { ValidationMiddleware } from './middleware/validation';
export { CacheMiddleware } from './middleware/cache';
export { LoggingMiddleware } from './middleware/logging';

// ============================================
// PLUGINS SYSTEM
// ============================================

export { Plugin, PluginManager } from './plugins';
export type { PluginContext, PluginHooks } from './plugins/types';

// ============================================
// ERRORS
// ============================================

export {
  KibanError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
} from './errors';

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