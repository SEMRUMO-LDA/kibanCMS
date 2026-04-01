/**
 * KibanClient - Core client for all CMS operations
 * Framework-agnostic, pure TypeScript implementation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { KibanConfig, Database } from '@kiban/types';

import { ContentService } from '../services/ContentService';
import { MediaService } from '../services/MediaService';
import { TaxonomyService } from '../services/TaxonomyService';
import { AuthService } from '../services/AuthService';
import { OrganizationService } from '../services/OrganizationService';
import { WebhookService } from '../services/WebhookService';
import { AuditService } from '../services/AuditService';
import { AIService } from '../services/AIService';
import { GeoService } from '../services/GeoService';
import { I18nService } from '../services/I18nService';
import { SEOService } from '../services/SEOService';
import { AnalyticsService } from '../services/AnalyticsService';

import { EventBus } from '../utils/events';
import { Cache } from '../utils/cache';
import { Logger } from '../utils/logger';
import { PluginManager } from '../plugins';
import { SecurityMiddleware } from '../middleware/security';

export class KibanClient {
  private config: KibanConfig;
  private supabase: SupabaseClient<Database>;
  private eventBus: EventBus;
  private cache: Cache;
  private logger: Logger;
  private pluginManager: PluginManager;
  private security: SecurityMiddleware;

  // Services
  public readonly content: ContentService;
  public readonly media: MediaService;
  public readonly taxonomy: TaxonomyService;
  public readonly auth: AuthService;
  public readonly organization: OrganizationService;
  public readonly webhook: WebhookService;
  public readonly audit: AuditService;
  public readonly ai: AIService;
  public readonly geo: GeoService;
  public readonly i18n: I18nService;
  public readonly seo: SEOService;
  public readonly analytics: AnalyticsService;

  constructor(config: KibanConfig) {
    this.config = config;
    this.supabase = config.supabaseClient;

    // Initialize core utilities
    this.eventBus = new EventBus();
    this.cache = new Cache(config.cache);
    this.logger = new Logger(config.logging);
    this.pluginManager = new PluginManager(this);
    this.security = new SecurityMiddleware(config.security);

    // Initialize services with dependency injection
    const context = {
      supabase: this.supabase,
      config: this.config,
      eventBus: this.eventBus,
      cache: this.cache,
      logger: this.logger,
      security: this.security,
    };

    this.content = new ContentService(context);
    this.media = new MediaService(context);
    this.taxonomy = new TaxonomyService(context);
    this.auth = new AuthService(context);
    this.organization = new OrganizationService(context);
    this.webhook = new WebhookService(context);
    this.audit = new AuditService(context);
    this.ai = new AIService(context);
    this.geo = new GeoService(context);
    this.i18n = new I18nService(context);
    this.seo = new SEOService(context);
    this.analytics = new AnalyticsService(context);

    // Initialize plugins
    this.initializePlugins();
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    try {
      // Emit initialization event
      await this.eventBus.emit('client:initializing');

      // Initialize auth session
      const session = await this.auth.getSession();
      if (session) {
        await this.auth.setUser(session.user);
        this.config.organizationId = session.user.user_metadata?.organization_id;
      }

      // Initialize services
      await Promise.all([
        this.content.initialize(),
        this.media.initialize(),
        this.ai.initialize(),
      ]);

      // Load plugins
      await this.pluginManager.loadPlugins(this.config.plugins || []);

      // Emit ready event
      await this.eventBus.emit('client:ready', { client: this });

      this.logger.info('KibanClient initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize KibanClient', error);
      throw error;
    }
  }

  /**
   * Initialize plugins system
   */
  private initializePlugins(): void {
    // Register core plugin hooks
    this.pluginManager.registerHook('beforeContentCreate');
    this.pluginManager.registerHook('afterContentCreate');
    this.pluginManager.registerHook('beforeContentUpdate');
    this.pluginManager.registerHook('afterContentUpdate');
    this.pluginManager.registerHook('beforeContentDelete');
    this.pluginManager.registerHook('afterContentDelete');
    this.pluginManager.registerHook('beforeMediaUpload');
    this.pluginManager.registerHook('afterMediaUpload');
    this.pluginManager.registerHook('beforeAuth');
    this.pluginManager.registerHook('afterAuth');
  }

  /**
   * Subscribe to events
   */
  on(event: string, handler: Function): () => void {
    return this.eventBus.on(event, handler);
  }

  /**
   * Emit events
   */
  async emit(event: string, data?: any): Promise<void> {
    await this.eventBus.emit(event, data);
  }

  /**
   * Register a plugin
   */
  async registerPlugin(plugin: any): Promise<void> {
    await this.pluginManager.register(plugin);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<KibanConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<KibanConfig>): void {
    this.config = { ...this.config, ...config };
    this.eventBus.emit('config:updated', this.config);
  }

  /**
   * Clear all caches
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
    this.logger.info('All caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Subscribe to real-time updates
   */
  subscribe(
    channel: string,
    callback: (payload: any) => void,
    options?: any
  ) {
    return this.supabase
      .channel(channel)
      .on('postgres_changes', options || { event: '*', schema: 'public' }, callback)
      .subscribe();
  }

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel: any): Promise<void> {
    await this.supabase.removeChannel(channel);
  }

  /**
   * Execute raw SQL query (admin only)
   */
  async rawQuery<T = any>(query: string, params?: any[]): Promise<T[]> {
    if (!this.security.hasRole('admin')) {
      throw new Error('Unauthorized: Admin access required');
    }

    const { data, error } = await this.supabase.rpc('exec_sql', {
      query,
      params,
    });

    if (error) throw error;
    return data as T[];
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    timestamp: string;
  }> {
    const checks = await Promise.allSettled([
      this.supabase.from('profiles').select('count').single(),
      this.cache.get('health:check'),
      this.eventBus.emit('health:check'),
    ]);

    const allHealthy = checks.every(check => check.status === 'fulfilled');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      services: {
        database: checks[0].status === 'fulfilled',
        cache: checks[1].status === 'fulfilled',
        events: checks[2].status === 'fulfilled',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Destroy client and cleanup resources
   */
  async destroy(): Promise<void> {
    await this.eventBus.emit('client:destroying');
    await this.cache.clear();
    await this.pluginManager.unloadAll();
    this.eventBus.removeAllListeners();
    this.logger.info('KibanClient destroyed');
  }
}