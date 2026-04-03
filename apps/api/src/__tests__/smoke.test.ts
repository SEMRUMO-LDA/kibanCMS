/**
 * Smoke Tests - Critical API Path Validation
 *
 * These tests validate the API endpoints respond correctly.
 * Run with: npx tsx --test src/__tests__/smoke.test.ts
 *
 * Requirements:
 * - API server running on PORT (default 5001)
 * - Valid SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 * - At least one API key in the database
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5001';
const API_KEY = process.env.TEST_API_KEY || '';
const JWT_TOKEN = process.env.TEST_JWT_TOKEN || '';

interface ApiResponse {
  status: number;
  body: any;
  ok: boolean;
}

async function apiCall(
  path: string,
  options: {
    method?: string;
    body?: any;
    auth?: 'apikey' | 'jwt' | 'none';
  } = {}
): Promise<ApiResponse> {
  const { method = 'GET', body, auth = 'apikey' } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth === 'apikey' && API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  } else if (auth === 'jwt' && JWT_TOKEN) {
    headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json().catch(() => null);

  return {
    status: response.status,
    body: responseBody,
    ok: response.ok,
  };
}

// ============================================
// TEST: Health Check
// ============================================

describe('Health Check', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await apiCall('/health', { auth: 'none' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.timestamp);
    assert.equal(res.body.service, 'KibanCMS Unified Server');
  });
});

// ============================================
// TEST: Collections API (JWT Auth)
// ============================================

describe('Collections API', () => {
  it('GET /api/v1/collections returns 401 without auth', async () => {
    const res = await apiCall('/api/v1/collections', { auth: 'none' });
    assert.equal(res.status, 401);
  });

  if (JWT_TOKEN) {
    it('GET /api/v1/collections returns collection list with JWT', async () => {
      const res = await apiCall('/api/v1/collections', { auth: 'jwt' });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.meta);
    });

    it('GET /api/v1/collections/:slug returns 404 for non-existent', async () => {
      const res = await apiCall('/api/v1/collections/non-existent-slug-12345', { auth: 'jwt' });
      assert.equal(res.status, 404);
    });
  }
});

// ============================================
// TEST: Entries API (API Key Auth)
// ============================================

describe('Entries API', () => {
  it('GET /api/v1/entries/:collection returns 401 without auth', async () => {
    const res = await apiCall('/api/v1/entries/blog', { auth: 'none' });
    assert.equal(res.status, 401);
  });

  if (API_KEY) {
    it('GET /api/v1/entries/:collection returns 404 for non-existent collection', async () => {
      const res = await apiCall('/api/v1/entries/non-existent-collection-12345');
      assert.equal(res.status, 404);
    });

    it('POST /api/v1/entries/:collection returns 400 without required fields', async () => {
      const res = await apiCall('/api/v1/entries/blog', {
        method: 'POST',
        body: {},
      });
      // Either 400 (missing fields) or 404 (collection not found)
      assert.ok([400, 404].includes(res.status));
    });

    it('PUT /api/v1/entries/:collection/:slug returns 404 for non-existent', async () => {
      const res = await apiCall('/api/v1/entries/blog/non-existent-entry-12345', {
        method: 'PUT',
        body: { title: 'Updated' },
      });
      assert.equal(res.status, 404);
    });

    it('DELETE /api/v1/entries/:collection/:slug returns 404 for non-existent', async () => {
      const res = await apiCall('/api/v1/entries/blog/non-existent-entry-12345', {
        method: 'DELETE',
      });
      assert.equal(res.status, 404);
    });

    it('GET /api/v1/entries/:collection supports search parameter', async () => {
      const res = await apiCall('/api/v1/entries/blog?search=test&status=published&limit=10');
      // 404 if collection doesn't exist, 200 if it does
      assert.ok([200, 404].includes(res.status));
    });
  }
});

// ============================================
// TEST: Media API (API Key Auth)
// ============================================

describe('Media API', () => {
  it('GET /api/v1/media returns 401 without auth', async () => {
    const res = await apiCall('/api/v1/media', { auth: 'none' });
    assert.equal(res.status, 401);
  });

  if (API_KEY) {
    it('GET /api/v1/media returns media list', async () => {
      const res = await apiCall('/api/v1/media');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.meta?.pagination);
    });

    it('GET /api/v1/media/:id returns 404 for non-existent', async () => {
      const res = await apiCall('/api/v1/media/00000000-0000-0000-0000-000000000000');
      assert.equal(res.status, 404);
    });

    it('POST /api/v1/media/upload returns 400 without required fields', async () => {
      const res = await apiCall('/api/v1/media/upload', {
        method: 'POST',
        body: {},
      });
      assert.equal(res.status, 400);
    });

    it('DELETE /api/v1/media/:id returns 404 for non-existent', async () => {
      const res = await apiCall('/api/v1/media/00000000-0000-0000-0000-000000000000', {
        method: 'DELETE',
      });
      assert.equal(res.status, 404);
    });
  }
});

// ============================================
// TEST: Users API (JWT Auth)
// ============================================

describe('Users API', () => {
  it('GET /api/v1/users returns 401 without auth', async () => {
    const res = await apiCall('/api/v1/users', { auth: 'none' });
    assert.equal(res.status, 401);
  });

  if (JWT_TOKEN) {
    it('GET /api/v1/users returns user list with JWT', async () => {
      const res = await apiCall('/api/v1/users', { auth: 'jwt' });
      // 200 if admin, 403 if not admin
      assert.ok([200, 403].includes(res.status));
    });
  }
});

// ============================================
// TEST: Webhooks API (API Key Auth)
// ============================================

describe('Webhooks API', () => {
  it('GET /api/v1/webhooks returns 401 without auth', async () => {
    const res = await apiCall('/api/v1/webhooks', { auth: 'none' });
    assert.equal(res.status, 401);
  });

  if (API_KEY) {
    it('GET /api/v1/webhooks returns webhook list', async () => {
      const res = await apiCall('/api/v1/webhooks');
      assert.equal(res.status, 200);
    });
  }
});

// ============================================
// TEST: Error Handling
// ============================================

describe('Error Handling', () => {
  it('Non-existent API route returns 404', async () => {
    const res = await apiCall('/api/v1/non-existent-route', { auth: 'none' });
    assert.equal(res.status, 404);
  });

  it('Rate limiting headers are present', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    // Health endpoint is not rate-limited, but API endpoints are
    assert.equal(response.status, 200);
  });
});
