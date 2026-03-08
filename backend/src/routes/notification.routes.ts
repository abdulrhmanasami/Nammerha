// ============================================================================
// Nammerha Backend — Notification Routes
// P2-008 FIX: Reordered routes — /read-all before /:id/read to prevent
// Express matching 'read-all' as a :id parameter.
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import * as notificationService from '../services/notification.service';
import type { ApiResponse } from '../types';

const router = Router();

router.use(authMiddleware);
router.use(requireActive);

// ─── GET /api/notifications — Get User Notifications ────────────────────────
router.get('/', async (req: Request, res: Response) => {
    try {
        const unreadOnly = req.query['unread_only'] === 'true';
        const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;

        const notifications = await notificationService.getUserNotifications(
            req.authUser!.user_id,
            { unread_only: unreadOnly, limit }
        );

        const response: ApiResponse = { success: true, data: notifications };
        res.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── GET /api/notifications/unread-count — Badge Count ──────────────────────
router.get('/unread-count', async (req: Request, res: Response) => {
    try {
        const count = await notificationService.getUnreadCount(req.authUser!.user_id);
        res.json({ success: true, data: { unread_count: count } } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── PATCH /api/notifications/read-all — Mark All as Read ───────────────────
// P2-008: MUST be registered BEFORE /:id/read to prevent Express from
// matching 'read-all' as the :id parameter.
router.patch('/read-all', async (req: Request, res: Response) => {
    try {
        const count = await notificationService.markAllAsRead(req.authUser!.user_id);
        res.json({ success: true, data: { marked_count: count }, message: `${count} notifications marked as read` } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message } as ApiResponse);
    }
});

// ─── PATCH /api/notifications/:id/read — Mark Single as Read ────────────────
router.patch('/:id/read', async (req: Request, res: Response) => {
    try {
        await notificationService.markAsRead(String(req.params['id']), req.authUser!.user_id);
        res.json({ success: true, message: 'Notification marked as read' } as ApiResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ success: false, error: message } as ApiResponse);
    }
});

export default router;
