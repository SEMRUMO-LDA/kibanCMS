/**
 * Admin API Client
 *
 * All admin data flows through OUR API server (which uses service role key).
 * This eliminates RLS issues, JWT/token problems, and Supabase direct dependency.
 *
 * The API server is the same origin in production (unified server).
 * Auth: JWT token from Supabase auth (passed in Authorization header).
 */

import { supabase, getTenantId } from './supabase';

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/v1';

interface ApiResponse<T = any> {
  data: T;
  meta?: any;
  message?: string;
  timestamp: string;
}

interface ApiError {
  error: {
    message: string;
    status: number;
  };
}

class ApiClient {
  private async getToken(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || null;
    } catch {
      return null;
    }
  }

  private async request<T = any>(
    method: string,
    path: string,
    body?: any,
    timeout = 10000
  ): Promise<{ data: T | null; error: string | null; meta?: any }> {
    const token = await this.getToken();
    if (!token) {
      return { data: null, error: 'Not authenticated' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };
      const tenantId = getTenantId();
      if (tenantId) {
        headers['X-Tenant'] = tenantId;
      }

      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const json = await res.json();

      if (!res.ok) {
        return { data: null, error: (json as ApiError).error?.message || `HTTP ${res.status}` };
      }

      const response = json as ApiResponse<T>;
      return { data: response.data, error: null, meta: response.meta };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        return { data: null, error: 'Request timeout' };
      }
      return { data: null, error: err.message || 'Network error' };
    }
  }

  // ── Collections ──
  async getCollections() {
    return this.request<any[]>('GET', '/collections');
  }

  async getCollection(slug: string) {
    return this.request<any>('GET', `/collections/${slug}`);
  }

  async createCollection(data: any) {
    return this.request<any>('POST', '/collections', data);
  }

  async updateCollection(slug: string, data: any) {
    return this.request<any>('PUT', `/collections/${slug}`, data);
  }

  async deleteCollection(slug: string) {
    return this.request<any>('DELETE', `/collections/${slug}`);
  }

  // ── Entries ──
  async getEntries(collectionSlug: string, params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>('GET', `/entries/${collectionSlug}${qs}`);
  }

  async getEntry(collectionSlug: string, entrySlug: string) {
    return this.request<any>('GET', `/entries/${collectionSlug}/${entrySlug}`);
  }

  async createEntry(collectionSlug: string, data: any) {
    return this.request<any>('POST', `/entries/${collectionSlug}`, data);
  }

  async updateEntry(collectionSlug: string, entrySlug: string, data: any) {
    return this.request<any>('PUT', `/entries/${collectionSlug}/${entrySlug}`, data);
  }

  async deleteEntry(collectionSlug: string, entrySlug: string) {
    return this.request<any>('DELETE', `/entries/${collectionSlug}/${entrySlug}`);
  }

  // ── Users ──
  async getUsers(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>('GET', `/users${qs}`);
  }

  async updateUser(id: string, data: any) {
    return this.request<any>('PATCH', `/users/${id}`, data);
  }

  async deleteUser(id: string) {
    return this.request<any>('DELETE', `/users/${id}`);
  }

  // ── Media ──
  async getMedia(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>('GET', `/media${qs}`);
  }

  async deleteMedia(id: string) {
    return this.request<any>('DELETE', `/media/${id}`);
  }

  /** Upload file via multipart/form-data to API server */
  async uploadMedia(file: File, options?: { alt_text?: string; folder_path?: string; is_public?: boolean }): Promise<{ data: any | null; error: string | null }> {
    const token = await this.getToken();
    if (!token) return { data: null, error: 'Not authenticated' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000); // 60s for uploads

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.alt_text) formData.append('alt_text', options.alt_text);
      if (options?.folder_path) formData.append('folder_path', options.folder_path);
      if (options?.is_public !== undefined) formData.append('is_public', String(options.is_public));

      const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
      const tenantId = getTenantId();
      if (tenantId) headers['X-Tenant'] = tenantId;

      const res = await fetch(`${API_BASE}/media/upload`, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const json = await res.json();

      if (!res.ok) return { data: null, error: json.error?.message || `HTTP ${res.status}` };
      return { data: json.data, error: null };
    } catch (err: any) {
      clearTimeout(timer);
      return { data: null, error: err.name === 'AbortError' ? 'Upload timeout' : err.message };
    }
  }

  // ── Webhooks ──
  async getWebhooks() {
    return this.request<any[]>('GET', '/webhooks');
  }

  // ── Email ──
  async sendTestEmail(to: string) {
    return this.request<any>('POST', '/email/test', { to });
  }

  // ── AI ──
  async generateCollection(image: string, context?: string) {
    return this.request<any>('POST', '/ai/generate-collection', { image, context }, 30000);
  }

  async generateAltText(image: string) {
    return this.request<any>('POST', '/ai/alt-text', { image }, 15000);
  }

  async translateContent(content: any, toLang: string, fromLang?: string) {
    return this.request<any>('POST', '/ai/translate', { content, to_lang: toLang, from_lang: fromLang }, 30000);
  }

  async adjustTone(text: string, action: 'professional' | 'casual' | 'shorter' | 'longer' | 'fix_grammar' | 'seo_optimize') {
    return this.request<any>('POST', '/ai/adjust-tone', { text, action }, 15000);
  }

  // ── Media Intelligence ──
  async getMediaUsage(id: string) {
    return this.request<any>('GET', `/media-intel/${id}/usage`);
  }

  async checkDuplicate(hash: string, filename?: string) {
    return this.request<any>('POST', '/media-intel/check-duplicate', { hash, filename });
  }

  // ── Snapshots ──
  async getSnapshots(collectionSlug: string) {
    return this.request<any[]>('GET', `/snapshots/${collectionSlug}`);
  }

  async createSnapshot(collectionSlug: string, data: { name: string; description?: string }) {
    return this.request<any>('POST', `/snapshots/${collectionSlug}`, data);
  }

  async rollbackSnapshot(collectionSlug: string, snapshotId: string) {
    return this.request<any>('POST', `/snapshots/${collectionSlug}/${snapshotId}/rollback`, {}, 30000);
  }

  async deleteSnapshot(collectionSlug: string, snapshotId: string) {
    return this.request<any>('DELETE', `/snapshots/${collectionSlug}/${snapshotId}`);
  }

  // ── Dashboard Stats ──
  async getDashboardStats() {
    return this.request<any>('GET', '/dashboard/stats');
  }

  // ── Activity ──
  async getActivity(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>('GET', `/activity${qs}`);
  }

  // ── Bookings ──
  async getBookingStats() {
    return this.request<any>('GET', '/bookings/stats');
  }

  async getBookingsList(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>('GET', `/bookings/list${qs}`);
  }

  async confirmBooking(bookingId: string) {
    return this.request<any>('POST', `/bookings/${bookingId}/confirm`);
  }

  async cancelBooking(bookingId: string) {
    return this.request<any>('POST', `/bookings/${bookingId}/cancel`);
  }

  async getBookingTours() {
    return this.request<any[]>('GET', '/bookings/tours');
  }

  // ── i18n ──
  async getI18nLanguages() {
    return this.request<any>('GET', '/i18n/languages');
  }

  async getI18nSupportedLanguages() {
    return this.request<any[]>('GET', '/i18n/supported-languages');
  }

  async detectLanguage() {
    return this.request<any>('POST', '/i18n/detect-language');
  }

  async translateEntry(entryId: string, collectionSlug: string, targetLang: string) {
    return this.request<any>('POST', '/i18n/translate', { entry_id: entryId, collection_slug: collectionSlug, target_lang: targetLang }, 30000);
  }

  async translateBulk(collectionSlug: string, targetLang: string) {
    return this.request<any>('POST', '/i18n/translate-bulk', { collection_slug: collectionSlug, target_lang: targetLang }, 120000);
  }

  async getI18nStatus(collectionSlug: string) {
    return this.request<any>('GET', `/i18n/status/${collectionSlug}`);
  }

  async updateTranslation(entryId: string, lang: string, fields: Record<string, string>) {
    return this.request<any>('PUT', `/i18n/translation/${entryId}/${lang}`, { fields });
  }

  async getI18nWidget() {
    return this.request<any>('GET', '/i18n/widget');
  }
}

export const api = new ApiClient();
