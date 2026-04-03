import crypto from 'crypto';
import { supabase } from './supabase.js';

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: any;
  url: string;
  retry_count: number;
}

interface Webhook {
  id: string;
  url: string;
  secret: string;
  enabled: boolean;
  total_deliveries: number;
  failed_deliveries: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Deliver a single webhook
 */
async function deliverWebhook(delivery: WebhookDelivery, webhook: Webhook): Promise<boolean> {
  const startTime = Date.now();
  const payloadString = JSON.stringify(delivery.payload);
  const signature = generateSignature(payloadString, webhook.secret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(delivery.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': delivery.event_type,
        'X-Webhook-ID': delivery.id,
        'X-Webhook-Timestamp': new Date().toISOString(),
        'User-Agent': 'KibanCMS-Webhooks/1.0',
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const duration = Date.now() - startTime;
    const responseBody = await response.text();
    const success = response.ok; // 2xx status codes

    // Update delivery record
    await supabase
      .from('webhook_deliveries')
      .update({
        status_code: response.status,
        response_body: responseBody.substring(0, 1000), // Limit to 1000 chars
        response_headers: Object.fromEntries(response.headers.entries()),
        duration_ms: duration,
        success,
        delivered_at: new Date().toISOString(),
        error: success ? null : `HTTP ${response.status}: ${response.statusText}`,
      })
      .eq('id', delivery.id);

    // Update webhook stats
    if (success) {
      await supabase
        .from('webhooks')
        .update({
          total_deliveries: webhook.total_deliveries + 1,
          last_delivery_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', webhook.id);

      console.log(`✅ Webhook delivered: ${delivery.event_type} → ${delivery.url} (${duration}ms)`);
    } else {
      await supabase
        .from('webhooks')
        .update({
          total_deliveries: webhook.total_deliveries + 1,
          failed_deliveries: webhook.failed_deliveries + 1,
          last_delivery_at: new Date().toISOString(),
          last_error: `HTTP ${response.status}`,
        })
        .eq('id', webhook.id);

      console.error(`❌ Webhook failed: ${delivery.event_type} → ${delivery.url} (${response.status})`);
    }

    return success;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Update delivery record with error
    await supabase
      .from('webhook_deliveries')
      .update({
        duration_ms: duration,
        success: false,
        delivered_at: new Date().toISOString(),
        error: error.message,
      })
      .eq('id', delivery.id);

    // Update webhook stats
    await supabase
      .from('webhooks')
      .update({
        total_deliveries: webhook.total_deliveries + 1,
        failed_deliveries: webhook.failed_deliveries + 1,
        last_delivery_at: new Date().toISOString(),
        last_error: error.message,
      })
      .eq('id', webhook.id);

    console.error(`💥 Webhook error: ${delivery.event_type} → ${delivery.url}`, error.message);

    return false;
  }
}

/**
 * Process pending webhook deliveries
 */
export async function processWebhookQueue() {
  try {
    // Get pending deliveries (not yet delivered)
    const { data: deliveries, error } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .is('delivered_at', null)
      .lt('retry_count', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(10); // Process 10 at a time

    if (error || !deliveries || deliveries.length === 0) {
      return;
    }

    console.log(`📦 Processing ${deliveries.length} webhook deliveries...`);

    for (const delivery of deliveries) {
      // Get webhook config
      const { data: webhook, error: webhookError } = await supabase
        .from('webhooks')
        .select('*')
        .eq('id', delivery.webhook_id)
        .single();

      if (webhookError || !webhook || !webhook.enabled) {
        // Mark as failed if webhook doesn't exist or is disabled
        await supabase
          .from('webhook_deliveries')
          .update({
            success: false,
            error: 'Webhook disabled or not found',
            delivered_at: new Date().toISOString(),
          })
          .eq('id', delivery.id);
        continue;
      }

      // Attempt delivery
      const success = await deliverWebhook(delivery, webhook);

      // If failed and retries left, increment retry count
      if (!success && delivery.retry_count < MAX_RETRIES - 1) {
        await supabase
          .from('webhook_deliveries')
          .update({
            retry_count: delivery.retry_count + 1,
            delivered_at: null, // Reset to allow retry
          })
          .eq('id', delivery.id);

        // Wait before retry
        const retryDelay = RETRY_DELAYS[delivery.retry_count] || 30000;
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  } catch (error) {
    console.error('Error processing webhook queue:', error);
  }
}

/**
 * Start webhook worker (poll every 5 seconds)
 */
export function startWebhookWorker(intervalMs: number = 5000) {
  console.log('🔄 Starting webhook worker...');

  // Process immediately
  processWebhookQueue();

  // Then poll at interval
  const interval = setInterval(processWebhookQueue, intervalMs);

  return () => {
    console.log('⏹️  Stopping webhook worker...');
    clearInterval(interval);
  };
}
