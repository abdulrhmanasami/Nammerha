// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Supplier Routes
// Catalog CRUD + Purchase Order Management + Dashboard Stats
// All endpoints require: JWT + KYC verified + role='supplier'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import { requireAttributes } from '../middleware/abac.middleware';
import * as supplierService from '../services/supplier.service';
import { safeRouteError } from '../utils/safe-error';
import type { AddCatalogItemDTO, UpdateCatalogItemDTO, ApiResponse } from '../types';

const router = Router();

// All supplier routes require authentication + active account + supplier role
router.use(authMiddleware);
router.use(requireActive);
router.use(requireRole('supplier'));

// ─── POST /api/supplier/catalog — Add Material to Catalog ───────────────────
router.post('/catalog', requireAttributes('supplier:manage_catalog'), async (req: Request, res: Response) => {
    try {
        const dto = req.body as AddCatalogItemDTO;

        if (!dto.material_name || !dto.material_category || !dto.unit || dto.unit_price_guide === undefined) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: material_name, material_category, unit, unit_price_guide',
            } as ApiResponse);
            return;
        }

        if (dto.unit_price_guide <= 0) {
            res.status(400).json({
                success: false,
                error: 'unit_price_guide must be a positive integer (cents)',
            } as ApiResponse);
            return;
        }

        // DT-ENUM-002 FIX: Integer validation — prevent floating-point precision attacks.
        // All prices in the Nammerha system are in cents (integer arithmetic).
        // A fractional value (e.g., 100.5 cents) would cause rounding issues downstream.
        if (!Number.isInteger(dto.unit_price_guide)) {
            res.status(400).json({
                success: false,
                error: 'unit_price_guide must be an integer (cents)',
            } as ApiResponse);
            return;
        }

        // DT-ENUM-002 FIX: Max cap — prevent integer overflow and unrealistic pricing.
        // $1M (100_000_000 cents) is a generous upper bound for material unit prices.
        const MAX_UNIT_PRICE_CENTS = 100_000_000;
        if (dto.unit_price_guide > MAX_UNIT_PRICE_CENTS) {
            res.status(400).json({
                success: false,
                error: `unit_price_guide exceeds maximum (${MAX_UNIT_PRICE_CENTS} cents / $1M)`,
            } as ApiResponse);
            return;
        }

        const item = await supplierService.addCatalogItem(getAuthUser(req).user_id, dto);
        res.status(201).json({
            success: true,
            data: item,
            message: 'Material added to catalog',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Supplier.AddCatalog');
    }
});

// ─── GET /api/supplier/catalog — View My Catalog ────────────────────────────
router.get('/catalog', async (req: Request, res: Response) => {
    try {
        const items = await supplierService.getMyCatalog(getAuthUser(req).user_id);
        res.json({ success: true, data: items } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Supplier.GetCatalog');
    }
});

// ─── PATCH /api/supplier/catalog/:id — Update Catalog Item ──────────────────
router.patch('/catalog/:id', async (req: Request, res: Response) => {
    try {
        const dto = req.body as UpdateCatalogItemDTO;
        const item = await supplierService.updateCatalogItem(
            getAuthUser(req).user_id,
            String(req.params['id']),
            dto,
        );
        res.json({ success: true, data: item, message: 'Catalog item updated' } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Supplier');
    }
});

// ─── DELETE /api/supplier/catalog/:id — Deactivate Catalog Item ─────────────
router.delete('/catalog/:id', async (req: Request, res: Response) => {
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

// ─── GET /api/supplier/orders — My Purchase Orders ──────────────────────────
router.get('/orders', async (req: Request, res: Response) => {
    try {
        const status = req.query['status'] as string | undefined;
        const orders = await supplierService.getMyOrders(getAuthUser(req).user_id, status);
        res.json({ success: true, data: orders } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Supplier.GetOrders');
    }
});

// ─── PATCH /api/supplier/orders/:id/status — Update PO Status ───────────────
// Valid transitions: generated/sent→acknowledged, acknowledged→shipped, shipped→delivered
router.patch('/orders/:id/status', requireAttributes('supplier:fulfill_order'), async (req: Request, res: Response) => {
    try {
        const { status: newStatus } = req.body as { status: string };

        if (!newStatus) {
            res.status(400).json({
                success: false,
                error: 'Missing required field: status',
            } as ApiResponse);
            return;
        }

        const validStatuses = ['acknowledged', 'shipped', 'delivered'];
        if (!validStatuses.includes(newStatus)) {
            res.status(400).json({
                success: false,
                error: `Invalid status. Allowed: ${validStatuses.join(', ')}`,
            } as ApiResponse);
            return;
        }

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

export default router;
