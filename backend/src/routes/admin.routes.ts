// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Admin Routes (Path 4)
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as escrowService from '../services/escrow.service';
import { safeRouteError } from '../utils/safe-error';
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
            safeRouteError(res, error, 'Admin.GetVerifications');
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

            const result = await escrowService.releaseEscrow(getAuthUser(req).user_id, dto);

            const response: ApiResponse = {
                success: true,
                data: result,
                message: `Released ${result.released_count} escrow entries totaling $${(result.total_released / 100).toFixed(2)}`,
            };
            res.status(200).json(response);
        } catch (error) {
            safeRouteError(res, error, 'Admin.ReleaseEscrow');
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

            const proof = await escrowService.flagDiscrepancy(getAuthUser(req).user_id, dto);

            const response: ApiResponse = {
                success: true,
                data: proof,
                message: 'Discrepancy flagged — proof rejected',
            };
            res.status(200).json(response);
        } catch (error) {
            safeRouteError(res, error, 'Admin.FlagDiscrepancy');
        }
    }
);

export default router;
