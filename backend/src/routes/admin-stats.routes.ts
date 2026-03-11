// ============================================================================
// Nammerha Backend — Admin Stats Routes (Feature 3: Usage Graphs)
// ============================================================================
// Time-series aggregation endpoints for admin dashboard charts.
// All endpoints require 'admin' or 'auditor' role.
//
// GET /api/admin/stats/projects-by-month   — Projects created per month (12m)
// GET /api/admin/stats/donations-by-month  — Donation amounts per month (12m)
// GET /api/admin/stats/users-by-month      — New registrations per month (12m)
// GET /api/admin/stats/funding-progress    — Funding % over time per project
// GET /api/admin/stats/overview            — Platform-wide summary counters
// ============================================================================
import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import { safeRouteError } from '../utils/safe-error';
import type { ApiResponse } from '../types';

const router = Router();

// DT-MW-002 FIX: Added requireActive — prevents deactivated admins from accessing stats
// DT-ARCH-001 FIX: Uses role-guard.middleware.ts requireRole (doesn't leak role names)
router.use(authMiddleware, requireActive, requireRole('admin', 'auditor'));

// ─── Time-Series Types ──────────────────────────────────────────────────────

interface MonthlyDataPoint {
    month: string;       // 'YYYY-MM' format
    count: number;
}

interface MonthlyAmountPoint {
    month: string;
    total_amount: number; // cents
}

interface FundingProgressPoint {
    project_id: string;
    title: string;
    total_estimated_cost: number;
    total_funded_amount: number;
    funded_percentage: number;
    published_at: string | null;
}

interface PlatformOverview {
    total_users: number;
    total_projects: number;
    total_donations: number;
    total_funded_amount: number;    // cents
    total_escrow_released: number;  // cents
    active_engineers: number;
    active_contractors: number;
    verified_proofs: number;
}

// ─── GET /overview ──────────────────────────────────────────────────────────
router.get('/overview', async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query<PlatformOverview>(
            `SELECT
                (SELECT COUNT(*)::int FROM users) AS total_users,
                (SELECT COUNT(*)::int FROM projects) AS total_projects,
                (SELECT COUNT(*)::int FROM escrow_ledger) AS total_donations,
                (SELECT COALESCE(SUM(amount_locked), 0)::bigint FROM escrow_ledger) AS total_funded_amount,
                (SELECT COALESCE(SUM(amount_locked), 0)::bigint FROM escrow_ledger WHERE payment_status = 'released') AS total_escrow_released,
                (SELECT COUNT(DISTINCT assigned_engineer_id)::int FROM projects WHERE assigned_engineer_id IS NOT NULL) AS active_engineers,
                (SELECT COUNT(DISTINCT assigned_contractor_id)::int FROM projects WHERE assigned_contractor_id IS NOT NULL) AS active_contractors,
                (SELECT COUNT(*)::int FROM spatial_proofs WHERE verification_status = 'verified') AS verified_proofs`
        );

        res.json({
            success: true,
            data: result.rows[0],
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'AdminStats.Overview');
    }
});

// ─── GET /projects-by-month ─────────────────────────────────────────────────
router.get('/projects-by-month', async (req: Request, res: Response): Promise<void> => {
    try {
        const months = parseInt(req.query['months'] as string) || 12;
        const clampedMonths = Math.min(Math.max(months, 1), 36);

        const result = await query<MonthlyDataPoint>(
            `SELECT
                TO_CHAR(d.month, 'YYYY-MM') AS month,
                COALESCE(p.cnt, 0)::int AS count
             FROM generate_series(
                DATE_TRUNC('month', NOW()) - MAKE_INTERVAL(months => $1),
                DATE_TRUNC('month', NOW()),
                '1 month'
             ) AS d(month)
             LEFT JOIN (
                SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*) AS cnt
                FROM projects
                GROUP BY DATE_TRUNC('month', created_at)
             ) p ON p.month = d.month
             ORDER BY d.month ASC`,
            [clampedMonths - 1]
        );

        res.json({
            success: true,
            data: result.rows,
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'AdminStats.ProjectsByMonth');
    }
});

// ─── GET /donations-by-month ────────────────────────────────────────────────
router.get('/donations-by-month', async (req: Request, res: Response): Promise<void> => {
    try {
        const months = parseInt(req.query['months'] as string) || 12;
        const clampedMonths = Math.min(Math.max(months, 1), 36);

        const result = await query<MonthlyAmountPoint>(
            `SELECT
                TO_CHAR(d.month, 'YYYY-MM') AS month,
                COALESCE(e.total, 0)::bigint AS total_amount
             FROM generate_series(
                DATE_TRUNC('month', NOW()) - MAKE_INTERVAL(months => $1),
                DATE_TRUNC('month', NOW()),
                '1 month'
             ) AS d(month)
             LEFT JOIN (
                SELECT DATE_TRUNC('month', locked_at) AS month, SUM(amount_locked) AS total
                FROM escrow_ledger
                GROUP BY DATE_TRUNC('month', locked_at)
             ) e ON e.month = d.month
             ORDER BY d.month ASC`,
            [clampedMonths - 1]
        );

        res.json({
            success: true,
            data: result.rows,
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'AdminStats.DonationsByMonth');
    }
});

// ─── GET /users-by-month ────────────────────────────────────────────────────
router.get('/users-by-month', async (req: Request, res: Response): Promise<void> => {
    try {
        const months = parseInt(req.query['months'] as string) || 12;
        const clampedMonths = Math.min(Math.max(months, 1), 36);

        const result = await query<MonthlyDataPoint>(
            `SELECT
                TO_CHAR(d.month, 'YYYY-MM') AS month,
                COALESCE(u.cnt, 0)::int AS count
             FROM generate_series(
                DATE_TRUNC('month', NOW()) - MAKE_INTERVAL(months => $1),
                DATE_TRUNC('month', NOW()),
                '1 month'
             ) AS d(month)
             LEFT JOIN (
                SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*) AS cnt
                FROM users
                GROUP BY DATE_TRUNC('month', created_at)
             ) u ON u.month = d.month
             ORDER BY d.month ASC`,
            [clampedMonths - 1]
        );

        res.json({
            success: true,
            data: result.rows,
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'AdminStats.UsersByMonth');
    }
});

// ─── GET /funding-progress ──────────────────────────────────────────────────
router.get('/funding-progress', async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query['limit'] as string) || 20;
        const clampedLimit = Math.min(Math.max(limit, 1), 100);

        const result = await query<FundingProgressPoint>(
            `SELECT
                project_id,
                title,
                total_estimated_cost::bigint,
                total_funded_amount::bigint,
                CASE WHEN total_estimated_cost > 0
                    THEN ROUND((total_funded_amount::numeric / total_estimated_cost::numeric) * 100, 1)
                    ELSE 0
                END AS funded_percentage,
                published_at
             FROM projects
             WHERE status NOT IN ('draft', 'cancelled')
             ORDER BY total_funded_amount DESC
             LIMIT $1`,
            [clampedLimit]
        );

        res.json({
            success: true,
            data: result.rows,
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'AdminStats.FundingProgress');
    }
});

export default router;
