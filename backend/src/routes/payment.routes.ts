// ============================================================================
// Nammerha — Payment Routes
// Endpoints for payment initiation, webhooks, and status checks
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { paymentService, PaymentGateway } from '../services/payment.service';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';

const router = Router();

// ─── POST /api/payments/initiate ────────────────────────────────────────────
// Authenticated donors initiate a payment for a specific BOQ item
router.post(
    '/initiate',
    authMiddleware,
    requireActive,
    requireRole('donor'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { item_id, project_id, amount, gateway, currency, return_url } = req.body as {
                item_id: string;
                project_id: string;
                amount: number;
                gateway: PaymentGateway;
                currency?: string;
                return_url?: string;
            };

            if (!item_id || !project_id || !amount || !gateway) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields: item_id, project_id, amount, gateway',
                });
                return;
            }

            if (!['visa', 'fatora'].includes(gateway)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid gateway. Supported: visa, fatora',
                });
                return;
            }

            if (typeof amount !== 'number' || amount <= 0) {
                res.status(400).json({
                    success: false,
                    error: 'Amount must be a positive number',
                });
                return;
            }

            const donorId = String((req as unknown as { user?: { user_id?: string } }).user?.user_id ?? '');

            const result = await paymentService.initiate({
                donor_id: donorId,
                item_id,
                project_id,
                amount,
                currency: currency ?? 'USD',
                gateway,
                return_url,
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
        } catch (err) {
            next(err);
        }
    }
);

// ─── POST /api/payments/webhook ─────────────────────────────────────────────
// Public endpoint for gateway callbacks (no auth — verified by signature)
router.post(
    '/webhook',
    async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
        try {
            const { reference, gateway, status, gateway_tx_id, signature } = req.body as {
                reference: string;
                gateway: PaymentGateway;
                status: 'success' | 'failure';
                gateway_tx_id: string;
                signature?: string;
            };

            if (!reference || !gateway || !status || !gateway_tx_id) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required webhook fields',
                });
                return;
            }

            const result = await paymentService.handleWebhook({
                reference,
                gateway,
                status,
                gateway_tx_id,
                signature,
            });

            // Always respond 200 to webhooks to prevent retries
            res.status(200).json({
                success: true,
                processed: result.processed,
            });
        } catch (err) {
            // Log but still respond 200 to prevent gateway retries
            console.error('[Payment Webhook Error]', err);
            res.status(200).json({
                success: false,
                processed: false,
            });
        }
    }
);

// ─── GET /api/payments/status/:ref ──────────────────────────────────────────
// Check payment status by reference
router.get(
    '/status/:ref',
    authMiddleware,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
        } catch (err) {
            next(err);
        }
    }
);

// ─── GET /api/payments/history ──────────────────────────────────────────────
// Get payment history for authenticated donor
router.get(
    '/history',
    authMiddleware,
    requireActive,
    requireRole('donor'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const donorId = String((req as unknown as { user?: { user_id?: string } }).user?.user_id ?? '');
            const payments = await paymentService.getDonorPayments(donorId);

            res.json({
                success: true,
                data: payments,
            });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
