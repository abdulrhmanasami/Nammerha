// ============================================================================
// Nammerha Backend — Monetization Routes
// Admin revenue dashboard + Supplier commission history + Tip endpoints
// Per profitability study Phase 1: Market Liquidity & E-commerce Revenue
// ============================================================================
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import {
  getCommissionConfig,
  updateCommissionRate,
  getCommissionSummary,
  getAllCommissions,
  getSupplierCommissions,
} from '../services/commission.service';
import {
  recordTip,
  getTipSummary,
  getUserTips,
  getPlatformRevenueSummary,
} from '../services/tip.service';

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES (require 'admin' role)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/revenue/admin/summary
 * Combined platform revenue snapshot (commissions + tips).
 */
router.get('/admin/summary', authMiddleware, requireRole('admin'), async (_req, res) => {
  try {
    const summary = await getPlatformRevenueSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch revenue summary',
    });
  }
});

/**
 * GET /api/revenue/admin/commissions
 * List all commission entries with optional supplier filter.
 */
router.get('/admin/commissions', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const pLimit = parseInt(req.query['limit'] as string, 10);
    const limit = Number.isNaN(pLimit) ? 50 : pLimit;
    const pOffset = parseInt(req.query['offset'] as string, 10);
    const offset = Number.isNaN(pOffset) ? 0 : pOffset;
    const supplierId = req.query['supplier_id'] as string | undefined;

    const result = await getAllCommissions(limit, offset, supplierId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch commissions',
    });
  }
});

/**
 * GET /api/revenue/admin/commissions/summary
 * Commission aggregate metrics for admin dashboard.
 */
router.get('/admin/commissions/summary', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const startDate = req.query['start_date'] as string | undefined;
    const endDate = req.query['end_date'] as string | undefined;

    const summary = await getCommissionSummary(startDate, endDate);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch commission summary',
    });
  }
});

/**
 * GET /api/revenue/admin/tips/summary
 * Tip aggregate metrics for admin dashboard.
 */
router.get('/admin/tips/summary', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const startDate = req.query['start_date'] as string | undefined;
    const endDate = req.query['end_date'] as string | undefined;

    const summary = await getTipSummary(startDate, endDate);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch tip summary',
    });
  }
});

/**
 * GET /api/revenue/admin/config
 * Get commission tier configuration.
 */
router.get('/admin/config', authMiddleware, requireRole('admin'), async (_req, res) => {
  try {
    const config = await getCommissionConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch config',
    });
  }
});

/**
 * PUT /api/revenue/admin/config/:tierId
 * Update a commission tier's rate (in basis points).
 */
router.put('/admin/config/:tierId', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const tierId = req.params['tierId'] as string;
    const { commission_rate_bps } = req.body as { commission_rate_bps: number };

    if (typeof commission_rate_bps !== 'number' || !tierId) {
      res.status(400).json({
        success: false,
        error: 'commission_rate_bps (number) and tierId are required',
      });
      return;
    }

    const updated = await updateCommissionRate(tierId, commission_rate_bps);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update tier',
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// UNIFIED CITIZEN ROUTES (any authenticated user)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/revenue/supplier/commissions
 * Get my commission history (supplier view).
 */
router.get('/supplier/commissions', authMiddleware, async (req, res) => {
  try {
    const supplierId = req.authUser?.user_id;
    if (!supplierId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const pLimit = parseInt(req.query['limit'] as string, 10);
    const limit = Number.isNaN(pLimit) ? 50 : pLimit;
    const pOffset = parseInt(req.query['offset'] as string, 10);
    const offset = Number.isNaN(pOffset) ? 0 : pOffset;

    const result = await getSupplierCommissions(supplierId, limit, offset);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch commissions',
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// USER ROUTES (require authenticated user) — GATED by PAYMENTS_ENABLED flag
// ═════════════════════════════════════════════════════════════════════════════
const PAYMENTS_ENABLED = process.env['PAYMENTS_ENABLED'] === 'true';

/**
 * POST /api/revenue/donor/tip
 * Record a voluntary platform tip from a donor.
 */
router.post('/donor/tip', authMiddleware, async (req, res) => {
  if (!PAYMENTS_ENABLED) {
    res.status(503).json({ success: false, error: 'Payments are temporarily disabled.' });
    return;
  }
  try {
    const donorId = req.authUser?.user_id;
    if (!donorId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const {
      payment_reference,
      tip_amount_cents,
      tip_percentage,
      payment_gateway,
      payment_gateway_ref,
    } = req.body as {
      payment_reference: string;
      tip_amount_cents: number;
      tip_percentage?: number;
      payment_gateway?: string;
      payment_gateway_ref?: string;
    };

    if (!payment_reference || typeof tip_amount_cents !== 'number' || tip_amount_cents <= 0) {
      res.status(400).json({
        success: false,
        error: 'payment_reference (string) and tip_amount_cents (number > 0) are required',
      });
      return;
    }

    const tip = await recordTip(
      donorId,
      payment_reference,
      tip_amount_cents,
      tip_percentage ?? null,
      payment_gateway,
      payment_gateway_ref,
    );

    res.status(201).json({ success: true, data: tip });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to record tip',
    });
  }
});

/**
 * GET /api/revenue/donor/tips
 * Get my tip history (donor view).
 */
router.get('/donor/tips', authMiddleware, async (req, res) => {
  if (!PAYMENTS_ENABLED) {
    res.status(503).json({ success: false, error: 'Payments are temporarily disabled.' });
    return;
  }
  try {
    const donorId = req.authUser?.user_id;
    if (!donorId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const pLimit = parseInt(req.query['limit'] as string, 10);
    const limit = Number.isNaN(pLimit) ? 50 : pLimit;
    const pOffset = parseInt(req.query['offset'] as string, 10);
    const offset = Number.isNaN(pOffset) ? 0 : pOffset;

    const result = await getUserTips(donorId, limit, offset);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch tips',
    });
  }
});

export default router;
