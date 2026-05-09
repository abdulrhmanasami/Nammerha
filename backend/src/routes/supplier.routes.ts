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

        // F1 AUDIT FIX: Validate min_order_qty when provided (POST had 0 checks on this).
        if (dto.min_order_qty !== undefined && (!Number.isInteger(dto.min_order_qty) || dto.min_order_qty < 1)) {
            res.status(400).json({ success: false, error: 'min_order_qty must be a positive integer (>= 1)' } as ApiResponse);
            return;
        }

        // F1 AUDIT FIX: Validate lead_time_days when provided.
        if (dto.lead_time_days !== undefined && (!Number.isInteger(dto.lead_time_days) || dto.lead_time_days < 1)) {
            res.status(400).json({ success: false, error: 'lead_time_days must be a positive integer (>= 1)' } as ApiResponse);
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
        const dto = req.body as UpdateCatalogItemDTO;

        // Validate unit_price_guide if provided
        if (dto.unit_price_guide !== undefined) {
            if (dto.unit_price_guide <= 0) {
                res.status(400).json({ success: false, error: 'unit_price_guide must be a positive integer (cents)' } as ApiResponse);
                return;
            }
            if (!Number.isInteger(dto.unit_price_guide)) {
                res.status(400).json({ success: false, error: 'unit_price_guide must be an integer (cents)' } as ApiResponse);
                return;
            }
            const MAX_UNIT_PRICE_CENTS = 100_000_000;
            if (dto.unit_price_guide > MAX_UNIT_PRICE_CENTS) {
                res.status(400).json({ success: false, error: `unit_price_guide exceeds maximum (${MAX_UNIT_PRICE_CENTS} cents / $1M)` } as ApiResponse);
                return;
            }
        }

        // Validate min_order_qty if provided
        if (dto.min_order_qty !== undefined) {
            if (!Number.isInteger(dto.min_order_qty) || dto.min_order_qty < 1) {
                res.status(400).json({ success: false, error: 'min_order_qty must be a positive integer (>= 1)' } as ApiResponse);
                return;
            }
        }

        // Validate lead_time_days if provided
        if (dto.lead_time_days !== undefined) {
            if (!Number.isInteger(dto.lead_time_days) || dto.lead_time_days < 1) {
                res.status(400).json({ success: false, error: 'lead_time_days must be a positive integer (>= 1)' } as ApiResponse);
                return;
            }
        }

        const item = await supplierService.updateCatalogItem(
            getAuthUser(req).user_id,
            String(req.params['id']),
            dto,
        );
        res.json({ success: true, data: item, message: 'Catalog item updated' } as ApiResponse);
    } catch (error) {
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
