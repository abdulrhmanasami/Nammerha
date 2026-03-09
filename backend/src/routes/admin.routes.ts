// ============================================================================
// Nammerha Backend — Admin Routes (Path 4)
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as escrowService from '../services/escrow.service';
import type { ReleaseEscrowDTO, FlagDiscrepancyDTO, ApiResponse } from '../types';

const router = Router();

// All admin routes require authentication + admin/auditor role
router.use(authMiddleware);
router.use(requireActive);

// ─── GET /api/admin/verifications/pending — Pending Verifications ───────────
router.get(
    '/verifications/pending',
    requireRole('admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const limit = Math.min(parseInt(req.query['limit'] as string) || 25, 100);
            const offset = Math.max(parseInt(req.query['offset'] as string) || 0, 0);
            const { cases, total } = await escrowService.getPendingVerifications(limit, offset);
            const response: ApiResponse = {
                success: true,
                data: cases,
                message: `${total} verifications pending`,
            };
            res.json(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ success: false, error: message } as ApiResponse);
        }
    }
);

// ─── POST /api/admin/escrow/release — Release Escrow Funds ──────────────────
router.post(
    '/escrow/release',
    requireRole('admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const dto = req.body as ReleaseEscrowDTO;

            if (!dto.proof_id || !dto.item_id) {
                const response: ApiResponse = {
                    success: false,
                    error: 'Missing required fields: proof_id, item_id',
                };
                res.status(400).json(response);
                return;
            }

            const result = await escrowService.releaseEscrow(req.authUser!.user_id, dto);

            const response: ApiResponse = {
                success: true,
                data: result,
                message: `Released ${result.released_count} escrow entries totaling $${(result.total_released / 100).toFixed(2)}`,
            };
            res.status(200).json(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            const status = message.includes('not found') ? 404 : 400;
            res.status(status).json({ success: false, error: message } as ApiResponse);
        }
    }
);

// ─── POST /api/admin/escrow/flag — Flag Discrepancy ─────────────────────────
router.post(
    '/escrow/flag',
    requireRole('admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const dto = req.body as FlagDiscrepancyDTO;

            if (!dto.proof_id || !dto.reason) {
                const response: ApiResponse = {
                    success: false,
                    error: 'Missing required fields: proof_id, reason',
                };
                res.status(400).json(response);
                return;
            }

            const proof = await escrowService.flagDiscrepancy(req.authUser!.user_id, dto);

            const response: ApiResponse = {
                success: true,
                data: proof,
                message: 'Discrepancy flagged — proof rejected',
            };
            res.status(200).json(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(400).json({ success: false, error: message } as ApiResponse);
        }
    }
);

export default router;
