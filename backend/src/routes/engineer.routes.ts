// ============================================================================
// Nammerha Backend — Engineer Routes
// Projects, KPIs, Bids, Profile, Captures
// All endpoints require: JWT + KYC verified + role='engineer'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as engineerService from '../services/engineer.service';
import * as executionService from '../services/execution.service';
import * as realityCapture from '../services/reality-capture.service';
import type { ApiResponse, SubmitSpatialProofDTO } from '../types';

const router = Router();

// All engineer routes require authentication + active account + engineer role
router.use(authMiddleware);
router.use(requireActive);
router.use(requireRole('engineer'));

// ─── GET /api/engineer/projects — My Assigned Projects ──────────────────────
router.get('/projects', async (req: Request, res: Response) => {
    try {
        const status = req.query['status'] as string | undefined;
        const projects = await engineerService.getMyProjects(
            req.authUser!.user_id,
            status,
        );
        res.json({ success: true, data: projects } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/engineer/stats — Dashboard KPIs ───────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await engineerService.getMyStats(req.authUser!.user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/engineer/bids — My Bid History ────────────────────────────────
router.get('/bids', async (req: Request, res: Response) => {
    try {
        const status = req.query['status'] as string | undefined;
        const bids = await engineerService.getMyBids(
            req.authUser!.user_id,
            status,
        );
        res.json({ success: true, data: bids } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/engineer/profile — My Score + Performance ─────────────────────
router.get('/profile', async (req: Request, res: Response) => {
    try {
        const profile = await engineerService.getMyProfile(req.authUser!.user_id);
        res.json({ success: true, data: profile } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = (error instanceof Error && error.message.includes('not found')) ? 404 : 500;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/engineer/captures — My Recent Captures ────────────────────────
router.get('/captures', async (req: Request, res: Response) => {
    try {
        const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
        const captures = await engineerService.getMyCaptures(
            req.authUser!.user_id,
            limit,
        );
        res.json({ success: true, data: captures } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
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
            req.authUser!.user_id,
            project_id,
            dto,
        );
        res.status(201).json({
            success: true,
            data: capture,
            message: 'Reality capture submitted',
        } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('GPS') ? 422 : message.includes('assigned') ? 403 : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── POST /api/engineer/camera/spatial-proof — Submit GPS Spatial Proof ─────
// Proxy to execution service for convenience from engineer camera page.
router.post('/camera/spatial-proof', async (req: Request, res: Response) => {
    try {
        const dto = req.body as SubmitSpatialProofDTO;

        if (!dto.item_id || !dto.project_id || !dto.image_url || dto.gps_lat === undefined || dto.gps_lng === undefined) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: item_id, project_id, image_url, gps_lat, gps_lng',
            } as ApiResponse);
            return;
        }

        const proof = await executionService.submitSpatialProof(
            req.authUser!.user_id,
            dto,
        );
        res.status(201).json({
            success: true,
            data: proof,
            message: 'Spatial proof submitted for verification',
        } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('GPS validation') ? 422 : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
