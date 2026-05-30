// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Compliance Routes (Epic 09)
// SDN Screening + Export Controls + Security Event Logs
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as compliance from '../services/compliance.service';
import * as securityEvents from '../services/security-events.service';
import type { ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ═════════════════════════════════════════════════════════════════════════════
// SDN SANCTIONS SCREENING (admin only)
// ═════════════════════════════════════════════════════════════════════════════

// ─── POST /api/compliance/sdn/screen/:userId — Screen User Against SDN ──────
router.post(
    '/sdn/screen/:userId',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const result = await compliance.screenUserAgainstSDN(
                String(req.params.userId)
            );

            // Log security event
            await securityEvents.logSecurityEvent({
                event_type: result.status === 'clear'
                    ? 'sanctions_screening'
                    : 'sanctions_match_found',
                severity: result.status === 'clear' ? 'info' : 'critical',
                actor_id: getAuthUser(req).user_id,
                actor_role: getAuthUser(req).role,
                target_entity_type: 'user',
                target_entity_id: String(req.params.userId),
                ip_address: req.ip || undefined,
                payload: {
                    match_score: result.match_score,
                    matched_name: result.matched_name,
                    status: result.status,
                    auto_blocked: result.auto_blocked,
                },
            });

            const response: ApiResponse = {
                success: true,
                data: result,
                message: result.status === 'clear'
                    ? 'User cleared — no SDN match'
                    : result.auto_blocked
                        ? `CRITICAL: Auto-blocked — ${(result.match_score * 100).toFixed(1)}% match with "${result.matched_name}"`
                        : `Potential match (${(result.match_score * 100).toFixed(1)}%) — requires admin review`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'Compliance');
        }
    }
);

// ─── GET /api/compliance/sdn/results/:userId — Screening History ────────────
router.get(
    '/sdn/results/:userId',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const results = await compliance.getScreeningResults(
                String(req.params.userId)
            );

            const response: ApiResponse = {
                success: true,
                data: results,
                message: `${results.length} screening results`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'Compliance');
        }
    }
);

// ─── GET /api/compliance/sdn/pending — Pending Matches ──────────────────────
router.get(
    '/sdn/pending',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            // P2-PAG-001 FIX: Clamp pagination to prevent massive DB queries.
            const pLimit = parseInt(req.query.limit as string, 10);
            const limit = Math.min(Number.isNaN(pLimit) ? 50 : pLimit, 200);
            const pOffset = parseInt(req.query.offset as string, 10);
            const offset = Math.max(Number.isNaN(pOffset) ? 0 : pOffset, 0);
            const { results, total } = await compliance.getPendingScreenings(limit, offset);

            const response: ApiResponse = {
                success: true,
                data: { results, total, limit, offset },
                message: `${results.length} of ${total} pending reviews`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'Compliance');
        }
    }
);

// ─── PATCH /api/compliance/sdn/review/:resultId — Review Match ──────────────
router.patch(
    '/sdn/review/:resultId',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const { decision, notes } = req.body as {
                decision: 'false_positive' | 'confirmed_match';
                notes?: string;
            };

            if (!decision || !['false_positive', 'confirmed_match'].includes(decision)) {
                res.status(400).json({
                    success: false,
                    error: 'Required: decision (false_positive or confirmed_match)',
                } as ApiResponse);
                return;
            }

            const result = await compliance.reviewScreeningResult(
                String(req.params.resultId),
                getAuthUser(req).user_id,
                decision,
                notes
            );

            const response: ApiResponse = {
                success: true,
                data: result,
                message: `Screening result ${decision === 'false_positive' ? 'cleared' : 'CONFIRMED — user blocked'}`,
            };
            res.json(response);
        } catch (error) {
            safeRouteError(res, error, 'Compliance');
        }
    }
);

// ─── POST /api/compliance/sdn/import — Bulk Import SDN List ─────────────────
router.post(
    '/sdn/import',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const dto = req.body as compliance.ImportSDNDTO;

            if (!dto.entries || !Array.isArray(dto.entries) || dto.entries.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'Required: entries (array of SDN records)',
                } as ApiResponse);
                return;
            }

            const result = await compliance.importSDNList(dto);

            const response: ApiResponse = {
                success: true,
                data: result,
                message: `${result.imported} SDN entries imported`,
            };
            res.status(201).json(response);
                } catch (error) {
                    safeRouteError(res, error, 'Compliance');
        }
    }
);

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT CONTROLS (admin only)
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/compliance/export-controls/materials — List Controlled ─────────
router.get(
    '/export-controls/materials',
    requireRole('admin'),
    async (_req: Request, res: Response) => {
        try {
            const materials = await compliance.listControlledMaterials();

            const response: ApiResponse = {
                success: true,
                data: materials,
                message: `${materials.length} controlled materials`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'Compliance');
        }
    }
);

// ─── POST /api/compliance/export-controls/materials — Add Controlled ────────
router.post(
    '/export-controls/materials',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const dto = req.body as compliance.AddControlledMaterialDTO;

            if (!dto.material_name || !dto.material_category) {
                res.status(400).json({
                    success: false,
                    error: 'Required: material_name, material_category',
                } as ApiResponse);
                return;
            }

            const material = await compliance.addControlledMaterial(
                getAuthUser(req).user_id,
                dto
            );

            const response: ApiResponse = {
                success: true,
                data: material,
                message: `Controlled material added: ${material.material_name}`,
            };
            res.status(201).json(response);
        } catch (error) {
            safeRouteError(res, error, 'Compliance');
        }
    }
);

// ─── GET /api/compliance/export-controls/dual-use-items — Flagged BOQ ───────
router.get(
    '/export-controls/dual-use-items',
    requireRole('admin'),
    async (_req: Request, res: Response) => {
        try {
            const items = await compliance.getDualUseItems();

            const response: ApiResponse = {
                success: true,
                data: items,
                message: `${items.length} dual-use items flagged`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'Compliance');
        }
    }
);

// ═════════════════════════════════════════════════════════════════════════════
// SECURITY EVENTS (admin only)
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/compliance/security/events — Query Security Log ───────────────
router.get(
    '/security/events',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const filters = {
                event_type: req.query.type as securityEvents.SecurityEventType | undefined,
                severity: req.query.severity as securityEvents.SecuritySeverity | undefined,
                actor_id: req.query.actor as string | undefined,
                from_date: req.query.from as string | undefined,
                to_date: req.query.to as string | undefined,
            };
            // P2-PAG-001 FIX: Clamp pagination to prevent massive DB queries.
            const p_limit = parseInt(req.query.limit as string, 10);
            const limit = Math.min(Number.isNaN(p_limit) ? 100 : p_limit, 500);
            const p_offset = parseInt(req.query.offset as string, 10);
            const offset = Math.max(Number.isNaN(p_offset) ? 0 : p_offset, 0);

            const result = await securityEvents.getSecurityEvents(filters, limit, offset);

            const response: ApiResponse = {
                success: true,
                data: {
                    events: result.events,
                    total: result.total,
                    limit,
                    offset,
                },
                message: `${result.events.length} of ${result.total} security events`,
            };
            res.json(response);
                } catch (error) {
                    safeRouteError(res, error, 'Compliance');
        }
    }
);

// ─── GET /api/compliance/security/export/cef — CEF Format Export ────────────
router.get(
    '/security/export/cef',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const from_date = req.query.from as string | undefined;
            const to_date = req.query.to as string | undefined;
            // P2-PAG-001 FIX: Clamp export limit.
            const p_limit = parseInt(req.query.limit as string, 10);
            const limit = Math.min(Number.isNaN(p_limit) ? 1000 : p_limit, 5000);

            const cef = await securityEvents.exportCEF(from_date, to_date, limit);

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="nammerha-security-events.cef"');
            res.send(cef);
                } catch (error) {
                    safeRouteError(res, error, 'Compliance');
        }
    }
);

// ─── GET /api/compliance/security/export/json — JSON Export ─────────────────
router.get(
    '/security/export/json',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const from_date = req.query.from as string | undefined;
            const to_date = req.query.to as string | undefined;
            // P2-PAG-001 FIX: Clamp export limit.
            const p_limit = parseInt(req.query.limit as string, 10);
            const limit = Math.min(Number.isNaN(p_limit) ? 1000 : p_limit, 5000);

            const events = await securityEvents.exportJSON(from_date, to_date, limit);

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="nammerha-security-events.json"');
            res.json({
                export_format: 'nammerha-security-v1',
                exported_at: new Date().toISOString(),
                total_events: events.length,
                events,
            });
                } catch (error) {
                    safeRouteError(res, error, 'Compliance');
        }
    }
);

export default router;
