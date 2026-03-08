// ============================================================================
// Nammerha Backend — Donation Routes (Path 2 — Authenticated)
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as crowdfundingService from '../services/crowdfunding.service';
import type { CreateDonationDTO, ApiResponse } from '../types';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/donations — Fund Specific BOQ Items (Donor) ─────────────────
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

        const escrowEntries = await crowdfundingService.createDonation(
            req.authUser!.user_id,
            dto
        );

        const totalLocked = escrowEntries.reduce((sum, e) => sum + e.amount_locked, 0);

        const response: ApiResponse = {
            success: true,
            data: {
                escrow_entries: escrowEntries,
                total_locked: totalLocked,
                items_funded: escrowEntries.length,
            },
            message: `Successfully locked $${(totalLocked / 100).toFixed(2)} in escrow`,
        };
        res.status(201).json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('fully funded') ? 409 : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/donations/my/summary — Donor Escrow Summary ──────────────────
router.get('/my/summary', requireRole('donor'), async (req: Request, res: Response) => {
    try {
        const summary = await crowdfundingService.getDonorEscrowSummary(req.authUser!.user_id);
        res.json({ success: true, data: summary } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/donations/my/history — Donor Donation History ─────────────────
router.get('/my/history', requireRole('donor'), async (req: Request, res: Response) => {
    try {
        const donations = await crowdfundingService.getDonorDonations(req.authUser!.user_id);
        res.json({ success: true, data: donations } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
