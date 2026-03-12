// ============================================================================
// Nammerha Backend — Marketplace Routes (Path 2 — Public)
// ============================================================================
import { Router, Request, Response } from 'express';
import * as crowdfundingService from '../services/crowdfunding.service';
import * as supplierService from '../services/supplier.service';
import { safeRouteError } from '../utils/safe-error';
import type { ApiResponse } from '../types';

const router = Router();

// Marketplace routes are public (no auth required for browsing)

// ─── GET /api/marketplace/projects — Browse Published Projects ──────────────
router.get('/projects', async (req: Request, res: Response) => {
    try {
        // PLT-AUDIT-001 FIX: Forward pagination params to prevent unbounded result sets.
        const limit = req.query['limit'] ? parseInt(String(req.query['limit']), 10) : undefined;
        const offset = req.query['offset'] ? parseInt(String(req.query['offset']), 10) : undefined;
        const projects = await crowdfundingService.getMarketplaceProjects({
            damage_type: req.query['damage_type'] as string | undefined,
            sort_by: req.query['sort_by'] as 'funded_percentage' | 'published_at' | undefined,
            limit: Number.isFinite(limit) ? limit : undefined,
            offset: Number.isFinite(offset) ? offset : undefined,
        });
        const response: ApiResponse = { success: true, data: projects };
        res.json(response);
    } catch (error) {
        safeRouteError(res, error, 'Marketplace.GetProjects');
    }
});

// ─── GET /api/marketplace/projects/:id/boq — Get BOQ for Project ────────────
router.get('/projects/:id/boq', async (req: Request, res: Response) => {
    try {
        const boq = await crowdfundingService.getProjectBOQ(String(req.params['id']));
        const response: ApiResponse = { success: true, data: boq };
        res.json(response);
    } catch (error) {
        safeRouteError(res, error, 'Marketplace.GetProjectBOQ');
    }
});

// ─── GET /api/marketplace/suppliers — List Verified Suppliers ────────────────
// Per strategic study §7.1: engineers select pre-assigned suppliers for BOQ items.
// Donors also see supplier names in the basket UI for transparency.
router.get('/suppliers', async (_req: Request, res: Response) => {
    try {
        const suppliers = await crowdfundingService.getVerifiedSuppliers();
        const response: ApiResponse = { success: true, data: suppliers };
        res.json(response);
    } catch (error) {
        safeRouteError(res, error, 'Marketplace.GetSuppliers');
    }
});

// ─── GET /api/marketplace/suppliers/:id/catalog — Supplier's Material Catalog ─
// Per strategic study §7.2: engineers browse supplier catalogs when building BOQ.
// Public endpoint: no auth required for browsing.
router.get('/suppliers/:id/catalog', async (req: Request, res: Response) => {
    try {
        const category = req.query['category'] as string | undefined;
        const catalog = await supplierService.getSupplierCatalog(
            String(req.params['id']),
            category,
        );
        const response: ApiResponse = { success: true, data: catalog };
        res.json(response);
    } catch (error) {
        safeRouteError(res, error, 'Marketplace.GetSupplierCatalog');
    }
});

export default router;
