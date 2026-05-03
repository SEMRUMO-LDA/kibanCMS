/**
 * Affiliates routes — admin API for the Affiliates add-on.
 *
 * Endpoints:
 *   GET  /api/v1/affiliates                  — list affiliates with current balance
 *   GET  /api/v1/affiliates/:id              — single affiliate + lifetime totals
 *   GET  /api/v1/affiliates/:id/ledger       — full ledger for an affiliate
 *   GET  /api/v1/affiliates/report?month=YYYY-MM — monthly aggregated report
 *   POST /api/v1/affiliates/:id/payout       — record a payout
 *
 * All endpoints require JWT (admin-only).
 */

import { Router, type Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { recordPayout } from '../lib/affiliates.js';

const router: Router = Router();

const DEFAULT_MIN_PAYOUT_EUR = 100;

async function getCollectionId(slug: string): Promise<string | null> {
  const { data } = await supabase.from('collections').select('id').eq('slug', slug).single();
  return data?.id || null;
}

interface LedgerEntry {
  id: string;
  affiliate_id: string;
  type: 'accrual' | 'reversal' | 'payout' | 'adjustment';
  amount_cents: number;
  currency: string;
  period: string;
  status: string;
  created_at: string;
  [k: string]: any;
}

async function loadLedgerRows(filter?: { affiliateId?: string; period?: string }): Promise<LedgerEntry[]> {
  const colId = await getCollectionId('commission-ledger');
  if (!colId) return [];

  let query = supabase
    .from('entries')
    .select('id, content, created_at')
    .eq('collection_id', colId)
    .order('created_at', { ascending: false });

  if (filter?.affiliateId) {
    query = query.filter('content->>affiliate_id', 'eq', filter.affiliateId);
  }
  if (filter?.period) {
    query = query.filter('content->>period', 'eq', filter.period);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('Failed to load ledger', { error: error.message });
    return [];
  }

  return (data || []).map(r => {
    const c = r.content as Record<string, any>;
    return {
      id: r.id,
      affiliate_id: c.affiliate_id || '',
      type: c.type,
      amount_cents: Number(c.amount_cents) || 0,
      currency: c.currency || 'eur',
      period: c.period || '',
      status: c.status || 'confirmed',
      created_at: c.created_at || r.created_at,
      coupon_code: c.coupon_code || '',
      order_id: c.order_id || '',
      booking_id: c.booking_id || '',
      commission_rate_snapshot: Number(c.commission_rate_snapshot) || 0,
      order_total_cents_snapshot: Number(c.order_total_cents_snapshot) || 0,
      stripe_session_id: c.stripe_session_id || '',
      stripe_payment_intent: c.stripe_payment_intent || '',
      related_event_id: c.related_event_id || '',
      notes: c.notes || '',
    };
  });
}

async function loadAffiliates(): Promise<Array<{ id: string; content: Record<string, any> }>> {
  const colId = await getCollectionId('affiliates');
  if (!colId) return [];
  const { data } = await supabase
    .from('entries')
    .select('id, content')
    .eq('collection_id', colId)
    .order('created_at', { ascending: false });
  return (data || []).map(r => ({ id: r.id, content: r.content as Record<string, any> }));
}

/** Read the global default min_payout from the affiliates addon config (site-settings). */
async function loadGlobalMinPayoutEur(): Promise<number> {
  try {
    const { data: settingsCol } = await supabase
      .from('collections')
      .select('id')
      .eq('slug', 'site-settings')
      .single();
    if (!settingsCol) return DEFAULT_MIN_PAYOUT_EUR;

    const { data: addonsEntry } = await supabase
      .from('entries')
      .select('content')
      .eq('collection_id', settingsCol.id)
      .eq('slug', 'addons-config')
      .single();
    const c = addonsEntry?.content as Record<string, any> | undefined;
    const raw = c?.affiliates?.min_payout_eur;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  } catch { /* fall through */ }
  return DEFAULT_MIN_PAYOUT_EUR;
}

function sumByAffiliate(rows: LedgerEntry[]): Map<string, number> {
  const byAff = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== 'confirmed') continue;
    byAff.set(r.affiliate_id, (byAff.get(r.affiliate_id) || 0) + r.amount_cents);
  }
  return byAff;
}

// ============================================
// GET /api/v1/affiliates
// ============================================

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const affiliates = await loadAffiliates();
    const ledger = await loadLedgerRows();
    const balances = sumByAffiliate(ledger);

    const result = affiliates.map(a => ({
      id: a.id,
      name: a.content.name || '',
      email: a.content.email || '',
      phone: a.content.phone || '',
      commission_rate: Number(a.content.commission_rate) || 0,
      status: a.content.status || 'active',
      payment_method: a.content.payment_method || '',
      balance_cents: balances.get(a.id) || 0,
      currency: 'eur',
    }));

    res.json({ data: result });
  } catch (err: any) {
    logger.error('GET /affiliates failed', { error: err.message });
    res.status(500).json({ error: { message: 'Failed to load affiliates', status: 500 } });
  }
});

// ============================================
// GET /api/v1/affiliates/report?month=YYYY-MM
// ============================================

router.get('/report', async (req: AuthRequest, res: Response) => {
  try {
    const month = String(req.query.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: { message: 'Query param "month" required in YYYY-MM format', status: 400 } });
    }

    const affiliates = await loadAffiliates();
    const allLedger = await loadLedgerRows();
    const monthLedger = allLedger.filter(r => r.period === month);
    const globalMinPayoutEur = await loadGlobalMinPayoutEur();

    // Lifetime confirmed balance per affiliate (used for payable-now calculation:
    // balance includes earlier carry-overs; payouts have negative amount, so this
    // sum naturally represents the current outstanding amount due).
    const lifetimeBalance = sumByAffiliate(allLedger);

    const rows = affiliates.map(a => {
      const monthRows = monthLedger.filter(r => r.affiliate_id === a.id);
      const accrualsCents = monthRows.filter(r => r.type === 'accrual' && r.status === 'confirmed')
        .reduce((s, r) => s + r.amount_cents, 0);
      const reversalsCents = monthRows.filter(r => r.type === 'reversal' && r.status === 'confirmed')
        .reduce((s, r) => s + Math.abs(r.amount_cents), 0);
      const payoutsCents = monthRows.filter(r => r.type === 'payout' && r.status === 'confirmed')
        .reduce((s, r) => s + Math.abs(r.amount_cents), 0);
      const ordersInMonth = monthRows.filter(r => r.type === 'accrual' && r.status === 'confirmed').length;

      const balanceCents = lifetimeBalance.get(a.id) || 0;
      const minPayoutEur = (() => {
        const perAff = Number(a.content.min_payout_eur);
        return Number.isFinite(perAff) && perAff > 0 ? perAff : globalMinPayoutEur;
      })();
      const minPayoutCents = Math.round(minPayoutEur * 100);
      const payable = balanceCents >= minPayoutCents;

      return {
        affiliate_id: a.id,
        name: a.content.name || '',
        email: a.content.email || '',
        commission_rate: Number(a.content.commission_rate) || 0,
        payment_method: a.content.payment_method || '',
        iban: a.content.iban || '',
        payment_details: a.content.payment_details || '',
        tax_id: a.content.tax_id || '',
        status: a.content.status || 'active',
        orders_in_month: ordersInMonth,
        accruals_cents: accrualsCents,
        reversals_cents: reversalsCents,
        payouts_cents: payoutsCents,
        net_month_cents: accrualsCents - reversalsCents,
        balance_cents: balanceCents,
        currency: 'eur',
        min_payout_eur: minPayoutEur,
        payable,
      };
    });

    res.json({
      data: rows,
      meta: {
        month,
        global_min_payout_eur: globalMinPayoutEur,
        currency: 'eur',
      },
    });
  } catch (err: any) {
    logger.error('GET /affiliates/report failed', { error: err.message });
    res.status(500).json({ error: { message: 'Failed to build report', status: 500 } });
  }
});

// ============================================
// GET /api/v1/affiliates/:id
// ============================================

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const colId = await getCollectionId('affiliates');
    if (!colId) return res.status(404).json({ error: { message: 'Affiliates add-on not installed', status: 404 } });

    const { data: entry } = await supabase
      .from('entries')
      .select('id, content, created_at')
      .eq('id', req.params.id)
      .eq('collection_id', colId)
      .single();
    if (!entry) return res.status(404).json({ error: { message: 'Affiliate not found', status: 404 } });

    const ledger = await loadLedgerRows({ affiliateId: req.params.id });
    const balanceCents = ledger
      .filter(r => r.status === 'confirmed')
      .reduce((s, r) => s + r.amount_cents, 0);
    const totalAccrualsCents = ledger
      .filter(r => r.type === 'accrual' && r.status === 'confirmed')
      .reduce((s, r) => s + r.amount_cents, 0);
    const totalPayoutsCents = ledger
      .filter(r => r.type === 'payout' && r.status === 'confirmed')
      .reduce((s, r) => s + Math.abs(r.amount_cents), 0);

    res.json({
      data: {
        id: entry.id,
        ...entry.content,
        balance_cents: balanceCents,
        total_accruals_cents: totalAccrualsCents,
        total_payouts_cents: totalPayoutsCents,
      },
    });
  } catch (err: any) {
    logger.error('GET /affiliates/:id failed', { error: err.message });
    res.status(500).json({ error: { message: 'Failed to load affiliate', status: 500 } });
  }
});

// ============================================
// GET /api/v1/affiliates/:id/ledger
// ============================================

router.get('/:id/ledger', async (req: AuthRequest, res: Response) => {
  try {
    const ledger = await loadLedgerRows({ affiliateId: req.params.id });
    res.json({ data: ledger });
  } catch (err: any) {
    logger.error('GET /affiliates/:id/ledger failed', { error: err.message });
    res.status(500).json({ error: { message: 'Failed to load ledger', status: 500 } });
  }
});

// ============================================
// POST /api/v1/affiliates/:id/payout
// Body: { amount_cents: number, currency?: string, notes?: string }
// ============================================

router.post('/:id/payout', async (req: AuthRequest, res: Response) => {
  try {
    const { amount_cents, currency, notes } = req.body || {};
    const amt = Number(amount_cents);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: { message: 'amount_cents must be a positive number', status: 400 } });
    }

    const colId = await getCollectionId('affiliates');
    if (!colId) return res.status(404).json({ error: { message: 'Affiliates add-on not installed', status: 404 } });

    const { data: entry } = await supabase
      .from('entries')
      .select('id')
      .eq('id', req.params.id)
      .eq('collection_id', colId)
      .single();
    if (!entry) return res.status(404).json({ error: { message: 'Affiliate not found', status: 404 } });

    const ledgerId = await recordPayout({
      affiliateId: req.params.id,
      amountCents: amt,
      currency: currency || 'eur',
      notes: notes || '',
    });

    if (!ledgerId) {
      return res.status(500).json({ error: { message: 'Failed to record payout', status: 500 } });
    }

    res.json({ data: { ledger_id: ledgerId } });
  } catch (err: any) {
    logger.error('POST /affiliates/:id/payout failed', { error: err.message });
    res.status(500).json({ error: { message: 'Failed to record payout', status: 500 } });
  }
});

export default router;
