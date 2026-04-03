import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

/** Escape special ILIKE characters to prevent pattern injection */
function escapeIlike(str: string): string {
  return str.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Check if user has admin/editor role */
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

/**
 * GET /api/v1/entries/:collection
 * Returns all entries for a collection
 *
 * Query params:
 * - status: filter by status (draft, published, archived)
 * - search: full-text search in title/excerpt
 * - tags: comma-separated tag filter
 * - limit: number of results (default 100)
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

    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('slug', collectionSlug)
      .single();

    if (collectionError || !collection) {
      res.status(404).json({
        error: {
          message: 'Collection not found',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    let query = supabase
      .from('entries')
      .select(
        'id, title, slug, content, excerpt, status, published_at, created_at, updated_at, author_id, tags, meta, version, featured_image',
        { count: 'exact' }
      )
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

    res.json({
      data: entries || [],
      meta: {
        collection: {
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
        },
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: count || 0,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching entries:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        status: 500,
        timestamp: new Date().toISOString(),
      },
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

    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('slug', collectionSlug)
      .single();

    if (collectionError || !collection) {
      res.status(404).json({
        error: {
          message: 'Collection not found',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { data: entry, error } = await supabase
      .from('entries')
      .select(
        'id, title, slug, content, excerpt, status, published_at, created_at, updated_at, author_id, tags, meta, version, featured_image'
      )
      .eq('collection_id', collection.id)
      .eq('slug', entrySlug)
      .single();

    if (error || !entry) {
      res.status(404).json({
        error: {
          message: 'Entry not found',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.json({
      data: entry,
      meta: {
        collection: {
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching entry:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        status: 500,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * POST /api/v1/entries/:collection
 * Create a new entry in a collection
 */
router.post('/:collection', async (req: AuthRequest, res: Response) => {
  try {
    const { collection: collectionSlug } = req.params;
    const { title, slug, content, excerpt, status, tags, meta, featured_image } = req.body;

    if (!title || !slug) {
      res.status(400).json({
        error: {
          message: 'Missing required fields: title, slug',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({
        error: {
          message: 'Invalid slug format. Use lowercase letters, numbers, and hyphens only.',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const authorId = req.profileId;
    if (!authorId) {
      res.status(401).json({
        error: {
          message: 'Unauthorized',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check role - only admin/editor/author can create entries
    const role = await getUserRole(authorId);
    if (!['super_admin', 'admin', 'editor', 'author'].includes(role || '')) {
      res.status(403).json({
        error: {
          message: 'Forbidden: Insufficient permissions to create entries',
          status: 403,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('slug', collectionSlug)
      .single();

    if (collectionError || !collection) {
      res.status(404).json({
        error: {
          message: 'Collection not found',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const entryStatus = status || 'draft';
    const validStatuses = ['draft', 'review', 'scheduled', 'published', 'archived'];
    if (!validStatuses.includes(entryStatus)) {
      res.status(400).json({
        error: {
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
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
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        res.status(409).json({
          error: {
            message: 'An entry with this slug already exists in this collection',
            status: 409,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }
      throw error;
    }

    res.status(201).json({
      data: entry,
      meta: {
        collection: {
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error creating entry:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        status: 500,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * PUT /api/v1/entries/:collection/:slug
 * Update an existing entry
 */
router.put('/:collection/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const { collection: collectionSlug, slug: entrySlug } = req.params;
    const authorId = req.profileId;

    if (!authorId) {
      res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('slug', collectionSlug)
      .single();

    if (collectionError || !collection) {
      res.status(404).json({
        error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: existing } = await supabase
      .from('entries')
      .select('id, author_id')
      .eq('collection_id', collection.id)
      .eq('slug', entrySlug)
      .single();

    if (!existing) {
      res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Authorization: only the author or admins can update
    const role = await getUserRole(authorId);
    if (existing.author_id !== authorId && !isAdminOrEditor(role)) {
      res.status(403).json({
        error: {
          message: 'Forbidden: You can only update your own entries',
          status: 403,
          timestamp: new Date().toISOString(),
        },
      });
      return;
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
        res.status(400).json({
          error: { message: 'Invalid slug format.', status: 400, timestamp: new Date().toISOString() },
        });
        return;
      }
      updateData.slug = req.body.slug;
    }

    // Validate status
    if (updateData.status) {
      const validStatuses = ['draft', 'review', 'scheduled', 'published', 'archived'];
      if (!validStatuses.includes(updateData.status)) {
        res.status(400).json({
          error: {
            message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
            status: 400,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }
      if (updateData.status === 'published') {
        updateData.published_at = new Date().toISOString();
      }
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        error: { message: 'No valid fields to update', status: 400, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: entry, error } = await supabase
      .from('entries')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({
          error: { message: 'An entry with this slug already exists', status: 409, timestamp: new Date().toISOString() },
        });
        return;
      }
      throw error;
    }

    res.json({
      data: entry,
      meta: { collection: { id: collection.id, name: collection.name, slug: collection.slug } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating entry:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * DELETE /api/v1/entries/:collection/:slug
 * Delete an entry
 */
router.delete('/:collection/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const { collection: collectionSlug, slug: entrySlug } = req.params;
    const authorId = req.profileId;

    if (!authorId) {
      res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', collectionSlug)
      .single();

    if (collectionError || !collection) {
      res.status(404).json({
        error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: existing } = await supabase
      .from('entries')
      .select('id, author_id')
      .eq('collection_id', collection.id)
      .eq('slug', entrySlug)
      .single();

    if (!existing) {
      res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Authorization: only the author or admins can delete
    const role = await getUserRole(authorId);
    if (existing.author_id !== authorId && !['super_admin', 'admin'].includes(role || '')) {
      res.status(403).json({
        error: {
          message: 'Forbidden: You can only delete your own entries',
          status: 403,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', existing.id);

    if (error) throw error;

    res.json({
      message: 'Entry deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error deleting entry:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
