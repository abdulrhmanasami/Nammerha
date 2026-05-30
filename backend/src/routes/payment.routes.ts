// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha — Payment Routes
// Endpoints for payment initiation, webhooks, and status checks
// ============================================================================

import { Router, Request, Response } from 'express';
import { paymentService, type PaymentGateway } from '../services/payment.service';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireIdempotencyKey } from '../middleware/require-idempotency-key.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { query } from '../config/database';
import { safeRouteError } from '../utils/safe-error';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';
import { initiatePaymentSchema, webhookCallbackSchema } from '../validation/schemas';

const router = Router();

// NMR-AUD-010: Maximum payment amount (integer cents) — defense-in-depth.
// This cap prevents astronomically large payment records and potential overflow
// in BigInt arithmetic. Configurable via environment.
const MAX_PAYMENT_CENTS = parseInt(process.env['MAX_PAYMENT_CENTS'] ?? '10000000', 10); // Default: $100,000

// ─── POST /api/payments/initiate ────────────────────────────────────────────
// Authenticated donors initiate a payment for a specific BOQ item.
// F-001 FIX: requireIdempotencyKey enforces header presence + validation.
// idempotencyMiddleware caches/replays responses for duplicate keys.
// This double-layer prevents double charges in degraded Syrian network conditions.
router.post(
  '/initiate',
  authMiddleware,
  requireActive,
  // UNIFIED CITIZEN: open to all authenticated users
  requireIdempotencyKey,
  idempotencyMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const dto = initiatePaymentSchema.parse(req.body);
      const { item_id, project_id, amount, gateway, currency, return_url } = dto;

      // NMR-AUD-010 FIX: Maximum cap (defense-in-depth against overflow/abuse)
      // Zod guarantees positive integer, but env-configurable cap is kept.
      if (amount > MAX_PAYMENT_CENTS) {
        res.status(400).json({
          success: false,
          error: `Amount exceeds maximum allowed: ${MAX_PAYMENT_CENTS} cents`,
        });
        return;
      }

      const donorId = getAuthUser(req).user_id;

      // NMR-AUD-007: Fetch donor details for gateway API (Fatora requires email)
      const donorResult = await query<{ full_name: string; email: string }>(
        'SELECT full_name, email FROM users WHERE user_id = $1',
        [donorId],
      );
      const donor = donorResult.rows[0];

      const result = await paymentService.initiate({
        user_id: donorId,
        item_id,
        project_id,
        amount,
        currency: currency ?? 'USD',
        gateway,
        return_url,
        donor_name: donor?.full_name,
        donor_email: donor?.email,
      });

      res.status(201).json({
        success: true,
        data: {
          reference: result.reference,
          status: result.status,
          payment_url: result.payment_url,
          gateway_tx_id: result.gateway_tx_id,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ success: false, error: 'Validation failed', details: error.issues });
        return;
      }
      safeRouteError(res, error, 'Payment.Initiate');
    }
  },
);

// ─── POST /api/payments/webhook ─────────────────────────────────────────────
// Public endpoint for gateway callbacks (no auth — verified by HMAC signature)
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const dto = webhookCallbackSchema.parse(req.body);
    const { reference, gateway, status, gateway_tx_id, signature } = dto;

    // NMR-AUD-005 FIX: Use RAW request body for HMAC verification.
    // Previously reconstructed JSON from destructured vars — fragile due
    // to key ordering differences between sender and receiver.
    // The raw body is captured by express.json({ verify }) in server.ts.
    const rawPayload =
      (req as Request & { rawBody?: string }).rawBody ??
      JSON.stringify({ reference, gateway, status, gateway_tx_id });

    if (!paymentService.verifySignature(rawPayload, signature)) {
      logger.error('Payment: Webhook signature verification failed', { reference });
      res.status(401).json({
        success: false,
        error: 'Invalid webhook signature',
      });
      return;
    }

    const result = await paymentService.handleWebhook({
      reference,
      gateway: gateway as PaymentGateway,
      status: status as 'success' | 'failure',
      gateway_tx_id: gateway_tx_id ?? '',
    });

    // Always respond 200 to webhooks to prevent retries
    res.status(200).json({
      success: true,
      processed: result.processed,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      // Log but respond 200 to prevent gateway retries on malformed payloads
      logger.error('Payment: Webhook validation failed', { details: err.issues });
      res.status(200).json({ success: false, processed: false });
      return;
    }
    // Log but still respond 200 to prevent gateway retries
    logger.error('Payment: Webhook processing error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(200).json({
      success: false,
      processed: false,
    });
  }
});

// ─── GET /api/payments/status/:ref ──────────────────────────────────────────
// Check payment status by reference
// MED-AUD-003 FIX: Added ownership verification to prevent IDOR.
// Only the payment's donor or admin/auditor roles may access payment details.
router.get(
  '/status/:ref',
  authMiddleware,
  requireActive,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const reference = String(req.params['ref']);

      const payment = await paymentService.getStatus(reference);

      if (!payment) {
        res.status(404).json({
          success: false,
          error: 'Payment not found',
        });
        return;
      }

      // MED-AUD-003: Ownership verification — prevent IDOR
      const userRole = getAuthUser(req).role;
      const userId = getAuthUser(req).user_id;
      const isPrivileged = userRole === 'admin' || userRole === 'auditor';
      if (payment.user_id !== userId && !isPrivileged) {
        res.status(403).json({
          success: false,
          error: 'Access denied: you can only view your own payments',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          reference: payment.reference,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          gateway: payment.gateway,
          created_at: payment.created_at,
        },
      });
    } catch (error) {
      safeRouteError(res, error, 'Payment.Status');
    }
  },
);

// ─── GET /api/payments/history ──────────────────────────────────────────────
// Get payment history for authenticated donor
router.get(
  '/history',
  authMiddleware,
  requireActive,
  // UNIFIED CITIZEN: open to all authenticated users
  async (req: Request, res: Response): Promise<void> => {
    try {
      const payments = await paymentService.getDonorPayments(getAuthUser(req).user_id);

      res.json({
        success: true,
        data: payments,
      });
    } catch (error) {
      safeRouteError(res, error, 'Payment.History');
    }
  },
);

export default router;
