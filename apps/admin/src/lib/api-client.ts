/**
 * Centralized API Client for Admin Panel
 * All API requests should go through this client
 */

import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:5001');

/**
 * Get the current auth token from Supabase session.
 * If the session is expired, force a refresh before returning.
 */
async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session) return null;

  // If the token expires within 60 seconds, refresh proactively
  const expiresAt = session.expires_at ?? 0;
  const nowSecs = Math.floor(Date.now() / 1000);

  if (expiresAt - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token || session.access_token;
  }

  return session.access_token;
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const token = await getAuthToken();

    if (!token) {
      console.error('[API Client] No auth token available');
      return { data: null, error: 'Not authenticated' };
    }

    const url = `${API_URL}${endpoint}`;
    console.log('[API Client] Request:', options.method || 'GET', url);
    console.log('[API Client] Token preview:', token.substring(0, 20) + '...');

    console.log('[API Client] Sending fetch...');
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    console.log('[API Client] Response:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API Client] Error response:', errorText);

      let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return { data: null, error: errorMessage };
    }

    const responseData = await response.json();
    console.log('[API Client] Success:', { dataType: typeof responseData });

    // API returns { data: T, meta?: any, timestamp: string }
    // Extract the actual data
    const data = responseData.data !== undefined ? responseData.data : responseData;

    return { data, error: null };
  } catch (err: any) {
    console.error('[API Client] Request failed:', err);
    return { data: null, error: err.message || 'Request failed' };
  }
}

// ============================================
// COLLECTIONS API
// ============================================

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: 'post' | 'page' | 'custom';
  icon: string | null;
  color: string | null;
  fields: any;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCollectionPayload {
  name: string;
  slug: string;
  description?: string;
  type: 'post' | 'page' | 'custom';
  icon?: string | null;
  color?: string | null;
  fields: any[];
}

export const collections = {
  /**
   * List all collections
   */
  list: async () => {
    return apiRequest<Collection[]>('/api/v1/collections');
  },

  /**
   * Get a single collection by slug
   */
  get: async (slug: string) => {
    return apiRequest<Collection>(`/api/v1/collections/${slug}`);
  },

  /**
   * Create a new collection
   */
  create: async (payload: CreateCollectionPayload) => {
    return apiRequest<Collection>('/api/v1/collections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Update a collection
   */
  update: async (slug: string, payload: Partial<CreateCollectionPayload>) => {
    return apiRequest<Collection>(`/api/v1/collections/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Delete a collection
   */
  delete: async (slug: string) => {
    return apiRequest<void>(`/api/v1/collections/${slug}`, {
      method: 'DELETE',
    });
  },
};

// ============================================
// ENTRIES API
// ============================================

export interface Entry {
  id: string;
  collection_slug: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  data: any;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
}

export const entries = {
  /**
   * List entries for a collection
   */
  list: async (collectionSlug: string, params?: { status?: string; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const query = queryParams.toString();
    const endpoint = `/api/v1/entries/${collectionSlug}${query ? `?${query}` : ''}`;

    return apiRequest<Entry[]>(endpoint);
  },

  /**
   * Get a single entry by slug
   */
  get: async (collectionSlug: string, entrySlug: string) => {
    return apiRequest<Entry>(`/api/v1/entries/${collectionSlug}/${entrySlug}`);
  },

  /**
   * Create a new entry
   */
  create: async (collectionSlug: string, payload: any) => {
    return apiRequest<Entry>(`/api/v1/entries/${collectionSlug}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Update an entry
   */
  update: async (collectionSlug: string, entrySlug: string, payload: any) => {
    return apiRequest<Entry>(`/api/v1/entries/${collectionSlug}/${entrySlug}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Delete an entry
   */
  delete: async (collectionSlug: string, entrySlug: string) => {
    return apiRequest<void>(`/api/v1/entries/${collectionSlug}/${entrySlug}`, {
      method: 'DELETE',
    });
  },
};

// ============================================
// WEBHOOKS API
// ============================================

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  created_at?: string;
}

export const webhooks = {
  /**
   * List all webhooks
   */
  list: async () => {
    return apiRequest<Webhook[]>('/api/v1/webhooks');
  },

  /**
   * Create a new webhook
   */
  create: async (payload: { url: string; events: string[]; secret?: string }) => {
    return apiRequest<Webhook>('/api/v1/webhooks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Delete a webhook
   */
  delete: async (id: string) => {
    return apiRequest<void>(`/api/v1/webhooks/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================
// MEDIA API
// ============================================

export interface MediaFile {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  bucket_name: string;
  alt_text: string | null;
  caption: string | null;
  folder_path: string;
  is_public: boolean;
  url?: string;
  created_at?: string;
  updated_at?: string;
}

export const media = {
  list: async (params?: { type?: string; search?: string; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return apiRequest<MediaFile[]>(`/api/v1/media${query ? `?${query}` : ''}`);
  },

  get: async (id: string) => {
    return apiRequest<MediaFile>(`/api/v1/media/${id}`);
  },

  upload: async (payload: { file: string; filename: string; mime_type: string; alt_text?: string }) => {
    return apiRequest<MediaFile>('/api/v1/media/upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update: async (id: string, payload: { alt_text?: string; caption?: string }) => {
    return apiRequest<MediaFile>(`/api/v1/media/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  delete: async (id: string) => {
    return apiRequest<void>(`/api/v1/media/${id}`, { method: 'DELETE' });
  },
};

// ============================================
// USERS API
// ============================================

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at?: string;
  updated_at?: string;
}

export const users = {
  list: async (params?: { role?: string; search?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.role) queryParams.append('role', params.role);
    if (params?.search) queryParams.append('search', params.search);
    const query = queryParams.toString();
    return apiRequest<User[]>(`/api/v1/users${query ? `?${query}` : ''}`);
  },

  get: async (id: string) => {
    return apiRequest<User>(`/api/v1/users/${id}`);
  },

  updateRole: async (id: string, role: string) => {
    return apiRequest<User>(`/api/v1/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  invite: async (payload: { email: string; role?: string; full_name?: string }) => {
    return apiRequest<User>('/api/v1/users/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  delete: async (id: string) => {
    return apiRequest<void>(`/api/v1/users/${id}`, { method: 'DELETE' });
  },
};

// Export the API client
export const api = {
  collections,
  entries,
  webhooks,
  media,
  users,
};

export default api;
