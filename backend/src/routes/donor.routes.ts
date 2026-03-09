// ============================================================================
// Nammerha Backend — Donor Routes (المانح / المتبرع)
// Portal: Impact dashboard, donations, marketplace, project funding, proofs
// All endpoints require: JWT + KYC verified + role='donor'
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role-guard.middleware';
import * as donorService from '../services/donor.service';
import type { ApiResponse } from '../types';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);
router.use(requireRole('donor'));

// ─── GET /api/donor/stats — Dashboard KPIs ─────────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await donorService.getMyStats(req.authUser!.user_id);
        res.json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/donor/donations — Full Donation History ───────────────────────
router.get('/donations', async (req: Request, res: Response) => {
    try {
        const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50;
        const donations = await donorService.getMyDonations(req.authUser!.user_id, limit);
        res.json({ success: true, data: donations } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/donor/impact — Projects I Funded ─────────────────────────────
router.get('/impact', async (req: Request, res: Response) => {
    try {
        const impact = await donorService.getMyImpact(req.authUser!.user_id);
        res.json({ success: true, data: impact } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/donor/marketplace — Browse Projects for Funding ───────────────
router.get('/marketplace', async (_req: Request, res: Response) => {
    try {
        const projects = await donorService.getMarketplace();
        res.json({ success: true, data: projects } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/donor/projects/:id/funding — My Contributions to Project ─────
router.get('/projects/:id/funding', async (req: Request, res: Response) => {
    try {
        const funding = await donorService.getProjectFunding(
            req.authUser!.user_id,
            String(req.params.id),
        );
        res.json({ success: true, data: funding } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/donor/proofs — GPS Proof Gallery ─────────────────────────────
router.get('/proofs', async (req: Request, res: Response) => {
    try {
        const proofs = await donorService.getMyProofGallery(req.authUser!.user_id);
        res.json({ success: true, data: proofs } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
