// ============================================================================
// Nammerha Backend — Auth Routes
// POST /api/auth/register  — Create a new user account
// POST /api/auth/login     — Authenticate and receive JWT token
//
// SEC-002: Account lockout after 5 consecutive failed logins
// SEC-003: Password max length (128 chars) to prevent bcrypt DoS
// SEC-009: Generic registration errors to prevent email enumeration
// ============================================================================
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../config/database';
import { generateToken } from '../middleware/auth.middleware';
import type { User, UserRole, ApiResponse } from '../types';

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

// RFC 5322 simplified email validation
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Password complexity: min 8 chars, 1 upper, 1 lower, 1 digit, 1 special
const PASSWORD_RULES = [
    { test: (p: string) => p.length >= 8, msg: 'at least 8 characters' },
    { test: (p: string) => /[A-Z]/.test(p), msg: 'at least one uppercase letter' },
    { test: (p: string) => /[a-z]/.test(p), msg: 'at least one lowercase letter' },
    { test: (p: string) => /[0-9]/.test(p), msg: 'at least one digit' },
    { test: (p: string) => /[^A-Za-z0-9]/.test(p), msg: 'at least one special character' },
];

// Valid roles for self-registration (admin/auditor require manual creation)
const SELF_REGISTER_ROLES: UserRole[] = ['donor', 'homeowner', 'engineer', 'supplier'];

// ─── POST /api/auth/register ────────────────────────────────────────────────
router.post(
    '/register',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

            // Check for existing user
            // SEC-009: Use a generic error message to prevent email enumeration.
            // An attacker should not be able to distinguish between "email exists"
            // and "registration failed" to map registered accounts.
            const existing = await query<{ user_id: string }>(
                'SELECT user_id FROM users WHERE email = $1',
                [email.toLowerCase().trim()]
            );
            if (existing.rows[0]) {
                res.status(409).json({
                    success: false,
                    error: 'Registration failed. Please try again or contact support.',
                } as ApiResponse);
                return;
            }

            // Hash password with bcrypt
            const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

            // Create user
            const result = await query<Pick<User, 'user_id' | 'email' | 'full_name' | 'role' | 'is_active'>>(
                `INSERT INTO users (email, password_hash, full_name, role, phone, is_active)
                 VALUES ($1, $2, $3, $4, $5, FALSE)
                 RETURNING user_id, email, full_name, role, is_active`,
                [
                    email.toLowerCase().trim(),
                    password_hash,
                    full_name.trim(),
                    role,
                    phone ?? null,
                ]
            );

            const user = result.rows[0];
            if (!user) {
                throw new Error('Failed to create user');
            }

            // Generate JWT
            const token = generateToken(user.user_id, user.role);

            res.status(201).json({
                success: true,
                data: {
                    user: {
                        user_id: user.user_id,
                        email: user.email,
                        full_name: user.full_name,
                        role: user.role,
                        is_active: user.is_active,
                    },
                    token,
                },
                message: 'Account created. KYC verification required for full access.',
            } as ApiResponse);
        } catch (err) {
            next(err);
        }
    }
);

// ─── POST /api/auth/login ───────────────────────────────────────────────────
router.post(
    '/login',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
            const result = await query<Pick<User, 'user_id' | 'email' | 'full_name' | 'role' | 'is_active' | 'password_hash'>>(
                'SELECT user_id, email, full_name, role, is_active, password_hash FROM users WHERE email = $1',
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
                          AND created_at > NOW() - INTERVAL '${LOCKOUT_DURATION_MINUTES} minutes'
                    ), 0)::int AS failed_attempts,
                    (
                        SELECT created_at + INTERVAL '${LOCKOUT_DURATION_MINUTES} minutes'
                        FROM audit_trail
                        WHERE entity_type = 'auth_lockout'
                          AND entity_id = $1
                          AND created_at > NOW() - INTERVAL '${LOCKOUT_DURATION_MINUTES} minutes'
                        ORDER BY created_at DESC LIMIT 1
                    ) AS locked_until`,
                [lockoutScope]
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
                    console.warn(`[Auth] IP locked: ${clientIp} for email ${normalizedEmail} — ${MAX_FAILED_ATTEMPTS} failed attempts`);
                }

                res.status(401).json({
                    success: false,
                    error: 'Invalid email or password',
                } as ApiResponse);
                return;
            }

            // Login successful — clean up old failure records
            // (No need to delete, they expire naturally via the time window)

            // Generate JWT
            const token = generateToken(user.user_id, user.role);

            res.json({
                success: true,
                data: {
                    user: {
                        user_id: user.user_id,
                        email: user.email,
                        full_name: user.full_name,
                        role: user.role,
                        is_active: user.is_active,
                    },
                    token,
                },
            } as ApiResponse);
        } catch (err) {
            next(err);
        }
    }
);

export default router;
