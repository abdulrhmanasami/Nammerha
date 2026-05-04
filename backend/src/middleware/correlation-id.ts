// ============================================================================
// Nammerha Backend — Request Correlation ID Middleware (SEC-09)
// ============================================================================
// Assigns a unique X-Request-Id to every incoming request for end-to-end
// tracing across Frontend → Backend → PostgreSQL → Redis → MinIO.
//
// If the client sends an X-Request-Id header (e.g., from the frontend error
// reporter), we reuse it. Otherwise, we generate a new UUIDv4.
//
// The ID is:
//   1. Stored on res.locals.requestId for downstream handlers
//   2. Returned in the response X-Request-Id header
//   3. Injected into the logger context for structured log correlation
//
// Standard: OpenTelemetry W3C Trace Context, OWASP Logging Cheat Sheet
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const HEADER_NAME = 'x-request-id';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Express middleware that ensures every request has a correlation ID.
 *
 * - Reuses client-provided X-Request-Id if it's a valid UUIDv4
 * - Generates a new UUIDv4 otherwise
 * - Sets the ID on res.locals.requestId and the response header
 *
 * Usage in server.ts:
 *   import { correlationId } from './middleware/correlation-id';
 *   app.use(correlationId);
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
    // Accept client-provided ID only if it's a valid UUIDv4 (prevent injection)
    const clientId = req.headers[HEADER_NAME];
    const id = typeof clientId === 'string' && UUID_REGEX.test(clientId)
        ? clientId
        : crypto.randomUUID();

    // Store for downstream handlers and logger
    res.locals.requestId = id;

    // Return in response for client-side correlation
    res.setHeader('X-Request-Id', id);

    next();
}
