// ============================================================================
// Nammerha Backend — Audit Middleware
// Auto-logs every mutation (POST, PATCH, PUT, DELETE) to audit_trail.
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';

/**
 * Audit middleware that logs mutations to the audit_trail table.
 * Captures the entity type from the route, the action from the HTTP method,
 * and the actor from the authenticated user.
 *
 * This is applied globally — every mutation is logged.
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

            query(
                `INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, new_values, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6::INET, $7)`,
                [
                    entityType,
                    extractEntityId(req.path, req.params),
                    action,
                    req.authUser.user_id,
                    JSON.stringify(req.body),
                    extractIp(req),
                    req.headers['user-agent'] ?? null,
                ]
            ).catch((err: Error) => {
                console.error('[Audit] Failed to log:', err.message);
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
    if (uuidMatch?.[1]) return uuidMatch[1];

    const ocdsMatch = path.match(/(OCDS-SYR-\d+)/i);
    if (ocdsMatch?.[1]) return ocdsMatch[1];

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
