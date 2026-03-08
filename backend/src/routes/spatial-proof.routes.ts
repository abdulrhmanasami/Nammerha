// ============================================================================
// Nammerha Backend — Spatial Proof Routes (Path 3)
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as executionService from '../services/execution.service';
import type { SubmitSpatialProofDTO, ApiResponse } from '../types';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/spatial-proof — Submit GPS Proof (Engineer) ──────────────────
router.post('/', requireRole('engineer'), async (req: Request, res: Response) => {
    try {
        const dto = req.body as SubmitSpatialProofDTO;

        if (!dto.item_id || !dto.project_id || !dto.image_url || dto.gps_lat == null || dto.gps_lng == null) {
            const response: ApiResponse = {
                success: false,
                error: 'Missing required fields: item_id, project_id, image_url, gps_lat, gps_lng',
            };
            res.status(400).json(response);
            return;
        }

        const proof = await executionService.submitSpatialProof(
            req.authUser!.user_id,
            dto
        );

        const response: ApiResponse = {
            success: true,
            data: proof,
            message: 'Spatial proof submitted for verification',
        };
        res.status(201).json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('GPS validation failed') ? 422 : 400;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/spatial-proof/project/:id — Get Purchase Orders for Project ───
// P2-NEW-006 FIX: Clarified endpoint purpose. This returns POs (not proofs)
// because the spatial proof flow is: PO generated → Engineer delivers → Proof submitted.
// This endpoint shows what POs exist so engineers know what to verify on-site.
router.get('/project/:id', async (req: Request, res: Response) => {
    try {
        const purchaseOrders = await executionService.getProjectPurchaseOrders(String(req.params['id']));
        res.json({ success: true, data: purchaseOrders } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
