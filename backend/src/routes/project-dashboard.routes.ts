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

// ─── V-004 FIX: Project Activity Log / Audit Trail ─────────────────────────
// Exposes the existing audit_trail table as a user-facing activity feed.
// Shows: escrow movements, proof submissions, PO transitions, approvals.
// Standard: OCDS (Open Contracting Data Standard) — transparency mandate.
// ────────────────────────────────────────────────────────────────────────────
import { query as dbQuery } from '../config/database';

router.get(
    '/:projectId/activity',
    requireRole('homeowner', 'donor', 'engineer', 'admin'),
    async (req: Request, res: Response) => {
        try {
            const projectId = String(req.params['projectId']);
            const rawLimit = parseInt(req.query['limit'] as string, 10);
            const rawOffset = parseInt(req.query['offset'] as string, 10);
            const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;
            const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

            // Query audit_trail for project-related events.
            // entity_id can be project_id directly, or an item/proof/PO that belongs to the project.
            // We use a UNION approach to cover both direct and indirect references.
            const result = await dbQuery<{
                audit_id: string;
                action: string;
                entity_type: string;
                entity_id: string;
                actor_id: string | null;
                actor_name: string | null;
                new_values: Record<string, unknown> | null;
                created_at: Date;
                total_count: string;
            }>(`
                WITH project_events AS (
                    -- Direct project references
                    SELECT at.audit_id, at.action, at.entity_type, at.entity_id,
                           at.actor_id, at.new_values, at.created_at
                    FROM audit_trail at
                    WHERE at.entity_id = $1
                       OR (at.new_values->>'project_id' = $1)

                    UNION

                    -- Events on items belonging to this project
                    SELECT at.audit_id, at.action, at.entity_type, at.entity_id,
                           at.actor_id, at.new_values, at.created_at
                    FROM audit_trail at
                    JOIN itemized_boq b ON b.item_id = at.entity_id
                    WHERE b.project_id = $1

                    UNION

                    -- Events on spatial proofs for this project
                    SELECT at.audit_id, at.action, at.entity_type, at.entity_id,
                           at.actor_id, at.new_values, at.created_at
                    FROM audit_trail at
                    JOIN spatial_proof sp ON sp.proof_id = at.entity_id
                    WHERE sp.project_id = $1
                )
                SELECT pe.audit_id, pe.action, pe.entity_type, pe.entity_id,
                       pe.actor_id, u.full_name AS actor_name,
                       pe.new_values, pe.created_at,
                       COUNT(*) OVER() AS total_count
                FROM project_events pe
                LEFT JOIN users u ON u.user_id = pe.actor_id
                ORDER BY pe.created_at DESC
                LIMIT $2 OFFSET $3
            `, [projectId, limit, offset]);

            const total = result.rows.length > 0
                ? parseInt(result.rows[0]?.total_count ?? '0', 10)
                : 0;

            const events = result.rows.map(row => ({
                id: row.audit_id,
                action: row.action,
                entity_type: row.entity_type,
                entity_id: row.entity_id,
                actor: row.actor_name ?? 'System',
                details: row.new_values,
                timestamp: row.created_at,
            }));

            res.json({
                success: true,
                data: { events, total, limit, offset },
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'ProjectDashboard.Activity');
        }
    }
);

export default router;
