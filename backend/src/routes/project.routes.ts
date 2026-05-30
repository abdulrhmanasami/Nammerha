// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Project Routes (Path 1)
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import * as projectService from '../services/project.service';
import { query } from '../config/database';
import type { CreateProjectDTO, AddBOQItemDTO, ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';
import { createProjectSchema, addBOQItemSchema } from '../validation/schemas';
import { formatZodErrors } from '../validation/spatial-proof.schema';
import { ZodError } from 'zod';

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
        safeRouteError(res, error, 'Project.GetGeoJSON');
    }
});

// ─── AUTHENTICATED ROUTES ───────────────────────────────────────────────────
// All routes below require authentication
router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/projects — Create Damage Report (Homeowner) ─────────────────
// UNIFIED CITIZEN: Any authenticated user can create a damage report / project.
router.post('/', async (req: Request, res: Response) => {
    try {
        const dto = createProjectSchema.parse(req.body) as CreateProjectDTO;

        const project = await projectService.createProject(getAuthUser(req).user_id, dto);
        const response: ApiResponse = { success: true, data: project, message: 'Project created successfully' };
        res.status(201).json(response);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                success: false,
                error: formatZodErrors(error),
            } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Project.Create');
    }
});

// ─── POST /api/projects/:id/assign-engineer — Auto-Assign (System) ─────────
// UNIFIED CITIZEN: Project owner or admin can assign engineer.
router.post('/:id/assign-engineer', async (req: Request, res: Response) => {
    try {
        const projectId = String(req.params['id']);

        // DT-IDOR-001 FIX: Verify homeowner owns this project (admin bypasses)
        // UNIFIED CITIZEN: Non-admin users must own the project
        if (getAuthUser(req).role !== 'admin') {
            const ownerCheck = await query<{ homeowner_id: string }>(
                'SELECT homeowner_id FROM projects WHERE project_id = $1',
                [projectId]
            );
            if (!ownerCheck.rows[0] || ownerCheck.rows[0].homeowner_id !== getAuthUser(req).user_id) {
                res.status(403).json({ success: false, error: 'Access denied' } as ApiResponse);
                return;
            }
        }

        const result = await projectService.assignEngineer(projectId);
        const response: ApiResponse = { success: true, data: result, message: 'Engineer assigned successfully' };
        res.status(200).json(response);
    } catch (error) {
        safeRouteError(res, error, 'Project.AssignEngineer');
    }
});

// ─── POST /api/projects/:id/boq — Add BOQ Item (Engineer) ──────────────────
// UNIFIED CITIZEN: Any authenticated user can add BOQ items.
router.post('/:id/boq', async (req: Request, res: Response) => {
    try {
        const dto = addBOQItemSchema.parse(req.body) as AddBOQItemDTO;

        const item = await projectService.addBOQItem(
            String(req.params['id']),
            getAuthUser(req).user_id,
            dto
        );
        const response: ApiResponse = { success: true, data: item, message: 'BOQ item added' };
        res.status(201).json(response);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                success: false,
                error: formatZodErrors(error),
            } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Project.AddBOQ');
    }
});

// ─── PATCH /api/projects/:id/publish — Publish to Marketplace (Engineer) ───
// UNIFIED CITIZEN: Any authenticated user can publish a project.
router.patch('/:id/publish', async (req: Request, res: Response) => {
    try {
        const project = await projectService.publishProject(
            String(req.params['id']),
            getAuthUser(req).user_id
        );
        const response: ApiResponse = { success: true, data: project, message: 'Project published to marketplace' };
        res.status(200).json(response);
    } catch (error) {
        safeRouteError(res, error, 'Project.Publish');
    }
});

// ─── GET /api/projects/my/list ──────────────────────────────────────────────
// IMPORTANT: Must be defined BEFORE /:id to prevent Express matching "my" as :id
router.get(
    // UNIFIED CITIZEN: Any authenticated user can list their projects.
    '/my/list',
    async (req: Request, res: Response) => {
        try {
            const projects = await projectService.getHomeownerProjects(getAuthUser(req).user_id);
            const response: ApiResponse = {
                success: true,
                data: projects,
            };
            res.json(response);
        } catch (error) {
            safeRouteError(res, error, 'Project.GetMyList');
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
        safeRouteError(res, error, 'Project.GetById');
    }
});

export default router;
