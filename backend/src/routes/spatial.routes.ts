// ============================================================================
// Nammerha Backend — Satellite & Geofencing Routes
// STAC imagery catalog + spatial compliance endpoints
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as satellite from '../services/satellite.service';
import * as geofencing from '../services/geofencing.service';
import type { ApiResponse } from '../types';

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
        const limit = parseInt(String(req.query['limit'] ?? '20')) || 20;
        const offset = parseInt(String(req.query['offset'] ?? '0')) || 0;

        const result = await satellite.getTimelineForProject(String(projectId), {
            provider,
            limit,
            offset,
        });

        res.json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Satellite] Timeline fetch failed:', error);
        res.status(500).json({ success: false, error: message } as ApiResponse);
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Satellite] Image fetch failed:', error);
        res.status(500).json({ success: false, error: message } as ApiResponse);
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Satellite] Stats fetch failed:', error);
        res.status(500).json({ success: false, error: message } as ApiResponse);
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

            const body = req.body as satellite.RegisterImageryDTO;

            // Validate required fields
            if (!body.project_id || !body.bbox_wkt || !body.captured_at ||
                !body.provider || !body.resolution_cm || !body.image_url) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields: project_id, bbox_wkt, captured_at, provider, resolution_cm, image_url',
                } as ApiResponse);
                return;
            }

            const result = await satellite.registerImagery(body, userId);
            res.status(201).json({ success: true, data: result } as ApiResponse);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Satellite] Registration failed:', error);
            res.status(400).json({ success: false, error: message } as ApiResponse);
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
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Satellite] Deletion failed:', error);
            res.status(500).json({ success: false, error: message } as ApiResponse);
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
        const { lat, lng } = req.body as { lat?: number; lng?: number };

        if (lat === undefined || lng === undefined) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: lat, lng',
            } as ApiResponse);
            return;
        }

        const result = await geofencing.checkProjectCompliance(lat, lng);
        res.json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Geofencing] Compliance check failed:', error);
        res.status(400).json({ success: false, error: message } as ApiResponse);
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Geofencing] GeoJSON fetch failed:', error);
        res.status(500).json({ success: false, error: message } as ApiResponse);
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
            const limit = parseInt(String(req.query['limit'] ?? '50')) || 50;
            const offset = parseInt(String(req.query['offset'] ?? '0')) || 0;

            const result = await geofencing.listAllZones({
                include_inactive: includeInactive,
                limit,
                offset,
            });

            res.json({ success: true, data: result } as ApiResponse);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Geofencing] Zone list failed:', error);
            res.status(500).json({ success: false, error: message } as ApiResponse);
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

            const body = req.body as geofencing.CreateZoneDTO;

            if (!body.zone_name || !body.zone_polygon_wkt || !body.restriction_type) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields: zone_name, zone_polygon_wkt, restriction_type',
                } as ApiResponse);
                return;
            }

            const zone = await geofencing.createZone(body, userId);
            res.status(201).json({ success: true, data: zone } as ApiResponse);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Geofencing] Zone creation failed:', error);
            res.status(400).json({ success: false, error: message } as ApiResponse);
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
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Geofencing] Zone deactivation failed:', error);
            res.status(500).json({ success: false, error: message } as ApiResponse);
        }
    },
);

export default router;
