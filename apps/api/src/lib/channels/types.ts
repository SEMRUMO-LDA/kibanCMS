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

export interface ChannelAdapter {
  readonly id: string;            // 'bokun', 'fareharbor', ...
  readonly displayName: string;

  /** Probe credentials by hitting a low-cost endpoint. */
  validateCredentials(creds: ChannelCredentials): Promise<{ ok: boolean; error?: string }>;

  /**
   * Verify that an inbound webhook actually came from the provider.
   * Returns the parsed event on success, or null if the signature is
   * invalid (caller should respond 401 and not process).
   */
  verifyWebhook(args: {
    rawBody: string;
    headers: Record<string, string | string[] | undefined>;
    secret: string;
  }): WebhookEvent | null;
}
