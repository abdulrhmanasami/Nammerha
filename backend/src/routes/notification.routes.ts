// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Notification Routes
// P2-008 FIX: Reordered routes — /read-all before /:id/read to prevent
// Express matching 'read-all' as a :id parameter.
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import * as notificationService from '../services/notification.service';
import { safeRouteError } from '../utils/safe-error';
import type { ApiResponse } from '../types';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ─── GET /api/notifications — Get User Notifications ────────────────────────
router.get('/', async (req: Request, res: Response) => {
    try {
        const unreadOnly = req.query['unread_only'] === 'true';
        // F4-2 FIX: NaN-safe clamping (same pattern as D-1/D-6)
        const rawLimit = parseInt(req.query['limit'] as string, 10);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 50;

        const notifications = await notificationService.getUserNotifications(
            getAuthUser(req).user_id,
            { unread_only: unreadOnly, limit }
        );

        const response: ApiResponse = { success: true, data: notifications };
        res.json(response);
    } catch (error) {
        safeRouteError(res, error, 'Notification.GetAll');
    }
});

// ─── GET /api/notifications/unread-count — Badge Count ──────────────────────
router.get('/unread-count', async (req: Request, res: Response) => {
    try {
        const count = await notificationService.getUnreadCount(getAuthUser(req).user_id);
        res.json({ success: true, data: { unread_count: count } } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Notification.GetUnreadCount');
    }
});

// ─── PATCH /api/notifications/read-all — Mark All as Read ───────────────────
// P2-008: MUST be registered BEFORE /:id/read to prevent Express from
// matching 'read-all' as the :id parameter.
router.patch('/read-all', async (req: Request, res: Response) => {
    try {
        const count = await notificationService.markAllAsRead(getAuthUser(req).user_id);
        res.json({ success: true, data: { marked_count: count }, message: `${count} notifications marked as read` } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Notification.MarkAllRead');
    }
});

// ─── PATCH /api/notifications/:id/read — Mark Single as Read ────────────────
router.patch('/:id/read', async (req: Request, res: Response) => {
    try {
        await notificationService.markAsRead(String(req.params['id']), getAuthUser(req).user_id);
        res.json({ success: true, message: 'Notification marked as read' } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Notification');
    }
});

export default router;
