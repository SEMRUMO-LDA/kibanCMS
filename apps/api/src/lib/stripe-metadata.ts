/**
 * Stripe Checkout metadata helpers.
 *
 * The Stripe webhook trusts a few metadata keys to decide WHAT was paid for
 * (order_id, booking_id) and WHICH tenant database to update (tenant_id).
 * Frontends may pass their own `metadata`, so those keys must never come
 * from the client — otherwise a visitor can pay €0.50 with
 * `metadata.order_id = <expensive order>` and get it confirmed, or route the
 * webhook to another tenant.
 */

const RESERVED_KEYS = new Set([
  'tenant_id',
  'order_id',
  'order_number',
  'booking_id',
  'coupon_code',
  'discount_cents',
  'source',
]);

/** Returns the client metadata without server-controlled keys. */
export function sanitizeClientMetadata(metadata: unknown): Record<string, string> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    clean[key] = String(value);
  }
  return clean;
}
