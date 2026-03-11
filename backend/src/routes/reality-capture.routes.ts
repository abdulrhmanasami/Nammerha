// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Reality Capture Routes (Ticket 8.1)
// PlanRadar 360 + Houzz Pro LIDAR patterns
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as capture from '../services/reality-capture.service';
import type { ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/reality-capture/:projectId/captures — Submit Capture ─────────
router.post(
    '/:projectId/captures',
    requireRole('engineer'),
    async (req: Request, res: Response) => {
        try {
            const dto = req.body as capture.SubmitCaptureDTO;

            if (!dto.file_url || !dto.construction_phase) {
                res.status(400).json({
                    success: false,
                    error: 'Required: file_url, construction_phase',
                } as ApiResponse);
                return;
            }

            const result = await capture.submitCapture(
                getAuthUser(req).user_id,
                String(req.params.projectId),
                dto
            );

            const response: ApiResponse = {
                success: true,
                data: result,
                message: `${dto.capture_type || 'photo_360'} capture submitted`,
            };
            res.status(201).json(response);
        } catch (error) {
            safeRouteError(res, error, 'RealityCapture');
        }
    }
);

// ─── GET /api/reality-capture/:projectId/captures — Browse Captures ─────────
router.get(
    '/:projectId/captures',
    requireRole('homeowner', 'donor', 'engineer', 'admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const phase = req.query.phase as capture.ConstructionPhase | undefined;
            const type = req.query.type as capture.CaptureType | undefined;
            const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
            const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

            const captures = await capture.getProjectCaptures(
                String(req.params.projectId), phase, type, limit, offset
            );

            const response: ApiResponse = {
                success: true,
                data: captures,
                message: `${captures.length} captures`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'RealityCapture');
        }
    }
);

// ─── GET /api/reality-capture/:projectId/hidden-works — Reveal Mode ─────────
// Returns pre-concrete captures as legal evidence for hidden works verification
router.get(
    '/:projectId/hidden-works',
    requireRole('admin', 'auditor', 'engineer'),
    async (req: Request, res: Response) => {
        try {
            const works = await capture.getHiddenWorks(String(req.params.projectId));

            const response: ApiResponse = {
                success: true,
                data: works,
                message: `${works.length} hidden works captures (pre-concrete phases)`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'RealityCapture');
        }
    }
);

// ─── POST /api/reality-capture/captures/:captureId/verify — Verify Capture ──
router.post(
    '/captures/:captureId/verify',
    requireRole('admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const result = await capture.verifyCapture(
                String(req.params.captureId),
                getAuthUser(req).user_id
            );

            const response: ApiResponse = {
                success: true,
                data: result,
                message: 'Capture verified',
            };
            res.json(response);
        } catch (error) {
            safeRouteError(res, error, 'RealityCapture');
        }
    }
);

// ─── POST /api/reality-capture/captures/:captureId/annotate — Add Note ──────
router.post(
    '/captures/:captureId/annotate',
    requireRole('admin', 'auditor', 'engineer'),
    async (req: Request, res: Response) => {
        try {
            const dto = req.body as capture.AddAnnotationDTO;

            if (!dto.note) {
                res.status(400).json({
                    success: false,
                    error: 'Required: note',
                } as ApiResponse);
                return;
            }

            const annotation = await capture.addAnnotation(
                String(req.params.captureId),
                getAuthUser(req).user_id,
                dto
            );

            const response: ApiResponse = {
                success: true,
                data: annotation,
                message: 'Annotation added',
            };
            res.status(201).json(response);
        } catch (error) {
            safeRouteError(res, error, 'RealityCapture');
        }
    }
);

// ─── GET /api/reality-capture/captures/:captureId/annotations — List Notes ──
router.get(
    '/captures/:captureId/annotations',
    requireRole('homeowner', 'donor', 'engineer', 'admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const annotations = await capture.getCaptureAnnotations(
                String(req.params.captureId)
            );

            const response: ApiResponse = {
                success: true,
                data: annotations,
                message: `${annotations.length} annotations`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'RealityCapture');
        }
    }
);

// ─── POST /api/reality-capture/:projectId/floor-plans — Upload Floor Plan ───
router.post(
    '/:projectId/floor-plans',
    requireRole('engineer'),
    async (req: Request, res: Response) => {
        try {
            const dto = req.body as capture.UploadFloorPlanDTO;

            if (!dto.title || !dto.file_url) {
                res.status(400).json({
                    success: false,
                    error: 'Required: title, file_url',
                } as ApiResponse);
                return;
            }

            const plan = await capture.uploadFloorPlan(
                getAuthUser(req).user_id,
                String(req.params.projectId),
                dto
            );

            const response: ApiResponse = {
                success: true,
                data: plan,
                message: `Floor plan v${plan.version} uploaded`,
            };
            res.status(201).json(response);
        } catch (error) {
            safeRouteError(res, error, 'RealityCapture');
        }
    }
);

// ─── GET /api/reality-capture/:projectId/floor-plans — List Floor Plans ─────
router.get(
    '/:projectId/floor-plans',
    requireRole('homeowner', 'donor', 'engineer', 'admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const plans = await capture.getFloorPlans(String(req.params.projectId));

            const response: ApiResponse = {
                success: true,
                data: plans,
                message: `${plans.length} floor plans`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'RealityCapture');
        }
    }
);

export default router;
