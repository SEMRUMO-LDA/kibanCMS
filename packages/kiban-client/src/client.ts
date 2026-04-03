import type {
  KibanClientConfig,
  Collection,
  Entry,
  QueryOptions,
  CollectionQuery,
  ApiResponse,
  ApiError,
} from './types';

export class KibanClient {
  private config: Required<KibanClientConfig>;

  constructor(config: KibanClientConfig) {
    if (!config.url) {
      throw new Error('KibanClient: url is required');
    }
    if (!config.apiKey) {
      throw new Error('KibanClient: apiKey is required');
    }

    this.config = {
      url: config.url.replace(/\/$/, ''), // Remove trailing slash
      apiKey: config.apiKey,
      timeout: config.timeout || 10000,
      fetch: config.fetch || globalThis.fetch.bind(globalThis),
    };
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.url}/api/v1${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await this.config.fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle error responses
      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result: ApiResponse<T> = await response.json();
      return result.data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    }
  }

  /**
   * Get all collections
   */
  async getCollections(): Promise<Collection[]> {
    return this.request<Collection[]>('/collections');
  }

  /**
   * Get a single collection by slug
   */
  async getCollection(slug: string): Promise<Collection> {
    return this.request<Collection>(`/collections/${slug}`);
  }

  /**
   * Get entries from a collection
   */
  async getEntries(collectionSlug: string, options: QueryOptions = {}): Promise<Entry[]> {
    const params = new URLSearchParams();

    if (options.status) params.append('status', options.status);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    if (options.sort) params.append('sort', options.sort);
    if (options.order) params.append('order', options.order);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<Entry[]>(`/entries/${collectionSlug}${query}`);
  }

  /**
   * Get a single entry by slug
   */
  async getEntry(collectionSlug: string, entrySlug: string): Promise<Entry> {
    return this.request<Entry>(`/entries/${collectionSlug}/${entrySlug}`);
  }

  /**
   * Fluent query builder for collections
   *
   * @example
   * const posts = await kiban.collection('blog').find({ status: 'published' })
   */
  collection(slug: string): CollectionQuery {
    return {
      find: (options?: QueryOptions) => this.getEntries(slug, options),
      findOne: async (filter: { slug: string }) => {
        try {
          return await this.getEntry(slug, filter.slug);
        } catch (error) {
          return null;
        }
      },
      count: async (options?: QueryOptions) => {
        const entries = await this.getEntries(slug, options);
        return entries.length;
      },
    };
  }
}
