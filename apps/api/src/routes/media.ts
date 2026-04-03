import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

const BUCKET_NAME = 'media';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav',
  'application/pdf',
];

/** Escape special ILIKE characters */
function escapeIlike(str: string): string {
  return str.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Check if user is admin */
async function isAdmin(profileId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .single();
  return ['super_admin', 'admin'].includes(data?.role || '');
}

/**
 * GET /api/v1/media
 * List media files (own files + public files, admins see all)
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { type, search, folder, limit = '50', offset = '0' } = req.query;

    let query = supabase
      .from('media')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Non-admins only see their own files and public files
    const admin = req.profileId ? await isAdmin(req.profileId) : false;
    if (!admin && req.profileId) {
      query = query.or(`uploaded_by.eq.${req.profileId},is_public.eq.true`);
    }

    if (type && typeof type === 'string') {
      if (type === 'document') {
        query = query.not('mime_type', 'like', 'image/%')
          .not('mime_type', 'like', 'video/%')
          .not('mime_type', 'like', 'audio/%');
      } else {
        query = query.like('mime_type', `${type}/%`);
      }
    }

    if (search && typeof search === 'string') {
      const escaped = escapeIlike(search);
      query = query.or(`filename.ilike.%${escaped}%,original_name.ilike.%${escaped}%`);
    }

    if (folder && typeof folder === 'string') {
      query = query.eq('folder_path', folder);
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: files, error, count } = await query;

    if (error) throw error;

    const filesWithUrls = (files || []).map((file) => {
      const { data: { publicUrl } } = supabase.storage
        .from(file.bucket_name || BUCKET_NAME)
        .getPublicUrl(file.storage_path);
      return { ...file, url: publicUrl };
    });

    res.json({
      data: filesWithUrls,
      meta: { pagination: { limit: limitNum, offset: offsetNum, total: count || 0 } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error listing media:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * GET /api/v1/media/:id
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: file, error } = await supabase
      .from('media')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !file) {
      res.status(404).json({
        error: { message: 'Media file not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Non-admins can only see own files or public files
    const admin = req.profileId ? await isAdmin(req.profileId) : false;
    if (!admin && file.uploaded_by !== req.profileId && !file.is_public) {
      res.status(403).json({
        error: { message: 'Forbidden', status: 403, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(file.bucket_name || BUCKET_NAME)
      .getPublicUrl(file.storage_path);

    res.json({
      data: { ...file, url: publicUrl },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching media:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * POST /api/v1/media/upload
 * Upload a media file via base64
 */
router.post('/upload', async (req: AuthRequest, res: Response) => {
  try {
    const { file, filename, mime_type, alt_text, caption, folder_path, is_public } = req.body;

    if (!file || !filename || !mime_type) {
      res.status(400).json({
        error: {
          message: 'Missing required fields: file (base64), filename, mime_type',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(mime_type)) {
      res.status(400).json({
        error: {
          message: `Unsupported file type: ${mime_type}`,
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate folder_path - no path traversal
    if (folder_path && (folder_path.includes('..') || folder_path.includes('\0'))) {
      res.status(400).json({
        error: { message: 'Invalid folder path', status: 400, timestamp: new Date().toISOString() },
      });
      return;
    }

    const base64Data = file.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > MAX_FILE_SIZE) {
      res.status(400).json({
        error: {
          message: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const authorId = req.profileId;
    if (!authorId) {
      res.status(401).json({
        error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Sanitize filename - only allow safe characters
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = safeName.split('.').pop() || '';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
    const storagePath = `${authorId}/${uniqueName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: mime_type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    const { data: mediaRecord, error: dbError } = await supabase
      .from('media')
      .insert({
        filename: uniqueName,
        original_name: safeName,
        mime_type,
        size_bytes: buffer.length,
        storage_path: storagePath,
        bucket_name: BUCKET_NAME,
        alt_text: alt_text || null,
        caption: caption || null,
        uploaded_by: authorId,
        folder_path: folder_path || '/',
        is_public: is_public || false,
      })
      .select()
      .single();

    if (dbError) {
      await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
      throw dbError;
    }

    res.status(201).json({
      data: { ...mediaRecord, url: publicUrl },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error uploading media:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * PATCH /api/v1/media/:id
 * Update media metadata (owner or admin only)
 */
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabase
      .from('media')
      .select('id, uploaded_by')
      .eq('id', id)
      .single();

    if (!existing) {
      res.status(404).json({
        error: { message: 'Media file not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Authorization: only owner or admin
    const admin = req.profileId ? await isAdmin(req.profileId) : false;
    if (existing.uploaded_by !== req.profileId && !admin) {
      res.status(403).json({
        error: { message: 'Forbidden: You can only update your own files', status: 403, timestamp: new Date().toISOString() },
      });
      return;
    }

    const updateData: Record<string, any> = {};
    const allowedFields = ['alt_text', 'caption', 'folder_path', 'is_public'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Validate folder_path
    if (updateData.folder_path && (updateData.folder_path.includes('..') || updateData.folder_path.includes('\0'))) {
      res.status(400).json({
        error: { message: 'Invalid folder path', status: 400, timestamp: new Date().toISOString() },
      });
      return;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        error: { message: 'No valid fields to update', status: 400, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: file, error } = await supabase
      .from('media')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ data: file, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error updating media:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * DELETE /api/v1/media/:id
 * Delete a media file (owner or admin only)
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: file, error: fetchError } = await supabase
      .from('media')
      .select('id, storage_path, bucket_name, filename, uploaded_by')
      .eq('id', id)
      .single();

    if (fetchError || !file) {
      res.status(404).json({
        error: { message: 'Media file not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Authorization: only owner or admin
    const admin = req.profileId ? await isAdmin(req.profileId) : false;
    if (file.uploaded_by !== req.profileId && !admin) {
      res.status(403).json({
        error: { message: 'Forbidden: You can only delete your own files', status: 403, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { error: storageError } = await supabase.storage
      .from(file.bucket_name || BUCKET_NAME)
      .remove([file.storage_path]);

    if (storageError) {
      console.warn('Failed to delete from storage:', storageError);
    }

    const { error: dbError } = await supabase
      .from('media')
      .delete()
      .eq('id', id);

    if (dbError) throw dbError;

    res.json({
      message: 'Media file deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error deleting media:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
