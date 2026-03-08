// ============================================================================
// Nammerha Backend — Marketplace Routes (Path 2 — Public)
// ============================================================================
import { Router, Request, Response } from 'express';
import * as crowdfundingService from '../services/crowdfunding.service';
import type { ApiResponse } from '../types';

const router = Router();

// Marketplace routes are public (no auth required for browsing)

// ─── GET /api/marketplace/projects — Browse Published Projects ──────────────
router.get('/projects', async (req: Request, res: Response) => {
    try {
        const projects = await crowdfundingService.getMarketplaceProjects({
            damage_type: req.query['damage_type'] as string | undefined,
            sort_by: req.query['sort_by'] as 'funded_percentage' | 'published_at' | undefined,
        });
        const response: ApiResponse = { success: true, data: projects };
        res.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/marketplace/projects/:id/boq — Get BOQ for Project ────────────
router.get('/projects/:id/boq', async (req: Request, res: Response) => {
    try {
        const boq = await crowdfundingService.getProjectBOQ(String(req.params['id']));
        const response: ApiResponse = { success: true, data: boq };
        res.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
