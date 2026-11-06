import type { Response } from 'express';
import { supabase } from './supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

/**
 * Collections that hold personal data (leads, subscribers, bookings, orders…)
 * or add-on secrets/config (Stripe secret key, webhook URLs).
 *
 * Public frontends authenticate with an API key that ships inside their JS
 * bundle, so anyone can copy it. Because the API reads through the service-role
 * client (RLS does not apply), an API key may only read these collections when
 * it belongs to a super_admin, admin or editor. Requests from the admin UI (JWT)
 * keep their current behaviour.
 */
export const PRIVATE_COLLECTIONS: ReadonlySet<string> = new Set([
  'form-submissions',
  'forms-config',
  'newsletter-subscribers',
  'bookings',
  'orders',
  'stripe-config',
  'stripe-transactions',
  'coupon-redemptions',
  'affiliates',
  'commission-ledger',
  'automations',
]);

const PRIVATE_READER_ROLES: ReadonlySet<string> = new Set(['super_admin', 'admin', 'editor']);

/** True when this request may read private data (always true for the admin UI / JWT). */
export async function canReadPrivateData(req: AuthRequest): Promise<boolean> {
  if (req.authMethod !== 'api_key') return true;
  if (!req.profileId) return false;
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', req.profileId)
    .single();
  return PRIVATE_READER_ROLES.has(data?.role || '');
}

export function sendPrivateDataForbidden(res: Response): void {
  res.status(403).json({
    error: {
      message: 'Forbidden: this data is private. Use an API key that belongs to an admin or editor.',
      status: 403,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Guard for routes that read a collection by slug.
 * Returns true when the request may continue; otherwise sends 403 and returns false.
 */
export async function allowCollectionRead(
  req: AuthRequest,
  res: Response,
  collectionSlug: string,
): Promise<boolean> {
  if (!PRIVATE_COLLECTIONS.has(collectionSlug)) return true;
  if (await canReadPrivateData(req)) return true;
  sendPrivateDataForbidden(res);
  return false;
}
