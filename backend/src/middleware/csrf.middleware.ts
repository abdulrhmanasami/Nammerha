// ============================================================================
// Nammerha Backend — CSRF Protection Middleware (Double-Submit Cookie)
// ============================================================================
// HGH-AUD-006: Since the platform uses JWT in HttpOnly cookies (not Bearer
// headers), CORS `credentials: true` sends cookies cross-origin. This
// middleware enforces Double-Submit Cookie CSRF protection for all
// state-changing operations.
//
// Extracted from server.ts (IMP-004 refactor) for architectural clarity.
// ============================================================================

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// ─── Paths Exempted from CSRF ───────────────────────────────────────────────
// Documented rationale for each exemption:
//
// - /webhook            → Gateway-to-server callbacks, not browser-initiated
// - /auth/logout        → Fire-and-forget cookie clearance (M-003)
// - /auth/register      → Pre-auth: no token/cookie exists yet (MOB-CSRF-001)
// - /auth/login         → Pre-auth: no token/cookie exists yet (MOB-CSRF-001)
// - /auth/forgot-password → Pre-auth: password recovery flow (MOB-CSRF-001)
// - /auth/reset-password  → Pre-auth: token-based password reset (MOB-CSRF-001)
// - /auth/resend-verification → Pre-auth: email verification flow (MOB-CSRF-001)
// - /auth/verify-email    → Pre-auth: token-based email verification (P0-W12-004)
// - /auth/social        → Pre-auth: social OAuth login/register (MOB-CSRF-001)
// - /client-errors      → Browser onerror telemetry, no cookie jar access (BUG-003)
// - /csp-report         → W3C CSP violation reporter, no CSRF token possible (BUG-003)
const CSRF_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  '/auth/logout',
  '/auth/register',
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/resend-verification',
  '/auth/verify-email',
  '/auth/social',
  '/client-errors',
  '/csp-report',
]);

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection middleware using Double-Submit Cookie pattern.
 *
 * Validates that the `_csrf` cookie value matches the `X-CSRF-Token` header
 * for all state-changing (non-GET/HEAD/OPTIONS) requests.
 *
 * Exemptions are documented in CSRF_EXEMPT_PATHS and cover webhook callbacks,
 * fire-and-forget logout, and browser telemetry reporters.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF for safe methods (idempotent, no side effects)
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip for webhook callbacks (gateway-to-server, not browser-initiated)
  if (req.path.includes('/webhook')) {
    return next();
  }

  // Skip for explicitly exempted paths
  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  // Development fallback: skip CSRF for X-User-Id header auth
  if (process.env['NODE_ENV'] === 'development' && req.headers['x-user-id']) {
    return next();
  }

  // JWTs from Mobile App / API Clients are sent via Bearer headers.
  // Since browsers cannot automatically append Authorization headers to cross-origin
  // requests (unlike cookies), Bearer-authenticated requests are immune to CSRF.
  if (req.headers['authorization']?.startsWith('Bearer ')) {
    return next();
  }

  // MOB-CSRF-001: Mobile clients send X-Platform: mobile header.
  // Mobile apps don't use browser cookies for session management, so they are
  // inherently immune to CSRF. The X-Platform header cannot be set by a CSRF
  // attack (custom headers require CORS preflight which the attacker can't pass).
  const platform = req.headers['x-platform'] as string | undefined;
  if (
    platform === 'mobile' ||
    platform === 'flutter' ||
    platform === 'android' ||
    platform === 'ios'
  ) {
    return next();
  }

  // For cookie-based requests, require matching CSRF token
  const csrfCookie = req.cookies?.['_csrf'] as string | undefined;
  const csrfHeader = req.headers['x-csrf-token'] as string | undefined;

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    res.status(403).json({
      success: false,
      error: 'CSRF token validation failed',
    });
    return;
  }

  next();
}

// ─── CSRF Token Generation Endpoint Handler ─────────────────────────────────

/**
 * PLT-AUD-004: Rate limiter for CSRF token generation.
 * crypto.randomBytes(32) consumes entropy — without throttling, an attacker
 * flooding this endpoint could exhaust the entropy pool and stall the event loop.
 */
export const csrfTokenRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 CSRF token requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

/**
 * GET /api/csrf-token handler.
 * Generates a cryptographically random token, sets it as a non-HttpOnly cookie
 * (client JS must read it to send as header), and returns it in the response body.
 */
export function csrfTokenHandler(_req: Request, res: Response): void {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('_csrf', token, {
    httpOnly: false, // Client JS needs to read this to send as header
    sameSite: 'strict',
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: 3600_000, // 1 hour
  });
  res.json({ success: true, csrfToken: token });
}
