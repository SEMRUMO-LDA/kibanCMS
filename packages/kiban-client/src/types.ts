/**
 * KibanCMS Client Types
 */

export interface KibanClientConfig {
  /** Base URL of your KibanCMS instance */
  url: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: 'post' | 'page' | 'custom';
  fields: FieldDefinition[];
  settings: Record<string, any>;
  icon: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldDefinition {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: any;
}

export interface Entry {
  id: string;
  collection_id: string;
  title: string;
  slug: string;
  content: Record<string, any>;
  excerpt: string | null;
  featured_image: string | null;
  status: 'draft' | 'review' | 'scheduled' | 'published' | 'archived';
  published_at: string | null;
  author_id: string;
  meta: Record<string, any>;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: any;
  timestamp: string;
}

export interface ApiError {
  error: {
    message: string;
    details?: any;
    status: number;
    timestamp: string;
  };
}

export interface QueryOptions {
  /** Filter by status */
  status?: Entry['status'];
  /** Number of results to return */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Field to sort by */
  sort?: string;
  /** Sort order */
  order?: 'asc' | 'desc';
}

export interface CollectionQuery {
  find(options?: QueryOptions): Promise<Entry[]>;
  findOne(filter: { slug: string }): Promise<Entry | null>;
  count(options?: QueryOptions): Promise<number>;
}
