// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Contractor Routes
// Projects, KPIs, Bids, Marketplace, Profile, Payments
// All endpoints require: JWT + KYC verified + role='contractor'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireAttributes } from '../middleware/abac.middleware';
import * as contractorService from '../services/contractor.service';
import * as matchmakingService from '../services/matchmaking.service';
import { safeRouteError } from '../utils/safe-error';
import type { ApiResponse } from '../types';

const router = Router();

// UNIFIED CITIZEN: All authenticated users can access contractor features.
// Role-gating removed — any citizen can bid on projects and manage work.
router.use(authMiddleware);
router.use(requireActive);

// ─── GET /api/contractor/projects — My Assigned Projects ────────────────────
router.get('/projects', async (req: Request, res: Response) => {
    // G4 AUDIT FIX: Was calling getMyProjects without pagination params
    const p_limit = parseInt(req.query['limit'] as string, 10);
            const limit = Number.isNaN(p_limit) ? 50 : p_limit;
    const p_offset = parseInt(req.query['offset'] as string, 10);
            const offset = Number.isNaN(p_offset) ? 0 : p_offset;
    const safeLim = Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 100);
    const safeOff = Number.isNaN(offset) ? 0 : Math.max(offset, 0);

    try {
        const status = req.query['status'] as string | undefined;
        const projects = await contractorService.getMyProjects(
            getAuthUser(req).user_id,
            status,
            safeLim,
            safeOff,
        );
        res.json({ success: true, data: projects } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Contractor.GetProjects');
    }
});

// ─── GET /api/contractor/stats — Dashboard KPIs ─────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await contractorService.getMyStats(getAuthUser(req).user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Contractor.GetStats');
    }
});

// ─── GET /api/contractor/bids — My Bid History ──────────────────────────────
router.get('/bids', async (req: Request, res: Response) => {
    // G4 FIX: Accept pagination params
    const p_limit = parseInt(req.query['limit'] as string, 10);
            const limit = Number.isNaN(p_limit) ? 50 : p_limit;
    const p_offset = parseInt(req.query['offset'] as string, 10);
            const offset = Number.isNaN(p_offset) ? 0 : p_offset;
    const safeLim = Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 100);
    const safeOff = Number.isNaN(offset) ? 0 : Math.max(offset, 0);

    try {
        const status = req.query['status'] as string | undefined;
        const bids = await contractorService.getMyBids(
            getAuthUser(req).user_id,
            status,
            safeLim,
            safeOff,
        );
        res.json({ success: true, data: bids } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Contractor.GetBids');
    }
});

// ─── GET /api/contractor/marketplace — Available Projects for Bidding ───────
router.get('/marketplace', async (req: Request, res: Response) => {
    // G4 FIX: Accept pagination params
    const p_limit = parseInt(req.query['limit'] as string, 10);
            const limit = Number.isNaN(p_limit) ? 50 : p_limit;
    const p_offset = parseInt(req.query['offset'] as string, 10);
            const offset = Number.isNaN(p_offset) ? 0 : p_offset;
    const safeLim = Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 100);
    const safeOff = Number.isNaN(offset) ? 0 : Math.max(offset, 0);

    try {
        const projects = await contractorService.getAvailableProjects(
            getAuthUser(req).user_id,
            safeLim,
            safeOff,
        );
        res.json({ success: true, data: projects } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Contractor.GetMarketplace');
    }
});

// ─── GET /api/contractor/profile — My Score + Performance ───────────────────
router.get('/profile', async (req: Request, res: Response) => {
    try {
        const profile = await contractorService.getMyProfile(getAuthUser(req).user_id);
        res.json({ success: true, data: profile } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Contractor.GetProfile');
    }
});

// ─── GET /api/contractor/payments — My Escrow Payments ──────────────────────
router.get('/payments', async (req: Request, res: Response) => {
    // G4 AUDIT FIX: Was calling getMyPayments without pagination params
    const p_limit = parseInt(req.query['limit'] as string, 10);
            const limit = Number.isNaN(p_limit) ? 50 : p_limit;
    const p_offset = parseInt(req.query['offset'] as string, 10);
            const offset = Number.isNaN(p_offset) ? 0 : p_offset;
    const safeLim = Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 100);
    const safeOff = Number.isNaN(offset) ? 0 : Math.max(offset, 0);

    try {
        const payments = await contractorService.getMyPayments(
            getAuthUser(req).user_id,
            safeLim,
            safeOff,
        );
        res.json({ success: true, data: payments } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Contractor.GetPayments');
    }
});

// ─── POST /api/contractor/bids — Submit a Competitive Bid ───────────────────
// Proxy to matchmaking.submitBid() with contractor context
router.post('/bids', requireAttributes('contractor:bid'), async (req: Request, res: Response) => {
    try {
        const { project_id, proposed_cost, estimated_days, cover_letter, methodology } = req.body as {
            project_id: string;
            proposed_cost: number;
            estimated_days: number;
            cover_letter?: string;
            methodology?: string;
        };

        if (!project_id || !proposed_cost || !estimated_days) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: project_id, proposed_cost, estimated_days',
            } as ApiResponse);
            return;
        }

        if (proposed_cost <= 0 || estimated_days <= 0) {
            res.status(400).json({
                success: false,
                error: 'proposed_cost and estimated_days must be positive',
            } as ApiResponse);
            return;
        }

        // DT-BL-001 FIX: FINOPS-004 integer validation — prevent floating-point precision attacks.
        // Amounts in cents must be whole numbers. A bid of 100.5 cents would cause
        // rounding issues in downstream arithmetic (escrow, PO generation).
        if (!Number.isInteger(proposed_cost) || !Number.isInteger(estimated_days)) {
            res.status(400).json({
                success: false,
                error: 'proposed_cost (cents) and estimated_days must be integers',
            } as ApiResponse);
            return;
        }

        // DT-BL-001 FIX: FINOPS-004 max cap — prevent integer overflow and absurd bids.
        // $100M (10_000_000_000 cents) is a generous upper bound for construction.
        // 3650 days (10 years) is the maximum realistic project timeline.
        const MAX_BID_CENTS = 10_000_000_000;
        const MAX_DAYS = 3650;
        if (proposed_cost > MAX_BID_CENTS) {
            res.status(400).json({
                success: false,
                error: `proposed_cost exceeds maximum (${MAX_BID_CENTS} cents / $100M)`,
            } as ApiResponse);
            return;
        }
        if (estimated_days > MAX_DAYS) {
            res.status(400).json({
                success: false,
                error: `estimated_days exceeds maximum (${MAX_DAYS} days / 10 years)`,
            } as ApiResponse);
            return;
        }

        const bid = await matchmakingService.submitBid(
            getAuthUser(req).user_id,
            project_id,
            {
                proposed_cost,
                estimated_days,
                cover_letter: cover_letter || undefined,
                methodology: methodology || undefined,
            },
        );

        res.status(201).json({
            success: true,
            data: bid,
            message: 'Bid submitted successfully',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Contractor.SubmitBid');
    }
});

export default router;
