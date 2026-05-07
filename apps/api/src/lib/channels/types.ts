/**
 * Channel Manager — adapter contract.
 *
 * Each provider (Bokun, FareHarbor, Cloudbeds, …) ships an adapter that
 * implements this interface. The CMS routes don't speak provider dialects;
 * they call adapter methods and trust the adapter to translate.
 */

export interface ChannelCredentials {
  // Free-form per-provider. Adapters know what they need.
  [key: string]: any;
}

export interface NormalizedBooking {
  external_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  product_external_id?: string;   // Bokun product/experience id
  product_title: string;
  date: string;                   // YYYY-MM-DD
  time_slot?: string;             // HH:mm
  participants: number;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  notes?: string;
  raw: any;                       // original payload for audit
}

export interface WebhookEvent {
  event_type: string;             // 'booking.created' | 'booking.cancelled' | ...
  external_id: string;
  booking?: NormalizedBooking;    // present for create/update
}

/**
 * How a provider authenticates inbound webhooks.
 *
 *  - 'url-token':  the webhook_secret is part of the URL path. The provider
 *                  has no signing capability, so we rely on URL secrecy.
 *                  The server compares the URL token to the stored secret
 *                  with timingSafeEqual before parsing the body. Bokun's
 *                  Push notifications work this way.
 *  - 'hmac':       provider signs the body and sends a signature header.
 *                  The adapter's verifyWebhook does HMAC + parse.
 *                  FareHarbor / Cloudbeds work this way.
 */
export type WebhookAuthMode = 'url-token' | 'hmac';

export interface ChannelAdapter {
  readonly id: string;            // 'bokun', 'fareharbor', ...
  readonly displayName: string;
  readonly webhookAuthMode: WebhookAuthMode;

  /** Probe credentials by hitting a low-cost endpoint. */
  validateCredentials(creds: ChannelCredentials): Promise<{ ok: boolean; error?: string }>;

  /**
   * Parse an inbound webhook body into the normalized event shape.
   *
   * For 'hmac' adapters, this method MUST also verify the signature using
   * the provided secret and return null on mismatch.
   *
   * For 'url-token' adapters, the route handler has already validated the
   * URL token; this method only needs to JSON.parse and normalize.
   */
  parseWebhook(args: {
    rawBody: string;
    headers: Record<string, string | string[] | undefined>;
    secret: string;
  }): WebhookEvent | null;
}
