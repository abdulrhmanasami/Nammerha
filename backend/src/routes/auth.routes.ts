// ============================================================================
// Nammerha Backend — Auth Routes
// POST /api/auth/register  — Create a new user account
// POST /api/auth/login     — Authenticate and receive JWT token
//
// SEC-002: Account lockout after 5 consecutive failed logins
// SEC-003: Password max length (128 chars) to prevent bcrypt DoS
// SEC-009: Generic registration errors to prevent email enumeration
// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { query } from '../config/database';

/**
 * SEC-PLAT-001: Hash tokens with SHA-256 before storing in DB.
 * Plaintext tokens in DB mean a SQL injection or DB dump exposes every user's
 * password reset capability. By storing only the hash, even a full DB leak
 * cannot be used to reset any account.
 * Standard: OWASP Token Storage, CWE-312 (Cleartext Storage of Sensitive Information).
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
import {
  generateToken,
  authMiddleware,
  generateMfaChallengeToken,
} from '../middleware/auth.middleware';
// P1-REM-003 FIX: Replaced direct email sending with persistent queue.
// PREVIOUS: Fire-and-forget sendXxxEmail().catch() — lost on SMTP failure.
// NOW: Emails are queued in PostgreSQL and retried with exponential backoff.
// email.service.ts remains the low-level transport (called by email-retry-job.ts).
import {
  enqueueVerificationEmail,
  enqueuePasswordResetEmail,
  enqueueSecurityAlertEmail,
} from '../services/email-queue.service';
import type { EmailLocale } from '../services/email.service';
import type { User, UserRole, ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';
import { logger } from '../utils/logger';
// P0-W6-001 FIX: Wire Zod validation — replaces manual inline checks.
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  resendVerificationSchema,
  verifyEmailSchema,
} from '../validation/schemas';

// ─── I18N-004: Locale Detection ─────────────────────────────────────────────
/**
 * Extract the email locale from the request's Accept-Language header.
 * Returns 'ar' if Arabic is preferred, otherwise defaults to 'en'.
 * This ensures email templates are rendered in the user's preferred language.
 */
function getEmailLocale(req: Request): EmailLocale {
  // P2-AUTH-004 FIX: Prioritize X-Locale header (set by frontend from the
  // user's chosen Nammerha locale) over Accept-Language (browser system language).
  // This ensures a Syrian user browsing in Arabic receives Arabic emails even
  // if their browser's system language is English.
  const xLocale = (req.headers['x-locale'] as string | undefined)?.trim().toLowerCase();
  if (xLocale === 'ar' || xLocale === 'en') {
    return xLocale as EmailLocale;
  }
  const acceptLang = req.headers['accept-language'] ?? '';
  // Accept-Language: ar, ar-SA, ar-SY, etc.
  if (/\bar/i.test(acceptLang)) {
    return 'ar';
  }
  return 'en';
}

const router = Router();

// P0-W6-001: MAX_PASSWORD_LENGTH removed — Zod schema enforces .max(128) directly.
// BUG-010 FIX: RFC 5321 max email length — prevents DoS via extremely long email strings.
const MAX_EMAIL_LENGTH = 254;

// SEC-002: Account lockout configuration
// RED TEAM FIX: Lockout is now per-(IP + email) compound, not per-email alone.
// An attacker brute-forcing from their IP only locks THEIR IP for that email —
// the real account owner from a different IP can still log in.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

const BCRYPT_SALT_ROUNDS = 12;

// Email verification token expiry
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
// Password reset token expiry
const RESET_TOKEN_EXPIRY_MINUTES = 60;
// Resend verification rate limit (seconds)
const RESEND_COOLDOWN_SECONDS = 60;

// ─── PLT-SEC-004 FIX: Anti-DoS Rate Limiting ────────────────────────────────
const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 verification requests
  standardHeaders: true,
  legacyHeaders: false,
  // P1-AUD-W16-003 FIX: i18n-aware rate limit response.
  // PREVIOUS: Hardcoded English `message` string — Arabic users saw untranslated errors.
  // express-rate-limit's `message` sends the response BEFORE our route handler runs,
  // bypassing all i18n infrastructure. Using `handler` gives us full control.
  // Standard: WCAG 3.1.1 (Language of Page), Nammerha i18n Architecture.
  handler: (req: Request, res: Response) => {
    const locale = getEmailLocale(req);
    res.status(429).json({
      success: false,
      error:
        locale === 'ar'
          ? 'محاولات تحقق كثيرة. يرجى الانتظار ١٥ دقيقة قبل المحاولة مرة أخرى.'
          : 'Too many verification attempts from this IP, please try again later.',
    } as ApiResponse);
  },
});

const sensitiveActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 sensitive requests (resend/forgot-password/change-password)
  standardHeaders: true,
  legacyHeaders: false,
  // P1-AUD-W16-003 FIX: i18n-aware rate limit response.
  handler: (req: Request, res: Response) => {
    const locale = getEmailLocale(req);
    res.status(429).json({
      success: false,
      error:
        locale === 'ar'
          ? 'محاولات كثيرة. يرجى الانتظار ١٥ دقيقة قبل المحاولة مرة أخرى.'
          : 'Too many requests. Please try again after 15 minutes.',
    } as ApiResponse);
  },
});

// V-005 FIX: Separate rate limiter for logout.
// PREVIOUS: Logout shared sensitiveActionLimiter with change-password and forgot-password.
// An attacker could exhaust the shared quota by spamming /api/auth/logout (which doesn't
// require authentication), then the victim couldn't change their password or request a
// password reset for 15 minutes. Logout is a non-destructive operation that only clears
// a cookie — it deserves a more generous, isolated limit.
// Standard: OWASP Rate Limiting, Zero-Trust Resource Isolation.
const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // More generous than sensitiveActionLimiter (logout is non-destructive)
  standardHeaders: true,
  legacyHeaders: false,
  // P1-AUD-W16-003 FIX: i18n-aware rate limit response.
  handler: (req: Request, res: Response) => {
    const locale = getEmailLocale(req);
    res.status(429).json({
      success: false,
      error:
        locale === 'ar'
          ? 'محاولات كثيرة. يرجى الانتظار قبل المحاولة مرة أخرى.'
          : 'Too many logout requests. Please try again later.',
    } as ApiResponse);
  },
});

// P0-W12-003 FIX: Login-specific rate limiter.
// PREVIOUS: /login had NO Express-level rate limiter. It relied solely on the
// audit_trail-based lockout (L396-435) which only activates after 5 failed
// attempts per email/IP compound. An attacker could credential-stuff across
// many different emails at ~60 req/sec without any IP-level throttling.
// Standard: OWASP ASVS 2.2.1, CWE-307 (Improper Restriction of Auth Attempts).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 login attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  // P1-AUD-W16-003 FIX: i18n-aware rate limit response.
  handler: (req: Request, res: Response) => {
    const locale = getEmailLocale(req);
    res.status(429).json({
      success: false,
      error:
        locale === 'ar'
          ? 'محاولات تسجيل دخول كثيرة. يرجى الانتظار ١٥ دقيقة قبل المحاولة مرة أخرى.'
          : 'Too many login attempts from this IP, please try again after 15 minutes.',
    } as ApiResponse);
  },
});

// P0-W6-001: EMAIL_REGEX and PASSWORD_RULES removed — Zod schemas in
// validation/schemas.ts are now the single source of truth for input validation.

// UNIFIED-ROLES: All 5 roles are auto-assigned to every user at registration.
// Donor excluded while DONATIONS_ENABLED=false.
const AUTO_ASSIGN_ROLES: readonly string[] = [
  'homeowner',
  'engineer',
  'contractor',
  'supplier',
  'tradesperson',
] as const;

// ─── POST /api/auth/register ────────────────────────────────────────────────
// P0-W12-001 FIX: Added sensitiveActionLimiter.
// PREVIOUS: /register had NO rate limiter. Attacker could send unlimited
// registration requests causing: (1) email bombing via verification emails,
// (2) database bloat (user row + 5 profile tables + role assignments per request),
// (3) CPU exhaustion (bcrypt hash with 12 rounds costs ~250ms/request).
// Standard: OWASP Rate Limiting, CWE-770 (Allocation of Resources Without Limits).
router.post(
  '/register',
  sensitiveActionLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // P0-W6-001 FIX: Wire Zod validation — replaces 60+ lines of manual inline checks.
      // Zod handles type coercion, trimming, format validation, complexity rules,
      // max lengths, and unknown field stripping in a single call.
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message ?? 'Invalid input';
        res.status(400).json({ success: false, error: firstError } as ApiResponse);
        return;
      }
      const { email, password, full_name, phone } = parsed.data;

      // UNIFIED-ROLES: Role parameter is ignored — all users get all roles.
      // Default primary role is 'homeowner' (most common use case).
      const role: UserRole = 'homeowner';

      // ─── PLT-AUD-001 FIX: Anti-Enumeration Canonical Response ─────────
      // Both "email exists" and "new user" paths return an IDENTICAL 200
      // response with the same JSON shape. This is the ONLY way to defeat
      // email enumeration — an attacker cannot distinguish the two paths by
      // status code, response body, or timing (bcrypt hash runs in both).
      //
      // JWT is NOT returned at registration. The user receives the token
      // only after verifying their email and logging in. This also resolves
      // PLT-AUD-008 (JWT before email verification).
      // ──────────────────────────────────────────────────────────────────────
      const GENERIC_REGISTRATION_RESPONSE: ApiResponse = {
        success: true,
        message: 'If your email is valid, you will receive a verification email shortly.',
      };

      // Check for existing user
      const normalizedRegEmail = email.toLowerCase().trim();
      const existing = await query<{
        user_id: string;
        is_email_verified: boolean;
        email_token_expires_at: Date | null;
      }>('SELECT user_id, is_email_verified, email_token_expires_at FROM users WHERE email = $1', [
        normalizedRegEmail,
      ]);

      if (existing.rows[0]) {
        const existingUser = existing.rows[0];

        // P1-W6-005 FIX: Timing equalization — bcrypt hash to match new-user path latency.
        // Without this, existing emails return in ~5-50ms while new users take ~350ms
        // (bcrypt.hash with 12 rounds). Attackers measure latency to enumerate valid
        // emails (CWE-208). Parity with login route's dummy bcrypt at L430.
        await bcrypt.hash('timing_equalization_padding', BCRYPT_SALT_ROUNDS);

        // PLT-AUD-009 FIX: The "Black Hole" Trap
        // If a user registers, doesn't verify, and tries to register again days later,
        // the system used to return GENERIC_REGISTRATION_RESPONSE but NEVER sent an email,
        // leaving the user permanently stuck. We now silently treat this as a "resend" request.
        if (!existingUser.is_email_verified) {
          let shouldSend = true;

          // Apply cooldown to prevent email bombing via /register endpoint
          if (existingUser.email_token_expires_at) {
            const tokenCreatedAt = new Date(existingUser.email_token_expires_at);
            tokenCreatedAt.setHours(tokenCreatedAt.getHours() - VERIFICATION_TOKEN_EXPIRY_HOURS);
            const secondsSinceLastSend = (Date.now() - tokenCreatedAt.getTime()) / 1000;
            if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
              shouldSend = false;
            }
          }

          if (shouldSend) {
            const verificationToken = crypto.randomUUID();
            const tokenExpiry = new Date();
            tokenExpiry.setHours(tokenExpiry.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

            await query(
              `UPDATE users SET email_verification_token = $1, email_token_expires_at = $2, updated_at = NOW() WHERE user_id = $3`,
              [hashToken(verificationToken), tokenExpiry, existingUser.user_id],
            );

            const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
            // P1-W5-001 FIX: Include email so verify-email page pre-fills the Sign In link.
            const verificationUrl = `${baseUrl}/verify-email.html?token=${verificationToken}&email=${encodeURIComponent(normalizedRegEmail)}`;
            enqueueVerificationEmail(normalizedRegEmail, verificationUrl, getEmailLocale(req), {
              sourceAction: 'register_resend',
              sourceUserId: existingUser.user_id,
            });
          }
        }

        // SEC-FT-002 + PLT-AUD-001: Identical response — no enumeration leak
        res.status(200).json(GENERIC_REGISTRATION_RESPONSE);
        return;
      }

      // Hash password with bcrypt
      const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

      // Generate email verification token
      const verificationToken = crypto.randomUUID();
      const tokenExpiry = new Date();
      tokenExpiry.setHours(tokenExpiry.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

      // Create user with verification token
      // P0-W5-003 FIX: ON CONFLICT (email) DO NOTHING defends against TOCTOU race condition.
      // Without this, two concurrent registrations for the same email could both pass the
      // SELECT check (line ~241) and both reach INSERT. The second INSERT either creates
      // a duplicate (no UNIQUE constraint) or throws a 500 (with UNIQUE constraint).
      // With ON CONFLICT, the second INSERT silently returns no rows → generic response.
      // Standard: CWE-362 (TOCTOU Race Condition), SEC-FT-002 (Anti-Enumeration).
      const result = await query<
        Pick<User, 'user_id' | 'email' | 'full_name' | 'role' | 'is_active' | 'is_email_verified'>
      >(
        `INSERT INTO users (email, password_hash, full_name, role, phone, is_active, is_email_verified, email_verification_token, email_token_expires_at)
                 VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, $6, $7)
                 ON CONFLICT (email) DO NOTHING
                 RETURNING user_id, email, full_name, role, is_active, is_email_verified`,
        [
          normalizedRegEmail,
          password_hash,
          full_name.trim(),
          role,
          phone ?? null,
          hashToken(verificationToken),
          tokenExpiry,
        ],
      );

      const user = result.rows[0];
      if (!user) {
        // P0-W5-003: Email was taken between SELECT check and INSERT (race condition).
        // Return the same generic response to prevent enumeration.
        res.status(200).json(GENERIC_REGISTRATION_RESPONSE);
        return;
      }

      // UNIFIED-ROLES: Auto-assign ALL 5 roles to every new user.
      // This eliminates role switching — users see all features immediately.
      // Each role gets status='active'. homeowner is the primary role.
      await query(
        `INSERT INTO user_roles (user_id, role_id, status, is_primary)
                 SELECT $1, r.role_id, 'active', (r.role_name = 'homeowner')
                 FROM roles r WHERE r.role_name = ANY($2::text[])
                 ON CONFLICT (user_id, role_id) DO NOTHING`,
        [user.user_id, AUTO_ASSIGN_ROLES],
      );

      // Create ALL role-specific profiles at registration
      // This ensures no "profile not found" errors when accessing any feature.
      const profileTables = [
        'homeowner_profiles',
        'engineer_profiles',
        'contractor_profiles',
        'supplier_profiles',
        'tradesperson_profiles',
      ] as const;
      for (const table of profileTables) {
        await query(`INSERT INTO ${table} (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [
          user.user_id,
        ]);
      }

      // Send verification email (fire-and-forget, never blocks registration)
      // PLT-AUD-006 FIX: Link points to frontend verify-email page, NOT the raw API.
      // The frontend page calls the API and displays a user-friendly result.
      const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
      // P1-W5-001 FIX: Include email so verify-email page pre-fills the Sign In link.
      const verificationUrl = `${baseUrl}/verify-email.html?token=${verificationToken}&email=${encodeURIComponent(user.email)}`;
      enqueueVerificationEmail(user.email, verificationUrl, getEmailLocale(req), {
        sourceAction: 'register',
        sourceUserId: user.user_id,
      });

      // PLT-AUD-001 FIX: Return IDENTICAL response for new and existing emails.
      // No JWT, no user data — the response is indistinguishable from the
      // existing-email path above.
      res.status(200).json(GENERIC_REGISTRATION_RESPONSE);
    } catch (error) {
      safeRouteError(res, error, 'Auth.Register');
    }
  },
);

// ─── POST /api/auth/login ───────────────────────────────────────────────────
// P0-W12-003 FIX: Added loginLimiter (defined at L142).
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    // P0-W6-001 FIX: Wire Zod validation for login input.
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: email, password',
      } as ApiResponse);
      return;
    }
    const { email, password, remember } = parsed.data;

    // Find user by email
    const normalizedEmail = email.toLowerCase().trim();

    const result = await query<
      Pick<
        User,
        | 'user_id'
        | 'email'
        | 'full_name'
        | 'role'
        | 'is_active'
        | 'is_email_verified'
        | 'password_hash'
        | 'mfa_enabled'
        | 'deleted_at'
        | 'deletion_scheduled_at'
      >
    >(
      'SELECT user_id, email, full_name, role, is_active, is_email_verified, password_hash, mfa_enabled, deleted_at, deletion_scheduled_at FROM users WHERE email = $1',
      [normalizedEmail],
    );

    const user = result.rows[0];
    if (!user) {
      // P0-W5-001 FIX: Constant-time defense against timing side-channel (CWE-208).
      // Without this dummy bcrypt call, non-existent emails return in ~2ms
      // while existing emails take ~250ms (bcrypt hash comparison with
      // BCRYPT_SALT_ROUNDS=12). Attackers measure response latency to
      // enumerate valid emails, completely bypassing the generic error message.
      // This dummy hash was pre-generated with the same salt rounds as production.
      // Standard: OWASP ASVS 2.2.1, CWE-208 (Observable Timing Discrepancy).
      await bcrypt.compare(password, '$2b$12$LJ3m4ys3Lf0Xg0EB8OQHZeK1QHW4QDpvzGIkPjEGLzJRAeSbVMCq');
      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      } as ApiResponse);
      return;
    }

    // SEC-002 + RED TEAM FIX: Independent check for IP and Email lockouts
    // Splitting Email and IP trackers mitigates the rotating-proxy loop-hole.
    const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const emailScope = `email::${normalizedEmail}`;
    const ipScope = `ip::${clientIp}`;

    const checkLockout = async (scope: string) => {
      const res = await query<{ failed_attempts: number; locked_until: Date | null }>(
        `SELECT
                        COALESCE((
                            SELECT COUNT(*) FROM audit_trail
                            WHERE entity_type = 'auth_failure'
                              AND entity_id = $1
                              AND created_at > NOW() - MAKE_INTERVAL(mins => $2)
                        ), 0)::int AS failed_attempts,
                        (
                            SELECT created_at + MAKE_INTERVAL(mins => $2)
                            FROM audit_trail
                            WHERE entity_type = 'auth_lockout'
                              AND entity_id = $1
                              AND created_at > NOW() - MAKE_INTERVAL(mins => $2)
                            ORDER BY created_at DESC LIMIT 1
                        ) AS locked_until`,
        [scope, LOCKOUT_DURATION_MINUTES],
      );
      return res.rows[0];
    };

    const [emailLockout, ipLockout] = await Promise.all([
      checkLockout(emailScope),
      checkLockout(ipScope),
    ]);

    const activeLockout = [emailLockout, ipLockout].find(
      (l) => l?.locked_until && new Date(l.locked_until) > new Date(),
    );

    if (activeLockout?.locked_until) {
      const minutesLeft = Math.ceil(
        (new Date(activeLockout.locked_until).getTime() - Date.now()) / 60_000,
      );
      res.status(429).json({
        success: false,
        error: `Account temporarily locked. Try again in ${minutesLeft} minute(s).`,
      } as ApiResponse);
      return;
    }

    // ── Social-Only Account Guard (Migration 042) ──────────────────────
    // Users who registered via Google/Apple/Facebook have no password_hash.
    // Attempting bcrypt.compare(password, null) would throw. Instead,
    // return a clear error telling the user to use their social provider.
    if (!user.password_hash) {
      // Look up which social provider they used
      const oauthResult = await query<{ provider: string }>(
        'SELECT provider FROM oauth_providers WHERE user_id = $1 LIMIT 1',
        [user.user_id],
      );
      const providerName = oauthResult.rows[0]?.provider ?? 'social';
      const providerDisplay: Record<string, string> = {
        google: 'Google',
        apple: 'Apple',
        facebook: 'Facebook',
      };
      const displayName = providerDisplay[providerName] ?? providerName;

      res.status(401).json({
        success: false,
        error: `This account uses ${displayName} sign-in. Please use ${displayName} to log in.`,
        code: 'SOCIAL_ONLY_ACCOUNT',
      } as ApiResponse);
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      // Independent failure logging and lockout handling
      const recordFailureAndLockIfOverLimit = async (scope: string, currentAttempts: number) => {
        await query(
          `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                         VALUES ('login_failed', 'auth_failure', $1, NULL, $2)`,
          [
            scope,
            JSON.stringify({
              email: normalizedEmail,
              ip: clientIp,
              timestamp: new Date().toISOString(),
            }),
          ],
        );
        const newCount = currentAttempts + 1;
        if (newCount >= MAX_FAILED_ATTEMPTS) {
          await query(
            `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                             VALUES ('account_locked', 'auth_lockout', $1, NULL, $2)`,
            [
              scope,
              JSON.stringify({
                email: normalizedEmail,
                ip: clientIp,
                reason: `${MAX_FAILED_ATTEMPTS} consecutive failed login attempts on ${scope}`,
                duration_minutes: LOCKOUT_DURATION_MINUTES,
              }),
            ],
          );
          logger.warn(`Auth: Scope locked due to failed attempts`, {
            scope,
            maxAttempts: MAX_FAILED_ATTEMPTS,
          });
          // P1-REM-004 FIX: Notify user of account lockout via security alert email.
          // PREVIOUS: Lockout only logged to audit_trail + console — the legitimate
          // account owner was never informed that someone was brute-forcing their account.
          // Standard: NIST SP 800-63B (Lockout Notification), OWASP ASVS 2.2.1.
          enqueueSecurityAlertEmail(
            normalizedEmail,
            getEmailLocale(req) === 'ar' ? 'تم قفل حسابك مؤقتاً' : 'Account Temporarily Locked',
            getEmailLocale(req) === 'ar'
              ? `تم قفل حسابك مؤقتاً بسبب ${MAX_FAILED_ATTEMPTS} محاولات تسجيل دخول فاشلة متتالية. سيتم فتح الحساب تلقائياً بعد ${LOCKOUT_DURATION_MINUTES} دقيقة. إذا لم تكن أنت من حاول تسجيل الدخول، يُرجى تغيير كلمة المرور فوراً.`
              : `Your account has been temporarily locked after ${MAX_FAILED_ATTEMPTS} consecutive failed login attempts. It will automatically unlock after ${LOCKOUT_DURATION_MINUTES} minutes. If this was not you, please change your password immediately.`,
            clientIp,
            getEmailLocale(req),
            { sourceAction: 'lockout' },
          );
        }
      };

      await Promise.all([
        recordFailureAndLockIfOverLimit(emailScope, emailLockout?.failed_attempts ?? 0),
        recordFailureAndLockIfOverLimit(ipScope, ipLockout?.failed_attempts ?? 0),
      ]);

      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      } as ApiResponse);
      return;
    }

    // Login successful — clean up old failure records
    // (No need to delete, they expire naturally via the time window)

    // PLT-MAR11-002 FIX: Reject login for unverified email accounts.
    // The registration path correctly withholds JWT until verification,
    // but without this gate the login path was a bypass. An attacker
    // could register, skip verification, and still access the platform.
    if (!user.is_email_verified) {
      res.status(403).json({
        success: false,
        error:
          'Please verify your email before signing in. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      } as ApiResponse);
      return;
    }

    // Fetch all active roles for multi-role JWT
    // UNIFIED CITIZEN: All users have all roles. primaryRole used for JWT generation.

    // ── MFA Challenge Gate (Migration 046) ─────────────────────────────────
    // If user has MFA enabled, return a short-lived challenge token instead
    // of the real JWT. The frontend must present the TOTP input screen and
    // call /api/auth/mfa/verify with the challenge token + 6-digit code.
    // Standard: NIST SP 800-63B (AAL2), OWASP ASVS v4 §2.8
    if (user.mfa_enabled) {
      const mfaChallengeToken = generateMfaChallengeToken(user.user_id, remember);
      res.json({
        success: true,
        data: {
          mfa_required: true,
          mfa_token: mfaChallengeToken,
        },
      } as ApiResponse);
      return;
    }
    const userRolesResult = await query<{ role_name: string; is_primary: boolean }>(
      `SELECT r.role_name, ur.is_primary FROM user_roles ur
                 JOIN roles r ON r.role_id = ur.role_id
                 WHERE ur.user_id = $1 AND ur.status = 'active'
                 ORDER BY ur.is_primary DESC, r.sort_order`,
      [user.user_id],
    );
    const allRoles = userRolesResult.rows.map((r) => r.role_name);
    // UNIFIED CITIZEN: Use primary role for JWT sub-claim
    const primaryRole = userRolesResult.rows.find((r) => r.is_primary)?.role_name ?? user.role;

    // Generate JWT with all roles — use primaryRole as the active context
    // P0-AUTH-001 FIX: Use 30-day expiry when Remember Me is checked.
    const jwtExpiry = remember ? '30d' : undefined;
    const token = generateToken(
      user.user_id,
      primaryRole,
      allRoles.length > 0 ? allRoles : [user.role],
      jwtExpiry,
    );

    // V1-AUDIT FIX: Set JWT in httpOnly cookie — JS cannot read this token.
    // This neutralizes XSS-based session theft entirely.
    // MOB-AUTH-001: Skip cookie for native mobile clients — they use Bearer tokens.
    const clientPlatform = req.headers['x-platform'] as string | undefined;
    const isMobileClient = clientPlatform === 'ios' || clientPlatform === 'android';

    if (!isMobileClient) {
      res.cookie('nammerha_jwt', token, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        // P0-AUTH-001 FIX: 30-day cookie when Remember Me is checked.
        maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    // MOB-AUTH-001: Mobile clients receive the JWT in the response body
    // because native apps cannot reliably use httpOnly cookies for cross-origin
    // API requests. The token is stored in flutter_secure_storage (AES-encrypted
    // on Android, Keychain on iOS) which provides equivalent security to httpOnly
    // cookies in a native context.
    // Web clients continue to use httpOnly cookies exclusively (NMR-AUD-H001).
    res.json({
      success: true,
      data: {
        user: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          role: primaryRole,
          // UNIFIED CITIZEN: All roles included for client-side feature gating
          roles: allRoles.length > 0 ? allRoles : [user.role],
          is_active: user.is_active,
          is_email_verified: user.is_email_verified,
          // GDPR-047: If account is soft-deleted, include deletion info
          ...(user.deleted_at
            ? {
                deletion_pending: true,
                deletion_scheduled_at: user.deletion_scheduled_at?.toISOString?.() ?? null,
              }
            : {}),
        },
        // MOB-AUTH-001: Token only included for mobile clients
        ...(isMobileClient ? { token } : {}),
      },
    } as ApiResponse);

    // P0-W10-002 FIX: Log successful login to audit_trail for forensic compliance.
    // PREVIOUS: Only FAILED logins were logged — making it impossible to answer
    // "When did this account last log in?" or "From which IP?".
    // Non-blocking (no await) to avoid slowing the login response.
    // Standard: NIST SP 800-53 AU-3 (Content of Audit Records), ISO 27001 A.12.4.1.
    query(
      `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
       VALUES ('login_success', 'user', $1, $1, $2)`,
      [
        user.user_id,
        JSON.stringify({
          email: user.email,
          ip: clientIp,
          user_agent: req.headers['user-agent'] ?? 'unknown',
          method: 'email',
          remember: remember ?? false,
          platform: clientPlatform ?? 'web',
          timestamp: new Date().toISOString(),
        }),
      ],
    ).catch((err) => {
      // Fire-and-forget: audit failure must NEVER block login
      logger.error('Auth: Failed to log login_success audit', { error: err });
    });
  } catch (error) {
    safeRouteError(res, error, 'Auth.Login');
  }
});

// ─── POST /api/auth/verify-email ────────────────────────────────────────────
// P0-W12-004 FIX: Converted from GET /verify-email/:token to POST /verify-email.
// PREVIOUS: GET with token in URL path was vulnerable to:
//   1. Email client prefetching (Gmail, Outlook pre-fetch GET links)
//   2. CSRF via <img src=".../verify-email/TOKEN"> — no user consent needed
//   3. Token exposure in server access logs, CDN logs, proxy logs (CWE-598)
//   4. Token leakage via Referer header to external resources
// NOW: POST with token in request body — immune to all four attack vectors.
// The email link URL is unchanged (loads verify-email.html page), then JS
// extracts the token and sends POST request — same pattern as reset-password.
// Standard: OWASP ASVS 2.5.2, CWE-598, RFC 7231 §4.3.3.
router.post(
  '/verify-email',
  verifyEmailLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // P0-W12-004: Zod validation replaces inline token.length check.
      const parsed = verifyEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid verification token',
        } as ApiResponse);
        return;
      }
      const { token } = parsed.data;

      // Find user by token and check expiry
      // SEC-PLAT-001: Hash the incoming URL token before DB lookup
      const result = await query<
        Pick<User, 'user_id' | 'email' | 'is_email_verified' | 'email_token_expires_at'>
      >(
        `SELECT user_id, email, is_email_verified, email_token_expires_at
             FROM users WHERE email_verification_token = $1`,
        [hashToken(token)],
      );

      const user = result.rows[0];
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'Verification token not found or already used',
        } as ApiResponse);
        return;
      }

      if (user.is_email_verified) {
        res.json({
          success: true,
          message: 'Email already verified',
        } as ApiResponse);
        return;
      }

      // Check token expiry
      if (user.email_token_expires_at && new Date(user.email_token_expires_at) < new Date()) {
        res.status(410).json({
          success: false,
          error: 'Verification token has expired. Please request a new one.',
        } as ApiResponse);
        return;
      }

      // Verify the email + activate the account + clear the token
      // PLT-AUTH-001 FIX: CRITICAL — previous code set is_email_verified = TRUE
      // but NEVER set is_active = TRUE. This caused requireActive() middleware
      // (used on ALL 20+ route files) to reject every verified user with 403
      // "Account not activated. KYC verification required." — making the
      // entire platform inaccessible to all self-registered users.
      await query(
        `UPDATE users
             SET is_email_verified = TRUE,
                 is_active = TRUE,
                 email_verification_token = NULL,
                 email_token_expires_at = NULL,
                 updated_at = NOW()
             WHERE user_id = $1`,
        [user.user_id],
      );

      logger.info('Auth: Email verified', { userId: user.user_id, email: user.email });

      res.json({
        success: true,
        message: 'Email verified successfully. You can now access all platform features.',
      } as ApiResponse);
    } catch (error) {
      safeRouteError(res, error, 'Auth.VerifyEmail');
    }
  },
);

// ─── POST /api/auth/resend-verification ─────────────────────────────────────
// PLT-AUTH-002 FIX: Removed authMiddleware — unverified users cannot login
// (blocked by the is_email_verified gate at L322), which created an inescapable
// dead-end: can't login → can't resend verification → can't verify → can't login.
// Now accepts email in body and does its own user lookup with rate limiting.
router.post(
  '/resend-verification',
  sensitiveActionLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // P0-W6-001 FIX: Wire Zod validation for resend-verification.
      const parsed = resendVerificationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Email is required',
        } as ApiResponse);
        return;
      }
      const { email } = parsed.data;

      // Anti-enumeration: always return success regardless of outcome
      const GENERIC_RESPONSE: ApiResponse = {
        success: true,
        message:
          'If your email is registered and unverified, a new verification link has been sent.',
      };

      const normalizedEmail = email.toLowerCase().trim();

      // Find user by email
      const result = await query<
        Pick<User, 'user_id' | 'email' | 'is_email_verified' | 'email_token_expires_at'>
      >(
        'SELECT user_id, email, is_email_verified, email_token_expires_at FROM users WHERE email = $1',
        [normalizedEmail],
      );
      const user = result.rows[0];

      // If user not found or already verified, return generic response (anti-enumeration)
      if (!user || user.is_email_verified) {
        res.json(GENERIC_RESPONSE);
        return;
      }

      // Rate limit: check if last token was generated less than RESEND_COOLDOWN_SECONDS ago
      if (user.email_token_expires_at) {
        const tokenCreatedAt = new Date(user.email_token_expires_at);
        tokenCreatedAt.setHours(tokenCreatedAt.getHours() - VERIFICATION_TOKEN_EXPIRY_HOURS);
        const secondsSinceLastSend = (Date.now() - tokenCreatedAt.getTime()) / 1000;
        if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
          const waitSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLastSend);
          // P2-W5-001: Removed locale ternary — clients translate via i18n.
          res.status(429).json({
            success: false,
            error: `Please wait ${waitSeconds} seconds before requesting another verification email`,
          } as ApiResponse);
          return;
        }
      }

      // Generate new token
      const newToken = crypto.randomUUID();
      const tokenExpiry = new Date();
      tokenExpiry.setHours(tokenExpiry.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

      await query(
        `UPDATE users SET email_verification_token = $1, email_token_expires_at = $2, updated_at = NOW()
                 WHERE user_id = $3`,
        [hashToken(newToken), tokenExpiry, user.user_id],
      );

      // Send verification email
      // PLT-AUD-006 FIX: Point to frontend page, not raw API endpoint
      const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
      // P1-W5-001 FIX: Include email so verify-email page pre-fills the Sign In link.
      const verificationUrl = `${baseUrl}/verify-email.html?token=${newToken}&email=${encodeURIComponent(user.email)}`;
      enqueueVerificationEmail(user.email, verificationUrl, getEmailLocale(req), {
        sourceAction: 'resend_verification',
        sourceUserId: user.user_id,
      });

      res.json(GENERIC_RESPONSE);
    } catch (error) {
      safeRouteError(res, error, 'Auth.ResendVerification');
    }
  },
);

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────
router.post(
  '/forgot-password',
  sensitiveActionLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // P0-W6-001 FIX: Wire Zod validation for forgot-password.
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Email is required',
        } as ApiResponse);
        return;
      }
      const { email } = parsed.data;

      // ALWAYS return success to prevent email enumeration (SEC-009)
      const successResponse = {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      } as ApiResponse;

      const normalizedEmail = email.toLowerCase().trim();

      // BUG-010 FIX: RFC 5321 max email length.
      if (normalizedEmail.length > MAX_EMAIL_LENGTH) {
        res.json(successResponse);
        return;
      }

      // W3-P1-007 FIX: Also select is_email_verified so we can redirect
      // unverified users to the verification flow instead of password reset.
      // P0-W11-004 FIX: Also select password_hash to detect social-only accounts.
      // P2-W12-005 FIX: Also select email_token_expires_at for cooldown check.
      // P2-W15-005 FIX: Also select reset_token_expires_at for reset cooldown check.
      const result = await query<
        Pick<
          User,
          | 'user_id'
          | 'email'
          | 'is_email_verified'
          | 'password_hash'
          | 'email_token_expires_at'
          | 'reset_token_expires_at'
        >
      >(
        'SELECT user_id, email, is_email_verified, password_hash, email_token_expires_at, reset_token_expires_at FROM users WHERE email = $1',
        [normalizedEmail],
      );

      const user = result.rows[0];
      if (!user) {
        // Return same success response to prevent enumeration
        res.json(successResponse);
        return;
      }

      // W3-P1-007 FIX: If the user hasn't verified their email, sending a
      // password reset link is misleading — they'd reset their password but
      // still be blocked by the is_email_verified gate at login (L583).
      // Instead, send them a fresh verification email. The response stays
      // identical (anti-enumeration).
      if (!user.is_email_verified) {
        // P2-W12-005 FIX: Apply same cooldown as /resend-verification (L788-801).
        // PREVIOUS: No cooldown — attacker could spam forgot-password every second
        // for an unverified email, generating unlimited verification emails.
        // Each call replaced the previous token, invalidating earlier email links.
        // NOW: Same RESEND_COOLDOWN_SECONDS check. Anti-enumeration response
        // preserved during cooldown (returns 200 successResponse, not 429).
        // Standard: OWASP Rate Limiting, Anti-Abuse, Parity with /resend-verification.
        if (user.email_token_expires_at) {
          const tokenCreatedAt = new Date(user.email_token_expires_at);
          tokenCreatedAt.setHours(tokenCreatedAt.getHours() - VERIFICATION_TOKEN_EXPIRY_HOURS);
          const secondsSinceLastSend = (Date.now() - tokenCreatedAt.getTime()) / 1000;
          if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
            // Silent anti-enumeration: return success without sending another email
            logger.info('Auth: Forgot-password unverified cooldown active', {
              email: normalizedEmail,
              secondsSinceLastSend: Math.round(secondsSinceLastSend),
            });
            res.json(successResponse);
            return;
          }
        }

        const verificationToken = crypto.randomUUID();
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

        await query(
          `UPDATE users SET email_verification_token = $1, email_token_expires_at = $2, updated_at = NOW()
               WHERE user_id = $3`,
          [hashToken(verificationToken), tokenExpiry, user.user_id],
        );

        const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
        // P1-W5-001 FIX: Include email so verify-email page pre-fills the Sign In link.
        const verificationUrl = `${baseUrl}/verify-email.html?token=${verificationToken}&email=${encodeURIComponent(user.email)}`;
        enqueueVerificationEmail(user.email, verificationUrl, getEmailLocale(req), {
          sourceAction: 'forgot_password_unverified',
          sourceUserId: user.user_id,
        });

        logger.info('Auth: Unverified user hit forgot-password, sent verification instead', {
          email: normalizedEmail,
        });
        res.json(successResponse);
        return;
      }

      // P0-W11-004 FIX: Social-only account guard.
      // PREVIOUS: Social-only users (Google/Apple/Facebook) who clicked "Forgot Password?"
      // received a legitimate password reset link. Clicking it set a password, silently
      // creating dual-auth (social + email/password) without any warning.
      // NOW: Send a helpful security alert email instead — tells the user their account
      // uses social login (Google/Apple/Facebook) and guides them to use that method.
      // Anti-enumeration response stays identical.
      // Standard: OWASP Session Management, Nielsen #5 (Error Prevention).
      if (!user.password_hash) {
        enqueueSecurityAlertEmail(
          user.email,
          'Password Reset Attempt — Social Account',
          'Someone attempted to reset the password for your account. Your account uses social login (Google/Apple/Facebook) — you do not have a password to reset. If you did not make this request, no action is needed. To sign in, use the same social login method you used to create your account.',
          req.ip ?? 'unknown',
          getEmailLocale(req),
          {
            sourceAction: 'forgot_password_social_only',
            sourceUserId: user.user_id,
          },
        );
        logger.info('Auth: Social-only user hit forgot-password, sent social login guidance', {
          email: normalizedEmail,
        });
        res.json(successResponse);
        return;
      }

      // P2-W15-005 FIX: Token-generation cooldown for verified users.
      // PREVIOUS: No cooldown — attacker could spam /forgot-password every second,
      // invalidating the victim's legitimate reset link. Each call generates a new
      // token, making the previous email link useless. While sensitiveActionLimiter
      // throttles per IP, rotating proxies bypass it.
      // NOW: Same backwards-math cooldown as /resend-verification (L829-841).
      // Anti-enumeration response preserved during cooldown.
      // Standard: OWASP Rate Limiting, Anti-Abuse, CWE-799 (Improper Control of Interaction Frequency).
      if (user.reset_token_expires_at) {
        const tokenCreatedAt = new Date(user.reset_token_expires_at);
        tokenCreatedAt.setMinutes(tokenCreatedAt.getMinutes() - RESET_TOKEN_EXPIRY_MINUTES);
        const secondsSinceLastSend = (Date.now() - tokenCreatedAt.getTime()) / 1000;
        if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
          // Silent anti-enumeration: return success without generating a new token
          logger.info('Auth: Forgot-password verified cooldown active', {
            email: normalizedEmail,
            secondsSinceLastSend: Math.round(secondsSinceLastSend),
          });
          res.json(successResponse);
          return;
        }
      }

      // Generate cryptographically secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date();
      tokenExpiry.setMinutes(tokenExpiry.getMinutes() + RESET_TOKEN_EXPIRY_MINUTES);

      await query(
        `UPDATE users SET password_reset_token = $1, reset_token_expires_at = $2, updated_at = NOW()
             WHERE user_id = $3`,
        [hashToken(resetToken), tokenExpiry, user.user_id],
      );

      // Send reset email
      const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
      // P0-W11-006 FIX: Include email in reset URL for post-reset login pre-fill.
      // PREVIOUS: Reset URL had no email param. After successful reset, the redirect
      // to auth.html relied on API response data. If the response was interrupted
      // (common on Syria 2G), the fallback chain had no email to pre-fill.
      // NOW: Same pattern as verification URL (L895) — email in URL as fallback.
      // Standard: Nielsen #6 (Recognition Over Recall), Defense-in-Depth.
      const resetUrl = `${baseUrl}/reset-password.html?token=${resetToken}&email=${encodeURIComponent(user.email)}`;
      enqueuePasswordResetEmail(user.email, resetUrl, getEmailLocale(req), {
        sourceAction: 'forgot_password',
        sourceUserId: user.user_id,
      });

      logger.info('Auth: Password reset requested', { email: normalizedEmail });
      res.json(successResponse);
    } catch (error) {
      safeRouteError(res, error, 'Auth.ForgotPassword');
    }
  },
);

// ─── POST /api/auth/reset-password ──────────────────────────────────────────
router.post(
  '/reset-password',
  sensitiveActionLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // P0-W6-001 FIX: Wire Zod validation for reset-password.
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message ?? 'Token and new password are required';
        res.status(400).json({
          success: false,
          error: firstError,
        } as ApiResponse);
        return;
      }
      const { token, new_password } = parsed.data;

      // P1-W13-006 FIX: Atomic token consumption using UPDATE...RETURNING.
      // PREVIOUS: SELECT user by hashed token (L1017) → check expiry (L1034) →
      // UPDATE to clear token (L1068). Between SELECT and UPDATE, a concurrent
      // request with the same token could pass the SELECT check (TOCTOU race).
      // NOW: Single UPDATE atomically claims the token AND returns user data.
      // If no rows returned, the token was already consumed, expired, or invalid.
      // Standard: OWASP ASVS 2.1.7, CWE-367 (TOCTOU Race Condition Prevention).
      const claimResult = await query<Pick<User, 'user_id' | 'email' | 'password_hash'>>(
        `UPDATE users
             SET password_reset_token = NULL,
                 reset_token_expires_at = NULL
             WHERE password_reset_token = $1
               AND (reset_token_expires_at IS NULL OR reset_token_expires_at > NOW())
             RETURNING user_id, email, password_hash`,
        [hashToken(token)],
      );

      const user = claimResult.rows[0];
      if (!user) {
        // Token was invalid, already consumed, or expired.
        // We don't distinguish these to prevent information leakage.
        res.status(400).json({
          success: false,
          error: 'Invalid or expired reset token',
        } as ApiResponse);
        return;
      }

      // P0-W14-003: Password-reuse check REMOVED (was P2-W6-010).
      // PREVIOUS: Compared new_password against old hash via bcrypt.compare().
      // If match, returned 400 "must be different" — but the token was ALREADY
      // consumed by the atomic UPDATE...RETURNING above (L1062-1070).
      // This trapped the user: they had to request a brand new reset email,
      // wait for delivery (5-15 min on Syrian ISPs), and click the new link.
      //
      // NIST SP 800-63B §5.1.1.2 explicitly recommends NOT enforcing password
      // history checks on resets — only on change-password (authenticated).
      // Password-reuse IS still enforced on POST /api/auth/change-password.
      //
      // Standard: NIST SP 800-63B, Nielsen #5 (Error Prevention),
      // OWASP ASVS 2.1.7 (single-use tokens must not trap users).

      // Hash new password and invalidate all existing JWTs.
      // MED-001 FIX: Setting token_invalidated_at = NOW() causes the auth
      // middleware to reject any JWT issued before this moment.
      const password_hash = await bcrypt.hash(new_password, BCRYPT_SALT_ROUNDS);
      await query(
        `UPDATE users
             SET password_hash = $1,
                 token_invalidated_at = NOW(),
                 updated_at = NOW()
             WHERE user_id = $2`,
        [password_hash, user.user_id],
      );

      // Log security event
      await query(
        `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
             VALUES ('password_reset_completed', 'user', $1, $1, $2)`,
        [
          user.user_id,
          JSON.stringify({
            email: user.email,
            timestamp: new Date().toISOString(),
          }),
        ],
      );

      logger.info('Auth: Password reset completed', { userId: user.user_id });

      // V-012 FIX: Notify user of password reset via security alert email.
      // PREVIOUS: Password resets were silent — if an attacker obtained the reset
      // token (e.g., via email account compromise), the real user would not know
      // their password was reset until their next login attempt.
      // Standard: NIST SP 800-63B (Password Reset Notification), OWASP ASVS 2.3.1.
      const resetIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      enqueueSecurityAlertEmail(
        user.email,
        getEmailLocale(req) === 'ar' ? 'تم إعادة تعيين كلمة المرور' : 'Password Reset',
        getEmailLocale(req) === 'ar'
          ? 'تم إعادة تعيين كلمة المرور الخاصة بحسابك في نمّرها بنجاح. إذا لم تطلب هذا الإجراء، يُرجى التواصل مع الدعم فوراً.'
          : 'The password for your Nammerha account has been successfully reset. If you did not request this, please contact support immediately.',
        resetIp,
        getEmailLocale(req),
        { sourceAction: 'reset_password', sourceUserId: user.user_id },
      );

      // P0-DEEP-002 FIX: Include user email in response so the frontend can
      // pre-fill the login form after redirect. Without this, the reset-password
      // page's redirect to auth.html always sends an empty ?email= param because
      // requestEmailInput is only populated when the token is missing/expired.
      // Standard: Nielsen #6 (Recognition Over Recall), Zero Re-entry Friction.
      res.json({
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.',
        data: { email: user.email },
      } as ApiResponse);
    } catch (error) {
      safeRouteError(res, error, 'Auth.ResetPassword');
    }
  },
);

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
// V1-AUDIT FIX: Server-side cookie clearance + NMR-AUD-M004 FIX: Token invalidation.
//
// Two-layer defense:
//   1. Set token_invalidated_at = NOW() in the database (invalidates any
//      already-captured or in-flight JWT tokens immediately)
//   2. Clear the httpOnly cookie (prevents future browser-sent requests)
//
// IMPORTANT: This route does NOT use authMiddleware. If the JWT is expired or
// malformed, authMiddleware would return 401 and the cookie would never be
// cleared — trapping the user in a logout loop. Instead, we use "soft auth":
// attempt to extract the user_id from the token, but always clear the cookie
// regardless of whether the token is valid.
// W3-P3-003 FIX: Rate-limit logout to prevent token-invalidation DoS.
// V-005 FIX: Uses separate logoutLimiter — no longer shares quota with
// change-password/forgot-password.
router.post('/logout', logoutLimiter, async (req: Request, res: Response): Promise<void> => {
  // NMR-AUD-M004 FIX: Soft-auth token invalidation.
  // Try to decode the JWT to get the user_id and invalidate all their tokens.
  // If decode fails (expired, malformed, etc.), we still proceed to clear the cookie.
  // P0-W6-002 FIX: Use jwt.verify() to prevent forged JWTs from triggering
  // token_invalidated_at on arbitrary users (DoS via unsigned decode).
  // Previous: jwt.decode() without verification — a crafted JWT with any
  // `sub` claim could force-logout any user via DB write.
  // Now: Only verified tokens trigger DB invalidation. Expired/invalid tokens
  // still get their cookie cleared but do NOT write to DB.
  try {
    const token = req.cookies?.['nammerha_jwt'] as string | undefined;
    if (token) {
      try {
        const jwtSecret = process.env['JWT_SECRET'] ?? '';
        if (jwtSecret) {
          const verified = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as {
            sub?: string;
          };
          const userId = verified.sub;
          if (userId) {
            await query('UPDATE users SET token_invalidated_at = NOW() WHERE user_id = $1', [
              userId,
            ]);
            logger.info('Auth: Token invalidated on logout', { userId });
          }
        }
      } catch {
        // Token expired or invalid — cookie will be cleared below.
        // No DB write for unverifiable tokens (prevents DoS).
        logger.info('Auth: Logout with expired/invalid token — cookie cleared only');
      }
    }
  } catch (err) {
    // Non-fatal: cookie will still be cleared below.
    logger.error('Auth: Failed to process logout', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  res.clearCookie('nammerha_jwt', {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
    path: '/',
  });
  res.json({ success: true, message: 'Logged out successfully' } as ApiResponse);
});

// ─── POST /api/auth/change-password ─────────────────────────────────────────
// Authenticated endpoint: requires valid JWT + current password verification.
// SEC: Rate-limited via sensitiveActionLimiter (5 req / 15 min per IP).
// SEC: bcrypt.compare verifies current password before accepting new one.
// SEC: token_invalidated_at = NOW() revokes ALL other sessions.
// SEC: Fresh JWT cookie reissued so current session survives.
// AUDIT: Logged in audit_trail for forensic compliance.
router.post(
  '/change-password',
  authMiddleware,
  sensitiveActionLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getAuthUser(req).user_id;
      // P0-W6-001 FIX: Wire Zod validation for change-password.
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError =
          parsed.error.issues[0]?.message ?? 'Current password and new password are required';
        res.status(400).json({
          success: false,
          error: firstError,
        } as ApiResponse);
        return;
      }
      const { current_password, new_password, remember } = parsed.data;

      // ── Validation: No password reuse ──────────────────────────
      if (current_password === new_password) {
        res.status(400).json({
          success: false,
          error: 'New password must be different from current password',
        } as ApiResponse);
        return;
      }

      // ── Fetch current password hash from DB ────────────────────
      const userResult = await query<
        Pick<User, 'user_id' | 'email' | 'password_hash' | 'role'> & { roles?: string[] }
      >('SELECT user_id, email, password_hash, role FROM users WHERE user_id = $1', [userId]);

      const user = userResult.rows[0];
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        } as ApiResponse);
        return;
      }

      // ── Social-Only Account Guard (Migration 042) ─────────────
      // Social-only users have no password_hash — they cannot
      // "change" a password that doesn't exist.
      if (!user.password_hash) {
        res.status(400).json({
          success: false,
          error:
            'This account uses social login and does not have a password. Use your social provider to sign in.',
        } as ApiResponse);
        return;
      }

      // ── Verify current password via bcrypt ─────────────────────
      const isCurrentValid = await bcrypt.compare(current_password, user.password_hash);
      if (!isCurrentValid) {
        logger.warn('Auth: Change password — invalid current password', { userId });
        res.status(401).json({
          success: false,
          error: 'Current password is incorrect',
        } as ApiResponse);
        return;
      }

      // ── Hash new password ──────────────────────────────────────
      const newHash = await bcrypt.hash(new_password, BCRYPT_SALT_ROUNDS);

      // ── Update DB: new hash + invalidate all other sessions ────
      // token_invalidated_at = NOW() causes auth middleware to reject
      // any JWT issued before this moment — all other sessions are killed.
      await query(
        `UPDATE users
                 SET password_hash = $1,
                     token_invalidated_at = NOW(),
                     updated_at = NOW()
                 WHERE user_id = $2`,
        [newHash, userId],
      );

      // ── Reissue JWT for current session ────────────────────────
      // Fetch all active roles for the new token
      const rolesResult = await query<{ role_name: string }>(
        `SELECT r.role_name FROM user_roles ur
                 JOIN roles r ON r.role_id = ur.role_id
                 WHERE ur.user_id = $1 AND ur.status = 'active'`,
        [userId],
      );
      const allRoles = rolesResult.rows.map((r) => r.role_name);

      // W3-P3-001 FIX: Use 30-day expiry when `remember` is true,
      // matching the login route's P0-AUTH-001 behavior.
      const jwtExpiry = remember ? '30d' : undefined;
      const token = generateToken(userId, user.role, allRoles, jwtExpiry);
      res.cookie('nammerha_jwt', token, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        // W3-P3-001 FIX: 30-day cookie when remember is true, else 24h default.
        maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
        path: '/',
      });

      // ── Audit trail ────────────────────────────────────────────
      await query(
        `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                 VALUES ('password_changed', 'user', $1, $1, $2)`,
        [
          userId,
          JSON.stringify({
            email: user.email,
            timestamp: new Date().toISOString(),
            method: 'authenticated_change',
          }),
        ],
      );

      logger.info('Auth: Password changed successfully', { userId });

      // V-012 FIX: Notify user of password change via security alert email.
      // PREVIOUS: Password changes were silent — a compromised session could change
      // the password without the real account owner knowing until their next login.
      // Standard: NIST SP 800-63B (Password Change Notification), OWASP ASVS 2.3.1.
      const changeIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const changeLang = getEmailLocale(req);
      enqueueSecurityAlertEmail(
        user.email,
        changeLang === 'ar' ? 'تم تغيير كلمة المرور' : 'Password Changed',
        changeLang === 'ar'
          ? 'تم تغيير كلمة المرور الخاصة بحسابك في نمّرها. إذا لم تقم بهذا الإجراء، يُرجى تأمين حسابك فوراً.'
          : 'The password for your Nammerha account has been changed. If you did not perform this action, please secure your account immediately.',
        changeIp,
        changeLang,
        { sourceAction: 'change_password', sourceUserId: userId },
      );

      res.json({
        success: true,
        message: 'Password changed successfully',
      } as ApiResponse);
    } catch (error) {
      safeRouteError(res, error, 'Auth.ChangePassword');
    }
  },
);

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
// V1-AUDIT FIX: Allows the frontend to check authentication status without
// storing JWT in localStorage. The httpOnly cookie is sent automatically.
// UNIFIED CITIZEN: Returns roles[] — all active roles for the user.
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // UNIFIED CITIZEN: authMiddleware already fetches all roles into req.authUser.roles.
    const authUser = getAuthUser(req);
    const result = await query<
      Pick<User, 'user_id' | 'email' | 'full_name' | 'role' | 'is_active' | 'is_email_verified'>
    >(
      'SELECT user_id, email, full_name, role, is_active, is_email_verified FROM users WHERE user_id = $1',
      [authUser.user_id],
    );
    const user = result.rows[0];
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        user: {
          ...user,
          roles: authUser.roles,
        },
      },
    } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'Auth.Me');
  }
});

// ─── V-005 FIX: Active Session Management ──────────────────────────────────
// Exposes pre-built device-auth.service.ts functions as user-facing endpoints.
// Users can view their active sessions and revoke access per-device or globally.
// Standard: NIST SP 800-63B (Session Management), OWASP Session Management.
// ────────────────────────────────────────────────────────────────────────────

// GET /api/auth/sessions — List all active sessions for the authenticated user
router.get('/sessions', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { getActiveSessions } = await import('../services/device-auth.service');
    const authUser = getAuthUser(req);
    const sessions = await getActiveSessions(authUser.user_id);

    // Enrich with "is_current" flag based on device_id header
    const currentDeviceId = req.headers['x-device-id'] as string | undefined;
    const enriched = sessions.map((s) => ({
      ...s,
      is_current: currentDeviceId ? s.device_id === currentDeviceId : false,
    }));

    res.json({
      success: true,
      data: { sessions: enriched, total: enriched.length },
    } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'Auth.GetSessions');
  }
});

// DELETE /api/auth/sessions/:deviceId — Revoke a specific device session
router.delete(
  '/sessions/:deviceId',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { revokeDeviceTokens } = await import('../services/device-auth.service');
      const authUser = getAuthUser(req);
      const deviceId = String(req.params['deviceId']);

      if (!deviceId) {
        res.status(400).json({
          success: false,
          error: 'Device ID is required',
        } as ApiResponse);
        return;
      }

      const revokedCount = await revokeDeviceTokens(authUser.user_id, deviceId);

      // Audit trail
      await query(
        `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                 VALUES ('session_revoked', 'device_session', $1, $2, $3)`,
        [
          deviceId,
          authUser.user_id,
          JSON.stringify({ device_id: deviceId, revoked_count: revokedCount }),
        ],
      );

      res.json({
        success: true,
        message:
          revokedCount > 0
            ? `Device session revoked (${revokedCount} token(s))`
            : 'No active sessions found for this device',
        data: { revoked_count: revokedCount },
      } as ApiResponse);
    } catch (error) {
      safeRouteError(res, error, 'Auth.RevokeDeviceSession');
    }
  },
);

// DELETE /api/auth/sessions — Nuclear: Revoke ALL sessions (force logout all devices)
router.delete('/sessions', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { revokeAllUserTokens } = await import('../services/device-auth.service');
    const authUser = getAuthUser(req);

    const revokedCount = await revokeAllUserTokens(authUser.user_id, 'user_requested');

    // Audit trail
    await query(
      `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                 VALUES ('all_sessions_revoked', 'user_sessions', $1, $2, $3)`,
      [
        authUser.user_id,
        authUser.user_id,
        JSON.stringify({ revoked_count: revokedCount, reason: 'user_requested' }),
      ],
    );

    // Clear the JWT cookie for the current browser session
    res.clearCookie('nammerha_jwt', {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path: '/',
    });

    res.json({
      success: true,
      message: `All sessions revoked (${revokedCount} token(s)). You will need to log in again.`,
      data: { revoked_count: revokedCount },
    } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'Auth.RevokeAllSessions');
  }
});

export default router;
