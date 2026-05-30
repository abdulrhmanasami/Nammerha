// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Reality Capture Routes (Ticket 8.1)
// PlanRadar 360 + Houzz Pro LIDAR patterns
// ============================================================================
import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as capture from '../services/reality-capture.service';
import type { ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';
import {
    submitCaptureSchema,
    addAnnotationSchema,
    uploadFloorPlanSchema,
} from '../validation/schemas';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/reality-capture/:projectId/captures — Submit Capture ─────────
router.post(
    '/:projectId/captures',
    // UNIFIED CITIZEN: open to all authenticated users
    async (req: Request, res: Response) => {
        try {
            const dto = submitCaptureSchema.parse(req.body);

            const result = await capture.submitCapture(
                getAuthUser(req).user_id,
                String(req.params.projectId),
                dto as unknown as capture.SubmitCaptureDTO
            );

            const response: ApiResponse = {
                success: true,
                data: result,
                message: `${dto.capture_type || 'photo_360'} capture submitted`,
            };
            res.status(201).json(response);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'RealityCapture');
        }
    }
);

// ─── GET /api/reality-capture/:projectId/captures — Browse Captures ─────────
router.get(
    '/:projectId/captures',
    // UNIFIED CITIZEN: open to all authenticated users
    async (req: Request, res: Response) => {
        try {
            const phase = req.query.phase as capture.ConstructionPhase | undefined;
            const type = req.query.type as capture.CaptureType | undefined;
            const p_limit = parseInt(req.query.limit as string, 10);
            const limit = Number.isNaN(p_limit) ? 50 : p_limit;
            const p_offset = parseInt(req.query.offset as string, 10);
            const offset = Number.isNaN(p_offset) ? 0 : p_offset;

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
    // UNIFIED CITIZEN: admin + auditor only for verification
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
    // UNIFIED CITIZEN: admin + auditor only for verification
    async (req: Request, res: Response) => {
        try {
            const dto = addAnnotationSchema.parse(req.body);

            const annotation = await capture.addAnnotation(
                String(req.params.captureId),
                getAuthUser(req).user_id,
                dto as unknown as capture.AddAnnotationDTO
            );

            const response: ApiResponse = {
                success: true,
                data: annotation,
                message: 'Annotation added',
            };
            res.status(201).json(response);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'RealityCapture');
        }
    }
);

// ─── GET /api/reality-capture/captures/:captureId/annotations — List Notes ──
router.get(
    '/captures/:captureId/annotations',
    // UNIFIED CITIZEN: open to all authenticated users
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
    // UNIFIED CITIZEN: open to all authenticated users
    async (req: Request, res: Response) => {
        try {
            const dto = uploadFloorPlanSchema.parse(req.body);

            const plan = await capture.uploadFloorPlan(
                getAuthUser(req).user_id,
                String(req.params.projectId),
                dto as unknown as capture.UploadFloorPlanDTO
            );

            const response: ApiResponse = {
                success: true,
                data: plan,
                message: `Floor plan v${plan.version} uploaded`,
            };
            res.status(201).json(response);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'RealityCapture');
        }
    }
);

// ─── GET /api/reality-capture/:projectId/floor-plans — List Floor Plans ─────
router.get(
    '/:projectId/floor-plans',
    // UNIFIED CITIZEN: open to all authenticated users
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
