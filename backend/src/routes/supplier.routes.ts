// ============================================================================
// Nammerha Backend — Supplier Routes
// Catalog CRUD + Purchase Order Management + Dashboard Stats
// All endpoints require: JWT + KYC verified + role='supplier'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as supplierService from '../services/supplier.service';
import type { AddCatalogItemDTO, UpdateCatalogItemDTO, ApiResponse } from '../types';

const router = Router();

// All supplier routes require authentication + active account + supplier role
router.use(authMiddleware);
router.use(requireActive);
router.use(requireRole('supplier'));

// ─── POST /api/supplier/catalog — Add Material to Catalog ───────────────────
router.post('/catalog', async (req: Request, res: Response) => {
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

        const item = await supplierService.addCatalogItem(req.authUser!.user_id, dto);
        res.status(201).json({
            success: true,
            data: item,
            message: 'Material added to catalog',
        } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('duplicate key') ? 409 : 400;
        res.status(status).json({
            success: false,
            error: status === 409
                ? 'This material is already in your catalog (same name + unit)'
                : message,
        } as ApiResponse);
    }
});

// ─── GET /api/supplier/catalog — View My Catalog ────────────────────────────
router.get('/catalog', async (req: Request, res: Response) => {
    try {
        const items = await supplierService.getMyCatalog(req.authUser!.user_id);
        res.json({ success: true, data: items } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── PATCH /api/supplier/catalog/:id — Update Catalog Item ──────────────────
router.patch('/catalog/:id', async (req: Request, res: Response) => {
    try {
        const dto = req.body as UpdateCatalogItemDTO;
        const item = await supplierService.updateCatalogItem(
            req.authUser!.user_id,
            String(req.params['id']),
            dto,
        );
        res.json({ success: true, data: item, message: 'Catalog item updated' } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('not found') || message.includes('not owned') ? 404 : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── DELETE /api/supplier/catalog/:id — Deactivate Catalog Item ─────────────
router.delete('/catalog/:id', async (req: Request, res: Response) => {
    try {
        await supplierService.deactivateCatalogItem(
            req.authUser!.user_id,
            String(req.params['id']),
        );
        res.json({ success: true, message: 'Catalog item deactivated' } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('not found') || message.includes('not owned') ? 404 : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/supplier/orders — My Purchase Orders ──────────────────────────
router.get('/orders', async (req: Request, res: Response) => {
    try {
        const status = req.query['status'] as string | undefined;
        const orders = await supplierService.getMyOrders(req.authUser!.user_id, status);
        res.json({ success: true, data: orders } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── PATCH /api/supplier/orders/:id/status — Update PO Status ───────────────
// Valid transitions: generated/sent→acknowledged, acknowledged→shipped, shipped→delivered
router.patch('/orders/:id/status', async (req: Request, res: Response) => {
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
                req.authUser!.user_id,
                String(req.params['id']),
            );
        } else {
            order = await supplierService.updateOrderStatus(
                req.authUser!.user_id,
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/supplier/stats — Dashboard KPIs ───────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await supplierService.getMyStats(req.authUser!.user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
