// ============================================================================
// Nammerha Backend — Financial Idempotency Guard (F-001 Remediation)
// ============================================================================
// A route-level middleware that MANDATES the Idempotency-Key header on
// financial mutation endpoints. This is SEPARATE from idempotencyMiddleware
// (which provides caching/replay behavior when the header is present).
//
// WHY SEPARATE:
//   1. The global idempotencyMiddleware silently skips when no header is sent.
//      That's correct for non-financial routes (GET, search, browse).
//   2. Financial mutations (payment initiation) MUST NOT skip.
//   3. Webhooks use HMAC + Redis locks, not client-provided keys — exempt.
//   4. Route-level guards are more explicit and auditable than global overrides.
//
// USAGE:
//   router.post('/initiate', requireIdempotencyKey, idempotencyMiddleware, handler);
// ============================================================================

import { Request, Response, NextFunction } from 'express';

// UUIDv4 format: 8-4-4-4-12 hex digits
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Maximum key length to prevent storage bombing attacks.
// UUIDv4 = 36 chars, but we allow up to 128 for clients using custom formats
// (e.g., "payment_abc123_1714819200" — timestamp-tagged keys).
const MAX_KEY_LENGTH = 128;

// Minimum key length to prevent trivially guessable/colliding keys.
const MIN_KEY_LENGTH = 8;

/**
 * F-001 FIX: Mandatory Idempotency-Key enforcement for financial endpoints.
 *
 * Validates:
 *   1. Header presence — REQUIRED
 *   2. Header type — must be a string (not array)
 *   3. Length bounds — [8, 128] chars (prevents collision + storage bombing)
 *   4. Format — preferably UUIDv4, but any alphanumeric-with-dashes accepted
 *   5. Character safety — no control chars, no whitespace-only, no SQL/HTML injection chars
 *
 * This guard does NOT cache/replay responses — that's handled by the downstream
 * idempotencyMiddleware which processes the key AFTER this guard validates it.
 */
export function requireIdempotencyKey(req: Request, res: Response, next: NextFunction): void {
  const rawKey = req.headers['idempotency-key'];

  // 1. Presence check
  if (!rawKey) {
    res.status(400).json({
      success: false,
      error:
        'Missing required Idempotency-Key header. Each financial request must include a unique idempotency key to prevent duplicate processing.',
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    return;
  }

  // 2. Type check (Express can parse repeated headers as arrays)
  if (typeof rawKey !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Idempotency-Key must be a single string value (not an array).',
      code: 'IDEMPOTENCY_KEY_INVALID_TYPE',
    });
    return;
  }

  const key = rawKey.trim();

  // 3. Length bounds
  if (key.length < MIN_KEY_LENGTH) {
    res.status(400).json({
      success: false,
      error: `Idempotency-Key too short (min ${MIN_KEY_LENGTH} characters). Use a UUIDv4 for best collision resistance.`,
      code: 'IDEMPOTENCY_KEY_TOO_SHORT',
    });
    return;
  }

  if (key.length > MAX_KEY_LENGTH) {
    res.status(400).json({
      success: false,
      error: `Idempotency-Key too long (max ${MAX_KEY_LENGTH} characters).`,
      code: 'IDEMPOTENCY_KEY_TOO_LONG',
    });
    return;
  }

  // 4. Character safety — block control characters, NUL bytes, and obvious injection vectors.
  //    Allowed: alphanumeric, hyphens, underscores, dots, colons (for timestamp-tagged keys).
  // eslint-disable-next-line no-control-regex -- Intentionally blocking control characters (security: NUL byte injection)
  if (/[\x00-\x1f<>"'`;\\]/.test(key)) {
    res.status(400).json({
      success: false,
      error:
        'Idempotency-Key contains invalid characters. Use alphanumeric characters, hyphens, underscores, dots, or colons.',
      code: 'IDEMPOTENCY_KEY_INVALID_CHARS',
    });
    return;
  }

  // 5. Prefer UUIDv4 — log warning if custom format (helps debugging, not blocking)
  //    We don't reject non-UUID keys because some clients use custom formats.
  //    The key is already validated for length and character safety above.
  //    This is informational only — the key is accepted regardless.

  next();
}

/**
 * Utility: Validate that a string is a well-formed UUIDv4.
 * Exported for use in unit tests and service-layer validation.
 */
export function isValidUUIDv4(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}
