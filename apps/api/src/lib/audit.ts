/**
 * Audit Log Helper
 *
 * Logs actions to the audit_log table for compliance and debugging.
 * Uses the tenant-aware Supabase proxy — automatically writes to the correct DB.
 *
 * Usage in routes:
 *   await audit(req, 'create', 'collection', collection.id, { name: collection.name });
 */

import type { Request } from 'express';
import { supabase } from './supabase.js';
import type { RequestWithId } from '../middleware/request-id.js';
import type { AuthRequest } from '../middleware/auth.js';

interface AuditEntry {
  user_id?: string;
  user_email?: string;
  action: string;
  resource: string;
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  request_id?: string;
}

/**
 * Log an action to the audit log.
 * Non-blocking — fires and forgets. Never throws.
 */
export function audit(
  req: Request,
  action: string,
  resource: string,
  resourceId?: string,
  details?: Record<string, any>
): void {
  const authReq = req as AuthRequest;
  const reqWithId = req as RequestWithId;

  const entry: AuditEntry = {
    user_id: authReq.user?.id || authReq.profileId || undefined,
    user_email: authReq.user?.email || undefined,
    action,
    resource,
    resource_id: resourceId,
    details: details || {},
    ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
    request_id: reqWithId.requestId,
  };

  // Fire and forget — don't block the response
  supabase
    .from('audit_log')
    .insert(entry)
    .then(({ error }) => {
      if (error) {
        console.error('[Audit] Failed to write:', error.message, entry);
      }
    })
    .catch((err: any) => {
      console.error('[Audit] Exception:', err.message);
    });
}
