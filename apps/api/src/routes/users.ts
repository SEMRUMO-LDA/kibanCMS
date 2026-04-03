import { Router, type Response } from 'express';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

const router: Router = Router();

/**
 * Helper: Check if current user is admin
 */
async function requireAdmin(req: AuthRequest, res: Response): Promise<boolean> {
  if (!req.user?.id) {
    res.status(401).json({
      error: {
        message: 'Unauthorized',
        status: 401,
        timestamp: new Date().toISOString(),
      },
    });
    return false;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', req.user.id)
    .single();

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    res.status(403).json({
      error: {
        message: 'Forbidden: Admin role required',
        status: 403,
        timestamp: new Date().toISOString(),
      },
    });
    return false;
  }

  return true;
}

/**
 * GET /api/v1/users
 * List all users (admin only)
 *
 * Query params:
 * - role: filter by role
 * - search: search by name/email
 * - limit: number of results (default 50)
 * - offset: pagination offset (default 0)
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { role, search, limit = '50', offset = '0' } = req.query;

    let query = supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, role, onboarding_completed, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (role && typeof role === 'string') {
      query = query.eq('role', role);
    }

    if (search && typeof search === 'string') {
      const escaped = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(`email.ilike.%${escaped}%,full_name.ilike.%${escaped}%`);
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: users, error, count } = await query;

    if (error) throw error;

    res.json({
      data: users || [],
      meta: {
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: count || 0,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error listing users', { error: error.message });
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
 * GET /api/v1/users/:id
 * Get a single user by ID (admin only)
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;

    const { data: user, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, role, onboarding_completed, preferences, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !user) {
      res.status(404).json({
        error: {
          message: 'User not found',
          details: { id },
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    res.json({
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching user', { error: error.message });
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
 * PATCH /api/v1/users/:id
 * Update user role or profile (admin only)
 */
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;

    // Check if user exists
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .single();

    if (!existing) {
      res.status(404).json({
        error: {
          message: 'User not found',
          details: { id },
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Prevent self-demotion for super_admin safety
    if (id === req.user?.id && req.body.role && req.body.role !== existing.role) {
      res.status(400).json({
        error: {
          message: 'Cannot change your own role',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const updateData: Record<string, any> = {};
    const allowedFields = ['full_name', 'role', 'avatar_url'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Validate role
    if (updateData.role) {
      const validRoles = ['super_admin', 'admin', 'editor', 'author', 'viewer'];
      if (!validRoles.includes(updateData.role)) {
        res.status(400).json({
          error: {
            message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
            status: 400,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Only super_admin can assign super_admin role
      if (updateData.role === 'super_admin') {
        const { data: currentProfile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', req.user?.id)
          .single();

        if (currentProfile?.role !== 'super_admin') {
          res.status(403).json({
            error: {
              message: 'Only super admins can assign the super_admin role',
              status: 403,
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }
      }
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

    const { data: user, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error updating user', { error: error.message });
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
 * POST /api/v1/users/invite
 * Invite a new user via email (admin only)
 * Uses Supabase admin API to create the user
 */
router.post('/invite', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { email, role, full_name } = req.body;

    if (!email) {
      res.status(400).json({
        error: {
          message: 'Missing required field: email',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate role
    const userRole = role || 'editor';
    const validRoles = ['admin', 'editor', 'author', 'viewer'];
    if (!validRoles.includes(userRole)) {
      res.status(400).json({
        error: {
          message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      res.status(409).json({
        error: {
          message: 'A user with this email already exists',
          details: { email },
          status: 409,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Invite user via Supabase Auth admin API (sends magic link email)
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: full_name || null,
        invited_role: userRole,
      },
    });

    if (inviteError) throw inviteError;

    // Update the profile role (handle_new_user trigger creates with 'viewer' default)
    if (inviteData.user) {
      await supabase
        .from('profiles')
        .update({ role: userRole, full_name: full_name || null })
        .eq('id', inviteData.user.id);
    }

    res.status(201).json({
      data: {
        id: inviteData.user?.id,
        email,
        role: userRole,
        invited: true,
      },
      message: 'Invitation sent successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error inviting user', { error: error.message });
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
 * DELETE /api/v1/users/:id
 * Delete a user (admin only)
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.user?.id) {
      res.status(400).json({
        error: {
          message: 'Cannot delete your own account',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check if user exists
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('id', id)
      .single();

    if (!existing) {
      res.status(404).json({
        error: {
          message: 'User not found',
          details: { id },
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Delete via Supabase admin API (cascades to profile via FK)
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (error) throw error;

    res.json({
      message: 'User deleted successfully',
      details: { id, email: existing.email },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error deleting user', { error: error.message });
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
