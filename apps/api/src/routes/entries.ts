import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { validateContent } from '../lib/validate-content.js';
import { audit } from '../lib/audit.js';
import { LRUCache } from '../lib/lru-cache.js';
import { tenantStore } from '../middleware/tenant.js';
import { autoTranslateEntryToAllLanguages } from './i18n.js';
import { withFallbackCache, invalidateCachePattern } from '../lib/redis.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

/** Escape special ILIKE characters to prevent pattern injection */
function escapeIlike(str: string): string {
  return str.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Soft-delete availability probe.
 *
 * Migration 004 adds entries.deleted_at. Tenants that haven't run it yet
 * cannot be filtered with .is('deleted_at', null) — the query 500s with a
 * "column does not exist" error. We probe once per tenant, cache the result,
 * and only apply the filter when the column is known to exist.
 */
const softDeleteAvailability = new Map<string, boolean>();

async function hasSoftDelete(): Promise<boolean> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
  const cached = softDeleteAvailability.get(tenantId);
  if (cached !== undefined) return cached;

  const { error } = await supabase
    .from('entries')
    .select('deleted_at')
    .limit(1);

  const available = !error;
  softDeleteAvailability.set(tenantId, available);

  if (!available) {
    logger.warn('Migration 004 not applied for tenant — Trash disabled', {
      tenant: tenantId,
      hint: 'Run database/migrations/004_soft_delete_trash.sql on this tenant\'s Supabase to enable Trash.',
    });
  }
  return available;
}

// ============================================
// COLLECTION CACHE (TTL 60s)
// Avoids repeated DB lookups for the same collection within a short window.
// ============================================
interface CachedCollection {
  id: string;
  name: string;
  slug: string;
  fields: any[];
}
const collectionCache = new LRUCache<CachedCollection>({ maxSize: 200, ttlMs: 60_000 });

async function getCollection(slug: string): Promise<CachedCollection | null> {
  const cached = collectionCache.get(slug);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('collections')
    .select('id, name, slug, fields')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;

  const entry: CachedCollection = { ...data, fields: data.fields || [] };
  collectionCache.set(slug, entry);
  return entry;
}

// ============================================
// ROLE HELPER
// ============================================
async function getUserRole(profileId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .single();
  return data?.role || null;
}

function isAdminOrEditor(role: string | null): boolean {
  return ['super_admin', 'admin', 'editor'].includes(role || '');
}

// ============================================
// ENTRY SELECT FIELDS
// Single source of truth for what we select from entries.
// Includes author join.
// ============================================
const ENTRY_SELECT = `
  id, title, slug, content, excerpt, status,
  published_at, created_at, updated_at,
  author_id, tags, meta, version, featured_image,
  author:profiles!author_id(id, full_name, email)
`;

const ENTRY_SELECT_COMPACT = `
  id, title, slug, content, excerpt, status,
  published_at, created_at, updated_at,
  author_id, tags, meta, version, featured_image
`;

/**
 * GET /api/v1/entries/:collection
 * Returns all entries for a collection
 *
 * Query params:
 * - status: filter by status (draft, published, archived)
 * - search: full-text search in title/excerpt
 * - tags: comma-separated tag filter
 * - limit: number of results (default 100, max 500)
 * - offset: pagination offset (default 0)
 * - sort: sort field (default: created_at)
 * - order: asc or desc (default: desc)
 */

/**
 * GET /api/v1/entries/by-id/:id
 *
 * Direct UUID lookup. The admin EntryEdit page uses entry IDs in its URLs
 * (/content/<col>/edit/<uuid>) but the public route is slug-based, so the
 * editor used to fetch the whole collection and filter client-side — which
 * silently broke when collections crossed the page-size limit (default 100,
 * max 500) and when soft-deleted entries were filtered out of the listing.
 * This endpoint sidesteps both issues.
 *
 * IMPORTANT: defined BEFORE the slug-based GET handlers so Express doesn't
 * route "/by-id/<uuid>" into "/:collection".
 */
router.get('/by-id/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Lightweight UUID guard — keeps obvious junk from hitting Postgres.
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({
        error: { message: 'Invalid id', status: 400, timestamp: new Date().toISOString() },
      });
    }

    const { data: entry, error } = await supabase
      .from('entries')
      .select(ENTRY_SELECT)
      .eq('id', id)
      .single();

    if (error || !entry) {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    // Resolve collection metadata so the editor doesn't have to do a second round-trip
    const { data: collection } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('id', (entry as any).collection_id)
      .single();

    res.json({
      data: entry,
      meta: collection
        ? { collection: { id: collection.id, name: collection.name, slug: collection.slug } }
        : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching entry by id', { error: error.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

router.get('/:collection', async (req: AuthRequest, res: Response) => {
  try {
    const { collection: collectionSlug } = req.params;
    const {
      status,
      search,
      tags,
      limit = '100',
      offset = '0',
      sort = 'created_at',
      order = 'desc',
    } = req.query;

    const collection = await getCollection(collectionSlug as string);
    if (!collection) {
      return res.status(404).json({
        error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 100, 500);
    const offsetNum = parseInt(offset as string, 10) || 0;
    const lang = req.query.lang as string | undefined;

    // Build a stable cache key from query params
    const cacheKey = `entries:${collectionSlug}:list:s=${status || ''}:q=${search || ''}:t=${tags || ''}:l=${limitNum}:o=${offsetNum}:sort=${sort}:ord=${order}:lang=${lang || ''}`;

    const { data: result, fromCache } = await withFallbackCache(cacheKey, async () => {
      let query = supabase
        .from('entries')
        .select(ENTRY_SELECT, { count: 'exact' })
        .eq('collection_id', collection.id);

      // Only apply soft-delete filter on tenants that ran migration 004
      if (await hasSoftDelete()) {
        query = query.is('deleted_at', null);
      }

      if (status && typeof status === 'string') {
        query = query.eq('status', status);
      }

      if (search && typeof search === 'string') {
        const escaped = escapeIlike(search);
        query = query.or(`title.ilike.%${escaped}%,excerpt.ilike.%${escaped}%`);
      }

      if (tags && typeof tags === 'string') {
        const tagList = tags.split(',').map(t => t.trim());
        query = query.overlaps('tags', tagList);
      }

      const allowedSortFields = ['created_at', 'updated_at', 'published_at', 'title', 'status'];
      const sortField = allowedSortFields.includes(sort as string) ? (sort as string) : 'created_at';
      query = query.order(sortField, { ascending: order === 'asc' });

      query = query.range(offsetNum, offsetNum + limitNum - 1);

      const { data: entries, error, count } = await query;
      if (error) throw error;

      // i18n: overlay translations if ?lang= is provided
      let responseData = entries || [];
      if (lang && responseData.length > 0) {
        responseData = responseData.map((entry: any) => {
          const translations = entry.meta?.translations?.[lang];
          if (translations) {
            return {
              ...entry,
              title: translations._title || entry.title,
              content: { ...(entry.content || {}), ...translations },
              meta: { ...(entry.meta || {}), _served_lang: lang },
            };
          }
          return { ...entry, meta: { ...(entry.meta || {}), _served_lang: entry.meta?.i18n?.source_lang || null } };
        });
      }

      return { data: responseData, count: count || 0 };
    });

    res.json({
      data: result.data,
      meta: {
        collection: { id: collection.id, name: collection.name, slug: collection.slug },
        pagination: { limit: limitNum, offset: offsetNum, total: result.count },
        ...(fromCache ? { cached: true } : {}),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching entries', { error: error.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * GET /api/v1/entries/:collection/:slug
 * Returns a single entry by slug
 */
router.get('/:collection/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const { collection: collectionSlug, slug: entrySlug } = req.params;

    const collection = await getCollection(collectionSlug as string);
    if (!collection) {
      return res.status(404).json({
        error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const lang = req.query.lang as string | undefined;
    const cacheKey = `entries:${collectionSlug}:slug:${entrySlug}:lang=${lang || ''}`;

    const { data: responseEntry, fromCache } = await withFallbackCache(cacheKey, async () => {
      let slugQuery = supabase
        .from('entries')
        .select(ENTRY_SELECT)
        .eq('collection_id', collection.id)
        .eq('slug', entrySlug);

      if (await hasSoftDelete()) {
        slugQuery = slugQuery.is('deleted_at', null);
      }

      const { data: entry, error } = await slugQuery.single();

      if (error || !entry) {
        throw new Error('ENTRY_NOT_FOUND');
      }

      // i18n: overlay translations if ?lang= is provided
      let processed = entry as any;
      if (lang && processed.meta?.translations?.[lang]) {
        const translations = processed.meta.translations[lang];
        processed = {
          ...processed,
          title: translations._title || processed.title,
          content: { ...(processed.content || {}), ...translations },
          meta: { ...(processed.meta || {}), _served_lang: lang },
        };
      }
      return processed;
    });

    res.json({
      data: responseEntry,
      meta: {
        collection: { id: collection.id, name: collection.name, slug: collection.slug },
        ...(fromCache ? { cached: true } : {}),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error.message === 'ENTRY_NOT_FOUND') {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
    }
    logger.error('Error fetching entry', { error: error.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * POST /api/v1/entries/:collection
 * Create a new entry in a collection.
 * Content is validated against the collection's field schema.
 */
router.post('/:collection', async (req: AuthRequest, res: Response) => {
  try {
    const { collection: collectionSlug } = req.params;
    const { title, slug, content, excerpt, status, tags, meta, featured_image } = req.body;

    if (!title || !slug) {
      return res.status(400).json({
        error: { message: 'Missing required fields: title, slug', status: 400, timestamp: new Date().toISOString() },
      });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({
        error: {
          message: 'Invalid slug format. Use lowercase letters, numbers, and hyphens only.',
          status: 400, timestamp: new Date().toISOString(),
        },
      });
    }

    const authorId = req.profileId;
    if (!authorId) {
      return res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const role = await getUserRole(authorId);
    if (!['super_admin', 'admin', 'editor', 'author'].includes(role || '')) {
      return res.status(403).json({
        error: { message: 'Forbidden: Insufficient permissions to create entries', status: 403, timestamp: new Date().toISOString() },
      });
    }

    const collection = await getCollection(collectionSlug as string);
    if (!collection) {
      return res.status(404).json({
        error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    // Validate content against collection schema
    if (content && collection.fields.length > 0) {
      const validationErrors = validateContent(content, collection.fields);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: {
            message: 'Content validation failed',
            status: 400,
            details: { fields: validationErrors },
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    const entryStatus = status || 'draft';
    const validStatuses = ['draft', 'review', 'scheduled', 'published', 'archived'];
    if (!validStatuses.includes(entryStatus)) {
      return res.status(400).json({
        error: { message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`, status: 400, timestamp: new Date().toISOString() },
      });
    }

    const { data: entry, error } = await supabase
      .from('entries')
      .insert({
        collection_id: collection.id,
        title,
        slug,
        content: content || {},
        excerpt: excerpt || null,
        status: entryStatus,
        published_at: entryStatus === 'published' ? new Date().toISOString() : null,
        author_id: authorId,
        tags: tags || [],
        meta: meta || {},
        featured_image: featured_image || null,
      })
      .select(ENTRY_SELECT_COMPACT)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: { message: 'An entry with this slug already exists in this collection', status: 409, timestamp: new Date().toISOString() },
        });
      }
      throw error;
    }

    audit(req, 'create', 'entry', entry.id, { title: entry.title, collection: collection.slug });

    // Invalidate entries cache for this collection
    invalidateCachePattern(`entries:${collectionSlug}:*`).catch(() => {});

    // Auto-translate when i18n config has auto_translate=true. Fire-and-forget
    // so the response stays fast; the i18n helper swallows its own errors.
    if (entry.status === 'published') {
      autoTranslateEntryToAllLanguages(entry.id, collection.slug).catch(() => { /* logged inside */ });
    }

    res.status(201).json({
      data: entry,
      meta: { collection: { id: collection.id, name: collection.name, slug: collection.slug } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error creating entry', { error: error.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * PUT /api/v1/entries/:collection/:slug
 * Update an existing entry.
 * Content is validated against the collection's field schema.
 */
router.put('/:collection/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const { collection: collectionSlug, slug: entrySlug } = req.params;
    const authorId = req.profileId;

    if (!authorId) {
      return res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const collection = await getCollection(collectionSlug as string);
    if (!collection) {
      return res.status(404).json({
        error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const { data: existing } = await supabase
      .from('entries')
      .select('id, author_id, version')
      .eq('collection_id', collection.id)
      .eq('slug', entrySlug)
      .single();

    if (!existing) {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const role = await getUserRole(authorId);
    if (existing.author_id !== authorId && !isAdminOrEditor(role)) {
      return res.status(403).json({
        error: { message: 'Forbidden: You can only update your own entries', status: 403, timestamp: new Date().toISOString() },
      });
    }

    // Optimistic locking — client must send the version it last fetched
    const clientVersion = req.body.version as number | undefined;

    const updateData: Record<string, any> = {};
    const allowedFields = ['title', 'content', 'excerpt', 'status', 'tags', 'meta', 'featured_image'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Handle slug change
    if (req.body.slug && req.body.slug !== entrySlug) {
      if (!/^[a-z0-9-]+$/.test(req.body.slug)) {
        return res.status(400).json({
          error: { message: 'Invalid slug format.', status: 400, timestamp: new Date().toISOString() },
        });
      }
      updateData.slug = req.body.slug;
    }

    // Validate status
    if (updateData.status) {
      const validStatuses = ['draft', 'review', 'scheduled', 'published', 'archived'];
      if (!validStatuses.includes(updateData.status)) {
        return res.status(400).json({
          error: { message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`, status: 400, timestamp: new Date().toISOString() },
        });
      }
      if (updateData.status === 'published') {
        updateData.published_at = new Date().toISOString();
      }
    }

    // Validate content against collection schema
    if (updateData.content && collection.fields.length > 0) {
      const validationErrors = validateContent(updateData.content, collection.fields);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: {
            message: 'Content validation failed',
            status: 400,
            details: { fields: validationErrors },
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: { message: 'No valid fields to update', status: 400, timestamp: new Date().toISOString() },
      });
    }

    // Build update query with optimistic locking when client sends version
    let updateQuery = supabase
      .from('entries')
      .update(updateData)
      .eq('id', existing.id);

    if (clientVersion !== undefined) {
      updateQuery = updateQuery.eq('version', clientVersion);
    }

    const { data: entry, error } = await updateQuery
      .select(ENTRY_SELECT_COMPACT)
      .single();

    if (error) {
      // Optimistic locking conflict — version mismatch (row matched by id but not by version)
      if (error.code === 'PGRST116' && clientVersion !== undefined) {
        return res.status(409).json({
          error: {
            message: 'Conflict: this entry was modified by another user. Please refresh and try again.',
            status: 409,
            currentVersion: existing.version,
            yourVersion: clientVersion,
            timestamp: new Date().toISOString(),
          },
        });
      }
      if (error.code === '23505') {
        return res.status(409).json({
          error: { message: 'An entry with this slug already exists', status: 409, timestamp: new Date().toISOString() },
        });
      }
      throw error;
    }

    audit(req, 'update', 'entry', entry.id, { title: entry.title, collection: collection.slug, fields: Object.keys(updateData) });

    // Invalidate entries cache for this collection
    invalidateCachePattern(`entries:${collectionSlug}:*`).catch(() => {});

    // Auto-translate refresh when content changed and entry is published.
    // The helper hashes content and skips if nothing changed (cheap no-op).
    if (entry.status === 'published') {
      autoTranslateEntryToAllLanguages(entry.id, collection.slug).catch(() => { /* logged inside */ });
    }

    res.json({
      data: entry,
      meta: { collection: { id: collection.id, name: collection.name, slug: collection.slug } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error updating entry', { error: error.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * POST /api/v1/entries/:collection/:slug/duplicate
 *
 * Clone an entry. Creates a new entry with the same content but:
 *  - status forced to "draft" (never accidentally republished)
 *  - title suffixed with " (Copy)"
 *  - slug = first available "<original>-copy[-N]"
 *  - published_at cleared, author_id reset to current user
 *  - meta.translations preserved (so the duplicate inherits work) but
 *    transactional fields (stripe_session_id, related_booking_ids,
 *    booking_status, deleted_at) are cleared
 */
router.post('/:collection/:slug/duplicate', async (req: AuthRequest, res: Response) => {
  try {
    const { collection: collectionSlug, slug: entrySlug } = req.params;
    const authorId = req.profileId;

    if (!authorId) {
      return res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const collection = await getCollection(collectionSlug as string);
    if (!collection) {
      return res.status(404).json({
        error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const { data: source, error: srcErr } = await supabase
      .from('entries')
      .select('title, slug, content, meta, tags, featured_image')
      .eq('collection_id', collection.id)
      .eq('slug', entrySlug)
      .single();

    if (srcErr || !source) {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    // Find a free slug — start with "<orig>-copy" then -copy-2, -copy-3...
    const baseSlug = `${source.slug}-copy`;
    let candidateSlug = baseSlug;
    let suffix = 2;
    // Cap attempts at 100 to avoid hammering DB if something's wrong
    for (let i = 0; i < 100; i++) {
      const { data: clash } = await supabase
        .from('entries')
        .select('id')
        .eq('collection_id', collection.id)
        .eq('slug', candidateSlug)
        .maybeSingle();
      if (!clash) break;
      candidateSlug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    // Strip transactional / booking-specific fields from the cloned content.
    // These should never carry over from one entry to a different entry.
    const SKIP_CONTENT_KEYS = new Set([
      'stripe_session_id', 'stripe_payment_intent', 'paid_at', 'payment_status',
      'booking_status', 'confirmed_at', 'cancelled_at', 'related_booking_ids',
      'order_number', 'order_id',
    ]);
    const sourceContent = (source.content as Record<string, any>) || {};
    const newContent: Record<string, any> = {};
    for (const [k, v] of Object.entries(sourceContent)) {
      if (!SKIP_CONTENT_KEYS.has(k)) newContent[k] = v;
    }

    // Strip soft-delete + i18n stale-hash from meta but keep translations —
    // the editor probably wants to start with the same multilingual copy.
    const sourceMeta = (source.meta as Record<string, any>) || {};
    const newMeta: Record<string, any> = { ...sourceMeta };
    delete newMeta.deleted_at;
    if (newMeta.i18n) {
      // The hash referenced the OLD content. Drop it so auto-translate
      // re-evaluates on the next publish (translations are still valid
      // text content, just need a fresh hash anchor when content changes).
      delete newMeta.i18n.content_hash;
    }

    const newTitle = source.title ? `${source.title} (Copy)` : `Copy of ${entrySlug}`;

    const { data: clone, error: insertError } = await supabase
      .from('entries')
      .insert({
        collection_id: collection.id,
        title: newTitle,
        slug: candidateSlug,
        content: newContent,
        meta: newMeta,
        status: 'draft',
        tags: source.tags || [],
        featured_image: source.featured_image || null,
        author_id: authorId,
      } as any)
      .select(ENTRY_SELECT)
      .single();

    if (insertError) throw insertError;

    audit(req, 'duplicate', 'entry', clone.id, {
      source_slug: entrySlug,
      new_slug: candidateSlug,
      collection: collection.slug,
    });

    res.status(201).json({
      data: clone,
      meta: {
        collection: { id: collection.id, name: collection.name, slug: collection.slug },
        source_slug: entrySlug,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error duplicating entry', { error: error.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * DELETE /api/v1/entries/:collection/:slug
 * Delete an entry. Returns the deleted entry data.
 */
router.delete('/:collection/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const { collection: collectionSlug, slug: entrySlug } = req.params;
    const authorId = req.profileId;

    if (!authorId) {
      return res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
    }

    const collection = await getCollection(collectionSlug as string);
    if (!collection) {
      return res.status(404).json({
        error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const { data: existing } = await supabase
      .from('entries')
      .select('id, title, slug, author_id')
      .eq('collection_id', collection.id)
      .eq('slug', entrySlug)
      .single();

    if (!existing) {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    const role = await getUserRole(authorId);
    if (existing.author_id !== authorId && !['super_admin', 'admin'].includes(role || '')) {
      return res.status(403).json({
        error: { message: 'Forbidden: You can only delete your own entries', status: 403, timestamp: new Date().toISOString() },
      });
    }

    // Soft delete (v1.6): flip deleted_at instead of removing the row, so
    // the entry can be restored from Trash for 30 days. Tenants that haven't
    // run migration 004 fall back to hard delete (legacy behaviour).
    let softDeleted = false;
    if (await hasSoftDelete()) {
      const { error } = await supabase
        .from('entries')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
      softDeleted = true;
    } else {
      const { error } = await supabase
        .from('entries')
        .delete()
        .eq('id', existing.id);
      if (error) throw error;
    }

    // Invalidate entries cache for this collection
    invalidateCachePattern(`entries:${collectionSlug}:*`).catch(() => {});

    audit(req, 'delete', 'entry', existing.id, {
      title: existing.title,
      collection: collection.slug,
      soft: softDeleted,
    });

    res.json({
      data: { id: existing.id, title: existing.title, slug: existing.slug },
      meta: { collection: { id: collection.id, name: collection.name, slug: collection.slug } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error deleting entry', { error: error.message });
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
