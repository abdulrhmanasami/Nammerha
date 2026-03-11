// ============================================================================
// Nammerha Backend — Quota Service (Feature 4: Webhook Notifications)
// ============================================================================
// Tracks API usage per user, checks quota limits, and dispatches
// webhook alerts when usage exceeds configurable thresholds.
// ============================================================================
import { query } from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuotaConfig {
    quota_id: string;
    role: string;
    max_requests_per_day: number;
    max_projects: number;
    webhook_url: string | null;
    alert_threshold_pct: number;
    is_active: boolean;
}

interface QuotaStatus {
    role: string;
    requests_today: number;
    max_requests_per_day: number;
    usage_percentage: number;
    threshold_exceeded: boolean;
    quota_exceeded: boolean;
}

// ─── In-Memory Alert Deduplication ──────────────────────────────────────────
// Prevents webhook spam: only alert once per user per hour
const alertedUsers = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function hasRecentAlert(userId: string): boolean {
    const lastAlert = alertedUsers.get(userId);
    if (!lastAlert) { return false; }
    return Date.now() - lastAlert < ALERT_COOLDOWN_MS;
}

function markAlerted(userId: string): void {
    alertedUsers.set(userId, Date.now());
    // Cleanup old entries every 1000 entries to prevent memory leak
    if (alertedUsers.size > 1000) {
        const cutoff = Date.now() - ALERT_COOLDOWN_MS;
        for (const [key, time] of alertedUsers.entries()) {
            if (time < cutoff) {
                alertedUsers.delete(key);
            }
        }
    }
}

// ─── Track Usage ────────────────────────────────────────────────────────────

/**
 * Record an API request hit. Fire-and-forget safe.
 */
export async function trackUsage(
    userId: string,
    endpoint: string,
    method: string,
    responseStatus: number
): Promise<void> {
    try {
        await query(
            `INSERT INTO api_usage (user_id, endpoint, method, response_status)
             VALUES ($1, $2, $3, $4)`,
            [userId, endpoint, method, responseStatus]
        );
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Quota] Failed to track usage:', err);
        // Never crash the request for tracking failures
    }
}

// ─── Check Quota ────────────────────────────────────────────────────────────

/**
 * Check the current quota status for a user.
 * Returns usage stats and whether thresholds/limits are exceeded.
 */
export async function checkQuota(userId: string, role: string): Promise<QuotaStatus> {
    // Get quota config for role
    const configResult = await query<QuotaConfig>(
        'SELECT * FROM quota_configs WHERE role = $1 AND is_active = TRUE',
        [role]
    );

    const config = configResult.rows[0];
    if (!config) {
        // No quota configured — unlimited
        return {
            role,
            requests_today: 0,
            max_requests_per_day: -1, // unlimited
            usage_percentage: 0,
            threshold_exceeded: false,
            quota_exceeded: false,
        };
    }

    // Count today's requests
    const usageResult = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM api_usage
         WHERE user_id = $1 AND created_at >= DATE_TRUNC('day', NOW())`,
        [userId]
    );

    const requestsToday = parseInt(usageResult.rows[0]?.count ?? '0', 10);
    const usagePercentage = config.max_requests_per_day > 0
        ? Math.round((requestsToday / config.max_requests_per_day) * 100)
        : 0;

    return {
        role,
        requests_today: requestsToday,
        max_requests_per_day: config.max_requests_per_day,
        usage_percentage: usagePercentage,
        threshold_exceeded: usagePercentage >= config.alert_threshold_pct,
        quota_exceeded: requestsToday >= config.max_requests_per_day,
    };
}

// ─── Dispatch Quota Alert ───────────────────────────────────────────────────

/**
 * Dispatches a webhook alert when usage exceeds the configured threshold.
 * Deduplicates alerts per user (max 1 per hour).
 */
export async function dispatchQuotaAlert(
    userId: string,
    status: QuotaStatus
): Promise<void> {
    if (hasRecentAlert(userId)) {
        return; // Already alerted recently
    }

    // Get webhook URL for this role
    const configResult = await query<{ webhook_url: string | null }>(
        'SELECT webhook_url FROM quota_configs WHERE role = $1',
        [status.role]
    );

    const webhookUrl = configResult.rows[0]?.webhook_url;

    // Also check the global notification webhook
    const globalWebhook = process.env['NOTIFICATION_WEBHOOK_URL'];
    const targetUrl = webhookUrl ?? globalWebhook;

    if (!targetUrl) {
        return; // No webhook configured
    }

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: 'quota.threshold_reached',
                user_id: userId,
                role: status.role,
                requests_today: status.requests_today,
                max_requests_per_day: status.max_requests_per_day,
                usage_percentage: status.usage_percentage,
                quota_exceeded: status.quota_exceeded,
                timestamp: new Date().toISOString(),
            }),
        });

        if (!response.ok) {
            // eslint-disable-next-line no-console
            console.error(`[Quota] Webhook returned ${response.status}: ${response.statusText}`);
        } else {
            // eslint-disable-next-line no-console
            console.warn(`[Quota] Alert dispatched for ${userId} (${status.usage_percentage}% usage)`);
        }

        markAlerted(userId);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Quota] Webhook dispatch failed:', err);
    }
}

// ─── Get Usage History ──────────────────────────────────────────────────────

/**
 * Get aggregated usage history for a user (for frontend charts).
 */
export async function getUsageHistory(
    userId: string,
    days: number = 30
): Promise<Array<{ date: string; count: number }>> {
    const clampedDays = Math.min(Math.max(days, 1), 90);

    const result = await query<{ date: string; count: number }>(
        `SELECT
            TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
            COALESCE(u.cnt, 0)::int AS count
         FROM generate_series(
            DATE_TRUNC('day', NOW()) - INTERVAL '${clampedDays - 1} days',
            DATE_TRUNC('day', NOW()),
            '1 day'
         ) AS d(day)
         LEFT JOIN (
            SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS cnt
            FROM api_usage WHERE user_id = $1
            GROUP BY DATE_TRUNC('day', created_at)
         ) u ON u.day = d.day
         ORDER BY d.day ASC`,
        [userId]
    );

    return result.rows;
}
