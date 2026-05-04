// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Spatial Proof Routes (Path 3)
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as executionService from '../services/execution.service';
import { parseSpatialProof, formatZodErrors } from '../validation/spatial-proof.schema';
import type { ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';
import { ZodError } from 'zod';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ─── POST /api/spatial-proof — Submit GPS Proof (Engineer) ──────────────────
// F-006 FIX: Zod validation replaces ad-hoc type assertion.
// Validates: UUID format, coordinate ranges [-90/90, -180/180], NaN/Infinity
// rejection, string length bounds, and produces structured error messages.
router.post('/', requireRole('engineer'), async (req: Request, res: Response) => {
    try {
        // F-006 FIX: Runtime validation — NOT a type assertion.
        // parseSpatialProof() throws ZodError with field-level details on failure.
        const dto = parseSpatialProof(req.body);

        const proof = await executionService.submitSpatialProof(
            getAuthUser(req).user_id,
            dto
        );

        const response: ApiResponse = {
            success: true,
            data: proof,
            message: 'Spatial proof submitted for verification',
        };
        res.status(201).json(response);
    } catch (error) {
        // F-006 FIX: Structured Zod validation errors → 400 with field details.
        if (error instanceof ZodError) {
            const response: ApiResponse = {
                success: false,
                error: formatZodErrors(error),
            };
            res.status(400).json(response);
            return;
        }
        safeRouteError(res, error, 'SpatialProof');
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
                safeRouteError(res, error, 'SpatialProof');
    }
});

export default router;
