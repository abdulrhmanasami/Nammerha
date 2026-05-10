// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Project Dashboard Routes (Ticket 7.3)
// Client-facing bird's eye view with daily logs + digital approvals
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as dashboard from '../services/project-dashboard.service';
import type { ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ─── GET /api/dashboard/:projectId — Full Project Overview ──────────────────
router.get(
    '/:projectId',
    requireRole('homeowner', 'donor', 'engineer', 'admin'),
    async (req: Request, res: Response) => {
        try {
            const overview = await dashboard.getDashboardOverview(String(req.params.projectId));

            const response: ApiResponse = {
                success: true,
                data: overview,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'ProjectDashboard');
        }
    }
);

// ─── GET /api/dashboard/:projectId/logs — Daily Construction Logs ───────────
router.get(
    '/:projectId/logs',
    requireRole('homeowner', 'donor', 'engineer', 'admin'),
    async (req: Request, res: Response) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
            const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

            const logs = await dashboard.getDailyLogs(String(req.params.projectId), limit, offset);

            const response: ApiResponse = {
                success: true,
                data: logs,
                message: `${logs.length} daily logs`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'ProjectDashboard');
        }
    }
);

// ─── POST /api/dashboard/:projectId/logs — Submit Daily Log ─────────────────
router.post(
    '/:projectId/logs',
    // UNIFIED CITIZEN: open to all authenticated users
    async (req: Request, res: Response) => {
        try {
            const dto = req.body as dashboard.CreateDailyLogDTO;

            if (!dto.description) {
                res.status(400).json({
                    success: false,
                    error: 'Required: description',
                } as ApiResponse);
                return;
            }

            const log = await dashboard.createDailyLog(
                getAuthUser(req).user_id,
                String(req.params.projectId),
                dto
            );

            const response: ApiResponse = {
                success: true,
                data: log,
                message: 'Daily log submitted',
            };
            res.status(201).json(response);
        } catch (error) {
            safeRouteError(res, error, 'ProjectDashboard');
        }
    }
);

// ─── POST /api/dashboard/:projectId/approvals — Request Approval ────────────
router.post(
    '/:projectId/approvals',
    // UNIFIED CITIZEN: open to all authenticated users
    async (req: Request, res: Response) => {
        try {
            const dto = req.body as dashboard.CreateApprovalDTO;

            if (!dto.title) {
                res.status(400).json({
                    success: false,
                    error: 'Required: title',
                } as ApiResponse);
                return;
            }

            const approval = await dashboard.requestApproval(
                getAuthUser(req).user_id,
                String(req.params.projectId),
                dto
            );

            const response: ApiResponse = {
                success: true,
                data: approval,
                message: 'Approval request created',
            };
            res.status(201).json(response);
        } catch (error) {
            safeRouteError(res, error, 'ProjectDashboard');
        }
    }
);

// ─── PATCH /api/dashboard/approvals/:approvalId — Approve/Reject ────────────
router.patch(
    '/approvals/:approvalId',
    requireRole('homeowner', 'admin'),
    async (req: Request, res: Response) => {
        try {
            const { decision, note } = req.body as {
                decision: 'approved' | 'rejected';
                note?: string;
            };

            if (!decision || !['approved', 'rejected'].includes(decision)) {
                res.status(400).json({
                    success: false,
                    error: "Required: decision ('approved' | 'rejected')",
                } as ApiResponse);
                return;
            }

            const approval = await dashboard.respondToApproval(
                String(req.params.approvalId),
                getAuthUser(req).user_id,
                decision,
                note
            );

            const response: ApiResponse = {
                success: true,
                data: approval,
                message: `Approval ${decision}`,
            };
            res.json(response);
        } catch (error) {
            safeRouteError(res, error, 'ProjectDashboard');
        }
    }
);

// ─── GET /api/dashboard/:projectId/approvals — List Approvals ───────────────
router.get(
    '/:projectId/approvals',
    requireRole('homeowner', 'donor', 'engineer', 'admin'),
    async (req: Request, res: Response) => {
        try {
            const status = req.query.status as string | undefined;
            const approvals = await dashboard.getApprovals(String(req.params.projectId), status);

            const response: ApiResponse = {
                success: true,
                data: approvals,
                message: `${approvals.length} approvals`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'ProjectDashboard');
        }
    }
);

export default router;
