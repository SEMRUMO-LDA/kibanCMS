/**
 * KibanCMS Client SDK
 * Modular, type-safe SDK for all CMS operations
 */

import { supabase } from '../supabase';
import { ContentService } from './services/content.service';
import { MediaService } from './services/media.service';
import { TaxonomyService } from './services/taxonomy.service';
import { AIService } from './services/ai.service';
import { GeoService } from './services/geo.service';
import { I18nService } from './services/i18n.service';
import { SEOService } from './services/seo.service';
import { AnalyticsService } from './services/analytics.service';
import { SecurityMiddleware } from './middleware/security';
import { CacheManager } from './cache/cache-manager';
import type { KibanConfig, KibanContext } from './types';

export class KibanClient {
  private config: KibanConfig;
  private context: KibanContext;

  // Services
  public content: ContentService;
  public media: MediaService;
  public taxonomy: TaxonomyService;
  public ai: AIService;
  public geo: GeoService;
  public i18n: I18nService;
  public seo: SEOService;
  public analytics: AnalyticsService;

  // Utilities
  public cache: CacheManager;
  public security: SecurityMiddleware;

  constructor(config: Partial<KibanConfig> = {}) {
    // Merge with default config
    this.config = {
      supabaseClient: supabase,
      organizationId: null,
      locale: 'pt',
      cacheStrategy: 'swr',
      cacheTTL: 3600,
      enableAI: true,
      enableGeo: true,
      enableAnalytics: true,
      ...config,
    };

    // Initialize context
    this.context = {
      user: null,
      organization: null,
      locale: this.config.locale,
      permissions: [],
    };

    // Initialize utilities
    this.cache = new CacheManager(this.config);
    this.security = new SecurityMiddleware(this.config, this.context);

    // Initialize services
    this.content = new ContentService(this.config, this.context, this.cache);
    this.media = new MediaService(this.config, this.context);
    this.taxonomy = new TaxonomyService(this.config, this.context);
    this.ai = new AIService(this.config, this.context);
    this.geo = new GeoService(this.config, this.context);
    this.i18n = new I18nService(this.config, this.context);
    this.seo = new SEOService(this.config, this.context);
    this.analytics = new AnalyticsService(this.config, this.context);
  }

  /**
   * Initialize the client with authentication
   */
  async initialize(): Promise<void> {
    try {
      // Get current session
      const { data: { session } } = await this.config.supabaseClient.auth.getSession();

      if (session?.user) {
        // Fetch user profile and organization
        const { data: profile } = await this.config.supabaseClient
          .from('profiles')
          .select('*, organization:organizations(*)')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          this.context.user = profile;
          this.context.organization = profile.organization;
          this.context.permissions = profile.permissions || [];
          this.config.organizationId = profile.organization_id;
        }
      }

      // Initialize services
      await Promise.all([
        this.content.initialize(),
        this.media.initialize(),
        this.ai.initialize(),
      ]);
    } catch (error) {
      console.error('Failed to initialize KibanClient:', error);
      throw error;
    }
  }

  /**
   * Set the current locale
   */
  setLocale(locale: string): void {
    this.context.locale = locale;
    this.config.locale = locale;
    this.i18n.setLocale(locale);
  }

  /**
   * Set the current organization
   */
  setOrganization(organizationId: string): void {
    this.config.organizationId = organizationId;
  }

  /**
   * Check if user has permission
   */
  hasPermission(permission: string): boolean {
    return this.security.hasPermission(permission);
  }

  /**
   * Check if user has role
   */
  hasRole(role: string): boolean {
    return this.security.hasRole(role);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current context
   */
  getContext(): KibanContext {
    return { ...this.context };
  }

  /**
   * Subscribe to real-time updates
   */
  subscribe(
    table: string,
    callback: (payload: any) => void,
    filter?: Record<string, any>
  ) {
    const filterString = filter
      ? Object.entries(filter)
          .map(([key, value]) => `${key}=eq.${value}`)
          .join('&')
      : undefined;

    return this.config.supabaseClient
      .channel(`kiban:${table}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: filterString,
        },
        callback
      )
      .subscribe();
  }
}

// Create singleton instance
let kibanClient: KibanClient | null = null;

/**
 * Get or create KibanClient instance
 */
export const getKibanClient = (config?: Partial<KibanConfig>): KibanClient => {
  if (!kibanClient) {
    kibanClient = new KibanClient(config);
  }
  return kibanClient;
};

// Export types and services
export * from './types';
export * from './services/content.service';
export * from './services/media.service';
export * from './services/taxonomy.service';
export * from './services/ai.service';
export * from './services/geo.service';
export * from './services/i18n.service';
export * from './services/seo.service';
export * from './services/analytics.service';
export * from './middleware/security';
export * from './cache/cache-manager';