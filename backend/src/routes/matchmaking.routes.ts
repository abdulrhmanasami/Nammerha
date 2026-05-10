// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Matchmaking Routes (Ticket 7.1)
// BuildZoom-style search, scoring, auto-match, and competitive bidding
// ============================================================================
import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import { requireAttributes } from '../middleware/abac.middleware';
import * as matchmaking from '../services/matchmaking.service';
import { query } from '../config/database';
import type { AbacPolicyKey, ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';

const router = Router();

// All matchmaking routes require authentication
router.use(authMiddleware);
router.use(requireActive);

// ─── GET /api/matchmaking/search — Search Engineers ─────────────────────────
// Public authenticated: search for engineers by location, specialty, score
router.get('/search', async (req: Request, res: Response) => {
    try {
        const dto: matchmaking.SearchEngineersDTO = {
            lat: req.query.lat ? parseFloat(req.query.lat as string) : undefined,
            lng: req.query.lng ? parseFloat(req.query.lng as string) : undefined,
            max_distance_km: req.query.max_distance_km
                ? parseInt(req.query.max_distance_km as string, 10)
                : undefined,
            specialty: req.query.specialty as string | undefined,
            query: req.query.q as string | undefined,
            min_score: req.query.min_score
                ? parseFloat(req.query.min_score as string)
                : undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
            offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        };

        const engineers = await matchmaking.searchEngineers(dto);

        const response: ApiResponse = {
            success: true,
            data: engineers,
            message: `${engineers.length} engineers found`,
        };
        res.json(response);
            } catch (error) {
                safeRouteError(res, error, 'Matchmaking');
    }
});

// ─── GET /api/matchmaking/project/:id/matches — Auto-Match ──────────────────
// Thumbtack pattern: auto-match top 3 engineers for a project
router.get(
    '/project/:id/matches',
    // UNIFIED CITIZEN: open to all authenticated users
    async (req: Request, res: Response) => {
        try {
            const matches = await matchmaking.matchProjectToEngineers(String(req.params.id));

            const response: ApiResponse = {
                success: true,
                data: matches,
                message: `${matches.length} engineers matched (max 3)`,
            };
            res.json(response);
        } catch (error) {
            safeRouteError(res, error, 'Matchmaking.ProjectMatches');
        }
    }
);

// ─── POST /api/matchmaking/project/:id/bid — Submit Bid ─────────────────────
// BuildZoom pattern: engineer submits competitive bid
router.post(
    '/project/:id/bid',
    // UNIFIED CITIZEN: open to all authenticated users
    // ABAC: Determine policy based on user's active role
    (req: Request, res: Response, next: NextFunction): void => {
        const userRoles = req.authUser?.roles ?? [req.authUser?.role ?? ''];
        const policyKey: AbacPolicyKey = userRoles.includes('contractor')
            ? 'contractor:bid'
            : 'engineer:assess';
        requireAttributes(policyKey)(req, res, next);
    },
    async (req: Request, res: Response) => {
        try {
            const dto = req.body as matchmaking.SubmitBidDTO;

            if (!dto.proposed_cost || !dto.estimated_days) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields: proposed_cost (cents), estimated_days',
                } as ApiResponse);
                return;
            }

            if (dto.proposed_cost <= 0 || dto.estimated_days <= 0) {
                res.status(400).json({
                    success: false,
                    error: 'proposed_cost and estimated_days must be positive',
                } as ApiResponse);
                return;
            }

            // FINOPS-004 FIX: Integer validation — prevent floating-point precision attacks.
            // Amounts in cents must be whole numbers. A bid of 100.5 cents would cause
            // rounding issues in downstream arithmetic (escrow, PO generation).
            if (!Number.isInteger(dto.proposed_cost) || !Number.isInteger(dto.estimated_days)) {
                res.status(400).json({
                    success: false,
                    error: 'proposed_cost (cents) and estimated_days must be integers',
                } as ApiResponse);
                return;
            }

            // FINOPS-004 FIX: Max cap — prevent integer overflow and absurd bids.
            // $100M (10_000_000_000 cents) is a generous upper bound for construction.
            // 3650 days (10 years) is the maximum realistic project timeline.
            const MAX_BID_CENTS = 10_000_000_000;
            const MAX_DAYS = 3650;
            if (dto.proposed_cost > MAX_BID_CENTS) {
                res.status(400).json({
                    success: false,
                    error: `proposed_cost exceeds maximum (${MAX_BID_CENTS} cents / $100M)`,
                } as ApiResponse);
                return;
            }
            if (dto.estimated_days > MAX_DAYS) {
                res.status(400).json({
                    success: false,
                    error: `estimated_days exceeds maximum (${MAX_DAYS} days / 10 years)`,
                } as ApiResponse);
                return;
            }

            const bid = await matchmaking.submitBid(
                getAuthUser(req).user_id,
                String(req.params.id),
                dto
            );

            const response: ApiResponse = {
                success: true,
                data: bid,
                message: 'Bid submitted successfully',
            };
            res.status(201).json(response);
        } catch (error) {
            safeRouteError(res, error, 'Matchmaking');
        }
    }
);

// ─── GET /api/matchmaking/project/:id/bids — List Bids for Project ──────────
router.get(
    '/project/:id/bids',
    // UNIFIED CITIZEN: open to all authenticated users
    async (req: Request, res: Response) => {
        try {
            const projectId = String(req.params.id);

            // DT-IDOR-003 FIX: Verify homeowner owns this project (admin bypasses)
            if (getAuthUser(req).role === 'homeowner') {
                const ownerCheck = await query<{ homeowner_id: string }>(
                    'SELECT homeowner_id FROM projects WHERE project_id = $1',
                    [projectId]
                );
                if (!ownerCheck.rows[0] || ownerCheck.rows[0].homeowner_id !== getAuthUser(req).user_id) {
                    res.status(403).json({ success: false, error: 'Access denied' } as ApiResponse);
                    return;
                }
            }

            const bids = await matchmaking.getProjectBids(projectId);

            const response: ApiResponse = {
                success: true,
                data: bids,
                message: `${bids.length} bids received`,
            };
            res.json(response);
        } catch (error) {
            safeRouteError(res, error, 'Matchmaking.GetBids');
        }
    }
);

// ─── POST /api/matchmaking/bids/:bidId/accept — Accept a Bid ────────────────
router.post(
    '/bids/:bidId/accept',
    // UNIFIED CITIZEN: open to all authenticated users
    async (req: Request, res: Response) => {
        try {
            // DT-IDOR-002 FIX: Pass role so service can verify ownership
            const bid = await matchmaking.acceptBid(
                String(req.params.bidId),
                getAuthUser(req).user_id,
                getAuthUser(req).role
            );

            const response: ApiResponse = {
                success: true,
                data: bid,
                message: 'Bid accepted — contractor assigned to project',
            };
            res.json(response);
        } catch (error) {
            safeRouteError(res, error, 'Matchmaking.AcceptBid');
        }
    }
);

// ─── GET /api/matchmaking/engineer/:id/score — Score Breakdown ──────────────
router.get('/engineer/:id/score', async (req: Request, res: Response) => {
    try {
        const breakdown = await matchmaking.getEngineerScoreBreakdown(String(req.params.id));

        const response: ApiResponse = {
            success: true,
            data: breakdown,
        };
        res.json(response);
            } catch (error) {
                safeRouteError(res, error, 'Matchmaking');
    }
});

// ─── POST /api/matchmaking/engineer/:id/recalculate — Recalculate Score ─────
router.post(
    '/engineer/:id/recalculate',
    requireRole('admin'),
    async (req: Request, res: Response) => {
        try {
            const newScore = await matchmaking.recalculateScore(String(req.params.id));

            const response: ApiResponse = {
                success: true,
                data: { user_id: String(req.params.id), new_score: newScore },
                message: `Score recalculated: ${newScore}`,
            };
            res.json(response);
        } catch (error) {
            safeRouteError(res, error, 'Matchmaking.Recalculate');
        }
    }
);

export default router;
