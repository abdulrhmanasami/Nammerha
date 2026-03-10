// ============================================================================
// Nammerha Backend — Routing Routes (Georavity Proxy)
// Proxies authenticated routing requests to the self-hosted Valhalla engine
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import * as georavity from '../services/georavity.service';
import type { ApiResponse } from '../types';
import type { LatLng, CostingModel } from '../services/georavity.service';

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
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Routing] Health check failed:', error);
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── AUTHENTICATED ROUTES ───────────────────────────────────────────────────
router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/routing/route ────────────────────────────────────────────────

interface RouteRequestBody {
    origin: LatLng;
    destination: LatLng;
    costing?: CostingModel;
}

/**
 * POST /api/routing/route
 * Calculate a route between two points.
 */
router.post('/route', async (req: Request, res: Response) => {
    try {
        const body = req.body as RouteRequestBody;

        if (!body.origin?.lat || !body.origin?.lng || !body.destination?.lat || !body.destination?.lng) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: origin.lat, origin.lng, destination.lat, destination.lng',
            } as ApiResponse);
            return;
        }

        const result = await georavity.getRoute(
            body.origin,
            body.destination,
            body.costing ?? 'auto',
        );

        res.json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Routing] Route calculation failed:', error);
        res.status(502).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── POST /api/routing/matrix ───────────────────────────────────────────────

interface MatrixRequestBody {
    source: LatLng;
    targets: LatLng[];
    costing?: CostingModel;
}

/**
 * POST /api/routing/matrix
 * Calculate distance matrix from one source to multiple targets.
 */
router.post('/matrix', async (req: Request, res: Response) => {
    try {
        const body = req.body as MatrixRequestBody;

        if (!body.source?.lat || !body.source?.lng) {
            res.status(400).json({
                success: false,
                error: 'Missing required field: source (with lat/lng)',
            } as ApiResponse);
            return;
        }

        if (!Array.isArray(body.targets) || body.targets.length === 0) {
            res.status(400).json({
                success: false,
                error: 'Missing or empty required field: targets (array of lat/lng)',
            } as ApiResponse);
            return;
        }

        // Cap at 50 targets to prevent abuse
        if (body.targets.length > 50) {
            res.status(400).json({
                success: false,
                error: 'Maximum 50 targets allowed per request',
            } as ApiResponse);
            return;
        }

        const result = await georavity.getDistanceMatrix(
            body.source,
            body.targets,
            body.costing ?? 'auto',
        );

        res.json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Routing] Matrix calculation failed:', error);
        res.status(502).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── POST /api/routing/isochrone ────────────────────────────────────────────

interface IsochroneRequestBody {
    center: LatLng;
    contours_minutes: number[];
    costing?: CostingModel;
}

/**
 * POST /api/routing/isochrone
 * Generate isochrone contours (reachability polygons).
 */
router.post('/isochrone', async (req: Request, res: Response) => {
    try {
        const body = req.body as IsochroneRequestBody;

        if (!body.center?.lat || !body.center?.lng) {
            res.status(400).json({
                success: false,
                error: 'Missing required field: center (with lat/lng)',
            } as ApiResponse);
            return;
        }

        if (!Array.isArray(body.contours_minutes) || body.contours_minutes.length === 0) {
            res.status(400).json({
                success: false,
                error: 'Missing or empty required field: contours_minutes (e.g., [15, 30, 60])',
            } as ApiResponse);
            return;
        }

        // Cap contours at max 120 minutes
        const validContours = body.contours_minutes.filter(
            (m) => typeof m === 'number' && m > 0 && m <= 120
        );

        if (validContours.length === 0) {
            res.status(400).json({
                success: false,
                error: 'contours_minutes must contain values between 1 and 120',
            } as ApiResponse);
            return;
        }

        const result = await georavity.getIsochrone(
            body.center,
            validContours,
            body.costing ?? 'auto',
        );

        res.json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Routing] Isochrone generation failed:', error);
        res.status(502).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
