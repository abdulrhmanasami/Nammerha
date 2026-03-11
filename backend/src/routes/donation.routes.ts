// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Donation Routes (Path 2 — Authenticated)
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as crowdfundingService from '../services/crowdfunding.service';
import type { CreateDonationDTO, ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/donations — Fund Specific BOQ Items (Donor) ─────────────────
// SEC-004 FIX: Idempotency-Key header prevents double-submit.
// RED TEAM FIX: Uses pg_advisory_xact_lock for atomic serialization.
// Two concurrent requests with the same key are serialized at the DB level —
// the second one waits for the first to commit, then finds the existing record.
// This is the same proven pattern used by the payment webhook handler.
router.post('/', requireRole('donor'), async (req: Request, res: Response) => {
    try {
        const dto = req.body as CreateDonationDTO;

        if (!dto.items || !Array.isArray(dto.items) || dto.items.length === 0) {
            const response: ApiResponse = { success: false, error: 'At least one item is required' };
            res.status(400).json(response);
            return;
        }

        if (!dto.payment_method) {
            const response: ApiResponse = { success: false, error: 'payment_method is required' };
            res.status(400).json(response);
            return;
        }

        // Validate each item has item_id and amount > 0
        for (const item of dto.items) {
            if (!item.item_id || !item.amount || item.amount <= 0) {
                const response: ApiResponse = {
                    success: false,
                    error: `Invalid item: item_id and positive amount are required`,
                };
                res.status(400).json(response);
                return;
            }
        }

        // SEC-004 + RED TEAM: Atomic idempotency via pg_advisory_xact_lock
        // Uses a transaction-scoped advisory lock keyed on the idempotency key hash.
        // This serializes concurrent requests with the same key at the DB level.
        const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
        if (idempotencyKey) {
            const { getClient } = await import('../config/database');
            const client = await getClient();
            try {
                await client.query('BEGIN');

                // Acquire advisory lock — blocks concurrent requests with same key
                // hashtext() is a PostgreSQL built-in that converts text→int4
                await client.query(
                    `SELECT pg_advisory_xact_lock(hashtext($1))`,
                    [idempotencyKey]
                );

                // Now check if a prior request already completed
                const existing = await client.query<{ new_values: string }>(
                    `SELECT new_values FROM audit_trail
                     WHERE action = 'donation_created'
                       AND entity_type = 'idempotency'
                       AND entity_id = $1
                       AND created_at > NOW() - INTERVAL '5 minutes'
                     LIMIT 1`,
                    [idempotencyKey]
                );

                if (existing.rows[0]) {
                    await client.query('COMMIT');
                    const cachedData = JSON.parse(existing.rows[0].new_values);
                    res.status(200).json({
                        success: true,
                        data: cachedData,
                        message: 'Duplicate request — returning original result (idempotency)',
                    } as ApiResponse);
                    return;
                }

                // First request: process the donation
                const escrowEntries = await crowdfundingService.createDonation(
                    getAuthUser(req).user_id,
                    dto
                );

                const totalLocked = escrowEntries.reduce((sum, e) => sum + e.amount_locked, 0);
                const responseData = {
                    escrow_entries: escrowEntries,
                    total_locked: totalLocked,
                    items_funded: escrowEntries.length,
                };

                // Store idempotency record within the same transaction
                await client.query(
                    `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                     VALUES ('donation_created', 'idempotency', $1, $2, $3)`,
                    [idempotencyKey, getAuthUser(req).user_id, JSON.stringify(responseData)]
                );

                await client.query('COMMIT');

                res.status(201).json({
                    success: true,
                    data: responseData,
                    message: `Successfully locked $${(totalLocked / 100).toFixed(2)} in escrow`,
                } as ApiResponse);
            } catch (txErr) {
                await client.query('ROLLBACK');
                throw txErr;
            } finally {
                client.release();
            }
            return;
        }

        // No idempotency key — process normally (legacy behavior)
        const escrowEntries = await crowdfundingService.createDonation(
            getAuthUser(req).user_id,
            dto
        );

        const totalLocked = escrowEntries.reduce((sum, e) => sum + e.amount_locked, 0);
        const responseData = {
            escrow_entries: escrowEntries,
            total_locked: totalLocked,
            items_funded: escrowEntries.length,
        };

        res.status(201).json({
            success: true,
            data: responseData,
            message: `Successfully locked $${(totalLocked / 100).toFixed(2)} in escrow`,
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Donation');
    }
});

// ─── GET /api/donations/my/summary — Donor Escrow Summary ──────────────────
router.get('/my/summary', requireRole('donor'), async (req: Request, res: Response) => {
    try {
        const summary = await crowdfundingService.getDonorEscrowSummary(getAuthUser(req).user_id);
        res.json({ success: true, data: summary } as ApiResponse);
            } catch (error) {
                safeRouteError(res, error, 'Donation');
    }
});

// ─── GET /api/donations/my/history — Donor Donation History ─────────────────
router.get('/my/history', requireRole('donor'), async (req: Request, res: Response) => {
    try {
        const donations = await crowdfundingService.getDonorDonations(getAuthUser(req).user_id);
        res.json({ success: true, data: donations } as ApiResponse);
            } catch (error) {
                safeRouteError(res, error, 'Donation');
    }
});

export default router;
