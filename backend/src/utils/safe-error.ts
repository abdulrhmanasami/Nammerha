// ============================================================================
// Nammerha Backend — Safe Error Response Utility (SEC-FT-001 FIX)
// ============================================================================
// Prevents internal error messages (SQL details, file paths, stack traces)
// from leaking to API consumers. All route-level catch blocks MUST use
// this function instead of sending raw error.message in 500 responses.
//
// Business logic errors (4xx) are returned as-is because they contain
// intentional, user-facing messages. Only 500-level errors are sanitized.
//
// DT-LEAK-001 ENHANCEMENT: When no explicit status is provided, the function
// now inspects the error message for well-known business-logic patterns to
// infer appropriate 4xx status codes. This replaces the scattered
// `message.includes('not found') ? 404 : 400` patterns that were in each route.
// ============================================================================
import type { Response } from 'express';
import type { ApiResponse } from '../types';

/**
 * Infer HTTP status code from error message content.
 * Returns a 4xx code if the message matches known business-logic patterns,
 * or null if the error is not recognized (→ defaults to 500).
 */
function inferStatusFromMessage(message: string): number | null {
    const lower = message.toLowerCase();

    // 404 — Resource not found
    if (lower.includes('not found') || lower.includes('not exist')) {
        return 404;
    }

    // 403 — Forbidden / Authorization
    if (lower.includes('not assigned') || lower.includes('not the owner') ||
        lower.includes('access denied') || lower.includes('insufficient permission') ||
        lower.includes('you do not own') || lower.includes('you are not')) {
        return 403;
    }

    // 409 — Conflict / Duplicate
    if (lower.includes('already') || lower.includes('duplicate') ||
        lower.includes('conflict') || lower.includes('no longer')) {
        return 409;
    }

    // 422 — Validation / Constraint violation
    if (lower.includes('gps') || lower.includes('fidic') ||
        lower.includes('constraint violation') || lower.includes('validation')) {
        return 422;
    }

    // 400 — Bad Request (generic business logic)
    if (lower.includes('must be') || lower.includes('missing') ||
        lower.includes('invalid') || lower.includes('required') ||
        lower.includes('cannot') || lower.includes('expected') ||
        lower.includes('not allowed') || lower.includes('only')) {
        return 400;
    }

    // Unknown pattern — let it fall through to 500
    return null;
}

/**
 * Sends a sanitized error response to the client.
 *
 * - **500-level errors**: Always returns "Internal server error" — never
 *   exposes raw Error.message which could contain SQL table/column names,
 *   file paths, or other internal details.
 * - **4xx-level errors**: Returns the raw message, which is assumed to be
 *   an intentional business-logic error thrown by service code.
 *
 * When no explicit status code is provided, the function inspects the error
 * message for well-known patterns to infer appropriate 4xx codes. This
 * centralizes the status-code derivation logic that was previously scattered
 * across ~36 route catch blocks.
 *
 * @param res      Express response object
 * @param error    The caught error (unknown type for safety)
 * @param context  Human-readable label for server-side logs (e.g., 'Admin.GetVerifications')
 * @param status   Optional explicit HTTP status code. When omitted, inferred from error message.
 */
export function safeRouteError(
    res: Response,
    error: unknown,
    context: string,
    status?: number
): void {
    const rawMessage = error instanceof Error ? error.message : 'Unknown error';

    // Determine the appropriate HTTP status code:
    // 1. Explicit status takes precedence
    // 2. Infer from error message patterns
    // 3. Default to 500
    const httpStatus = status ?? inferStatusFromMessage(rawMessage) ?? 500;

    if (httpStatus >= 500) {
        // ─── CRITICAL: Never expose internal error details ──────────────
        // Log the full error server-side for debugging
        console.error(`[${context}] Internal error:`, error);
        const response: ApiResponse = {
            success: false,
            error: 'Internal server error',
        };
        res.status(httpStatus).json(response);
    } else {
        // 4xx errors are intentional business logic — safe to expose
        const response: ApiResponse = {
            success: false,
            error: rawMessage,
        };
        res.status(httpStatus).json(response);
    }
}
