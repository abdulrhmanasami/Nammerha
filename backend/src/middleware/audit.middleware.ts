// ============================================================================
// Nammerha Backend — Audit Middleware
// Auto-logs every mutation (POST, PATCH, PUT, DELETE) to audit_trail.
// PLAT-WARN-03 FIX: Sensitive fields (passwords, tokens, secrets) are masked
// before persistence to prevent credential exposure in audit logs.
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { logger } from '../utils/logger';

// ─── Sensitive Field Masking (PLAT-WARN-03) ─────────────────────────────────
// Keys are matched case-insensitively. Any nested object or array is scanned
// recursively. This prevents passwords, tokens, and API keys from being
// persisted in the audit_trail table — even if future routes add new
// sensitive fields that match these patterns.

const SENSITIVE_KEYS = new Set([
    'password',
    'password_hash',
    'new_password',
    'old_password',
    'token',
    'secret',
    'api_key',
    'apikey',
    'credit_card',
    'card_number',
    'cvv',
    'cvc',
    'ssn',
    'authorization',
    'refresh_token',
    'access_token',
]);

const REDACTED = '[REDACTED]';

/**
 * Recursively masks sensitive field values in an object.
 * Returns a new object — the original is never mutated.
 */
function maskSensitiveFields(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => maskSensitiveFields(item));
    }

    if (typeof obj === 'object') {
        const masked: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            if (SENSITIVE_KEYS.has(key.toLowerCase())) {
                masked[key] = REDACTED;
            } else if (typeof value === 'object' && value !== null) {
                masked[key] = maskSensitiveFields(value);
            } else {
                masked[key] = value;
            }
        }
        return masked;
    }

    return obj;
}

/**
 * Audit middleware that logs mutations to the audit_trail table.
 * Captures the entity type from the route, the action from the HTTP method,
 * and the actor from the authenticated user.
 *
 * This is applied globally — every mutation is logged.
 * PLAT-WARN-03: Sensitive fields are masked before persistence.
 */
export function auditMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Only audit mutations
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
        next();
        return;
    }

    // Capture the original json method to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown): Response {
        // Log to audit_trail asynchronously (fire-and-forget)
        if (res.statusCode >= 200 && res.statusCode < 300 && req.authUser) {
            const entityType = extractEntityType(req.path);
            const action = mapMethodToAction(req.method);

            // PLAT-WARN-03: Mask sensitive fields before logging to DB
            const safeBody = maskSensitiveFields(req.body);

            query(
                `INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, new_values, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6::INET, $7)`,
                [
                    entityType,
                    extractEntityId(req.path, req.params),
                    action,
                    req.authUser.user_id,
                    JSON.stringify(safeBody),
                    extractIp(req),
                    req.headers['user-agent'] ?? null,
                ]
            ).catch((err: Error) => {
                logger.error('Audit trail persistence failed', { error: err.message });
            });
        }

        return originalJson(body);
    };

    next();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractEntityType(path: string): string {
    // /api/projects/:id/boq → 'project_boq'
    // /api/donations → 'donation'
    // /api/admin/escrow/release → 'escrow_release'
    const segments = path
        .replace(/^\/api\//, '')
        .split('/')
        .filter((s) => !s.match(/^[0-9a-f-]{36}$/i) && !s.match(/^OCDS-/));
    return segments.join('_').replace(/-/g, '_');
}

function extractEntityId(path: string, params: Record<string, string | string[] | undefined>): string {
    // Try to extract UUID or OCDS ID from path
    const uuidMatch = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch?.[1]) {return uuidMatch[1];}

    const ocdsMatch = path.match(/(OCDS-SYR-\d+)/i);
    if (ocdsMatch?.[1]) {return ocdsMatch[1];}

    return String(params['id'] ?? 'unknown');
}

function mapMethodToAction(method: string): string {
    switch (method) {
        case 'POST': return 'created';
        case 'PATCH':
        case 'PUT': return 'updated';
        case 'DELETE': return 'deleted';
        default: return method.toLowerCase();
    }
}

function extractIp(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0]?.trim() ?? null;
    }
    return req.socket.remoteAddress ?? null;
}
