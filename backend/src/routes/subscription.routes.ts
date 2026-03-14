// ============================================================================
// Nammerha Backend — Subscription Routes
// SaaS subscription management endpoints per profitability study Phase 2.
// Public: plan listing. Authenticated: subscribe/cancel/my-sub.
// Admin: subscriber list, plan pricing update.
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import {
    getPlans,
    getUserSubscription,
    subscribe,
    cancelSubscription,
    listSubscribers,
    updatePlanPricing,
} from '../services/subscription.service';

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES (no auth required)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/subscriptions/plans
 * List all active subscription plans with their feature matrices.
 * Public endpoint — used by the pricing page.
 */
router.get('/plans', async (_req: Request, res: Response): Promise<void> => {
    try {
        const plans = await getPlans();
        res.json({ success: true, data: plans });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'Failed to load subscription plans',
            detail: err instanceof Error ? err.message : String(err),
        });
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ROUTES (require valid JWT)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/subscriptions/me
 * Get the authenticated user's current subscription.
 * Returns null data if user is on the implicit free tier.
 */
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }

        const subscription = await getUserSubscription(req.authUser.user_id);
        res.json({
            success: true,
            data: subscription,
            is_free_tier: subscription === null,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'Failed to load subscription',
            detail: err instanceof Error ? err.message : String(err),
        });
    }
});

/**
 * POST /api/subscriptions/subscribe
 * Subscribe to a plan or upgrade/downgrade.
 * Body: { plan_slug: string }
 */
router.post('/subscribe', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }

        const { plan_slug } = req.body as { plan_slug?: string };
        if (!plan_slug || typeof plan_slug !== 'string') {
            res.status(400).json({
                success: false,
                error: 'plan_slug is required and must be a string',
            });
            return;
        }

        const subscription = await subscribe(req.authUser.user_id, plan_slug);
        res.status(201).json({ success: true, data: subscription });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes('not found') ? 404 : 500;
        res.status(status).json({
            success: false,
            error: message,
        });
    }
});

/**
 * POST /api/subscriptions/cancel
 * Cancel the current subscription (will remain active until period end).
 */
router.post('/cancel', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }

        await cancelSubscription(req.authUser.user_id);
        res.json({
            success: true,
            message: 'Subscription cancelled. Access remains until current billing period ends.',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes('No active') ? 404 : 500;
        res.status(status).json({
            success: false,
            error: message,
        });
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES (require 'admin' role)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/subscriptions/admin/subscribers
 * List all subscribers with pagination.
 * Query: ?limit=50&offset=0
 */
router.get(
    '/admin/subscribers',
    authMiddleware,
    requireRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const limit = parseInt(req.query['limit'] as string, 10) || 50;
            const offset = parseInt(req.query['offset'] as string, 10) || 0;

            const result = await listSubscribers(limit, offset);
            res.json({ success: true, data: result });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: 'Failed to list subscribers',
                detail: err instanceof Error ? err.message : String(err),
            });
        }
    },
);

/**
 * PUT /api/subscriptions/admin/plans/:planId
 * Update plan pricing.
 * Body: { price_cents: number }
 */
router.put(
    '/admin/plans/:planId',
    authMiddleware,
    requireRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const planId = req.params['planId'] as string;
            const { price_cents } = req.body as { price_cents?: number };

            if (typeof price_cents !== 'number' || price_cents < 0) {
                res.status(400).json({
                    success: false,
                    error: 'price_cents must be a non-negative number',
                });
                return;
            }

            if (!planId) {
                res.status(400).json({ success: false, error: 'planId is required' });
                return;
            }

            const updated = await updatePlanPricing(planId, price_cents);
            res.json({ success: true, data: updated });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const status = message.includes('not found') ? 404 : 500;
            res.status(status).json({
                success: false,
                error: message,
            });
        }
    },
);

export default router;
