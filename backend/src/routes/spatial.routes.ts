// ============================================================================
// Nammerha Backend — Satellite & Geofencing Routes
// STAC imagery catalog + spatial compliance endpoints
// ============================================================================
import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as satellite from '../services/satellite.service';
import * as geofencing from '../services/geofencing.service';
import type { ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';
import {
    registerImagerySchema,
    nearbySearchSchema,
    createGeofenceZoneSchema,
} from '../validation/schemas';

const router = Router();

// ─── ALL ROUTES REQUIRE AUTHENTICATION ──────────────────────────────────────
router.use(authMiddleware);
router.use(requireActive);

// ═══════════════════════════════════════════════════════════════════════════
// SATELLITE IMAGERY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/spatial/satellite/project/:id/timeline
 * Get chronological satellite imagery for a project.
 */
router.get('/satellite/project/:id/timeline', async (req: Request, res: Response) => {
    try {
        const projectId = req.params['id'];
        if (!projectId) {
            res.status(400).json({ success: false, error: 'Project ID required' } as ApiResponse);
            return;
        }

        const provider = typeof req.query['provider'] === 'string' ? req.query['provider'] : undefined;
        const pLimit = parseInt(String(req.query['limit'] ?? '20'), 10);
        const limit = Number.isNaN(pLimit) ? 20 : pLimit;
        const pOffset = parseInt(String(req.query['offset'] ?? '0'), 10);
        const offset = Number.isNaN(pOffset) ? 0 : pOffset;

        const result = await satellite.getTimelineForProject(String(projectId), {
            provider,
            limit,
            offset,
        });

        res.json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Spatial.SatelliteTimeline');
    }
});

/**
 * GET /api/spatial/satellite/:id
 * Get a single satellite image by ID.
 */
router.get('/satellite/:id', async (req: Request, res: Response) => {
    try {
        const imageryId = req.params['id'];
        if (!imageryId) {
            res.status(400).json({ success: false, error: 'Imagery ID required' } as ApiResponse);
            return;
        }

        const image = await satellite.getImageryById(String(imageryId));
        if (!image) {
            res.status(404).json({ success: false, error: 'Imagery not found' } as ApiResponse);
            return;
        }

        res.json({ success: true, data: image } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Spatial.SatelliteImage');
    }
});

/**
 * GET /api/spatial/satellite/project/:id/stats
 * Get imagery statistics for a project (dashboard widget).
 */
router.get('/satellite/project/:id/stats', async (req: Request, res: Response) => {
    try {
        const projectId = req.params['id'];
        if (!projectId) {
            res.status(400).json({ success: false, error: 'Project ID required' } as ApiResponse);
            return;
        }

        const stats = await satellite.getProjectImageryStats(String(projectId));
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Spatial.SatelliteStats');
    }
});

/**
 * POST /api/spatial/satellite/imagery  (admin only)
 * Register new satellite imagery in the catalog.
 */
router.post(
    '/satellite/imagery',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const userId = (req as Request & { userId?: string }).userId;
            if (!userId) {
                res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
                return;
            }

            const body = registerImagerySchema.parse(req.body);

            const result = await satellite.registerImagery(body as satellite.RegisterImageryDTO, userId);
            res.status(201).json({ success: true, data: result } as ApiResponse);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'Spatial');
        }
    },
);

/**
 * DELETE /api/spatial/satellite/:id  (admin only)
 * Delete satellite imagery metadata (does NOT delete S3 file).
 */
router.delete(
    '/satellite/:id',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const imageryId = req.params['id'];
            if (!imageryId) {
                res.status(400).json({ success: false, error: 'Imagery ID required' } as ApiResponse);
                return;
            }

            const deleted = await satellite.deleteImagery(String(imageryId));
            if (!deleted) {
                res.status(404).json({ success: false, error: 'Imagery not found' } as ApiResponse);
                return;
            }

            res.json({ success: true, data: { deleted: true } } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Spatial.SatelliteDelete');
        }
    },
);

// ═══════════════════════════════════════════════════════════════════════════
// GEOFENCING — COMPLIANCE ZONES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/spatial/geofencing/check
 * Check if a coordinate falls within any restricted zone.
 * Critical for project creation compliance validation.
 */
router.post('/geofencing/check', async (req: Request, res: Response) => {
    try {
        const { lat, lng } = nearbySearchSchema.parse(req.body);

        const result = await geofencing.checkProjectCompliance(lat, lng);
        res.json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Spatial');
    }
});

/**
 * GET /api/spatial/geofencing/zones/geojson
 * Get all active zones as GeoJSON FeatureCollection (for map visualization).
 */
router.get('/geofencing/zones/geojson', async (_req: Request, res: Response) => {
    try {
        const geojson = await geofencing.getActiveZonesGeoJSON();
        res.json({ success: true, data: geojson } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Spatial.GeofencingGeoJSON');
    }
});

/**
 * GET /api/spatial/geofencing/zones  (admin)
 * List all zones including inactive (admin management view).
 */
router.get(
    '/geofencing/zones',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const includeInactive = String(req.query['include_inactive']) === 'true';
            const pLimit = parseInt(String(req.query['limit'] ?? '50'), 10);
            const limit = Number.isNaN(pLimit) ? 50 : pLimit;
            const pOffset = parseInt(String(req.query['offset'] ?? '0'), 10);
            const offset = Number.isNaN(pOffset) ? 0 : pOffset;

            const result = await geofencing.listAllZones({
                include_inactive: includeInactive,
                limit,
                offset,
            });

            res.json({ success: true, data: result } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Spatial.GeofencingZones');
        }
    },
);

/**
 * POST /api/spatial/geofencing/zones  (admin)
 * Create a new geofenced compliance zone.
 */
router.post(
    '/geofencing/zones',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const userId = (req as Request & { userId?: string }).userId;
            if (!userId) {
                res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
                return;
            }

            const body = createGeofenceZoneSchema.parse(req.body);

            const zone = await geofencing.createZone(body as unknown as geofencing.CreateZoneDTO, userId);
            res.status(201).json({ success: true, data: zone } as ApiResponse);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'Spatial');
        }
    },
);

/**
 * DELETE /api/spatial/geofencing/zones/:id  (admin)
 * Soft-delete (deactivate) a geofenced zone.
 */
router.delete(
    '/geofencing/zones/:id',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const zoneId = req.params['id'];
            if (!zoneId) {
                res.status(400).json({ success: false, error: 'Zone ID required' } as ApiResponse);
                return;
            }

            const deactivated = await geofencing.deactivateZone(String(zoneId));
            if (!deactivated) {
                res.status(404).json({ success: false, error: 'Zone not found' } as ApiResponse);
                return;
            }

            res.json({ success: true, data: { deactivated: true } } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Spatial.GeofencingDeleteZone');
        }
    },
);

export default router;
