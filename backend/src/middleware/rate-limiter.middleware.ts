// ============================================================================
// Nammerha Backend — Endpoint Rate Limiter Middleware (D-9)
// ============================================================================
// Generic, reusable sliding-window rate limiter. No external dependencies.
//
// Usage:
//   router.get('/heavy-endpoint', createEndpointRateLimiter({
//       windowMs: 60_000,     // 1 minute window
//       maxRequests: 5,       // max 5 requests per window
//   }), handler);
//
// Features:
//   - Per-user keying via req.authUser.user_id (authenticated endpoints)
//   - Fallback to IP-based keying for unauthenticated endpoints
//   - Automatic cleanup of expired windows every 60 seconds
//   - Returns 429 Too Many Requests with Retry-After header
//   - Memory-bounded: entries expire and are swept periodically
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RateLimiterOptions {
    /** Window duration in milliseconds (default: 60_000 = 1 minute) */
    windowMs?: number;
    /** Maximum requests allowed per window (default: 10) */
    maxRequests?: number;
    /** Custom key extractor. Defaults to authUser.user_id or IP. */
    keyExtractor?: (req: Request) => string;
    /** Context label for logging (e.g., 'ReceiptPDF') */
    context?: string;
}

interface WindowEntry {
    count: number;
    windowStart: number;
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates a per-endpoint rate limiter middleware.
 *
 * Each instance maintains its own independent window map, so applying
 * this to different routes creates separate rate-limit counters.
 *
 * The sliding window resets after `windowMs` milliseconds. On expiry,
 * the counter resets to 1 (the current request).
 *
 * Memory safety: A periodic sweep runs every 60 seconds to remove
 * entries whose window has expired. The sweep interval is cleaned up
 * if the process exits gracefully.
 */
export function createEndpointRateLimiter(options: RateLimiterOptions = {}) {
    const windowMs = options.windowMs ?? 60_000;
    const maxRequests = options.maxRequests ?? 10;
    const context = options.context ?? 'RateLimiter';

    const defaultKeyExtractor = (req: Request): string => {
        // Prefer authenticated user ID for precision
        if (req.authUser?.user_id) {
            return `user:${req.authUser.user_id}`;
        }
        // Fallback to IP (handles proxied requests via x-forwarded-for)
        const forwarded = req.headers['x-forwarded-for'];
        const ip = typeof forwarded === 'string'
            ? forwarded.split(',')[0]?.trim()
            : req.socket.remoteAddress;
        return `ip:${ip ?? 'unknown'}`;
    };

    const keyExtractor = options.keyExtractor ?? defaultKeyExtractor;
    const windows = new Map<string, WindowEntry>();

    // ── Periodic Cleanup ────────────────────────────────────────────────
    // Sweep expired entries every 60 seconds to prevent memory leaks
    // from users who made requests once and never returned.
    const sweepInterval = setInterval(() => {
        const now = Date.now();
        let swept = 0;
        for (const [key, entry] of windows) {
            if (now - entry.windowStart > windowMs) {
                windows.delete(key);
                swept++;
            }
        }
        if (swept > 0) {
            logger.debug(`${context}: Swept ${swept} expired rate-limit entries`, {
                remaining: windows.size,
            });
        }
    }, 60_000);

    // Prevent the interval from keeping the process alive during shutdown
    sweepInterval.unref();

    // ── Middleware ───────────────────────────────────────────────────────

    return (req: Request, res: Response, next: NextFunction): void => {
        const key = keyExtractor(req);
        const now = Date.now();
        const existing = windows.get(key);

        if (!existing || now - existing.windowStart > windowMs) {
            // Window expired or first request — start new window
            windows.set(key, { count: 1, windowStart: now });
            // Set rate limit headers (RFC 6585 / draft-ietf-httpapi-ratelimit-headers)
            res.setHeader('X-RateLimit-Limit', maxRequests);
            res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
            next();
            return;
        }

        // Window still active — increment counter
        existing.count++;

        if (existing.count > maxRequests) {
            // Rate limit exceeded
            const retryAfterMs = windowMs - (now - existing.windowStart);
            const retryAfterSec = Math.ceil(retryAfterMs / 1000);

            logger.warn(`${context}: Rate limit exceeded`, {
                key,
                count: existing.count,
                limit: maxRequests,
                retry_after_sec: retryAfterSec,
            });

            res.setHeader('Retry-After', retryAfterSec);
            res.setHeader('X-RateLimit-Limit', maxRequests);
            res.setHeader('X-RateLimit-Remaining', 0);
            res.status(429).json({
                success: false,
                error: 'Too many requests. Please try again later.',
            });
            return;
        }

        // Under limit — allow through
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', maxRequests - existing.count);
        next();
    };
}
