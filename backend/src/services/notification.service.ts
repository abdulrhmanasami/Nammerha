// ============================================================================
// Nammerha Backend — Notification Service (Cross-cutting)
// ============================================================================
// Handles creating, querying, and marking notifications for all platform
// actors. Used by escrow.service.ts when closing the transparency loop.
// ============================================================================
import { query } from '../config/database';
import type { Notification, NotificationType, NotificationChannel } from '../types';

// ─── Create Notification ────────────────────────────────────────────────────

interface CreateNotificationInput {
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    channel?: NotificationChannel;
}

/**
 * Creates a notification record.
 * Can be called with either the pool (for standalone use)
 * or a transaction client (for use within escrow release flow).
 */
export async function createNotification(
    clientOrPool: {
        query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
    },
    input: CreateNotificationInput
): Promise<Notification> {
    const result = await clientOrPool.query<Notification>(
        `INSERT INTO notifications (user_id, type, title, body, data, channel)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
        [
            input.user_id,
            input.type,
            input.title,
            input.body,
            input.data ? JSON.stringify(input.data) : null,
            input.channel ?? 'in_app',
        ]
    );

    const notification = result.rows[0];
    if (!notification) throw new Error('Failed to create notification');

    // TODO: In production, dispatch to push notification service (FCM/APNS)
    console.log(`[Notification] ${input.type} → ${input.user_id}: ${input.title}`);

    return notification;
}

// ─── Query Notifications ────────────────────────────────────────────────────

/**
 * Get all notifications for a user, newest first.
 * Optionally filter by read status.
 */
export async function getUserNotifications(
    userId: string,
    options?: { unread_only?: boolean; limit?: number }
): Promise<Notification[]> {
    let sql = 'SELECT * FROM notifications WHERE user_id = $1';
    const params: unknown[] = [userId];

    if (options?.unread_only) {
        sql += ' AND is_read = FALSE';
    }

    sql += ' ORDER BY created_at DESC';

    if (options?.limit) {
        params.push(options.limit);
        sql += ` LIMIT $${params.length}`;
    }

    const result = await query<Notification>(sql, params);
    return result.rows;
}

/**
 * Get unread notification count for badge display.
 */
export async function getUnreadCount(userId: string): Promise<number> {
    const result = await query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
        [userId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
}

// ─── Mark Notifications ─────────────────────────────────────────────────────

/**
 * Mark a specific notification as read.
 */
export async function markAsRead(
    notificationId: string,
    userId: string
): Promise<void> {
    const result = await query(
        `UPDATE notifications SET is_read = TRUE, read_at = NOW()
     WHERE notification_id = $1 AND user_id = $2`,
        [notificationId, userId]
    );
    if (result.rowCount === 0) {
        throw new Error('Notification not found or does not belong to user');
    }
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userId: string): Promise<number> {
    const result = await query(
        `UPDATE notifications SET is_read = TRUE, read_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE`,
        [userId]
    );
    return result.rowCount ?? 0;
}
