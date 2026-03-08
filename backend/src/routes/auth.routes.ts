// ============================================================================
// Nammerha Backend — Auth Routes
// POST /api/auth/register  — Create a new user account
// POST /api/auth/login     — Authenticate and receive JWT token
// ============================================================================
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../config/database';
import { generateToken } from '../middleware/auth.middleware';
import type { User, UserRole, ApiResponse } from '../types';

const router = Router();

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
            const existing = await query<{ user_id: string }>(
                'SELECT user_id FROM users WHERE email = $1',
                [email.toLowerCase().trim()]
            );
            if (existing.rows[0]) {
                res.status(409).json({
                    success: false,
                    error: 'An account with this email already exists',
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

            // Find user by email
            const result = await query<Pick<User, 'user_id' | 'email' | 'full_name' | 'role' | 'is_active' | 'password_hash'>>(
                'SELECT user_id, email, full_name, role, is_active, password_hash FROM users WHERE email = $1',
                [email.toLowerCase().trim()]
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

            // Verify password
            const isPasswordValid = await bcrypt.compare(password, user.password_hash);
            if (!isPasswordValid) {
                res.status(401).json({
                    success: false,
                    error: 'Invalid email or password',
                } as ApiResponse);
                return;
            }

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
