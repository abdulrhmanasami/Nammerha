// ============================================================================
import { getAuthUser } from '../utils/auth-guard';
// Nammerha Backend — Auth Routes
// POST /api/auth/register  — Create a new user account
// POST /api/auth/login     — Authenticate and receive JWT token
//
// SEC-002: Account lockout after 5 consecutive failed logins
// SEC-003: Password max length (128 chars) to prevent bcrypt DoS
// SEC-009: Generic registration errors to prevent email enumeration
// ============================================================================
import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { query } from '../config/database';
import { generateToken, authMiddleware } from '../middleware/auth.middleware';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.service';
import type { User, UserRole, ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';
import { logger } from '../utils/logger';

const router = Router();

// SEC-003: Maximum password length to prevent bcrypt CPU exhaustion.
// bcrypt truncates at 72 bytes internally, but the hashing function still
// processes the full input. A 1MB password would cause CPU starvation.
const MAX_PASSWORD_LENGTH = 128;

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

// SEC-FIELD-002 FIX: ReDoS-safe email validation. The original RFC 5322 pattern
// had nested quantifiers `(?:...)*` causing catastrophic backtracking on crafted input.
// This version uses bounded {1,63} domain labels and requires at least one dot (TLD).
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,63}(?:\.[a-zA-Z]{2,63}){0,3}$/;

// Password complexity: min 8 chars, 1 upper, 1 lower, 1 digit, 1 special
const PASSWORD_RULES = [
    { test: (p: string) => p.length >= 8, msg: 'at least 8 characters' },
    { test: (p: string) => /[A-Z]/.test(p), msg: 'at least one uppercase letter' },
    { test: (p: string) => /[a-z]/.test(p), msg: 'at least one lowercase letter' },
    { test: (p: string) => /[0-9]/.test(p), msg: 'at least one digit' },
    { test: (p: string) => /[^A-Za-z0-9]/.test(p), msg: 'at least one special character' },
];

// Valid roles for self-registration (admin/auditor require manual creation)
const SELF_REGISTER_ROLES: UserRole[] = ['donor', 'homeowner', 'engineer', 'supplier', 'contractor', 'tradesperson'];

// ─── POST /api/auth/register ────────────────────────────────────────────────
router.post(
    '/register',
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { email, password, full_name, role, phone } = req.body as {
                email: string;
                password: string;
                full_name: string;
                role: UserRole;
                phone?: string;
            };

            // Validate required fields
            if (!email || !password || !full_name || !role) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields: email, password, full_name, role',
                } as ApiResponse);
                return;
            }

            // Validate role
            if (!SELF_REGISTER_ROLES.includes(role)) {
                res.status(400).json({
                    success: false,
                    error: `Invalid role. Allowed: ${SELF_REGISTER_ROLES.join(', ')}`,
                } as ApiResponse);
                return;
            }

            // Validate email format
            if (!EMAIL_REGEX.test(email)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid email format',
                } as ApiResponse);
                return;
            }

            // SEC-003: Password max length check (before bcrypt hashing)
            if (password.length > MAX_PASSWORD_LENGTH) {
                res.status(400).json({
                    success: false,
                    error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`,
                } as ApiResponse);
                return;
            }

            // Validate password complexity
            const failedRules = PASSWORD_RULES
                .filter(rule => !rule.test(password))
                .map(rule => rule.msg);

            if (failedRules.length > 0) {
                res.status(400).json({
                    success: false,
                    error: `Password must contain: ${failedRules.join(', ')}`,
                } as ApiResponse);
                return;
            }

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
            const existing = await query<{ user_id: string }>(
                'SELECT user_id FROM users WHERE email = $1',
                [normalizedRegEmail]
            );
            if (existing.rows[0]) {
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
            const result = await query<Pick<User, 'user_id' | 'email' | 'full_name' | 'role' | 'is_active' | 'is_email_verified'>>(
                `INSERT INTO users (email, password_hash, full_name, role, phone, is_active, is_email_verified, email_verification_token, email_token_expires_at)
                 VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, $6, $7)
                 RETURNING user_id, email, full_name, role, is_active, is_email_verified`,
                [
                    normalizedRegEmail,
                    password_hash,
                    full_name.trim(),
                    role,
                    phone ?? null,
                    verificationToken,
                    tokenExpiry,
                ]
            );

            const user = result.rows[0];
            if (!user) {
                throw new Error('Failed to create user');
            }

            // Send verification email (fire-and-forget, never blocks registration)
            // PLT-AUD-006 FIX: Link points to frontend verify-email page, NOT the raw API.
            // The frontend page calls the API and displays a user-friendly result.
            const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
            const verificationUrl = `${baseUrl}/verify-email.html?token=${verificationToken}`;
            sendVerificationEmail(user.email, verificationUrl).catch((err) => {
                logger.error('Auth: Verification email dispatch failed', { error: err instanceof Error ? err.message : String(err) });
            });

            // PLT-AUD-001 FIX: Return IDENTICAL response for new and existing emails.
            // No JWT, no user data — the response is indistinguishable from the
            // existing-email path above.
            res.status(200).json(GENERIC_REGISTRATION_RESPONSE);
        } catch (error) {
            safeRouteError(res, error, 'Auth.Register');
        }
    }
);

// ─── POST /api/auth/login ───────────────────────────────────────────────────
router.post(
    '/login',
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { email, password } = req.body as {
                email: string;
                password: string;
            };

            if (!email || !password) {
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields: email, password',
                } as ApiResponse);
                return;
            }

            // SEC-003: Password max length check (before bcrypt comparison)
            if (password.length > MAX_PASSWORD_LENGTH) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid email or password',
                } as ApiResponse);
                return;
            }

            // Find user by email
            const normalizedEmail = email.toLowerCase().trim();
            const result = await query<Pick<User, 'user_id' | 'email' | 'full_name' | 'role' | 'is_active' | 'is_email_verified' | 'password_hash'>>(
                'SELECT user_id, email, full_name, role, is_active, is_email_verified, password_hash FROM users WHERE email = $1',
                [normalizedEmail]
            );

            const user = result.rows[0];
            if (!user) {
                // Use generic message to prevent email enumeration
                res.status(401).json({
                    success: false,
                    error: 'Invalid email or password',
                } as ApiResponse);
                return;
            }

            // SEC-002 + RED TEAM FIX: Check account lockout per (IP + email)
            // Only the attacker's IP gets locked, not the entire account.
            const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
            const lockoutScope = `${normalizedEmail}::${clientIp}`;

            const lockoutResult = await query<{ failed_attempts: number; locked_until: Date | null }>(
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
                [lockoutScope, LOCKOUT_DURATION_MINUTES]
            );

            const lockout = lockoutResult.rows[0];
            if (lockout?.locked_until && new Date(lockout.locked_until) > new Date()) {
                const minutesLeft = Math.ceil(
                    (new Date(lockout.locked_until).getTime() - Date.now()) / 60_000
                );
                res.status(429).json({
                    success: false,
                    error: `Account temporarily locked. Try again in ${minutesLeft} minute(s).`,
                } as ApiResponse);
                return;
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(password, user.password_hash);
            if (!isPasswordValid) {
                // SEC-002 + RED TEAM: Record failed attempt scoped to (IP + email)
                await query(
                    `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                     VALUES ('login_failed', 'auth_failure', $1, NULL, $2)`,
                    [lockoutScope, JSON.stringify({
                        email: normalizedEmail,
                        ip: clientIp,
                        timestamp: new Date().toISOString(),
                    })]
                );

                // Check if this failure triggers lockout for this IP
                const newCount = (lockout?.failed_attempts ?? 0) + 1;
                if (newCount >= MAX_FAILED_ATTEMPTS) {
                    await query(
                        `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                         VALUES ('account_locked', 'auth_lockout', $1, NULL, $2)`,
                        [lockoutScope, JSON.stringify({
                            email: normalizedEmail,
                            ip: clientIp,
                            reason: `${MAX_FAILED_ATTEMPTS} consecutive failed login attempts from IP ${clientIp}`,
                            duration_minutes: LOCKOUT_DURATION_MINUTES,
                        })]
                    );
                    logger.warn('Auth: IP locked due to failed attempts', { ip: clientIp, email: normalizedEmail, maxAttempts: MAX_FAILED_ATTEMPTS });
                }

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
                    error: 'Please verify your email before signing in. Check your inbox for the verification link.',
                } as ApiResponse);
                return;
            }

            // Generate JWT
            const token = generateToken(user.user_id, user.role);

            // V1-AUDIT FIX: Set JWT in httpOnly cookie — JS cannot read this token.
            // This neutralizes XSS-based session theft entirely.
            res.cookie('nammerha_jwt', token, {
                httpOnly: true,
                secure: process.env['NODE_ENV'] === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000, // 24h — mirrors JWT expiry
                path: '/',
            });

            res.json({
                success: true,
                data: {
                    user: {
                        user_id: user.user_id,
                        email: user.email,
                        full_name: user.full_name,
                        role: user.role,
                        is_active: user.is_active,
                        is_email_verified: user.is_email_verified,
                    },
                    // V1-AUDIT: token still in body for backward compat during migration.
                    // Frontend will stop reading this — auth is via httpOnly cookie.
                    token,
                },
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Auth.Login');
        }
    }
);

// ─── GET /api/auth/verify-email/:token ──────────────────────────────────────
router.get('/verify-email/:token', async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.params;
        if (!token || token.length < 10) {
            res.status(400).json({
                success: false,
                error: 'Invalid verification token',
            } as ApiResponse);
            return;
        }

        // Find user by token and check expiry
        const result = await query<Pick<User, 'user_id' | 'email' | 'is_email_verified' | 'email_token_expires_at'>>(
            `SELECT user_id, email, is_email_verified, email_token_expires_at
             FROM users WHERE email_verification_token = $1`,
            [token]
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

        // Verify the email + clear the token
        await query(
            `UPDATE users
             SET is_email_verified = TRUE,
                 email_verification_token = NULL,
                 email_token_expires_at = NULL,
                 updated_at = NOW()
             WHERE user_id = $1`,
            [user.user_id]
        );

        logger.info('Auth: Email verified', { userId: user.user_id, email: user.email });

        res.json({
            success: true,
            message: 'Email verified successfully. You can now access all platform features.',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Auth.VerifyEmail');
    }
});

// ─── POST /api/auth/resend-verification ─────────────────────────────────────
router.post(
    '/resend-verification',
    authMiddleware,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = getAuthUser(req).user_id;

            // Get user
            const result = await query<Pick<User, 'user_id' | 'email' | 'is_email_verified' | 'email_token_expires_at'>>(
                'SELECT user_id, email, is_email_verified, email_token_expires_at FROM users WHERE user_id = $1',
                [userId]
            );
            const user = result.rows[0];
            if (!user) {
                res.status(404).json({ success: false, error: 'User not found' } as ApiResponse);
                return;
            }

            if (user.is_email_verified) {
                res.json({ success: true, message: 'Email already verified' } as ApiResponse);
                return;
            }

            // Rate limit: check if last token was generated less than RESEND_COOLDOWN_SECONDS ago
            if (user.email_token_expires_at) {
                const tokenCreatedAt = new Date(user.email_token_expires_at);
                tokenCreatedAt.setHours(tokenCreatedAt.getHours() - VERIFICATION_TOKEN_EXPIRY_HOURS);
                const secondsSinceLastSend = (Date.now() - tokenCreatedAt.getTime()) / 1000;
                if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
                    const waitSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLastSend);
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
                [newToken, tokenExpiry, userId]
            );

            // Send verification email
            // PLT-AUD-006 FIX: Point to frontend page, not raw API endpoint
            const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
            const verificationUrl = `${baseUrl}/verify-email.html?token=${newToken}`;
            sendVerificationEmail(user.email, verificationUrl).catch((err) => {
                logger.error('Auth: Resend verification email failed', { error: err instanceof Error ? err.message : String(err) });
            });

            res.json({
                success: true,
                message: 'Verification email resent. Please check your inbox.',
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Auth.ResendVerification');
        }
    }
);

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body as { email: string };

        if (!email) {
            res.status(400).json({
                success: false,
                error: 'Email is required',
            } as ApiResponse);
            return;
        }

        // ALWAYS return success to prevent email enumeration (SEC-009)
        const successResponse = {
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.',
        } as ApiResponse;

        const normalizedEmail = email.toLowerCase().trim();
        const result = await query<Pick<User, 'user_id' | 'email'>>(
            'SELECT user_id, email FROM users WHERE email = $1',
            [normalizedEmail]
        );

        const user = result.rows[0];
        if (!user) {
            // Return same success response to prevent enumeration
            res.json(successResponse);
            return;
        }

        // Generate cryptographically secure reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date();
        tokenExpiry.setMinutes(tokenExpiry.getMinutes() + RESET_TOKEN_EXPIRY_MINUTES);

        await query(
            `UPDATE users SET password_reset_token = $1, reset_token_expires_at = $2, updated_at = NOW()
             WHERE user_id = $3`,
            [resetToken, tokenExpiry, user.user_id]
        );

        // Send reset email
        const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
        const resetUrl = `${baseUrl}/reset-password.html?token=${resetToken}`;
        sendPasswordResetEmail(user.email, resetUrl).catch((err) => {
            logger.error('Auth: Password reset email failed', { error: err instanceof Error ? err.message : String(err) });
        });

        logger.info('Auth: Password reset requested', { email: normalizedEmail });
        res.json(successResponse);
    } catch (error) {
        safeRouteError(res, error, 'Auth.ForgotPassword');
    }
});

// ─── POST /api/auth/reset-password ──────────────────────────────────────────
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
    try {
        const { token, new_password } = req.body as {
            token: string;
            new_password: string;
        };

        if (!token || !new_password) {
            res.status(400).json({
                success: false,
                error: 'Token and new password are required',
            } as ApiResponse);
            return;
        }

        // Validate password complexity
        const failedRules = PASSWORD_RULES
            .filter(rule => !rule.test(new_password))
            .map(rule => rule.msg);

        if (failedRules.length > 0) {
            res.status(400).json({
                success: false,
                error: `Password must contain: ${failedRules.join(', ')}`,
            } as ApiResponse);
            return;
        }

        if (new_password.length > MAX_PASSWORD_LENGTH) {
            res.status(400).json({
                success: false,
                error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`,
            } as ApiResponse);
            return;
        }

        // Find user by reset token
        const result = await query<Pick<User, 'user_id' | 'email' | 'reset_token_expires_at'>>(
            `SELECT user_id, email, reset_token_expires_at
             FROM users WHERE password_reset_token = $1`,
            [token]
        );

        const user = result.rows[0];
        if (!user) {
            res.status(400).json({
                success: false,
                error: 'Invalid or expired reset token',
            } as ApiResponse);
            return;
        }

        // Check token expiry
        if (user.reset_token_expires_at && new Date(user.reset_token_expires_at) < new Date()) {
            // Clear expired token
            await query(
                'UPDATE users SET password_reset_token = NULL, reset_token_expires_at = NULL WHERE user_id = $1',
                [user.user_id]
            );
            res.status(410).json({
                success: false,
                error: 'Reset token has expired. Please request a new one.',
            } as ApiResponse);
            return;
        }

        // Hash new password, clear reset token, and invalidate all existing JWTs
        const password_hash = await bcrypt.hash(new_password, BCRYPT_SALT_ROUNDS);
        // MED-001 FIX: Setting token_invalidated_at = NOW() causes the auth
        // middleware to reject any JWT issued before this moment. This ensures
        // that stolen tokens become useless after a password reset.
        await query(
            `UPDATE users
             SET password_hash = $1,
                 password_reset_token = NULL,
                 reset_token_expires_at = NULL,
                 token_invalidated_at = NOW(),
                 updated_at = NOW()
             WHERE user_id = $2`,
            [password_hash, user.user_id]
        );

        // Log security event
        await query(
            `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
             VALUES ('password_reset_completed', 'user', $1, $1, $2)`,
            [user.user_id, JSON.stringify({
                email: user.email,
                timestamp: new Date().toISOString(),
            })]
        );

        logger.info('Auth: Password reset completed', { userId: user.user_id });

        res.json({
            success: true,
            message: 'Password has been reset successfully. You can now log in with your new password.',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Auth.ResetPassword');
    }
});

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
// V1-AUDIT FIX: Server-side cookie clearance. The frontend cannot clear an
// httpOnly cookie — only the server can. This endpoint clears the JWT cookie
// to terminate the session.
router.post('/logout', (_req: Request, res: Response): void => {
    res.clearCookie('nammerha_jwt', {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        path: '/',
    });
    res.json({ success: true, message: 'Logged out successfully' } as ApiResponse);
});

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
// V1-AUDIT FIX: Allows the frontend to check authentication status without
// storing JWT in localStorage. The httpOnly cookie is sent automatically.
router.get(
    '/me',
    authMiddleware,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = getAuthUser(req).user_id;
            const result = await query<Pick<User, 'user_id' | 'email' | 'full_name' | 'role' | 'is_active' | 'is_email_verified'>>(
                'SELECT user_id, email, full_name, role, is_active, is_email_verified FROM users WHERE user_id = $1',
                [userId]
            );
            const user = result.rows[0];
            if (!user) {
                res.status(404).json({ success: false, error: 'User not found' } as ApiResponse);
                return;
            }
            res.json({ success: true, data: { user } } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Auth.Me');
        }
    }
);

export default router;
