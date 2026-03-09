// ============================================================================
// Nammerha Backend — Matchmaking Routes (Ticket 7.1)
// BuildZoom-style search, scoring, auto-match, and competitive bidding
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as matchmaking from '../services/matchmaking.service';
import type { ApiResponse } from '../types';

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
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/matchmaking/project/:id/matches — Auto-Match ──────────────────
// Thumbtack pattern: auto-match top 3 engineers for a project
router.get(
    '/project/:id/matches',
    requireRole('homeowner', 'admin'),
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
            const message = error instanceof Error ? error.message : 'Unknown error';
            const status = message.includes('not found') ? 404 : 400;
            res.status(status).json({ success: false, error: message } as ApiResponse);
        }
    }
);

// ─── POST /api/matchmaking/project/:id/bid — Submit Bid ─────────────────────
// BuildZoom pattern: engineer submits competitive bid
router.post(
    '/project/:id/bid',
    requireRole('engineer', 'contractor'),
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

            const bid = await matchmaking.submitBid(
                req.authUser!.user_id,
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
            const message = error instanceof Error ? error.message : 'Unknown error';
            const status = message.includes('duplicate') ? 409 : 400;
            res.status(status).json({ success: false, error: message } as ApiResponse);
        }
    }
);

// ─── GET /api/matchmaking/project/:id/bids — List Bids for Project ──────────
router.get(
    '/project/:id/bids',
    requireRole('homeowner', 'admin'),
    async (req: Request, res: Response) => {
        try {
            const bids = await matchmaking.getProjectBids(String(req.params.id));

            const response: ApiResponse = {
                success: true,
                data: bids,
                message: `${bids.length} bids received`,
            };
            res.json(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ success: false, error: message } as ApiResponse);
        }
    }
);

// ─── POST /api/matchmaking/bids/:bidId/accept — Accept a Bid ────────────────
router.post(
    '/bids/:bidId/accept',
    requireRole('homeowner', 'admin'),
    async (req: Request, res: Response) => {
        try {
            const bid = await matchmaking.acceptBid(
                String(req.params.bidId),
                req.authUser!.user_id
            );

            const response: ApiResponse = {
                success: true,
                data: bid,
                message: 'Bid accepted — contractor assigned to project',
            };
            res.json(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            const status = message.includes('not found') ? 404 : 400;
            res.status(status).json({ success: false, error: message } as ApiResponse);
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('not found') ? 404 : 500;
        res.status(status).json({ success: false, error: message } as ApiResponse);
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
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(400).json({ success: false, error: message } as ApiResponse);
        }
    }
);

export default router;
