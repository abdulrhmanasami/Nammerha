// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Supplier Routes
// Catalog CRUD + Purchase Order Management + Dashboard Stats
// All endpoints require: JWT + KYC verified + role='supplier'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireAttributes } from '../middleware/abac.middleware';
import * as supplierService from '../services/supplier.service';
import { safeRouteError } from '../utils/safe-error';
import { ZodError } from 'zod';
import { addCatalogItemSchema, updateCatalogItemSchema, poStatusSchema } from '../validation/schemas';
import type { ApiResponse } from '../types';

const router = Router();

// UNIFIED CITIZEN: All authenticated users can access supplier features.
// Role-gating removed — any citizen can manage catalogs and orders.
router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/supplier/catalog — Add Material to Catalog ───────────────────
router.post('/catalog', requireAttributes('supplier:manage_catalog'), async (req: Request, res: Response) => {
    try {
        const dto = addCatalogItemSchema.parse(req.body);

        const item = await supplierService.addCatalogItem(getAuthUser(req).user_id, dto);
        res.status(201).json({
            success: true,
            data: item,
            message: 'Material added to catalog',
        } as ApiResponse);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Supplier.AddCatalog');
    }
});

// ─── GET /api/supplier/catalog — View My Catalog (paginated) ────────────────
router.get('/catalog', async (req: Request, res: Response) => {
    try {
        const rawLimit = parseInt(String(req.query['limit'] ?? ''), 10);
        const rawOffset = parseInt(String(req.query['offset'] ?? ''), 10);
        const limit = Number.isNaN(rawLimit) ? undefined : rawLimit;
        const offset = Number.isNaN(rawOffset) ? undefined : rawOffset;
        const search = req.query['search'] as string | undefined;
        const result = await supplierService.getMyCatalog(getAuthUser(req).user_id, { limit, offset, search });
        res.json({ success: true, data: result.items, meta: { total: result.total, limit: limit ?? 50, offset: offset ?? 0 } } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Supplier.GetCatalog');
    }
});

// ─── PATCH /api/supplier/catalog/:id — Update Catalog Item ──────────────────
// E1 AUDIT FIX: Added field validation — was completely missing (POST had 4 checks, PATCH had 0).
router.patch('/catalog/:id', requireAttributes('supplier:manage_catalog'), async (req: Request, res: Response) => {
    try {
        const dto = updateCatalogItemSchema.parse(req.body);

        const item = await supplierService.updateCatalogItem(
            getAuthUser(req).user_id,
            String(req.params['id']),
            dto,
        );
        res.json({ success: true, data: item, message: 'Catalog item updated' } as ApiResponse);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Supplier.UpdateCatalog');
    }
});

// ─── DELETE /api/supplier/catalog/:id — Deactivate Catalog Item ─────────────
router.delete('/catalog/:id', requireAttributes('supplier:manage_catalog'), async (req: Request, res: Response) => {
    try {
        await supplierService.deactivateCatalogItem(
            getAuthUser(req).user_id,
            String(req.params['id']),
        );
        res.json({ success: true, message: 'Catalog item deactivated' } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Supplier');
    }
});

// ─── POST /api/supplier/catalog/:id/reactivate — Re-enable Catalog Item ─────
router.post('/catalog/:id/reactivate', requireAttributes('supplier:manage_catalog'), async (req: Request, res: Response) => {
    try {
        const item = await supplierService.reactivateCatalogItem(
            getAuthUser(req).user_id,
            String(req.params['id']),
        );
        res.json({ success: true, data: item, message: 'Catalog item reactivated' } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Supplier.Reactivate');
    }
});

// ─── GET /api/supplier/orders — My Purchase Orders (paginated) ──────────────
router.get('/orders', async (req: Request, res: Response) => {
    try {
        const status = req.query['status'] as string | undefined;
        const rawLimit = parseInt(String(req.query['limit'] ?? ''), 10);
        const rawOffset = parseInt(String(req.query['offset'] ?? ''), 10);
        const limit = Number.isNaN(rawLimit) ? undefined : rawLimit;
        const offset = Number.isNaN(rawOffset) ? undefined : rawOffset;
        const result = await supplierService.getMyOrders(getAuthUser(req).user_id, status, { limit, offset });
        res.json({ success: true, data: result.items, meta: { total: result.total, limit: limit ?? 50, offset: offset ?? 0 } } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Supplier.GetOrders');
    }
});

// ─── PATCH /api/supplier/orders/:id/status — Update PO Status ───────────────
// Valid transitions: generated/sent→acknowledged, acknowledged→shipped, shipped→delivered
router.patch('/orders/:id/status', requireAttributes('supplier:fulfill_order'), async (req: Request, res: Response) => {
    try {
        const { status: newStatus } = poStatusSchema.parse(req.body);

        let order;
        if (newStatus === 'acknowledged') {
            order = await supplierService.acknowledgeOrder(
                getAuthUser(req).user_id,
                String(req.params['id']),
            );
        } else {
            order = await supplierService.updateOrderStatus(
                getAuthUser(req).user_id,
                String(req.params['id']),
                newStatus as 'shipped' | 'delivered',
            );
        }

        res.json({
            success: true,
            data: order,
            message: `Order status updated to '${newStatus}'`,
        } as ApiResponse);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'Supplier');
    }
});

// ─── GET /api/supplier/stats — Dashboard KPIs ───────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await supplierService.getMyStats(getAuthUser(req).user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Supplier.GetStats');
    }
});

// ─── GET /api/supplier/analytics — Monthly Revenue Analytics ────────────────
router.get('/analytics', async (req: Request, res: Response) => {
    try {
        const data = await supplierService.getMonthlyAnalytics(getAuthUser(req).user_id);
        res.json({ success: true, data } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Supplier.Analytics');
    }
});

export default router;
