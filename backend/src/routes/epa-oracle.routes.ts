// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — EPA Oracle Routes (Ticket 7.2)
// FIDIC 13.8 Price Adjustment Engine + Oracle Admin CRUD
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as oracle from '../services/epa-oracle.service';
import type { ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';
import { calculateEPASchema, upsertPriceSchema } from '../validation/schemas';
import { formatZodErrors } from '../validation/spatial-proof.schema';
import { ZodError } from 'zod';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ─── GET /api/oracle/prices — List Oracle Prices ────────────────────────────
router.get(
    '/prices',
    requireRole('admin', 'auditor', 'engineer'),
    async (req: Request, res: Response) => {
        try {
            const materialCode = req.query.material_code as string | undefined;
            const entries = await oracle.getOracleEntries(materialCode);

            const response: ApiResponse = {
                success: true,
                data: entries,
                message: `${entries.length} oracle entries`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'EpaOracle');
        }
    }
);

// ─── POST /api/oracle/prices — Create/Update Price Entry ────────────────────
router.post(
    '/prices',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const dto = upsertPriceSchema.parse(req.body);

            const entry = await oracle.upsertOracleEntry(dto, getAuthUser(req).user_id);

            const response: ApiResponse = {
                success: true,
                data: entry,
                message: `Oracle entry created: ${entry.material_name}`,
            };
            res.status(201).json(response);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({
                    success: false,
                    error: formatZodErrors(error),
                } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'EPAOracle');
        }
    }
);

// ─── POST /api/oracle/epa/calculate — Calculate FIDIC 13.8 Adjustment ───────
router.post(
    '/epa/calculate',
    requireRole('admin', 'auditor', 'engineer'),
    async (req: Request, res: Response) => {
        try {
            const dto = calculateEPASchema.parse(req.body);

            const adjustment = await oracle.calculateAndStoreEPA(dto, getAuthUser(req).user_id);

            const response: ApiResponse = {
                success: true,
                data: adjustment,
                message: `FIDIC adjustment: Pn=${adjustment.adjustment_multiplier}, delta=$${(adjustment.adjustment_delta / 100).toFixed(2)}`,
            };
            res.status(201).json(response);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({
                    success: false,
                    error: formatZodErrors(error),
                } as ApiResponse);
                return;
            }
            safeRouteError(res, error, 'EPAOracle');
        }
    }
);

// ─── GET /api/oracle/epa/history/:projectId — EPA History ───────────────────
router.get(
    '/epa/history/:projectId',
    requireRole('admin', 'auditor', 'engineer', 'homeowner'),
    async (req: Request, res: Response) => {
        try {
            const history = await oracle.getEPAHistory(String(req.params.projectId));

            const response: ApiResponse = {
                success: true,
                data: history,
                message: `${history.length} EPA adjustments`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'EpaOracle');
        }
    }
);

// ─── POST /api/oracle/epa/approve/:adjustmentId — Approve/Reject EPA ────────
router.post(
    '/epa/approve/:adjustmentId',
    requireRole('admin', 'auditor'),
    async (req: Request, res: Response) => {
        try {
            const { decision } = req.body as { decision: 'approved' | 'rejected' };

            if (!decision || !['approved', 'rejected'].includes(decision)) {
                res.status(400).json({
                    success: false,
                    error: "Required: decision ('approved' | 'rejected')",
                } as ApiResponse);
                return;
            }

            const result = await oracle.respondToEPA(
                String(req.params.adjustmentId),
                getAuthUser(req).user_id,
                decision
            );

            const response: ApiResponse = {
                success: true,
                data: result,
                message: `EPA adjustment ${decision}`,
            };
            res.json(response);
        } catch (error) {
            safeRouteError(res, error, 'EPAOracle');
        }
    }
);

// ─── GET /api/oracle/epa/alerts — Threshold Alerts ──────────────────────────
router.get(
    '/epa/alerts',
    requireRole('admin', 'auditor'),
    async (_req: Request, res: Response) => {
        try {
            const alerts = await oracle.checkEPAThresholds();

            const response: ApiResponse = {
                success: true,
                data: alerts,
                message: `${alerts.length} projects with >5% price drift`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'EpaOracle');
        }
    }
);

export default router;
