// ============================================================================
// Nammerha Backend — Routing Routes (Georavity Proxy)
// Proxies authenticated routing requests to the self-hosted Valhalla engine
// ============================================================================
import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import * as georavity from '../services/georavity.service';
import { safeRouteError } from '../utils/safe-error';
import type { ApiResponse } from '../types';
import type { CostingModel } from '../services/georavity.service';
import {
    routeRequestSchema,
    matrixRequestSchema,
    isochroneRequestSchema,
} from '../validation/schemas';

const router = Router();

// ─── PUBLIC: Health Check ───────────────────────────────────────────────────

/**
 * GET /api/routing/health
 * Returns the health status of the Georavity engine.
 * Public endpoint for monitoring dashboards.
 */
router.get('/health', async (_req: Request, res: Response) => {
    try {
        const status = await georavity.healthCheck();
        const response: ApiResponse = {
            success: true,
            data: status,
        };
        res.json(response);
    } catch (error) {
        safeRouteError(res, error, 'Routing.Health');
    }
});

// ─── AUTHENTICATED ROUTES ───────────────────────────────────────────────────
router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/routing/route ────────────────────────────────────────────────

/**
 * POST /api/routing/route
 * Calculate a route between two points.
 */
router.post('/route', async (req: Request, res: Response) => {
    try {
        const body = routeRequestSchema.parse(req.body);

        const result = await georavity.getRoute(
            body.origin,
            body.destination,
            (body.costing ?? 'auto') as CostingModel,
        );

        res.json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Routing.GetRoute', 502);
    }
});

// ─── POST /api/routing/matrix ───────────────────────────────────────────────

/**
 * POST /api/routing/matrix
 * Calculate distance matrix from one source to multiple targets.
 */
router.post('/matrix', async (req: Request, res: Response) => {
    try {
        const body = matrixRequestSchema.parse(req.body);

        const result = await georavity.getDistanceMatrix(
            body.source,
            body.targets,
            (body.costing ?? 'auto') as CostingModel,
        );

        res.json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Routing.Matrix', 502);
    }
});

// ─── POST /api/routing/isochrone ────────────────────────────────────────────

/**
 * POST /api/routing/isochrone
 * Generate isochrone contours (reachability polygons).
 */
router.post('/isochrone', async (req: Request, res: Response) => {
    try {
        const body = isochroneRequestSchema.parse(req.body);

        const result = await georavity.getIsochrone(
            body.center,
            body.contours_minutes,
            (body.costing ?? 'auto') as CostingModel,
        );

        res.json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Routing.Isochrone', 502);
    }
});

export default router;
