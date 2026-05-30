// ============================================================================
// Nammerha Backend — Impact Communications Routes
// ============================================================================
// REST API for donor impact message management.
//
// Endpoints:
//   GET  /api/impact/messages      — My impact messages (paginated)
//   GET  /api/impact/unread-count  — Unread badge count
//   PUT  /api/impact/messages/:id/read — Mark single message read
//   PUT  /api/impact/messages/read-all — Mark all messages read
// ============================================================================

import { Router, Request, Response } from 'express';
import { getAuthUser } from '../utils/auth-guard';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import * as impactService from '../services/impact.service';
import { safeRouteError } from '../utils/safe-error';
import type { ApiResponse } from '../types';

const router = Router();

// All impact routes require: JWT + active + donor role
router.use(authMiddleware);
router.use(requireActive);
// UNIFIED CITIZEN: open to all authenticated users

// ─── GET /api/impact/messages — My Impact Messages ──────────────────────────
router.get('/messages', async (req: Request, res: Response) => {
    try {
        const donorId = getAuthUser(req).user_id;
        const p_limit = parseInt(String(req.query['limit'] ?? '50'), 10);
        const limit = Math.min(Number.isNaN(p_limit) ? 50 : p_limit, 100);
        const p_offset = parseInt(String(req.query['offset'] ?? '0'), 10);
        const offset = Math.max(Number.isNaN(p_offset) ? 0 : p_offset, 0);
        const unreadOnly = req.query['unread_only'] === 'true';

        const messages = await impactService.getDonorMessages(donorId, {
            limit, offset, unreadOnly,
        });

        res.json({ success: true, data: messages } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Impact.GetMessages');
    }
});

// ─── GET /api/impact/unread-count — Badge Count ─────────────────────────────
router.get('/unread-count', async (req: Request, res: Response) => {
    try {
        const count = await impactService.getUnreadCount(getAuthUser(req).user_id);
        res.json({ success: true, data: { count } } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Impact.UnreadCount');
    }
});

// ─── PUT /api/impact/messages/:id/read — Mark Single Read ───────────────────
router.put('/messages/:id/read', async (req: Request, res: Response) => {
    try {
        const messageId = String(req.params['id']);
        const donorId = getAuthUser(req).user_id;

        const updated = await impactService.markAsRead(messageId, donorId);

        if (!updated) {
            res.status(404).json({
                success: false,
                error: 'Message not found or already read',
                error_ar: 'الرسالة غير موجودة أو مقروءة مسبقاً',
            } as ApiResponse);
            return;
        }

        res.json({
            success: true,
            message: 'Message marked as read',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Impact.MarkRead');
    }
});

// ─── PUT /api/impact/messages/read-all — Mark All Read ──────────────────────
router.put('/messages/read-all', async (req: Request, res: Response) => {
    try {
        const count = await impactService.markAllRead(getAuthUser(req).user_id);
        res.json({
            success: true,
            data: { marked: count },
            message: `${count} messages marked as read`,
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Impact.MarkAllRead');
    }
});

export default router;
