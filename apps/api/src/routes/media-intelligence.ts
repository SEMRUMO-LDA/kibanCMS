import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import crypto from 'crypto';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

/**
 * GET /api/v1/media/:id/usage
 * Returns all entries that reference this media file (reverse lookup).
 * Searches content JSONB + featured_image fields across ALL entries.
 */
router.get('/:id/usage', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get the media file details
    const { data: media, error: mediaErr } = await supabase
      .from('media')
      .select('id, filename, storage_path')
      .eq('id', id)
      .single();

    if (mediaErr || !media) {
      return res.status(404).json({ error: { message: 'Media not found', status: 404, timestamp: new Date().toISOString() } });
    }

    // Generate the public URL for this media
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(media.storage_path);

    // Search all entries for references to this media
    // Check: featured_image field, content JSONB (stringified search)
    const { data: entries } = await supabase
      .from('entries')
      .select('id, title, slug, collection_id, status');

    // Get all collections for name resolution
    const { data: cols } = await supabase
      .from('collections')
      .select('id, name, slug');
    const colMap = new Map((cols || []).map(c => [c.id, c]));

    const usages: any[] = [];

    for (const entry of (entries || [])) {
      // Check featured_image
      let found = false;
      if ((entry as any).featured_image === id) found = true;

      // Check content JSONB for the media ID or URL
      if (!found) {
        const { data: fullEntry } = await supabase
          .from('entries')
          .select('content, featured_image')
          .eq('id', entry.id)
          .single();

        if (fullEntry) {
          const contentStr = JSON.stringify(fullEntry.content || {});
          if (contentStr.includes(id) || contentStr.includes(publicUrl) || contentStr.includes(media.filename)) {
            found = true;
          }
          if (fullEntry.featured_image === id) found = true;
        }
      }

      if (found) {
        const col = colMap.get(entry.collection_id);
        usages.push({
          entry_id: entry.id,
          entry_title: entry.title,
          entry_slug: entry.slug,
          entry_status: entry.status,
          collection_name: col?.name || 'Unknown',
          collection_slug: col?.slug || '',
        });
      }
    }

    res.json({
      data: { media_id: id, filename: media.filename, url: publicUrl, usages, usage_count: usages.length },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message, status: 500, timestamp: new Date().toISOString() } });
  }
});

/**
 * POST /api/v1/media/check-duplicate
 * Accepts a file hash (SHA-256) and checks if it already exists.
 * Returns the existing file if found.
 */
router.post('/check-duplicate', async (req: AuthRequest, res: Response) => {
  try {
    const { hash, filename } = req.body;

    if (!hash) {
      return res.status(400).json({ error: { message: 'hash is required', status: 400, timestamp: new Date().toISOString() } });
    }

    // Search by filename pattern or metadata
    // Since we store hash in metadata, search there
    const { data: existing } = await supabase
      .from('media')
      .select('id, filename, original_name, storage_path, size_bytes, mime_type, created_at')
      .eq('metadata->>hash', hash)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(existing.storage_path);
      return res.json({
        data: { duplicate: true, existing: { ...existing, url: publicUrl } },
        timestamp: new Date().toISOString(),
      });
    }

    // Also check by exact filename + size as fallback
    if (filename) {
      const { data: byName } = await supabase
        .from('media')
        .select('id, filename, original_name, storage_path, size_bytes, mime_type, created_at')
        .eq('original_name', filename)
        .limit(5);

      if (byName && byName.length > 0) {
        const matches = byName.map(f => {
          const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(f.storage_path);
          return { ...f, url: publicUrl };
        });
        return res.json({
          data: { duplicate: false, similar: matches },
          timestamp: new Date().toISOString(),
        });
      }
    }

    res.json({
      data: { duplicate: false, similar: [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message, status: 500, timestamp: new Date().toISOString() } });
  }
});

export default router;
