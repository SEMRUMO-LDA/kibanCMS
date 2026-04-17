/**
 * Coupons route — public API for code validation.
 *
 * POST /api/v1/coupons/validate
 *   Validates a coupon WITHOUT reserving it. Safe to call on every keystroke
 *   in a frontend "apply coupon" form. Actual reservation happens at checkout.
 */

import { Router, type Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { validateCoupon } from '../lib/coupons.js';
import { logger } from '../lib/logger.js';

const router: Router = Router();

router.post('/validate', async (req: AuthRequest, res: Response) => {
  try {
    const { code, resource_slug, customer_email, subtotal_cents, currency } = req.body || {};

    if (!code || !resource_slug || !customer_email || subtotal_cents == null || !currency) {
      return res.status(400).json({
        error: {
          message: 'Missing required fields: code, resource_slug, customer_email, subtotal_cents, currency',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const result = await validateCoupon({
      code: String(code),
      resource_slug: String(resource_slug),
      customer_email: String(customer_email).toLowerCase(),
      subtotal_cents: Number(subtotal_cents),
      currency: String(currency).toLowerCase(),
    });

    // Redact the full coupon object in the response — expose only what the frontend needs
    if (result.valid && result.coupon) {
      return res.json({
        data: {
          valid: true,
          code: result.coupon.code,
          type: result.coupon.type,
          discount_cents: result.discount_cents,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      data: {
        valid: false,
        reason: result.reason,
        message: result.message,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error validating coupon', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to validate coupon', status: 500, timestamp: new Date().toISOString() },
    });
  }
});

export default router;
