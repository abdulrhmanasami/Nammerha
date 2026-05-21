// ============================================================================
// Nammerha Backend — Account Deletion Routes (GDPR Art. 17)
// ============================================================================
// Endpoints:
//   POST /api/auth/account/delete          — Request account deletion
//   POST /api/auth/account/cancel-deletion — Cancel pending deletion
//   GET  /api/auth/account/deletion-status — Check deletion status
//
// Rate limiting: 3 attempts / 1 hour (prevent abuse)
// Auth: All endpoints require authenticated session
//
// Standards: GDPR Art. 17, OWASP ASVS v4 §1.4
// ============================================================================

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { authMiddleware } from '../middleware/auth.middleware';
import { getAuthUser } from '../utils/auth-guard';
import { safeRouteError } from '../utils/safe-error';
import { accountDeletionSchema } from '../validation/schemas';
import {
    requestDeletion,
    cancelDeletion,
    getDeletionStatus,
} from '../services/account-deletion.service';
import pool from '../config/database';
import { logger } from '../utils/logger';
import type { ApiResponse } from '../types';

const router = Router();

// ─── Rate Limiting ──────────────────────────────────────────────────────────
// Very strict: 3 deletion requests per hour per IP.
// This is a destructive, irreversible action.

const deletionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: {
        success: false,
        error: 'Too many deletion requests. Please try again later.',
        error_ar: 'طلبات حذف كثيرة جداً. حاول مرة أخرى لاحقاً.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request): string => {
        return req.ip ?? req.socket.remoteAddress ?? 'unknown';
    },
});

// ─── POST /delete — Request Account Deletion ────────────────────────────────
router.post(
    '/delete',
    authMiddleware,
    deletionLimiter,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const user = getAuthUser(req);

            // Inline Zod validation (matches MFA routes pattern)
            const parsed = accountDeletionSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid request. Provide password and confirmation text.',
                    error_ar: 'طلب غير صالح. أدخل كلمة المرور ونص التأكيد.',
                } as ApiResponse);
                return;
            }

            const { password, confirmation, reason } = parsed.data;

            // 1. Verify confirmation text (must be "DELETE" or "حذف")
            const normalizedConfirmation = confirmation.trim().toUpperCase();
            if (normalizedConfirmation !== 'DELETE' && normalizedConfirmation !== 'حذف') {
                res.status(400).json({
                    success: false,
                    error: 'Please type "DELETE" or "حذف" to confirm.',
                    error_ar: 'اكتب "DELETE" أو "حذف" للتأكيد.',
                } as ApiResponse);
                return;
            }

            // 2. Verify password
            const userResult = await pool.query<{ password_hash: string | null }>(
                `SELECT password_hash FROM users WHERE user_id = $1`,
                [user.user_id],
            );

            const userRow = userResult.rows[0];
            if (!userRow) {
                res.status(404).json({
                    success: false,
                    error: 'User not found',
                    error_ar: 'المستخدم غير موجود',
                } as ApiResponse);
                return;
            }

            // Social-only users (no password) — cannot delete via this endpoint
            // They must set a password first or use a different verification method
            if (!userRow.password_hash) {
                res.status(400).json({
                    success: false,
                    error: 'Please set a password before deleting your account.',
                    error_ar: 'يرجى تعيين كلمة مرور قبل حذف حسابك.',
                } as ApiResponse);
                return;
            }

            const passwordValid = await bcrypt.compare(password, userRow.password_hash);
            if (!passwordValid) {
                // Audit: failed deletion attempt (potential account takeover)
                await pool.query(
                    `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, ip_address, user_agent, new_values)
                     VALUES ('account_deletion_failed_auth', 'user', $1, $1, $2, $3, $4)`,
                    [
                        user.user_id,
                        req.ip ?? null,
                        req.headers['user-agent'] ?? null,
                        JSON.stringify({ reason: 'invalid_password' }),
                    ],
                );

                res.status(401).json({
                    success: false,
                    error: 'Incorrect password',
                    error_ar: 'كلمة المرور غير صحيحة',
                } as ApiResponse);
                return;
            }

            // 3. Execute deletion request
            const result = await requestDeletion(
                user.user_id,
                reason ?? null,
                req.ip ?? 'unknown',
                req.headers['user-agent'] ?? 'unknown',
            );

            if (!result.success) {
                if (result.blockers && result.blockers.length > 0) {
                    res.status(403).json({
                        success: false,
                        error: 'Account deletion blocked',
                        error_ar: 'حذف الحساب محظور',
                        data: { blockers: result.blockers },
                    } as ApiResponse);
                    return;
                }

                res.status(500).json({
                    success: false,
                    error: result.error ?? 'Failed to process deletion request',
                    error_ar: 'فشل معالجة طلب الحذف',
                } as ApiResponse);
                return;
            }

            // Clear the auth cookie (logout)
            res.clearCookie('nammerha_jwt', {
                httpOnly: true,
                secure: process.env['NODE_ENV'] === 'production',
                sameSite: 'strict',
                path: '/',
            });

            logger.info('GDPR-047: Account deletion requested via API', {
                user_id: user.user_id,
                request_id: result.request_id,
            });

            res.json({
                success: true,
                data: {
                    request_id: result.request_id,
                    grace_period_ends: result.grace_period_ends,
                    grace_period_days: 30,
                    message: 'Account scheduled for permanent deletion.',
                    message_ar: 'تم جدولة حذف الحساب نهائياً.',
                },
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'AccountDeletion.Request');
        }
    },
);

// ─── POST /cancel-deletion — Cancel Pending Deletion ────────────────────────
router.post(
    '/cancel-deletion',
    authMiddleware,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const user = getAuthUser(req);

            const result = await cancelDeletion(
                user.user_id,
                req.ip ?? 'unknown',
                req.headers['user-agent'] ?? 'unknown',
            );

            if (!result.success) {
                res.status(400).json({
                    success: false,
                    error: result.error ?? 'Failed to cancel deletion',
                    error_ar: 'فشل إلغاء الحذف',
                } as ApiResponse);
                return;
            }

            res.json({
                success: true,
                data: {
                    message: 'Account deletion cancelled. Your account is active again.',
                    message_ar: 'تم إلغاء حذف الحساب. حسابك نشط مجدداً.',
                },
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'AccountDeletion.Cancel');
        }
    },
);

// ─── GET /deletion-status — Check Deletion Status ───────────────────────────
router.get(
    '/deletion-status',
    authMiddleware,
    async (req: Request, res: Response): Promise<void> => {
        try {
            const user = getAuthUser(req);
            const status = await getDeletionStatus(user.user_id);

            res.json({
                success: true,
                data: status,
            } as ApiResponse);
        } catch (error) {
            safeRouteError(res, error, 'AccountDeletion.Status');
        }
    },
);

export default router;
