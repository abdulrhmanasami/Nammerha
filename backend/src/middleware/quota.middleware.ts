// ============================================================================
// Nammerha Backend — Quota Middleware (Feature 4)
// ============================================================================
// Express middleware that tracks API usage per request, checks quotas,
// and dispatches webhook alerts when thresholds are exceeded.
// Attaches quota status to the response for downstream use.
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import { trackUsage, checkQuota, dispatchQuotaAlert } from '../services/quota.service';

/**
 * Quota tracking middleware. Must be mounted AFTER authMiddleware
 * since it reads `req.authUser` for user context.
 *
 * Behavior:
 * 1. Records the API hit (fire-and-forget)
 * 2. Checks quota status
 * 3. If quota exceeded → returns 429
 * 4. If threshold exceeded → dispatches webhook alert (async, non-blocking)
 * 5. Attaches usage headers to response
 */
export function quotaMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Skip for unauthenticated requests (public endpoints)
    if (!req.authUser) {
        next();
        return;
    }

    const userId = req.authUser.user_id;
    const role = req.authUser.role;
    const endpoint = req.baseUrl + req.path;
    const method = req.method;

    // Track usage after response completes (non-blocking)
    res.on('finish', () => {
        trackUsage(userId, endpoint, method, res.statusCode).catch(() => {
            // Silently ignore tracking failures
        });
    });

    // Check quota (async, but non-blocking for the main path)
    checkQuota(userId, role)
        .then((status) => {
            // Attach usage headers for transparency
            res.setHeader('X-RateLimit-Limit', String(status.max_requests_per_day));
            res.setHeader('X-RateLimit-Remaining', String(
                Math.max(0, status.max_requests_per_day - status.requests_today)
            ));
            res.setHeader('X-RateLimit-Usage', `${status.usage_percentage}%`);

            if (status.quota_exceeded) {
                res.status(429).json({
                    success: false,
                    error: 'Daily API quota exceeded. Please try again tomorrow or contact support.',
                    quota: {
                        requests_today: status.requests_today,
                        max_requests_per_day: status.max_requests_per_day,
                        resets_at: getNextMidnightUTC(),
                    },
                });
                return;
            }

            // Dispatch alert if threshold exceeded (non-blocking)
            if (status.threshold_exceeded) {
                dispatchQuotaAlert(userId, status).catch(() => {
                    // Silently ignore alert failures
                });
            }

            next();
        })
        .catch(() => {
            // If quota check fails, allow the request through (fail-open for availability)
            next();
        });
}

/**
 * Returns the next midnight UTC timestamp for the rate limit reset header.
 */
function getNextMidnightUTC(): string {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow.toISOString();
}
