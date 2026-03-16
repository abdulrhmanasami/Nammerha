// ============================================================================
// Nammerha Backend — Enterprise & FinTech Routes
// Per profitability study Phase 3:
//   - Enterprise TaaS: OCDS dashboard, audit trail, impact reports
//   - FinTech Admin: escrow fee config, fee summary, org management
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import { safeRouteError } from '../utils/safe-error';
import {
    validateApiKey,
    getOrgDashboard,
    getProjectAuditTrail,
    getImpactReport,
    logApiCall,
    createOrganization,
    listOrganizations,
} from '../services/enterprise-taas.service';
import {
    getEscrowFeeSummary,
    getAllFeeConfigs,
    updateFeeRate,
} from '../services/escrow-fee.service';
import { logger } from '../utils/logger';

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: Enterprise API Key Authentication
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Authenticates enterprise API requests via X-API-Key header.
 * Separate from JWT auth — org-level access for institutional subscribers.
 */
async function enterpriseApiAuth(req: Request, res: Response, next: () => void): Promise<void> {
    const startTime = Date.now();
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
        res.status(401).json({
            success: false,
            error: 'X-API-Key header is required for enterprise API access',
        });
        return;
    }

    try {
        const org = await validateApiKey(apiKey);
        if (!org) {
            res.status(403).json({
                success: false,
                error: 'Invalid or inactive API key',
            });
            return;
        }

        // Attach org to request for downstream handlers
        (req as Request & { enterpriseOrg: typeof org }).enterpriseOrg = org;

        // Log API access (non-blocking)
        const endpoint = req.originalUrl || req.url;
        logApiCall(org.org_id, endpoint, req.method, 200, Date.now() - startTime, req.ip)
            .catch(() => { /* Non-critical logging failure */ });

        next();
    } catch (err) {
        // P1-ERR-001 FIX: Never expose internal errors to API callers.
        logger.error('Enterprise API auth failed', { error: err instanceof Error ? err.message : String(err) });
        res.status(500).json({ success: false, error: 'API authentication failed' });
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ENTERPRISE API ROUTES (API-Key authenticated)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/enterprise/dashboard
 * Enterprise org dashboard with aggregated OCDS metrics.
 */
router.get('/dashboard', enterpriseApiAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const org = (req as Request & { enterpriseOrg: { org_id: string } }).enterpriseOrg;
        const dashboard = await getOrgDashboard(org.org_id);
        res.json({ success: true, data: dashboard });
    } catch (err) {
        safeRouteError(res, err, 'Enterprise.Dashboard');
    }
});

/**
 * GET /api/enterprise/projects/:projectId/audit
 * Detailed audit trail for a specific project.
 */
router.get(
    '/projects/:projectId/audit',
    enterpriseApiAuth,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const projectId = req.params['projectId'] as string;
            if (!projectId) {
                res.status(400).json({ success: false, error: 'projectId is required' });
                return;
            }
            const audit = await getProjectAuditTrail(projectId);
            res.json({ success: true, data: audit });
        } catch (err) {
            safeRouteError(res, err, 'Enterprise.ProjectAudit');
        }
    },
);

/**
 * GET /api/enterprise/impact-report
 * ESG/SDG impact report with platform-wide metrics.
 */
router.get('/impact-report', enterpriseApiAuth, async (_req: Request, res: Response): Promise<void> => {
    try {
        const report = await getImpactReport();
        res.json({ success: true, data: report });
    } catch (err) {
        safeRouteError(res, err, 'Enterprise.ImpactReport');
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES (JWT + admin role)
// ═════════════════════════════════════════════════════════════════════════════

// ─── Escrow Fee Administration ──────────────────────────────────────────────

/**
 * GET /api/enterprise/admin/fees/summary
 * Escrow fee revenue summary.
 */
router.get(
    '/admin/fees/summary',
    authMiddleware,
    requireRole('admin'),
    async (_req: Request, res: Response): Promise<void> => {
        try {
            const summary = await getEscrowFeeSummary();
            res.json({ success: true, data: summary });
        } catch (err) {
            safeRouteError(res, err, 'Enterprise.FeeSummary');
        }
    },
);

/**
 * GET /api/enterprise/admin/fees/config
 * List all fee configurations.
 */
router.get(
    '/admin/fees/config',
    authMiddleware,
    requireRole('admin'),
    async (_req: Request, res: Response): Promise<void> => {
        try {
            const configs = await getAllFeeConfigs();
            res.json({ success: true, data: configs });
        } catch (err) {
            safeRouteError(res, err, 'Enterprise.FeeConfig');
        }
    },
);

/**
 * PUT /api/enterprise/admin/fees/config/:configId
 * Update escrow fee rate.
 * Body: { fee_rate_bps: number }
 */
router.put(
    '/admin/fees/config/:configId',
    authMiddleware,
    requireRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const configId = req.params['configId'] as string;
            const { fee_rate_bps } = req.body as { fee_rate_bps?: number };

            // P2-FEE-001 FIX: Upper bound prevents accidental 100% fee.
            // 2000 bps = 20% — sane maximum for platform fees.
            if (typeof fee_rate_bps !== 'number' || fee_rate_bps < 0 || fee_rate_bps > 2000) {
                res.status(400).json({
                    success: false,
                    error: 'fee_rate_bps must be between 0 and 2000 (max 20%)',
                });
                return;
            }

            const updated = await updateFeeRate(configId, fee_rate_bps);
            res.json({ success: true, data: updated });
        } catch (err) {
            safeRouteError(res, err, 'Enterprise.UpdateFee');
        }
    },
);

// ─── Enterprise Organization Administration ────────────────────────────────

/**
 * GET /api/enterprise/admin/organizations
 * List all enterprise organizations.
 */
router.get(
    '/admin/organizations',
    authMiddleware,
    requireRole('admin'),
    async (_req: Request, res: Response): Promise<void> => {
        try {
            const orgs = await listOrganizations();
            res.json({ success: true, data: orgs });
        } catch (err) {
            safeRouteError(res, err, 'Enterprise.ListOrgs');
        }
    },
);

/**
 * POST /api/enterprise/admin/organizations
 * Create a new enterprise organization + generate API key.
 * Body: { org_name, org_type, contact_email, tier?, annual_fee_cents? }
 */
router.post(
    '/admin/organizations',
    authMiddleware,
    requireRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { org_name, org_type, contact_email, tier, annual_fee_cents } =
                req.body as {
                    org_name?: string;
                    org_type?: string;
                    contact_email?: string;
                    tier?: string;
                    annual_fee_cents?: number;
                };

            if (!org_name || !org_type || !contact_email) {
                res.status(400).json({
                    success: false,
                    error: 'org_name, org_type, and contact_email are required',
                });
                return;
            }

            const org = await createOrganization({
                org_name,
                org_type,
                contact_email,
                tier,
                annual_fee_cents,
            });

            res.status(201).json({
                success: true,
                data: org,
                warning: 'The API key is shown only once. Store it securely.',
            });
        } catch (err) {
            safeRouteError(res, err, 'Enterprise.CreateOrg');
        }
    },
);

export default router;
