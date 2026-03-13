// ============================================================================
// Nammerha Backend — Notification Service (Cross-cutting)
// ============================================================================
// Handles creating, querying, and marking notifications for all platform
// actors. Used by escrow.service.ts when closing the transparency loop.
// ============================================================================
import { query } from '../config/database';
import type { Notification, NotificationType, NotificationChannel } from '../types';
import { logger } from '../utils/logger';

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
    if (!notification) { throw new Error('Failed to create notification'); }

    // MED-AUD-001 FIX: Dispatch to channel-specific delivery provider.
    // Fire-and-forget with error isolation — failed delivery never crashes
    // the calling transaction or blocks the HTTP response.
    const channel = input.channel ?? 'in_app';
    dispatchToProvider(channel, input).catch((err) => {
        logger.error('Notification dispatch failed', { channel, error: err instanceof Error ? err.message : String(err) });
    });

    return notification;
}

// ─── Notification Dispatch Providers (MED-AUD-001 FIX) ──────────────────────

type DispatchProvider = (input: CreateNotificationInput) => Promise<void>;

/**
 * Provider registry. Extensible — add FCM, Twilio, etc. by adding entries.
 * Each provider is async and independently error-isolated.
 */
const DISPATCH_PROVIDERS: Record<string, DispatchProvider> = {
    // eslint-disable-next-line require-await
    in_app: async (input) => {
        // In-app: already persisted to DB above. No additional delivery needed.
        logger.info('In-app notification', { userId: input.user_id, title: input.title });
    },

    email: async (input) => {
        // Email: use SMTP transport if configured, otherwise log warning.
        const smtpHost = process.env['SMTP_HOST'];
        const smtpUser = process.env['SMTP_USER'];
        const smtpPass = process.env['SMTP_PASS'];
        const fromEmail = process.env['SMTP_FROM'] ?? 'noreply@nammerha.com';

        if (!smtpHost) {
            logger.warn('Email delivery requested but SMTP_HOST not configured — skipping');
            return;
        }

        // Dynamic import to avoid loading nodemailer when not needed
        try {
            const nodemailer = await import('nodemailer');

            // Build transport config — auth is optional (self-hosted Postfix relay
            // on internal Docker network doesn't need credentials)
            const transportConfig: Record<string, unknown> = {
                host: smtpHost,
                port: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
                secure: process.env['SMTP_SECURE'] === 'true',
            };

            // Only add auth if credentials are provided (external SMTP services)
            if (smtpUser && smtpPass) {
                transportConfig['auth'] = { user: smtpUser, pass: smtpPass };
            }

            const transporter = nodemailer.createTransport(transportConfig);

            // Look up user email from DB
            const userResult = await query<{ email: string }>(
                'SELECT email FROM users WHERE user_id = $1',
                [input.user_id]
            );
            const userEmail = userResult.rows[0]?.email;
            if (!userEmail) {
                logger.warn('Cannot send email — no email found for user', { userId: input.user_id });
                return;
            }

            await transporter.sendMail({
                from: fromEmail,
                to: userEmail,
                subject: input.title,
                text: input.body,
                html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                    <h2 style="color:#1a365d;">${input.title}</h2>
                    <p>${input.body}</p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
                    <p style="color:#94a3b8;font-size:12px;">Nammerha — National Reconstruction Platform</p>
                </div>`,
            });
            logger.info('Email notification sent', { to: userEmail, title: input.title });
        } catch (err) {
            logger.error('Email delivery failed', { error: err instanceof Error ? err.message : String(err) });
            // Never re-throw — email failure must not crash the calling operation
        }
    },

    webhook: async (input) => {
        // Webhook: POST notification payload to a configured endpoint
        const webhookUrl = process.env['NOTIFICATION_WEBHOOK_URL'];
        if (!webhookUrl) {
            logger.warn('Webhook delivery requested but NOTIFICATION_WEBHOOK_URL not set — skipping');
            return;
        }

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'notification.created',
                    user_id: input.user_id,
                    type: input.type,
                    title: input.title,
                    body: input.body,
                    data: input.data,
                    timestamp: new Date().toISOString(),
                }),
            });
            if (!response.ok) {
                logger.error('Webhook returned error', { status: response.status, statusText: response.statusText });
            } else {
                logger.info('Webhook dispatched', { type: input.type, userId: input.user_id });
            }
        } catch (err) {
            logger.error('Webhook delivery failed', { error: err instanceof Error ? err.message : String(err) });
        }
    },
};

/**
 * Dispatches a notification to the appropriate delivery provider.
 * Falls back to in_app logging if the requested channel has no provider.
 */
async function dispatchToProvider(channel: string, input: CreateNotificationInput): Promise<void> {
    const provider = DISPATCH_PROVIDERS[channel];
    if (provider) {
        await provider(input);
    } else if (DISPATCH_PROVIDERS['in_app']) {
        await DISPATCH_PROVIDERS['in_app'](input);
    }
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
    // M-001 FIX: Explicit column list — prevents schema drift.
    let sql = `SELECT notification_id, user_id, type, title, body, data,
                      channel, is_read, read_at, created_at
               FROM notifications WHERE user_id = $1`;
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
