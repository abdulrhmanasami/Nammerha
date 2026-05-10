// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Engineer Routes
// Projects, KPIs, Bids, Profile, Captures
// All endpoints require: JWT + KYC verified + role='engineer'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { safeRouteError } from '../utils/safe-error';
import * as engineerService from '../services/engineer.service';
import * as executionService from '../services/execution.service';
import * as realityCapture from '../services/reality-capture.service';
import { parseSpatialProof, formatZodErrors } from '../validation/spatial-proof.schema';
import type { ApiResponse } from '../types';
import { ZodError } from 'zod';

const router = Router();

// UNIFIED CITIZEN: All authenticated users can access engineer features.
// Role-gating removed — any citizen can manage projects, captures, spatial proofs.
router.use(authMiddleware);
router.use(requireActive);

// ─── GET /api/engineer/projects — My Assigned Projects ──────────────────────
router.get('/projects', async (req: Request, res: Response) => {
    // AUDIT FIX: Was calling getMyProjects without pagination params
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50;
    const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0;
    const safeLim = Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 100);
    const safeOff = Number.isNaN(offset) ? 0 : Math.max(offset, 0);

    try {
        const status = req.query['status'] as string | undefined;
        const projects = await engineerService.getMyProjects(
            getAuthUser(req).user_id,
            status,
            safeLim,
            safeOff,
        );
        res.json({ success: true, data: projects } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Engineer');
    }
});

// ─── GET /api/engineer/stats — Dashboard KPIs ───────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await engineerService.getMyStats(getAuthUser(req).user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Engineer');
    }
});

// ─── GET /api/engineer/bids — My Bid History ────────────────────────────────
router.get('/bids', async (req: Request, res: Response) => {
    // AUDIT FIX: Was calling getMyBids without pagination params
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50;
    const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0;
    const safeLim = Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 100);
    const safeOff = Number.isNaN(offset) ? 0 : Math.max(offset, 0);

    try {
        const status = req.query['status'] as string | undefined;
        const bids = await engineerService.getMyBids(
            getAuthUser(req).user_id,
            status,
            safeLim,
            safeOff,
        );
        res.json({ success: true, data: bids } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Engineer');
    }
});

// ─── GET /api/engineer/profile — My Score + Performance ─────────────────────
router.get('/profile', async (req: Request, res: Response) => {
    try {
        const profile = await engineerService.getMyProfile(getAuthUser(req).user_id);
        res.json({ success: true, data: profile } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Engineer');
    }
});

// ─── GET /api/engineer/captures — My Recent Captures ────────────────────────
router.get('/captures', async (req: Request, res: Response) => {
    try {
        // P3-CAP-001 FIX: NaN-safe + max clamp — prevents 500 on ?limit=abc and DoS on ?limit=999999999
        const rawLimit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
        const limit = Number.isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), 100);
        const captures = await engineerService.getMyCaptures(
            getAuthUser(req).user_id,
            limit,
        );
        res.json({ success: true, data: captures } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Engineer');
    }
});

// ─── POST /api/engineer/camera/capture — Submit Reality Capture ─────────────
// Proxy to reality-capture service for convenience from engineer dashboard.
router.post('/camera/capture', async (req: Request, res: Response) => {
    try {
        const { project_id, ...dto } = req.body as { project_id: string } & realityCapture.SubmitCaptureDTO;

        if (!project_id || !dto.file_url || !dto.construction_phase) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: project_id, file_url, construction_phase',
            } as ApiResponse);
            return;
        }

        const capture = await realityCapture.submitCapture(
            getAuthUser(req).user_id,
            project_id,
            dto,
        );
        res.status(201).json({
            success: true,
            data: capture,
            message: 'Reality capture submitted',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Engineer');
    }
});

// ─── POST /api/engineer/camera/spatial-proof — Submit GPS Spatial Proof ─────
// Proxy to execution service for convenience from engineer camera page.
// F-006 FIX: Zod validation replaces ad-hoc type assertion.
router.post('/camera/spatial-proof', async (req: Request, res: Response) => {
    try {
        // F-006 FIX: Runtime validation — NOT a type assertion.
        const dto = parseSpatialProof(req.body);

        const proof = await executionService.submitSpatialProof(
            getAuthUser(req).user_id,
            dto,
        );
        res.status(201).json({
            success: true,
            data: proof,
            message: 'Spatial proof submitted for verification',
        } as ApiResponse);
    } catch (error) {
        // F-006 FIX: Structured Zod validation errors → 400 with field details.
        if (error instanceof ZodError) {
            res.status(400).json({
                success: false,
                error: formatZodErrors(error),
            } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Engineer');
    }
});

export default router;
