// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Donor Routes (المانح / المتبرع)
// Portal: Impact dashboard, donations, marketplace, project funding, proofs
// All endpoints require: JWT + KYC verified + role='donor'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import * as donorService from '../services/donor.service';
import { safeRouteError } from '../utils/safe-error';
import type { ApiResponse } from '../types';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);
// DONATIONS_DISABLED: Donor features are temporarily quarantined.
// All endpoints return 503 until donation infrastructure is ready.
router.use((_req: Request, res: Response) => {
    res.status(503).json({
        success: false,
        error: 'ميزات التبرعات معطّلة مؤقتاً — سيتم تفعيلها قريباً',
    } as ApiResponse);
});

// ─── GET /api/donor/stats — Dashboard KPIs ─────────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await donorService.getMyStats(getAuthUser(req).user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Donor.GetStats');
    }
});

// ─── GET /api/donor/donations — Full Donation History ───────────────────────
router.get('/donations', async (req: Request, res: Response) => {
    try {
        // D-7 FIX: NaN-safe + clamped to prevent unbounded queries
        const rawLimit = parseInt(req.query['limit'] as string, 10);
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
        const donations = await donorService.getMyDonations(getAuthUser(req).user_id, limit);
        res.json({ success: true, data: donations } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Donor.GetDonations');
    }
});

// ─── GET /api/donor/impact — Projects I Funded ─────────────────────────────
router.get('/impact', async (req: Request, res: Response) => {
    try {
        const impact = await donorService.getMyImpact(getAuthUser(req).user_id);
        res.json({ success: true, data: impact } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Donor.GetImpact');
    }
});

// ─── GET /api/donor/marketplace — Browse Projects for Funding ───────────────
router.get('/marketplace', async (_req: Request, res: Response) => {
    try {
        const projects = await donorService.getMarketplace();
        res.json({ success: true, data: projects } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Donor.GetMarketplace');
    }
});

// ─── GET /api/donor/projects/:id/funding — My Contributions to Project ─────
router.get('/projects/:id/funding', async (req: Request, res: Response) => {
    try {
        const funding = await donorService.getProjectFunding(
            getAuthUser(req).user_id,
            String(req.params.id),
        );
        res.json({ success: true, data: funding } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Donor.GetProjectFunding');
    }
});

// ─── GET /api/donor/proofs — GPS Proof Gallery ─────────────────────────────
router.get('/proofs', async (req: Request, res: Response) => {
    try {
        const proofs = await donorService.getMyProofGallery(getAuthUser(req).user_id);
        res.json({ success: true, data: proofs } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Donor.GetProofs');
    }
});

// ─── GET /api/donor/timeline — Impact Timeline (ENH-1) ─────────────────────
// Chronological feed: donation → delivery → GPS verification → fund release.
// Shows the donor exactly where their money went and what it built.
router.get('/timeline', async (req: Request, res: Response) => {
    try {
        // D-1/D-6 FIX: NaN-safe + clamped (max 500) to prevent memory exhaustion DoS
        const rawLimit = parseInt(req.query['limit'] as string, 10);
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
        const timeline = await donorService.getMyImpactTimeline(getAuthUser(req).user_id, limit);
        res.json({ success: true, data: timeline } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Donor.GetTimeline');
    }
});

// ─── POST /api/donor/refunds — Request Refund (ENH-2) ──────────────────────
// Creates a formal refund request for a locked escrow entry.
// The admin must approve via POST /api/admin/escrow/refund before funds are released.
router.post('/refunds', async (req: Request, res: Response) => {
    try {
        const { escrow_id, reason } = req.body as { escrow_id: string; reason: string };

        if (!escrow_id || !reason) {
            res.status(400).json({ success: false, error: 'escrow_id and reason are required' } as ApiResponse);
            return;
        }

        // D-4 FIX: Clamp reason length to prevent storage bomb attacks
        if (reason.length > 1000) {
            res.status(400).json({ success: false, error: 'Reason must be 1000 characters or less' } as ApiResponse);
            return;
        }

        const { requestRefund } = await import('../services/escrow.service');
        const result = await requestRefund(getAuthUser(req).user_id, { escrow_id, reason });
        res.status(201).json({ success: true, data: result } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Donor.RequestRefund');
    }
});
// ─── GET /api/donor/receipts/:escrowId — Donation Receipt PDF (ENH-3 + D-9) ─
// D-9: Three-layer CPU protection:
//   Layer 1: Rate limiter — 5 requests per user per 60 seconds
//   Layer 2: ETag caching — 304 Not Modified if receipt hasn't changed
//   Layer 3: In-memory PDF buffer cache — no PDFKit re-generation
import { createEndpointRateLimiter } from '../middleware/rate-limiter.middleware';

const receiptRateLimiter = createEndpointRateLimiter({
    windowMs: 60_000,      // 1 minute window
    maxRequests: 5,        // max 5 per user per minute
    context: 'ReceiptPDF',
});

router.get('/receipts/:escrowId', receiptRateLimiter, async (req: Request, res: Response) => {
    try {
        const { generateReceipt } = await import('../services/receipt.service');
        const { buffer, filename, etag } = await generateReceipt(
            getAuthUser(req).user_id,
            String(req.params.escrowId),
        );

        // Layer 2: ETag — if client already has this version, skip transfer
        const clientETag = req.headers['if-none-match'];
        if (clientETag === etag) {
            res.status(304).end();
            return;
        }

        // Set caching + content headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, max-age=3600'); // 1 hour browser cache
        res.send(buffer);
    } catch (error) {
        safeRouteError(res, error, 'Donor.GetReceipt');
    }
});

export default router;
