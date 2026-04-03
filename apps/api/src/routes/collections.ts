import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

/**
 * Helper: Check if user has admin privileges
 */
const isAdmin = (role: string | undefined): boolean => {
  return role === 'admin' || role === 'super_admin';
};

/**
 * GET /api/v1/collections
 * Returns all collections
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { data: collections, error } = await supabase
      .from('collections')
      .select('id, name, slug, description, type, icon, created_at, updated_at')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({
      data: collections || [],
      meta: {
        count: collections?.length || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching collections:', error);
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
 * GET /api/v1/collections/:slug
 * Returns a single collection with schema
 */
router.get('/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const { slug } = req.params;

    const { data: collection, error } = await supabase
      .from('collections')
      .select('id, name, slug, description, type, icon, fields, created_at, updated_at')
      .eq('slug', slug)
      .single();

    if (error || !collection) {
      res.status(404).json({
        error: {
          message: 'Collection not found',
          details: { slug },
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.json({
      data: collection,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching collection:', error);
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
 * POST /api/v1/collections
 * Create a new collection
 * Requires admin role
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    // Check authentication
    if (!req.user?.id) {
      res.status(401).json({
        error: {
          message: 'Unauthorized',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (!profile || !isAdmin(profile.role)) {
      res.status(403).json({
        error: {
          message: 'Forbidden: Admin role required',
          status: 403,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate required fields
    const { name, slug, description, type, icon, color, fields } = req.body;

    if (!name || !slug || !type || !fields) {
      res.status(400).json({
        error: {
          message: 'Missing required fields: name, slug, type, fields',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate slug format (lowercase, alphanumeric, hyphens only)
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

    // Check if slug already exists
    const { data: existing } = await supabase
      .from('collections')
      .select('slug')
      .eq('slug', slug)
      .single();

    if (existing) {
      res.status(409).json({
        error: {
          message: 'Collection with this slug already exists',
          details: { slug },
          status: 409,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Create collection
    const { data: collection, error } = await supabase
      .from('collections')
      .insert({
        name,
        slug,
        description: description || null,
        type,
        icon: icon || null,
        color: color || null,
        fields,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      data: collection,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error creating collection:', error);
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
 * PUT /api/v1/collections/:slug
 * Update an existing collection
 * Requires admin role
 */
router.put('/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const { slug } = req.params;

    // Check authentication
    if (!req.user?.id) {
      res.status(401).json({
        error: {
          message: 'Unauthorized',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (!profile || !isAdmin(profile.role)) {
      res.status(403).json({
        error: {
          message: 'Forbidden: Admin role required',
          status: 403,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check if collection exists
    const { data: existing } = await supabase
      .from('collections')
      .select('id, slug')
      .eq('slug', slug)
      .single();

    if (!existing) {
      res.status(404).json({
        error: {
          message: 'Collection not found',
          details: { slug },
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Prepare update data (only allow specific fields)
    const updateData: any = {};
    const allowedFields = ['name', 'description', 'type', 'icon', 'color', 'fields'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // If slug is being changed, validate it
    if (req.body.slug && req.body.slug !== slug) {
      if (!/^[a-z0-9-]+$/.test(req.body.slug)) {
        res.status(400).json({
          error: {
            message: 'Invalid slug format. Use lowercase letters, numbers, and hyphens only.',
            status: 400,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Check new slug doesn't already exist
      const { data: slugCheck } = await supabase
        .from('collections')
        .select('slug')
        .eq('slug', req.body.slug)
        .single();

      if (slugCheck) {
        res.status(409).json({
          error: {
            message: 'Collection with this slug already exists',
            details: { slug: req.body.slug },
            status: 409,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      updateData.slug = req.body.slug;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        error: {
          message: 'No valid fields to update',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Update collection
    const { data: collection, error } = await supabase
      .from('collections')
      .update(updateData)
      .eq('slug', slug)
      .select()
      .single();

    if (error) throw error;

    res.json({
      data: collection,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating collection:', error);
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
 * DELETE /api/v1/collections/:slug
 * Delete a collection
 * Requires admin role
 * WARNING: This will also delete all entries in the collection
 */
router.delete('/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const { slug } = req.params;

    // Check authentication
    if (!req.user?.id) {
      res.status(401).json({
        error: {
          message: 'Unauthorized',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (!profile || !isAdmin(profile.role)) {
      res.status(403).json({
        error: {
          message: 'Forbidden: Admin role required',
          status: 403,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check if collection exists
    const { data: existing } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!existing) {
      res.status(404).json({
        error: {
          message: 'Collection not found',
          details: { slug },
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Delete collection (cascade will delete entries)
    const { error } = await supabase
      .from('collections')
      .delete()
      .eq('slug', slug);

    if (error) throw error;

    res.json({
      message: 'Collection deleted successfully',
      details: { slug },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error deleting collection:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        status: 500,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default router;
