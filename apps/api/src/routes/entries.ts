import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { validateContent } from '../lib/validate-content.js';
import { audit } from '../lib/audit.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

/** Escape special ILIKE characters to prevent pattern injection */
function escapeIlike(str: string): string {
  return str.replace(/%/g, '\\%').replace(/_/g, '\\_');
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
  fetchedAt: number;
}
const collectionCache = new Map<string, CachedCollection>();
const CACHE_TTL = 60_000; // 60 seconds

async function getCollection(slug: string): Promise<CachedCollection | null> {
  const cached = collectionCache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached;

  const { data, error } = await supabase
    .from('collections')
    .select('id, name, slug, fields')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;

  const entry: CachedCollection = { ...data, fields: data.fields || [], fetchedAt: Date.now() };
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

    let query = supabase
      .from('entries')
      .select(ENTRY_SELECT, { count: 'exact' })
      .eq('collection_id', collection.id);

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

    const limitNum = Math.min(parseInt(limit as string, 10) || 100, 500);
    const offsetNum = parseInt(offset as string, 10) || 0;
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: entries, error, count } = await query;

    if (error) throw error;

    // i18n: overlay translations if ?lang= is provided
    const lang = req.query.lang as string | undefined;
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

    res.json({
      data: responseData,
      meta: {
        collection: { id: collection.id, name: collection.name, slug: collection.slug },
        pagination: { limit: limitNum, offset: offsetNum, total: count || 0 },
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

    const { data: entry, error } = await supabase
      .from('entries')
      .select(ENTRY_SELECT)
      .eq('collection_id', collection.id)
      .eq('slug', entrySlug)
      .single();

    if (error || !entry) {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
    }

    // i18n: overlay translations if ?lang= is provided
    let responseEntry = entry as any;
    const lang = req.query.lang as string | undefined;
    if (lang && responseEntry.meta?.translations?.[lang]) {
      const translations = responseEntry.meta.translations[lang];
      responseEntry = {
        ...responseEntry,
        title: translations._title || responseEntry.title,
        content: { ...(responseEntry.content || {}), ...translations },
        meta: { ...(responseEntry.meta || {}), _served_lang: lang },
      };
    }

    res.json({
      data: responseEntry,
      meta: { collection: { id: collection.id, name: collection.name, slug: collection.slug } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
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
      .select('id, author_id')
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

    const { data: entry, error } = await supabase
      .from('entries')
      .update(updateData)
      .eq('id', existing.id)
      .select(ENTRY_SELECT_COMPACT)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: { message: 'An entry with this slug already exists', status: 409, timestamp: new Date().toISOString() },
        });
      }
      throw error;
    }

    audit(req, 'update', 'entry', entry.id, { title: entry.title, collection: collection.slug, fields: Object.keys(updateData) });

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

    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', existing.id);

    if (error) throw error;

    audit(req, 'delete', 'entry', existing.id, { title: existing.title, collection: collection.slug });

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
