// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Tradesperson Routes (أصحاب المهن)
// Profile, Stats, Requests (Thumbtack), Assignments (Subcontractor), Earnings
// All endpoints require: JWT + KYC verified + role='tradesperson'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import { requireAttributes } from '../middleware/abac.middleware';
import * as tradespersonService from '../services/tradesperson.service';
import { safeRouteError } from '../utils/safe-error';
import type { ApiResponse, AvailabilityStatus } from '../types';

const router = Router();

// All tradesperson routes require authentication + active account + tradesperson role
router.use(authMiddleware);
router.use(requireActive);
router.use(requireRole('tradesperson'));

// ─── GET /api/tradesperson/profile — My Trade Profile ───────────────────────
router.get('/profile', async (req: Request, res: Response) => {
    try {
        const profile = await tradespersonService.getMyProfile(getAuthUser(req).user_id);
        res.json({ success: true, data: profile } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Tradesperson.GetProfile');
    }
});

// ─── GET /api/tradesperson/stats — Dashboard KPIs ───────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await tradespersonService.getMyStats(getAuthUser(req).user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Tradesperson.GetStats');
    }
});

// ─── GET /api/tradesperson/requests — Available Service Requests ────────────
// Thumbtack mode: open requests matching my trade
router.get('/requests', async (req: Request, res: Response) => {
    try {
        const requests = await tradespersonService.getAvailableRequests(getAuthUser(req).user_id);
        res.json({ success: true, data: requests } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Tradesperson.GetRequests');
    }
});

// ─── POST /api/tradesperson/requests/:id/accept — Accept a Request ──────────
router.post('/requests/:id/accept', requireAttributes('tradesperson:accept_job'), async (req: Request, res: Response) => {
    try {
        const result = await tradespersonService.acceptRequest(
            getAuthUser(req).user_id,
            String(req.params.id),
        );
        res.json({
            success: true,
            data: result,
            message: 'Request accepted — contact the homeowner to schedule',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Tradesperson.AcceptRequest');
    }
});

// ─── GET /api/tradesperson/assignments — My Contractor Assignments ──────────
// Subcontractor mode: tasks assigned by general contractors
router.get('/assignments', async (req: Request, res: Response) => {
    try {
        const status = req.query['status'] as string | undefined;
        const assignments = await tradespersonService.getMyAssignments(
            getAuthUser(req).user_id,
            status,
        );
        res.json({ success: true, data: assignments } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Tradesperson.GetAssignments');
    }
});

// ─── POST /api/tradesperson/assignments/:id/respond — Accept/Decline ────────
router.post('/assignments/:id/respond', requireAttributes('tradesperson:respond_assignment'), async (req: Request, res: Response) => {
    try {
        const { accept } = req.body as { accept: boolean };
        if (typeof accept !== 'boolean') {
            res.status(400).json({
                success: false,
                error: 'Missing required field: accept (boolean)',
            } as ApiResponse);
            return;
        }

        const result = await tradespersonService.respondToAssignment(
            getAuthUser(req).user_id,
            String(req.params.id),
            accept,
        );
        res.json({
            success: true,
            data: result,
            message: accept ? 'Assignment accepted' : 'Assignment declined',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Tradesperson.RespondAssignment');
    }
});

// ─── GET /api/tradesperson/earnings — Payment History ───────────────────────
router.get('/earnings', async (req: Request, res: Response) => {
    try {
        const earnings = await tradespersonService.getMyEarnings(getAuthUser(req).user_id);
        res.json({ success: true, data: earnings } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Tradesperson.GetEarnings');
    }
});

// ─── PATCH /api/tradesperson/availability — Toggle Status ───────────────────
router.patch('/availability', async (req: Request, res: Response) => {
    try {
        const { status: newStatus } = req.body as { status: string };
        if (!newStatus) {
            res.status(400).json({
                success: false,
                error: 'Missing required field: status (available | busy | offline)',
            } as ApiResponse);
            return;
        }

        // DT-ENUM-001 FIX: Validate availability status against allowed enum values.
        // Without this, any arbitrary string is blindly cast to AvailabilityStatus,
        // which would cause a PostgreSQL enum type error at best, or data corruption at worst.
        const VALID_AVAILABILITY: readonly string[] = ['available', 'busy', 'offline'];
        if (!VALID_AVAILABILITY.includes(newStatus)) {
            res.status(400).json({
                success: false,
                error: `Invalid status. Allowed values: ${VALID_AVAILABILITY.join(', ')}`,
            } as ApiResponse);
            return;
        }

        const result = await tradespersonService.updateAvailability(
            getAuthUser(req).user_id,
            newStatus as AvailabilityStatus,
        );
        res.json({
            success: true,
            data: result,
            message: `Availability updated to: ${result.availability}`,
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Tradesperson');
    }
});

export default router;
