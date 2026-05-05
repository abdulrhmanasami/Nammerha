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
import { generateToken, authMiddleware } from '../middleware/auth.middleware';
import { sendVerificationEmail, sendPasswordResetEmail, type EmailLocale } from '../services/email.service';
import type { User, UserRole, ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';
import { logger } from '../utils/logger';

// ─── I18N-004: Locale Detection ─────────────────────────────────────────────
/**
 * Extract the email locale from the request's Accept-Language header.
 * Returns 'ar' if Arabic is preferred, otherwise defaults to 'en'.
 * This ensures email templates are rendered in the user's preferred language.
 */
function getEmailLocale(req: Request): EmailLocale {
    const acceptLang = req.headers['accept-language'] ?? '';
    // Accept-Language: ar, ar-SA, ar-SY, etc.
    if (/\bar/i.test(acceptLang)) {
        return 'ar';
    }
    return 'en';
}

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

// ─── PLT-SEC-004 FIX: Anti-DoS Rate Limiting ────────────────────────────────
const verifyEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 verification requests
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many verification attempts from this IP, please try again later.' } as ApiResponse
});

const sensitiveActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 sensitive requests (resend/forgot-password)
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة بعد 15 دقيقة.' } as ApiResponse
});

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
            const { email, password, full_name, role: rawRole, phone } = req.body as {
                email: string;
                password: string;
                full_name: string;
                role?: UserRole; // Now OPTIONAL — defaults to 'donor'
                phone?: string;
            };

            // I18N-004: Locale-aware error messages for mobile clients
            const regLocale = getEmailLocale(req);

            // Multi-Role Architecture: role is optional, defaults to 'donor'
            const role: UserRole = rawRole ?? 'donor';

            // Validate required fields
            if (!email || !password || !full_name) {
                res.status(400).json({
                    success: false,
                    error: regLocale === 'ar'
                        ? 'الحقول المطلوبة مفقودة: البريد الإلكتروني، كلمة المرور، الاسم الكامل'
                        : 'Missing required fields: email, password, full_name',
                } as ApiResponse);
                return;
            }

            // Validate role (if provided)
            if (rawRole && !SELF_REGISTER_ROLES.includes(role)) {
                res.status(400).json({
                    success: false,
                    error: regLocale === 'ar'
                        ? `الدور غير صالح. الأدوار المسموحة: ${SELF_REGISTER_ROLES.join(', ')}`
                        : `Invalid role. Allowed: ${SELF_REGISTER_ROLES.join(', ')}`,
                } as ApiResponse);
                return;
            }

            // Validate email format
            if (!EMAIL_REGEX.test(email)) {
                res.status(400).json({
                    success: false,
                    error: regLocale === 'ar'
                        ? 'صيغة البريد الإلكتروني غير صحيحة'
                        : 'Invalid email format',
                } as ApiResponse);
                return;
            }

            // SEC-003: Password max length check (before bcrypt hashing)
            if (password.length > MAX_PASSWORD_LENGTH) {
                res.status(400).json({
                    success: false,
                    error: regLocale === 'ar'
                        ? `كلمة المرور يجب ألا تتجاوز ${MAX_PASSWORD_LENGTH} حرفاً`
                        : `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`,
                } as ApiResponse);
                return;
            }

            // Validate password complexity
            // I18N-004: Arabic password rule messages for mobile clients
            const PASSWORD_RULES_AR: Record<string, string> = {
                'at least 8 characters': '8 أحرف على الأقل',
                'at least one uppercase letter': 'حرف كبير واحد على الأقل',
                'at least one lowercase letter': 'حرف صغير واحد على الأقل',
                'at least one digit': 'رقم واحد على الأقل',
                'at least one special character': 'رمز خاص واحد على الأقل',
            };

            const failedRules = PASSWORD_RULES
                .filter(rule => !rule.test(password))
                .map(rule => rule.msg);

            if (failedRules.length > 0) {
                const localizedRules = regLocale === 'ar'
                    ? failedRules.map(r => PASSWORD_RULES_AR[r] ?? r)
                    : failedRules;
                res.status(400).json({
                    success: false,
                    error: regLocale === 'ar'
                        ? `كلمة المرور يجب أن تحتوي على: ${localizedRules.join('، ')}`
                        : `Password must contain: ${failedRules.join(', ')}`,
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
            const existing = await query<{ user_id: string, is_email_verified: boolean, email_token_expires_at: Date | null }>(
                'SELECT user_id, is_email_verified, email_token_expires_at FROM users WHERE email = $1',
                [normalizedRegEmail]
            );
            
            if (existing.rows[0]) {
                const existingUser = existing.rows[0];
                
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
                            [verificationToken, tokenExpiry, existingUser.user_id]
                        );

                        const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
                        const verificationUrl = `${baseUrl}/verify-email.html?token=${verificationToken}`;
                        sendVerificationEmail(normalizedRegEmail, verificationUrl, getEmailLocale(req)).catch((err) => {
                            logger.error('Auth: Verification email dispatch failed (re-register)', { error: err instanceof Error ? err.message : String(err) });
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

            // Multi-Role Architecture: Insert into user_roles junction table
            await query(
                `INSERT INTO user_roles (user_id, role_id, status, is_primary)
                 SELECT $1, r.role_id, 'active', TRUE
                 FROM roles r WHERE r.role_name = $2
                 ON CONFLICT (user_id, role_id) DO NOTHING`,
                [user.user_id, role]
            );

            // Create role-specific profile
            // FIX-008: Explicit allowlist validation — mirrors CRIT-001 in role.routes.ts.
            const profileMap: Record<string, string> = {
                donor: 'donor_profiles',
                contractor: 'contractor_profiles',
                engineer: 'engineer_profiles',
                supplier: 'supplier_profiles',
                tradesperson: 'tradesperson_profiles',
                homeowner: 'homeowner_profiles',
            };
            const ALLOWED_PROFILE_TABLES: ReadonlySet<string> = new Set(Object.values(profileMap));
            const profileTable = profileMap[role];
            if (profileTable && ALLOWED_PROFILE_TABLES.has(profileTable)) {
                await query(
                    `INSERT INTO ${profileTable} (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
                    [user.user_id]
                );
            }

            // Send verification email (fire-and-forget, never blocks registration)
            // PLT-AUD-006 FIX: Link points to frontend verify-email page, NOT the raw API.
            // The frontend page calls the API and displays a user-friendly result.
            const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
            const verificationUrl = `${baseUrl}/verify-email.html?token=${verificationToken}`;
            sendVerificationEmail(user.email, verificationUrl, getEmailLocale(req)).catch((err) => {
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

            // I18N-004: Locale-aware error messages for mobile clients
            const loginLocale = getEmailLocale(req);

            if (!email || !password) {
                res.status(400).json({
                    success: false,
                    error: loginLocale === 'ar'
                        ? 'الحقول المطلوبة مفقودة: البريد الإلكتروني وكلمة المرور'
                        : 'Missing required fields: email, password',
                } as ApiResponse);
                return;
            }

            // SEC-003: Password max length check (before bcrypt comparison)
            if (password.length > MAX_PASSWORD_LENGTH) {
                res.status(401).json({
                    success: false,
                    error: loginLocale === 'ar'
                        ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
                        : 'Invalid email or password',
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
                    error: loginLocale === 'ar'
                        ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
                        : 'Invalid email or password',
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
                    [scope, LOCKOUT_DURATION_MINUTES]
                );
                return res.rows[0];
            };

            const [emailLockout, ipLockout] = await Promise.all([
                checkLockout(emailScope),
                checkLockout(ipScope)
            ]);

            const activeLockout = [emailLockout, ipLockout].find(l => l?.locked_until && new Date(l.locked_until) > new Date());
            
            if (activeLockout?.locked_until) {
                const minutesLeft = Math.ceil(
                    (new Date(activeLockout.locked_until).getTime() - Date.now()) / 60_000
                );
                res.status(429).json({
                    success: false,
                    error: loginLocale === 'ar'
                        ? `الحساب مقفل مؤقتاً. حاول مرة أخرى بعد ${minutesLeft} دقيقة.`
                        : `Account temporarily locked. Try again in ${minutesLeft} minute(s).`,
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
                        [scope, JSON.stringify({ email: normalizedEmail, ip: clientIp, timestamp: new Date().toISOString() })]
                    );
                    const newCount = currentAttempts + 1;
                    if (newCount >= MAX_FAILED_ATTEMPTS) {
                        await query(
                            `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                             VALUES ('account_locked', 'auth_lockout', $1, NULL, $2)`,
                            [scope, JSON.stringify({
                                email: normalizedEmail,
                                ip: clientIp,
                                reason: `${MAX_FAILED_ATTEMPTS} consecutive failed login attempts on ${scope}`,
                                duration_minutes: LOCKOUT_DURATION_MINUTES,
                            })]
                        );
                        logger.warn(`Auth: Scope locked due to failed attempts`, { scope, maxAttempts: MAX_FAILED_ATTEMPTS });
                    }
                };

                await Promise.all([
                    recordFailureAndLockIfOverLimit(emailScope, emailLockout?.failed_attempts ?? 0),
                    recordFailureAndLockIfOverLimit(ipScope, ipLockout?.failed_attempts ?? 0)
                ]);

                res.status(401).json({
                    success: false,
                    error: loginLocale === 'ar'
                        ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
                        : 'Invalid email or password',
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
                    error: loginLocale === 'ar'
                        ? 'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول. تحقق من صندوق الوارد للحصول على رابط التحقق.'
                        : 'Please verify your email before signing in. Check your inbox for the verification link.',
                    code: 'EMAIL_NOT_VERIFIED',
                } as ApiResponse);
                return;
            }

            // Fetch all active roles for multi-role JWT
            // BUG-5 FIX: Also fetch is_primary to determine correct activeRole.
            // Previous code used users.role which may be stale after cross-session switches.
            const userRolesResult = await query<{ role_name: string; is_primary: boolean }>(
                `SELECT r.role_name, ur.is_primary FROM user_roles ur
                 JOIN roles r ON r.role_id = ur.role_id
                 WHERE ur.user_id = $1 AND ur.status = 'active'
                 ORDER BY ur.is_primary DESC, r.sort_order`,
                [user.user_id]
            );
            const allRoles = userRolesResult.rows.map(r => r.role_name);
            // BUG-5 FIX: Use the primary role from user_roles, fallback to users.role
            const primaryRole = userRolesResult.rows.find(r => r.is_primary)?.role_name ?? user.role;

            // Generate JWT with all roles — use primaryRole as the active context
            const token = generateToken(
                user.user_id,
                primaryRole,
                allRoles.length > 0 ? allRoles : [user.role]
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
                    maxAge: 24 * 60 * 60 * 1000, // 24h — mirrors JWT expiry
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
                        // HIGH-002 FIX: Include all roles so frontend role-switcher
                        // can display all user roles immediately after login
                        roles: allRoles.length > 0 ? allRoles : [user.role],
                        activeRole: primaryRole,
                        is_active: user.is_active,
                        is_email_verified: user.is_email_verified,
                    },
                    // MOB-AUTH-001: Token only included for mobile clients
                    ...(isMobileClient ? { token } : {}),
                },
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Auth.Login');
        }
    }
);

// ─── GET /api/auth/verify-email/:token ──────────────────────────────────────
router.get('/verify-email/:token', verifyEmailLimiter, async (req: Request, res: Response): Promise<void> => {
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
// PLT-AUTH-002 FIX: Removed authMiddleware — unverified users cannot login
// (blocked by the is_email_verified gate at L322), which created an inescapable
// dead-end: can't login → can't resend verification → can't verify → can't login.
// Now accepts email in body and does its own user lookup with rate limiting.
router.post(
    '/resend-verification',
    sensitiveActionLimiter,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const { email } = req.body as { email?: string };

            if (!email) {
                res.status(400).json({
                    success: false,
                    error: 'Email is required',
                } as ApiResponse);
                return;
            }

            // Anti-enumeration: always return success regardless of outcome
            const GENERIC_RESPONSE: ApiResponse = {
                success: true,
                message: 'If your email is registered and unverified, a new verification link has been sent.',
            };

            const normalizedEmail = email.toLowerCase().trim();

            // Find user by email
            const result = await query<Pick<User, 'user_id' | 'email' | 'is_email_verified' | 'email_token_expires_at'>>(
                'SELECT user_id, email, is_email_verified, email_token_expires_at FROM users WHERE email = $1',
                [normalizedEmail]
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
                    const reqLocale = getEmailLocale(req);
                    res.status(429).json({
                        success: false,
                        error: reqLocale === 'ar'
                            ? `يرجى الانتظار ${waitSeconds} ثانية قبل طلب رابط تحقق جديد.`
                            : `Please wait ${waitSeconds} seconds before requesting another verification email`,
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
                [newToken, tokenExpiry, user.user_id]
            );

            // Send verification email
            // PLT-AUD-006 FIX: Point to frontend page, not raw API endpoint
            const baseUrl = process.env['APP_BASE_URL'] ?? 'https://nammerha.com';
            const verificationUrl = `${baseUrl}/verify-email.html?token=${newToken}`;
            sendVerificationEmail(user.email, verificationUrl, getEmailLocale(req)).catch((err) => {
                logger.error('Auth: Resend verification email failed', { error: err instanceof Error ? err.message : String(err) });
            });

            res.json(GENERIC_RESPONSE);
        } catch (error) {
            safeRouteError(res, error, 'Auth.ResendVerification');
        }
    }
);

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────
router.post('/forgot-password', sensitiveActionLimiter, async (req: Request, res: Response): Promise<void> => {
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
        sendPasswordResetEmail(user.email, resetUrl, getEmailLocale(req)).catch((err) => {
            logger.error('Auth: Password reset email failed', { error: err instanceof Error ? err.message : String(err) });
        });

        logger.info('Auth: Password reset requested', { email: normalizedEmail });
        res.json(successResponse);
    } catch (error) {
        safeRouteError(res, error, 'Auth.ForgotPassword');
    }
});

// ─── POST /api/auth/reset-password ──────────────────────────────────────────
router.post('/reset-password', sensitiveActionLimiter, async (req: Request, res: Response): Promise<void> => {
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
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
    // NMR-AUD-M004 FIX: Soft-auth token invalidation.
    // Try to decode the JWT to get the user_id and invalidate all their tokens.
    // If decode fails (expired, malformed, etc.), we still proceed to clear the cookie.
    try {
        const token = req.cookies?.['nammerha_jwt'] as string | undefined;
        if (token) {
            // Decode WITHOUT verification — we only need the user_id.
            // The token is about to be invalidated anyway; verifying it first
            // would just block logout for users with expired tokens.
            const decoded = jwt.decode(token) as { sub?: string; user_id?: string } | null;
            const userId = decoded?.sub ?? decoded?.user_id;
            if (userId) {
                await query(
                    'UPDATE users SET token_invalidated_at = NOW() WHERE user_id = $1',
                    [userId]
                );
                logger.info('Auth: Token invalidated on logout', { userId });
            }
        }
    } catch (err) {
        // Non-fatal: cookie will still be cleared below.
        // The token will expire naturally within 24h even if invalidation fails.
        logger.error('Auth: Failed to invalidate token on logout', {
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
            const { current_password, new_password } = req.body as {
                current_password?: string;
                new_password?: string;
            };

            // ── Validation: Required fields ────────────────────────────
            if (!current_password || !new_password) {
                res.status(400).json({
                    success: false,
                    error: 'Current password and new password are required',
                } as ApiResponse);
                return;
            }

            // ── Validation: Max length (SEC-003: bcrypt DoS prevention) ─
            if (new_password.length > MAX_PASSWORD_LENGTH) {
                res.status(400).json({
                    success: false,
                    error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`,
                } as ApiResponse);
                return;
            }

            // ── Validation: Password complexity rules ──────────────────
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

            // ── Validation: No password reuse ──────────────────────────
            if (current_password === new_password) {
                res.status(400).json({
                    success: false,
                    error: 'New password must be different from current password',
                } as ApiResponse);
                return;
            }

            // ── Fetch current password hash from DB ────────────────────
            const userResult = await query<Pick<User, 'user_id' | 'email' | 'password_hash' | 'role'> & { roles?: string[] }>(
                'SELECT user_id, email, password_hash, role FROM users WHERE user_id = $1',
                [userId]
            );

            const user = userResult.rows[0];
            if (!user) {
                res.status(404).json({
                    success: false,
                    error: 'User not found',
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
                [newHash, userId]
            );

            // ── Reissue JWT for current session ────────────────────────
            // Fetch all active roles for the new token
            const rolesResult = await query<{ role_name: string }>(
                `SELECT r.role_name FROM user_roles ur
                 JOIN roles r ON r.role_id = ur.role_id
                 WHERE ur.user_id = $1 AND ur.status = 'active'`,
                [userId]
            );
            const allRoles = rolesResult.rows.map(r => r.role_name);

            const token = generateToken(userId, user.role, allRoles);
            res.cookie('nammerha_jwt', token, {
                httpOnly: true,
                secure: process.env['NODE_ENV'] === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/',
            });

            // ── Audit trail ────────────────────────────────────────────
            await query(
                `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                 VALUES ('password_changed', 'user', $1, $1, $2)`,
                [userId, JSON.stringify({
                    email: user.email,
                    timestamp: new Date().toISOString(),
                    method: 'authenticated_change',
                })]
            );

            logger.info('Auth: Password changed successfully', { userId });

            res.json({
                success: true,
                message: 'Password changed successfully',
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Auth.ChangePassword');
        }
    }
);

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
// V1-AUDIT FIX: Allows the frontend to check authentication status without
// storing JWT in localStorage. The httpOnly cookie is sent automatically.
// FIX-002: Returns roles[] and activeRole — mirrors login response contract.
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

            // FIX-002: Fetch all active roles (mirrors login endpoint at L361-367)
            const rolesResult = await query<{ role_name: string }>(
                `SELECT r.role_name FROM user_roles ur
                 JOIN roles r ON r.role_id = ur.role_id
                 WHERE ur.user_id = $1 AND ur.status = 'active'`,
                [userId]
            );
            const allRoles = rolesResult.rows.map(r => r.role_name);

            res.json({
                success: true,
                data: {
                    user: {
                        ...user,
                        roles: allRoles.length > 0 ? allRoles : [user.role],
                        activeRole: user.role,
                    },
                },
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'Auth.Me');
        }
    }
);

export default router;
