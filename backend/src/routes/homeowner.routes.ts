// ============================================================================
// Nammerha Backend — Homeowner Routes (صاحب البيت / المتضرر)
// Portal: Projects, Service Requests, Bid Comparison, Approvals, Escrow
// All endpoints require: JWT + KYC verified + role='homeowner'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as homeownerService from '../services/homeowner.service';
import type { ApiResponse } from '../types';

const router = Router();

// All homeowner routes require authentication + active account + homeowner role
router.use(authMiddleware);
router.use(requireActive);
router.use(requireRole('homeowner'));

// ─── GET /api/homeowner/projects — My Projects with full context ────────────
router.get('/projects', async (req: Request, res: Response) => {
    try {
        const projects = await homeownerService.getMyProjects(req.authUser!.user_id);
        res.json({ success: true, data: projects } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/homeowner/stats — Dashboard KPIs ─────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await homeownerService.getMyStats(req.authUser!.user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/homeowner/projects/:id/bids — Bid Comparison ─────────────────
router.get('/projects/:id/bids', async (req: Request, res: Response) => {
    try {
        const bids = await homeownerService.getProjectBids(
            req.authUser!.user_id,
            String(req.params.id),
        );
        res.json({ success: true, data: bids } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('not found') ? 404 : 500;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── POST /api/homeowner/service-requests — Create Thumbtack Request ───────
router.post('/service-requests', async (req: Request, res: Response) => {
    try {
        const dto = req.body as homeownerService.CreateServiceRequestDTO;

        if (!dto.trade_needed || !dto.title) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: trade_needed, title',
            } as ApiResponse);
            return;
        }

        const result = await homeownerService.createServiceRequest(
            req.authUser!.user_id,
            dto,
        );
        res.status(201).json({
            success: true,
            data: result,
            message: 'Service request created — matching tradespeople nearby',
        } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/homeowner/service-requests — My Service Requests ──────────────
router.get('/service-requests', async (req: Request, res: Response) => {
    try {
        const requests = await homeownerService.getMyServiceRequests(req.authUser!.user_id);
        res.json({ success: true, data: requests } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── POST /api/homeowner/service-requests/:id/cancel — Cancel Request ──────
router.post('/service-requests/:id/cancel', async (req: Request, res: Response) => {
    try {
        const result = await homeownerService.cancelServiceRequest(
            req.authUser!.user_id,
            String(req.params.id),
        );
        res.json({
            success: true,
            data: result,
            message: 'Service request cancelled',
        } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('not found') ? 404
            : message.includes('not the owner') ? 403
                : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/homeowner/approvals — Pending Approvals ──────────────────────
router.get('/approvals', async (req: Request, res: Response) => {
    try {
        const statusFilter = req.query['status'] as string | undefined;
        const approvals = await homeownerService.getMyApprovals(
            req.authUser!.user_id,
            statusFilter,
        );
        res.json({ success: true, data: approvals } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/homeowner/escrow — Escrow Summary ────────────────────────────
router.get('/escrow', async (req: Request, res: Response) => {
    try {
        const summary = await homeownerService.getMyEscrowSummary(req.authUser!.user_id);
        res.json({ success: true, data: summary } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
