// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Homeowner Routes (صاحب البيت / المتضرر)
// Portal: Projects, Service Requests, Bid Comparison, Approvals, Escrow
// All endpoints require: JWT + KYC verified + role='homeowner'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import * as homeownerService from '../services/homeowner.service';
import { safeRouteError } from '../utils/safe-error';
import type { ApiResponse } from '../types';

const router = Router();

// All homeowner routes require authentication + active account + homeowner role
router.use(authMiddleware);
router.use(requireActive);
// UNIFIED CITIZEN: open to all authenticated users

// ─── GET /api/homeowner/projects — My Projects with full context ────────────
router.get('/projects', async (req: Request, res: Response) => {
    try {
        const projects = await homeownerService.getMyProjects(getAuthUser(req).user_id);
        res.json({ success: true, data: projects } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Homeowner.GetProjects');
    }
});

// ─── GET /api/homeowner/stats — Dashboard KPIs ─────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await homeownerService.getMyStats(getAuthUser(req).user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Homeowner.GetStats');
    }
});

// ─── GET /api/homeowner/projects/:id/bids — Bid Comparison ─────────────────
router.get('/projects/:id/bids', async (req: Request, res: Response) => {
    try {
        const bids = await homeownerService.getProjectBids(
            getAuthUser(req).user_id,
            String(req.params.id),
        );
        res.json({ success: true, data: bids } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Homeowner.GetBids');
    }
});

// ─── POST /api/homeowner/service-requests — Create Thumbtack Request ───────
router.post('/service-requests', async (req: Request, res: Response) => {
    try {
        const dto = req.body as homeownerService.CreateServiceRequestDTO;

        // H4 FIX: Comprehensive input validation
        // Validates: required fields, enum whitelist, max lengths, numeric bounds
        if (!dto.trade_needed || !dto.title) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: trade_needed, title',
            } as ApiResponse);
            return;
        }

        // H4-SEC-001: Title max-length (prevent DB bloat / DoS)
        if (dto.title.length > 200) {
            res.status(400).json({
                success: false,
                error: 'Title must not exceed 200 characters',
            } as ApiResponse);
            return;
        }

        // H4-SEC-002: Description max-length
        if (dto.description && dto.description.length > 2000) {
            res.status(400).json({
                success: false,
                error: 'Description must not exceed 2000 characters',
            } as ApiResponse);
            return;
        }

        // H4-SEC-003: Urgency enum whitelist
        // PLT-HO-001 FIX: Aligned with DB request_urgency enum (routine/urgent/emergency).
        // Previous: ['low', 'medium', 'high', 'emergency'] — 3 of 4 values rejected by PostgreSQL.
        const validUrgencies = ['routine', 'urgent', 'emergency'] as const;
        if (dto.urgency && !validUrgencies.includes(dto.urgency as typeof validUrgencies[number])) {
            res.status(400).json({
                success: false,
                error: `Invalid urgency. Must be one of: ${validUrgencies.join(', ')}`,
            } as ApiResponse);
            return;
        }

        // H4-SEC-004: Budget non-negative and reasonable max (10 billion cents = 100M USD)
        if (dto.budget_max !== undefined) {
            if (typeof dto.budget_max !== 'number' || !Number.isInteger(dto.budget_max) || dto.budget_max < 0 || dto.budget_max > 10_000_000_000) {
                res.status(400).json({
                    success: false,
                    error: 'Budget must be a non-negative integer within reasonable range',
                } as ApiResponse);
                return;
            }
        }

        const result = await homeownerService.createServiceRequest(
            getAuthUser(req).user_id,
            dto,
        );
        res.status(201).json({
            success: true,
            data: result,
            message: 'Service request created — matching tradespeople nearby',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Homeowner');
    }
});

// ─── GET /api/homeowner/service-requests — My Service Requests ──────────────
router.get('/service-requests', async (req: Request, res: Response) => {
    try {
        const requests = await homeownerService.getMyServiceRequests(getAuthUser(req).user_id);
        res.json({ success: true, data: requests } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Homeowner.GetServiceRequests');
    }
});

// ─── POST /api/homeowner/service-requests/:id/cancel — Cancel Request ──────
router.post('/service-requests/:id/cancel', async (req: Request, res: Response) => {
    try {
        const result = await homeownerService.cancelServiceRequest(
            getAuthUser(req).user_id,
            String(req.params.id),
        );
        res.json({
            success: true,
            data: result,
            message: 'Service request cancelled',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Homeowner.CancelRequest');
    }
});

// ─── GET /api/homeowner/approvals — Pending Approvals ──────────────────────
router.get('/approvals', async (req: Request, res: Response) => {
    try {
        const statusFilter = req.query['status'] as string | undefined;
        const approvals = await homeownerService.getMyApprovals(
            getAuthUser(req).user_id,
            statusFilter,
        );
        res.json({ success: true, data: approvals } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Homeowner.GetApprovals');
    }
});

// ─── GET /api/homeowner/escrow — Escrow Summary ────────────────────────────
router.get('/escrow', async (req: Request, res: Response) => {
    try {
        const summary = await homeownerService.getMyEscrowSummary(getAuthUser(req).user_id);
        res.json({ success: true, data: summary } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Homeowner.GetEscrow');
    }
});

// ─── V-003 FIX: Escrow Transaction Receipt PDF ─────────────────────────────
// Homeowner can download a bilingual PDF receipt for any escrow transaction
// belonging to their projects. Reuses the existing receipt.service.ts generator.
// Rate limited: 5 per user per minute. ETag caching for 304 responses.
// Standard: OCDS Financial Transparency, ISO 27001 (Data Access Controls).
// ────────────────────────────────────────────────────────────────────────────
import { createEndpointRateLimiter } from '../middleware/rate-limiter.middleware';
import { query as dbQuery } from '../config/database';

const homeownerReceiptLimiter = createEndpointRateLimiter({
    windowMs: 60_000,
    maxRequests: 5,
    context: 'HomeownerReceipt',
});

router.get('/receipts/:escrowId', homeownerReceiptLimiter, async (req: Request, res: Response) => {
    try {
        const userId = getAuthUser(req).user_id;
        const escrowId = String(req.params['escrowId']);

        // Ownership check: verify escrow transaction belongs to a project owned by this user
        const ownershipCheck = await dbQuery<{ transaction_id: string }>(
            `SELECT el.transaction_id
             FROM escrow_ledger el
             JOIN projects p ON p.project_id = el.project_id
             WHERE el.transaction_id = $1
               AND p.homeowner_id = $2
             LIMIT 1`,
            [escrowId, userId]
        );

        if (!ownershipCheck.rows[0]) {
            res.status(404).json({
                success: false,
                error: 'Transaction not found or does not belong to your projects',
            } as ApiResponse);
            return;
        }

        // Reuse the existing receipt generator — pass homeowner as "donor" for PDF generation.
        // The PDF content is generic enough (project, amount, date) to work for both parties.
        const { generateReceipt } = await import('../services/receipt.service');
        const { buffer, filename, etag } = await generateReceipt(userId, escrowId);

        // ETag: 304 Not Modified if client already has this version
        const clientETag = req.headers['if-none-match'];
        if (clientETag === etag) {
            res.status(304).end();
            return;
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.send(buffer);
    } catch (error) {
        safeRouteError(res, error, 'Homeowner.GetReceipt');
    }
});

export default router;
