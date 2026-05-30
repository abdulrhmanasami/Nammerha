// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Admin Routes (Path 4)
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as escrowService from '../services/escrow.service';
import * as kycService from '../services/kyc.service';
import { safeRouteError } from '../utils/safe-error';
import type { ReleaseEscrowDTO, FlagDiscrepancyDTO, ApiResponse } from '../types';
import { ZodError } from 'zod';
import { releaseEscrowSchema, flagDiscrepancySchema, refundDecisionSchema, kycDecisionSchema } from '../validation/schemas';

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
            const pLimit = parseInt(req.query['limit'] as string, 10);
            const limit = Math.min(Number.isNaN(pLimit) ? 25 : pLimit, 100);
            const pOffset = parseInt(req.query['offset'] as string, 10);
            const offset = Math.max(Number.isNaN(pOffset) ? 0 : pOffset, 0);
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
            const dto = releaseEscrowSchema.parse(req.body) as ReleaseEscrowDTO;

            const result = await escrowService.releaseEscrow(getAuthUser(req).user_id, dto);

            const response: ApiResponse = {
                success: true,
                data: result,
                message: `Released ${result.released_count} escrow entries totaling $${(result.total_released / 100).toFixed(2)}`,
            };
            res.status(200).json(response);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
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
            const dto = flagDiscrepancySchema.parse(req.body) as FlagDiscrepancyDTO;

            const proof = await escrowService.flagDiscrepancy(getAuthUser(req).user_id, dto);

            const response: ApiResponse = {
                success: true,
                data: proof,
                message: 'Discrepancy flagged — proof rejected',
            };
            res.status(200).json(response);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'Admin.FlagDiscrepancy');
        }
    }
);
// ─── GET /api/admin/refund-requests — Pending Refund Requests (ENH-2) ──────
router.get(
    '/refund-requests',
    requireRole('admin'),
    async (_req: Request, res: Response) => {
        try {
            const requests = await escrowService.getPendingRefunds();
            res.json({ success: true, data: requests } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Admin.GetRefundRequests');
        }
    }
);

// ─── POST /api/admin/escrow/refund — Process Refund Request (ENH-2) ────────
router.post(
    '/escrow/refund',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const { refund_id, decision, notes } = refundDecisionSchema.parse(req.body);

            const result = await escrowService.processRefund(
                getAuthUser(req).user_id,
                refund_id,
                decision,
                notes,
            );
            res.json({ success: true, data: result } as ApiResponse);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'Admin.ProcessRefund');
        }
    }
);

// ─── GET /api/admin/kyc/queue — KYC Verification Queue ──────────────────────
// GAP-P3-009 FIX: Replaces hardcoded APPLICANTS[] with live DB query.
router.get(
    '/kyc/queue',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const status = req.query['status'] as string | undefined;
            const pLimit = parseInt(req.query['limit'] as string, 10);
            const limit = Math.min(Number.isNaN(pLimit) ? 25 : pLimit, 100);
            const pOffset = parseInt(req.query['offset'] as string, 10);
            const offset = Math.max(Number.isNaN(pOffset) ? 0 : pOffset, 0);

            const validStatuses = ['pending', 'submitted', 'verified', 'rejected', 'suspended'];
            if (status && !validStatuses.includes(status)) {
                res.status(400).json({
                    success: false,
                    error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
                } as ApiResponse);
                return;
            }

            const { entries, total } = await kycService.getKycQueue(
                status as Parameters<typeof kycService.getKycQueue>[0],
                limit,
                offset,
            );
            res.json({
                success: true,
                data: entries,
                message: `${total} KYC applications`,
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Admin.GetKycQueue');
        }
    }
);

// ─── GET /api/admin/kyc/stats — KYC Status Counts ───────────────────────────
router.get(
    '/kyc/stats',
    requireRole('admin'),
    async (_req: Request, res: Response) => {
        try {
            const stats = await kycService.getKycStats();
            res.json({
                success: true,
                data: stats,
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Admin.GetKycStats');
        }
    }
);

// ─── POST /api/admin/kyc/:userId/decision — Approve/Reject KYC ──────────────
router.post(
    '/kyc/:userId/decision',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const { userId } = req.params;
            const { decision, reason } = kycDecisionSchema.parse(req.body);

            const result = await kycService.updateKycStatus(
                String(userId),
                decision,
                getAuthUser(req).user_id,
                reason,
            );

            const actionLabel = decision === 'verified' ? 'verified' : 'rejected';
            res.json({
                success: true,
                data: result,
                message: `KYC ${actionLabel}: ${result.full_name}`,
            } as ApiResponse);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'Admin.UpdateKycStatus');
        }
    }
);

export default router;
