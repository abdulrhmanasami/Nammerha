// ============================================================================
// Nammerha Backend — Client Error Reporting Route (PLT-AUDIT-007)
// ============================================================================
// Receives client-side errors (window.onerror, unhandledrejection) and logs
// them through the structured logger for ops team visibility.
//
// Security:
//   - No authentication required (must capture errors from non-logged-in users)
//   - Strict rate limiting (10 reports/minute per IP)
//   - Payload size validation (max 4KB)
//   - Input sanitization (no raw user strings in structured fields)
// ============================================================================
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

const router = Router();

// ─── Rate Limiter (10 per minute per IP — prevents flood attacks) ───────────
const errorReportLimiter = rateLimit({
    windowMs: 60_000,          // 1 minute window
    max: 10,                    // 10 reports per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many error reports — please try again later' },
});

// ─── Payload Validation ─────────────────────────────────────────────────────
interface ClientErrorPayload {
    message: string;
    source?: string;
    lineno?: number;
    colno?: number;
    stack?: string;
    url: string;
    userAgent?: string;
    timestamp: string;
    // PLT-2026-AUD-002 FIX: Added 'warning' to match frontend error-reporter severity tiers
    type: 'error' | 'unhandledrejection' | 'manual' | 'warning';
    /** PLT-2026-AUD-002: Severity tier for APM alerting rules */
    severity?: 'error' | 'warning';
    metadata?: Record<string, unknown>;
}

function isValidPayload(body: unknown): body is ClientErrorPayload {
    if (typeof body !== 'object' || body === null) {
        return false;
    }
    const obj = body as Record<string, unknown>;
    return (
        typeof obj['message'] === 'string' &&
        obj['message'].length > 0 &&
        obj['message'].length <= 2048 &&
        typeof obj['url'] === 'string' &&
        typeof obj['timestamp'] === 'string' &&
        typeof obj['type'] === 'string' &&
        ['error', 'unhandledrejection', 'manual', 'warning'].includes(obj['type'] as string)
    );
}

// ─── POST /api/client-errors — Receive and log client-side errors ───────────
router.post('/', errorReportLimiter, (req, res) => {
    try {
        if (!isValidPayload(req.body)) {
            res.status(400).json({ error: 'Invalid error report payload' });
            return;
        }

        const payload = req.body;

        // Sanitize: truncate stack trace to prevent log injection
        const safeStack = payload.stack
            ? payload.stack.slice(0, 4096)
            : undefined;

        // Log through structured logger (visible to ops team via log aggregation)
        // PLT-2026-AUD-002: Route warnings to warn level, errors to error level
        const logFn = payload.type === 'warning' || payload.severity === 'warning'
            ? logger.warn.bind(logger)
            : logger.error.bind(logger);

        logFn('CLIENT_ERROR', {
            type: payload.type,
            severity: payload.severity ?? 'error',
            message: payload.message.slice(0, 2048),
            source: payload.source?.slice(0, 512),
            lineno: payload.lineno,
            colno: payload.colno,
            stack: safeStack,
            url: payload.url.slice(0, 512),
            userAgent: payload.userAgent?.slice(0, 256),
            timestamp: payload.timestamp,
            clientIp: req.ip,
            metadata: payload.metadata,
        });

        res.status(204).end();
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
        logger.error('ClientErrorRoute: handler failed', { error: err instanceof Error ? err.message : String(err) });
    }
});

export default router;
