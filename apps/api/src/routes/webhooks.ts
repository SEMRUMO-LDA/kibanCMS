import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

// Fields to return (never expose secret in list/get)
const WEBHOOK_SELECT = 'id, name, url, events, collections, enabled, total_deliveries, failed_deliveries, last_delivery_at, last_error, profile_id, created_at, updated_at';

/**
 * GET /api/v1/webhooks
 * List webhooks owned by the authenticated user
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select(WEBHOOK_SELECT)
      .eq('profile_id', req.profileId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      data: webhooks || [],
      meta: { count: webhooks?.length || 0 },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * POST /api/v1/webhooks
 * Create a new webhook
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, url, events, collections } = req.body;

    if (!name || !url || !events || !Array.isArray(events) || events.length === 0) {
      res.status(400).json({
        error: {
          message: 'Missing required fields: name, url, events (array)',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Validate URL
    try {
      const webhookUrl = new URL(url);
      if (!['http:', 'https:'].includes(webhookUrl.protocol)) {
        res.status(400).json({
          error: { message: 'URL must use http or https protocol', status: 400, timestamp: new Date().toISOString() },
        });
        return;
      }
    } catch {
      res.status(400).json({
        error: { message: 'Invalid URL format', status: 400, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Validate event types
    const validEvents = ['entry.created', 'entry.updated', 'entry.deleted', 'media.uploaded', 'webhook.test'];
    const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      res.status(400).json({
        error: {
          message: `Invalid event types: ${invalidEvents.join(', ')}. Valid: ${validEvents.join(', ')}`,
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Generate secret
    const { data: secretData, error: secretError } = await supabase.rpc('generate_webhook_secret');

    if (secretError || !secretData) {
      throw new Error('Failed to generate webhook secret');
    }

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .insert({
        name,
        url,
        events,
        collections: collections || [],
        secret: secretData,
        profile_id: req.profileId,
      })
      .select(WEBHOOK_SELECT)
      .single();

    if (error) throw error;

    // Return secret ONLY on creation (user's only chance to see it)
    res.status(201).json({
      data: { ...webhook, secret: secretData },
      message: 'Webhook created. Save the secret - it will not be shown again.',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error creating webhook:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * GET /api/v1/webhooks/:id
 * Get a single webhook (owner only, secret hidden)
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .select(WEBHOOK_SELECT)
      .eq('id', id)
      .eq('profile_id', req.profileId)
      .single();

    if (error || !webhook) {
      res.status(404).json({
        error: { message: 'Webhook not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    res.json({ data: webhook, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error fetching webhook:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * PATCH /api/v1/webhooks/:id
 * Update a webhook (owner only)
 */
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('webhooks')
      .select('id, profile_id')
      .eq('id', id)
      .single();

    if (!existing) {
      res.status(404).json({
        error: { message: 'Webhook not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    if (existing.profile_id !== req.profileId) {
      res.status(403).json({
        error: { message: 'Forbidden: You can only update your own webhooks', status: 403, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Only allow safe fields to be updated
    const updateData: Record<string, any> = {};
    const allowedFields = ['name', 'url', 'events', 'collections', 'enabled'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        error: { message: 'No valid fields to update', status: 400, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Validate URL if changing
    if (updateData.url) {
      try {
        const webhookUrl = new URL(updateData.url);
        if (!['http:', 'https:'].includes(webhookUrl.protocol)) {
          res.status(400).json({
            error: { message: 'URL must use http or https', status: 400, timestamp: new Date().toISOString() },
          });
          return;
        }
      } catch {
        res.status(400).json({
          error: { message: 'Invalid URL format', status: 400, timestamp: new Date().toISOString() },
        });
        return;
      }
    }

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .update(updateData)
      .eq('id', id)
      .select(WEBHOOK_SELECT)
      .single();

    if (error) throw error;

    res.json({ data: webhook, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error updating webhook:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * DELETE /api/v1/webhooks/:id
 * Delete a webhook (owner only)
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('webhooks')
      .select('id, profile_id')
      .eq('id', id)
      .single();

    if (!existing) {
      res.status(404).json({
        error: { message: 'Webhook not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    if (existing.profile_id !== req.profileId) {
      res.status(403).json({
        error: { message: 'Forbidden: You can only delete your own webhooks', status: 403, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { error } = await supabase.from('webhooks').delete().eq('id', id);
    if (error) throw error;

    res.json({ message: 'Webhook deleted successfully', timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * GET /api/v1/webhooks/:id/deliveries
 * Get delivery logs (owner only)
 */
router.get('/:id/deliveries', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    // Verify ownership
    const { data: webhook } = await supabase
      .from('webhooks')
      .select('id, profile_id')
      .eq('id', id)
      .single();

    if (!webhook) {
      res.status(404).json({
        error: { message: 'Webhook not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    if (webhook.profile_id !== req.profileId) {
      res.status(403).json({
        error: { message: 'Forbidden', status: 403, timestamp: new Date().toISOString() },
      });
      return;
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = parseInt(offset as string, 10) || 0;

    const { data: deliveries, error, count } = await supabase
      .from('webhook_deliveries')
      .select('*', { count: 'exact' })
      .eq('webhook_id', id)
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (error) throw error;

    res.json({
      data: deliveries || [],
      meta: { pagination: { limit: limitNum, offset: offsetNum, total: count || 0 } },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching deliveries:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * POST /api/v1/webhooks/:id/test
 * Send a test webhook (owner only)
 */
router.post('/:id/test', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .select(WEBHOOK_SELECT)
      .eq('id', id)
      .eq('profile_id', req.profileId)
      .single();

    if (error || !webhook) {
      res.status(404).json({
        error: { message: 'Webhook not found', status: 404, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: delivery, error: deliveryError } = await supabase
      .from('webhook_deliveries')
      .insert({
        webhook_id: webhook.id,
        event_type: 'webhook.test',
        payload: {
          event: 'webhook.test',
          webhook_id: webhook.id,
          webhook_name: webhook.name,
          message: 'This is a test webhook from KibanCMS',
          timestamp: new Date().toISOString(),
        },
        url: webhook.url,
      })
      .select()
      .single();

    if (deliveryError) throw deliveryError;

    res.json({
      data: { message: 'Test webhook queued for delivery', delivery_id: delivery.id },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error sending test webhook:', error);
    res.status(500).json({
      error: { message: 'Internal server error', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
