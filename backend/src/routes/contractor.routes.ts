// ============================================================================
// Nammerha Backend — Contractor Routes
// Projects, KPIs, Bids, Marketplace, Profile, Payments
// All endpoints require: JWT + KYC verified + role='contractor'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as contractorService from '../services/contractor.service';
import * as matchmakingService from '../services/matchmaking.service';
import type { ApiResponse } from '../types';

const router = Router();

// All contractor routes require authentication + active account + contractor role
router.use(authMiddleware);
router.use(requireActive);
router.use(requireRole('contractor'));

// ─── GET /api/contractor/projects — My Assigned Projects ────────────────────
router.get('/projects', async (req: Request, res: Response) => {
    try {
        const status = req.query['status'] as string | undefined;
        const projects = await contractorService.getMyProjects(
            req.authUser!.user_id,
            status,
        );
        res.json({ success: true, data: projects } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/contractor/stats — Dashboard KPIs ─────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await contractorService.getMyStats(req.authUser!.user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/contractor/bids — My Bid History ──────────────────────────────
router.get('/bids', async (req: Request, res: Response) => {
    try {
        const status = req.query['status'] as string | undefined;
        const bids = await contractorService.getMyBids(
            req.authUser!.user_id,
            status,
        );
        res.json({ success: true, data: bids } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/contractor/marketplace — Available Projects for Bidding ───────
router.get('/marketplace', async (req: Request, res: Response) => {
    try {
        const projects = await contractorService.getAvailableProjects(
            req.authUser!.user_id,
        );
        res.json({ success: true, data: projects } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/contractor/profile — My Score + Performance ───────────────────
router.get('/profile', async (req: Request, res: Response) => {
    try {
        const profile = await contractorService.getMyProfile(req.authUser!.user_id);
        res.json({ success: true, data: profile } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = (error instanceof Error && error.message.includes('not found')) ? 404 : 500;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/contractor/payments — My Escrow Payments ──────────────────────
router.get('/payments', async (req: Request, res: Response) => {
    try {
        const payments = await contractorService.getMyPayments(req.authUser!.user_id);
        res.json({ success: true, data: payments } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── POST /api/contractor/bids — Submit a Competitive Bid ───────────────────
// Proxy to matchmaking.submitBid() with contractor context
router.post('/bids', async (req: Request, res: Response) => {
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

        const bid = await matchmakingService.submitBid(
            req.authUser!.user_id,
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('already') ? 409 : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
