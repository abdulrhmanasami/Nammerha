// ============================================================================
// Nammerha Backend — Project Routes (Path 1)
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as projectService from '../services/project.service';
import type { CreateProjectDTO, AddBOQItemDTO, ApiResponse } from '../types';

const router = Router();

// ─── PUBLIC ROUTES (no auth required) ───────────────────────────────────────

// GET /api/projects/geojson — Public GeoJSON FeatureCollection for MapLibre
// Returns all public projects with GPS coordinates for the interactive map.
// No authentication needed: vw_project_cards already filters to is_public=true.
router.get('/geojson', async (_req: Request, res: Response) => {
    try {
        const geojson = await projectService.getProjectsGeoJSON();
        // Cache for 60 seconds to reduce DB load on homepage
        res.set('Cache-Control', 'public, max-age=60');
        res.json(geojson);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[GeoJSON] Failed to generate project GeoJSON:', error);
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── AUTHENTICATED ROUTES ───────────────────────────────────────────────────
// All routes below require authentication
router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/projects — Create Damage Report (Homeowner) ─────────────────
router.post('/', requireRole('homeowner'), async (req: Request, res: Response) => {
    try {
        const dto = req.body as CreateProjectDTO;

        if (!dto.title || !dto.damage_type || dto.gps_lat == null || dto.gps_lng == null) {
            const response: ApiResponse = {
                success: false,
                error: 'Missing required fields: title, damage_type, gps_lat, gps_lng',
            };
            res.status(400).json(response);
            return;
        }

        const project = await projectService.createProject(req.authUser!.user_id, dto);
        const response: ApiResponse = { success: true, data: project, message: 'Project created successfully' };
        res.status(201).json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── POST /api/projects/:id/assign-engineer — Auto-Assign (System) ─────────
router.post('/:id/assign-engineer', requireRole('admin', 'homeowner'), async (req: Request, res: Response) => {
    try {
        const result = await projectService.assignEngineer(String(req.params['id']));
        const response: ApiResponse = { success: true, data: result, message: 'Engineer assigned successfully' };
        res.status(200).json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── POST /api/projects/:id/boq — Add BOQ Item (Engineer) ──────────────────
router.post('/:id/boq', requireRole('engineer'), async (req: Request, res: Response) => {
    try {
        const dto = req.body as AddBOQItemDTO;

        if (!dto.material_name || !dto.unit || dto.unit_price == null || dto.required_quantity == null || !dto.preferred_supplier_id) {
            const response: ApiResponse = {
                success: false,
                error: 'Missing required fields: material_name, unit, unit_price, required_quantity, preferred_supplier_id',
            };
            res.status(400).json(response);
            return;
        }

        const item = await projectService.addBOQItem(
            String(req.params['id']),
            req.authUser!.user_id,
            dto
        );
        const response: ApiResponse = { success: true, data: item, message: 'BOQ item added' };
        res.status(201).json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('not assigned') ? 403 : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── PATCH /api/projects/:id/publish — Publish to Marketplace (Engineer) ───
router.patch('/:id/publish', requireRole('engineer'), async (req: Request, res: Response) => {
    try {
        const project = await projectService.publishProject(
            String(req.params['id']),
            req.authUser!.user_id
        );
        const response: ApiResponse = { success: true, data: project, message: 'Project published to marketplace' };
        res.status(200).json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/projects/my/list ──────────────────────────────────────────────
// IMPORTANT: Must be defined BEFORE /:id to prevent Express matching "my" as :id
router.get(
    '/my/list',
    requireRole('homeowner'),
    async (req: Request, res: Response) => {
        try {
            const projects = await projectService.getHomeownerProjects(req.authUser!.user_id);
            const response: ApiResponse = {
                success: true,
                data: projects,
            };
            res.json(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ success: false, error: message } as ApiResponse);
        }
    }
);

// ─── GET /api/projects/:id ──────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const project = await projectService.getProjectById(String(req.params['id']));
        if (!project) {
            res.status(404).json({
                success: false,
                error: `Project ${req.params['id']} not found`,
            } as ApiResponse);
            return;
        }
        const response: ApiResponse = {
            success: true,
            data: project,
        };
        res.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
