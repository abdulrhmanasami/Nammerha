// ============================================================================
// Nammerha Backend — Contract Payment Routes
// ============================================================================
// REST endpoints for service contracts, milestones, and payments.
//
// All endpoints require: JWT + Active account.
// All financial mutations validate via Zod schemas.
// Idempotency-Key header enforced on POST endpoints.
//
// Standard: Nammerha Domain Law §1 (Zero-Trust Financial Operations)
// ============================================================================

import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { getAuthUser } from '../utils/auth-guard';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { requireIdempotencyKey } from '../middleware/require-idempotency-key.middleware';
import { safeRouteError } from '../utils/safe-error';
import * as contractPaymentService from '../services/contract-payment.service';
import {
  createContractSchema,
  createContractPaymentSchema,
  confirmContractPaymentSchema,
  contractListQuerySchema,
} from '../validation/schemas';
import type { ApiResponse } from '../types';

const router = Router();

// All contract routes require authentication
router.use(authMiddleware);
router.use(requireActive);

// ─── GET /api/contracts/my — My Contracts ───────────────────────────────────

router.get('/my', async (req: Request, res: Response) => {
  try {
    const params = contractListQuerySchema.parse(req.query);
    const contracts = await contractPaymentService.getMyContracts(
      getAuthUser(req).user_id,
      params.status,
      params.limit,
      params.offset,
    );
    res.json({ success: true, data: contracts } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'Contracts.GetMy');
  }
});

// ─── GET /api/contracts/:id — Contract Details ──────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const contractId = req.params['id'] as string;
    if (!contractId) {
      res.status(400).json({ success: false, error: 'Contract ID required' } as ApiResponse);
      return;
    }
    const contract = await contractPaymentService.getContractDetails(
      contractId,
      getAuthUser(req).user_id,
    );
    res.json({ success: true, data: contract } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'Contracts.GetDetails');
  }
});

// ─── POST /api/contracts — Create Contract ──────────────────────────────────

router.post(
  '/',
  requireIdempotencyKey,
  idempotencyMiddleware,
  async (req: Request, res: Response) => {
    try {
      const input = createContractSchema.parse(req.body);
      const contract = await contractPaymentService.createContract(getAuthUser(req).user_id, input);
      res.status(201).json({ success: true, data: contract } as ApiResponse);
    } catch (error) {
      safeRouteError(res, error, 'Contracts.Create');
    }
  },
);

// ─── GET /api/contracts/:id/milestones — Contract Milestones ────────────────

router.get('/:id/milestones', async (req: Request, res: Response) => {
  try {
    const contractId = req.params['id'] as string;
    if (!contractId) {
      res.status(400).json({ success: false, error: 'Contract ID required' } as ApiResponse);
      return;
    }
    const milestones = await contractPaymentService.getMilestones(
      contractId,
      getAuthUser(req).user_id,
    );
    res.json({ success: true, data: milestones } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'Contracts.GetMilestones');
  }
});

// ─── GET /api/contracts/:id/payments — Payment History ──────────────────────

router.get('/:id/payments', async (req: Request, res: Response) => {
  try {
    const contractId = req.params['id'] as string;
    if (!contractId) {
      res.status(400).json({ success: false, error: 'Contract ID required' } as ApiResponse);
      return;
    }
    const payments = await contractPaymentService.getContractPayments(
      contractId,
      getAuthUser(req).user_id,
    );
    res.json({ success: true, data: payments } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'Contracts.GetPayments');
  }
});

// ─── POST /api/contracts/:id/payments — Create Payment ──────────────────────

router.post(
  '/:id/payments',
  requireIdempotencyKey,
  idempotencyMiddleware,
  async (req: Request, res: Response) => {
    try {
      const contractId = req.params['id'] as string;
      if (!contractId) {
        res.status(400).json({ success: false, error: 'Contract ID required' } as ApiResponse);
        return;
      }

      const input = createContractPaymentSchema.parse(req.body);

      // Extract idempotency key from header (Nammerha Domain Law §1 — mandatory)
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (!idempotencyKey) {
        res
          .status(400)
          .json({ success: false, error: 'Idempotency-Key header is required' } as ApiResponse);
        return;
      }

      const payment = await contractPaymentService.createPayment(
        contractId,
        getAuthUser(req).user_id,
        input,
        idempotencyKey,
      );
      res.status(201).json({ success: true, data: payment } as ApiResponse);
    } catch (error) {
      safeRouteError(res, error, 'Contracts.CreatePayment');
    }
  },
);

// ─── POST /api/contracts/payments/:paymentId/confirm — Confirm Payment ──────

router.post(
  '/payments/:paymentId/confirm',
  requireIdempotencyKey,
  idempotencyMiddleware,
  async (req: Request, res: Response) => {
    try {
      const paymentId = req.params['paymentId'] as string;
      if (!paymentId) {
        res.status(400).json({ success: false, error: 'Payment ID required' } as ApiResponse);
        return;
      }

      const input = confirmContractPaymentSchema.parse(req.body);
      const payment = await contractPaymentService.confirmPayment(
        paymentId,
        getAuthUser(req).user_id,
        input.note,
      );
      res.json({ success: true, data: payment } as ApiResponse);
    } catch (error) {
      safeRouteError(res, error, 'Contracts.ConfirmPayment');
    }
  },
);

export default router;
