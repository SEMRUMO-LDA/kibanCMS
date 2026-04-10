/**
 * Snapshots API — create, list, and rollback collection snapshots.
 * A snapshot captures the full state of all entries in a collection.
 */

import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';
import type { AuthRequest } from '../middleware/auth.js';

const router: Router = Router();

// Only admins can manage snapshots
async function requireAdmin(req: AuthRequest, res: Response): Promise<boolean> {
  if (!req.profileId) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401, timestamp: new Date().toISOString() } });
    return false;
  }
  const { data } = await supabase.from('profiles').select('role').eq('id', req.profileId).single();
  if (!data || !['super_admin', 'admin'].includes(data.role)) {
    res.status(403).json({ error: { message: 'Only admins can manage snapshots', status: 403, timestamp: new Date().toISOString() } });
    return false;
  }
  return true;
}

/**
 * GET /api/v1/snapshots/:collectionSlug
 * List all snapshots for a collection (newest first)
 */
router.get('/:collectionSlug', async (req: AuthRequest, res: Response) => {
  try {
    const { collectionSlug } = req.params;

    // Resolve collection
    const { data: collection } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('slug', collectionSlug)
      .single();

    if (!collection) {
      return res.status(404).json({ error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() } });
    }

    const { data: snapshots, error } = await supabase
      .from('collection_snapshots')
      .select('id, name, description, entry_count, created_by, created_at')
      .eq('collection_id', collection.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      data: snapshots || [],
      meta: { collection: { id: collection.id, name: collection.name, slug: collection.slug } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error listing snapshots', { error: error.message });
    res.status(500).json({ error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() } });
  }
});

/**
 * POST /api/v1/snapshots/:collectionSlug
 * Create a snapshot of all entries in a collection
 */
router.post('/:collectionSlug', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { collectionSlug } = req.params;
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: { message: 'Snapshot name is required', status: 400, timestamp: new Date().toISOString() } });
    }

    // Resolve collection
    const { data: collection } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('slug', collectionSlug)
      .single();

    if (!collection) {
      return res.status(404).json({ error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() } });
    }

    // Fetch ALL entries in this collection (full data for restore)
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('id, title, slug, content, excerpt, status, published_at, author_id, tags, meta, version, featured_image, created_at, updated_at')
      .eq('collection_id', collection.id)
      .order('created_at', { ascending: true });

    if (entriesError) throw entriesError;

    const entriesData = entries || [];

    // Create snapshot
    const { data: snapshot, error } = await supabase
      .from('collection_snapshots')
      .insert({
        collection_id: collection.id,
        name: name.trim(),
        description: description?.trim() || null,
        entry_count: entriesData.length,
        entries_data: entriesData,
        created_by: req.profileId,
      })
      .select('id, name, description, entry_count, created_at')
      .single();

    if (error) throw error;

    audit(req, 'create', 'snapshot', snapshot.id, {
      collection: collection.slug,
      name: snapshot.name,
      entry_count: snapshot.entry_count,
    });

    res.status(201).json({
      data: snapshot,
      meta: { collection: { id: collection.id, name: collection.name, slug: collection.slug } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error creating snapshot', { error: error.message });
    res.status(500).json({ error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() } });
  }
});

/**
 * POST /api/v1/snapshots/:collectionSlug/:snapshotId/rollback
 * Restore all entries in a collection to the state captured in a snapshot.
 * This DELETES current entries and re-inserts the snapshot data.
 */
router.post('/:collectionSlug/:snapshotId/rollback', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { collectionSlug, snapshotId } = req.params;

    // Resolve collection
    const { data: collection } = await supabase
      .from('collections')
      .select('id, name, slug')
      .eq('slug', collectionSlug)
      .single();

    if (!collection) {
      return res.status(404).json({ error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() } });
    }

    // Fetch snapshot
    const { data: snapshot, error: snapError } = await supabase
      .from('collection_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .eq('collection_id', collection.id)
      .single();

    if (snapError || !snapshot) {
      return res.status(404).json({ error: { message: 'Snapshot not found', status: 404, timestamp: new Date().toISOString() } });
    }

    const snapshotEntries = snapshot.entries_data as any[];

    // Safety: create an auto-snapshot of current state before rollback
    const { data: currentEntries } = await supabase
      .from('entries')
      .select('id, title, slug, content, excerpt, status, published_at, author_id, tags, meta, version, featured_image, created_at, updated_at')
      .eq('collection_id', collection.id);

    await supabase.from('collection_snapshots').insert({
      collection_id: collection.id,
      name: `Auto-backup before rollback to "${snapshot.name}"`,
      description: `Automatic backup created before rolling back to snapshot "${snapshot.name}" (${snapshotId})`,
      entry_count: (currentEntries || []).length,
      entries_data: currentEntries || [],
      created_by: req.profileId,
    });

    // Delete all current entries in this collection
    const { error: deleteError } = await supabase
      .from('entries')
      .delete()
      .eq('collection_id', collection.id);

    if (deleteError) throw deleteError;

    // Re-insert entries from snapshot (without original IDs — let DB generate new ones)
    if (snapshotEntries.length > 0) {
      const entriesToInsert = snapshotEntries.map(e => ({
        collection_id: collection.id,
        title: e.title,
        slug: e.slug,
        content: e.content,
        excerpt: e.excerpt,
        status: e.status,
        published_at: e.published_at,
        author_id: e.author_id,
        tags: e.tags,
        meta: e.meta,
        featured_image: e.featured_image,
      }));

      const { error: insertError } = await supabase
        .from('entries')
        .insert(entriesToInsert);

      if (insertError) throw insertError;
    }

    audit(req, 'rollback', 'snapshot', snapshotId, {
      collection: collection.slug,
      snapshot_name: snapshot.name,
      restored_entries: snapshotEntries.length,
    });

    res.json({
      data: {
        message: `Rolled back to "${snapshot.name}" — ${snapshotEntries.length} entries restored`,
        restored_count: snapshotEntries.length,
        backup_created: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error rolling back snapshot', { error: error.message });
    res.status(500).json({ error: { message: 'Rollback failed. An auto-backup was created before the attempt.', status: 500, timestamp: new Date().toISOString() } });
  }
});

/**
 * DELETE /api/v1/snapshots/:collectionSlug/:snapshotId
 * Delete a snapshot
 */
router.delete('/:collectionSlug/:snapshotId', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { collectionSlug, snapshotId } = req.params;

    const { data: collection } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', collectionSlug)
      .single();

    if (!collection) {
      return res.status(404).json({ error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() } });
    }

    const { error } = await supabase
      .from('collection_snapshots')
      .delete()
      .eq('id', snapshotId)
      .eq('collection_id', collection.id);

    if (error) throw error;

    res.json({ message: 'Snapshot deleted', timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Error deleting snapshot', { error: error.message });
    res.status(500).json({ error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() } });
  }
});

export default router;
