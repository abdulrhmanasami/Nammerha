// ============================================================================
// Nammerha Backend — Open Data Routes (Ticket 8.2)
// PUBLIC unauthenticated OCDS endpoints + authenticated report export
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as openData from '../services/open-data.service';
import type { ApiResponse } from '../types';

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS — No authentication required
// These power the "بوابة البيانات المفتوحة" (Open Data Portal)
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/open-data/projects — List Published Projects ──────────────────
router.get('/projects', async (req: Request, res: Response) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
        const status = req.query.status as string | undefined;

        const result = await openData.listPublicProjects(limit, offset, status);

        const response: ApiResponse = {
            success: true,
            data: {
                projects: result.projects,
                total: result.total,
                limit,
                offset,
            },
            message: `${result.projects.length} of ${result.total} public projects`,
        };
        res.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/open-data/projects/:id — Public Project Card (بطاقة مشروع) ───
router.get('/projects/:id', async (req: Request, res: Response) => {
    try {
        const card = await openData.buildProjectCard(String(req.params.id));

        const response: ApiResponse = {
            success: true,
            data: card,
        };
        res.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('not found') ? 404 : 500;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/open-data/projects/:id/ocds — OCDS Release Package ────────────
router.get('/projects/:id/ocds', async (req: Request, res: Response) => {
    try {
        const releasePackage = await openData.buildOCDSRelease(String(req.params.id));

        // Set OCDS-specific headers
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-OCDS-Version', '1.1');
        res.json(releasePackage);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('not found') ? 404 : 500;
        res.status(status).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/open-data/schema — OCDS Extension Schema ─────────────────────
router.get('/schema', (_req: Request, res: Response) => {
    const schema = openData.getOCDSExtensionSchema();
    res.json(schema);
});

// ─── GET /api/open-data/stats — Platform Statistics ─────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
    try {
        const stats = await openData.getPlatformStats();

        const response: ApiResponse = {
            success: true,
            data: stats,
            message: 'Nammerha platform statistics',
        };
        res.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ENDPOINTS — Report Export
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/open-data/projects/:id/report/pdf — PDF Evidence Report ───────
router.get(
    '/projects/:id/report/pdf',
    authMiddleware,
    requireActive,
    requireRole('admin', 'auditor', 'engineer', 'homeowner'),
    async (req: Request, res: Response) => {
        try {
            // Build comprehensive project data for PDF
            const card = await openData.buildProjectCard(String(req.params.id));
            const ocds = await openData.buildOCDSRelease(String(req.params.id));

            // For MVP, return structured JSON that frontend renders as PDF.
            // Server-side PDF generation (pdfkit) can be added when dependency approved.
            const response: ApiResponse = {
                success: true,
                data: {
                    format: 'json-for-pdf',
                    project: card,
                    ocds_release: ocds.releases[0],
                    generated_at: new Date().toISOString(),
                    report_type: 'evidence_report',
                    note: 'Convert to PDF client-side using jsPDF or request server PDF when pdfkit is installed',
                },
                message: 'Evidence report data generated',
            };
            res.json(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            const status = message.includes('not found') ? 404 : 500;
            res.status(status).json({ success: false, error: message } as ApiResponse);
        }
    }
);

// ─── GET /api/open-data/projects/:id/report/xlsx — Excel Data Export ────────
router.get(
    '/projects/:id/report/xlsx',
    authMiddleware,
    requireActive,
    requireRole('admin', 'auditor', 'engineer', 'homeowner'),
    async (req: Request, res: Response) => {
        try {
            // Build comprehensive project data for Excel
            const card = await openData.buildProjectCard(String(req.params.id));

            // For MVP, return structured JSON that frontend renders as XLSX.
            // Server-side XLSX (exceljs) can be added when dependency approved.
            const response: ApiResponse = {
                success: true,
                data: {
                    format: 'json-for-xlsx',
                    project: card,
                    generated_at: new Date().toISOString(),
                    report_type: 'data_export',
                    note: 'Convert to XLSX client-side using SheetJS or request server XLSX when exceljs is installed',
                },
                message: 'Data export generated',
            };
            res.json(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            const status = message.includes('not found') ? 404 : 500;
            res.status(status).json({ success: false, error: message } as ApiResponse);
        }
    }
);

export default router;
