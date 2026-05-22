// ============================================================================
// Nammerha Backend — MFA/2FA Routes
// ============================================================================
// TOTP-based Multi-Factor Authentication API endpoints.
//
// Endpoints:
//   POST /api/auth/mfa/setup    — Begin TOTP enrollment (returns QR)       [Auth]
//   POST /api/auth/mfa/confirm  — Confirm enrollment with first code       [Auth]
//   POST /api/auth/mfa/verify   — Login MFA challenge (TOTP code)          [MFA Token]
//   POST /api/auth/mfa/recovery — Login MFA challenge (recovery code)      [MFA Token]
//   POST /api/auth/mfa/disable  — Disable MFA (requires password)          [Auth]
//   GET  /api/auth/mfa/status   — Get MFA status for profile               [Auth]
//   POST /api/auth/mfa/recovery-codes — Regenerate recovery codes          [Auth]
//
// Standards: NIST SP 800-63B (AAL2), OWASP ASVS v4 §2.8, RFC 6238
// ============================================================================

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { authMiddleware, generateToken } from '../middleware/auth.middleware';
import {
  setupMfa,
  confirmMfaSetup,
  verifyTotpCode,
  verifyRecoveryCode,
  disableMfa,
  getMfaStatus,
  regenerateRecoveryCodes,
} from '../services/mfa.service';
import { query } from '../config/database';
import { safeRouteError } from '../utils/safe-error';
import {
  mfaConfirmSchema,
  mfaVerifySchema,
  mfaRecoverySchema,
  mfaDisableSchema,
} from '../validation/schemas';
import { enqueueSecurityAlertEmail } from '../services/email-queue.service';
import type { ApiResponse } from '../types';

// ─── MFA Challenge Token ────────────────────────────────────────────────────
// Imported from auth.middleware.ts (added as part of this feature)
import { verifyMfaChallengeToken } from '../middleware/auth.middleware';

// ─── Rate Limiting ──────────────────────────────────────────────────────────
import rateLimit from 'express-rate-limit';

// Strict rate limit for MFA verification (prevents brute-force on 6-digit codes)
// 10^6 combinations / 5 attempts per 15 min = impractical brute-force
const mfaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many MFA attempts. Please wait 15 minutes.',
  },
  keyGenerator: (req: Request) => {
    // P1-W10-013 FIX: Key by IP + MFA token hash to prevent distributed attacks.
    // PREVIOUS: Keyed by IP only — a stolen challenge token could be brute-forced
    // from the attacker's own IP (fresh rate limit window).
    // Now includes the mfa_token itself (truncated hash for efficiency) so the
    // rate limit follows the challenge session, not just the client IP.
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const mfaToken = (req.body as Record<string, unknown>)?.mfa_token;
    const tokenSuffix = typeof mfaToken === 'string' ? mfaToken.slice(-16) : 'none';
    return `mfa:${ip}:${tokenSuffix}`;
  },
});

// Rate limit for MFA setup/disable (less strict — requires auth)
const mfaSetupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many MFA setup attempts. Please try again later.',
  },
});

const router = Router();

// ─── Locale Helper ──────────────────────────────────────────────────────────

type EmailLocale = 'ar' | 'en';

function getEmailLocale(req: Request): EmailLocale {
  const acceptLang = req.headers['accept-language'] ?? '';
  return acceptLang.startsWith('ar') ? 'ar' : 'en';
}

// ─── POST /setup — Begin TOTP Enrollment ────────────────────────────────────

router.post(
  '/setup',
  authMiddleware,
  mfaSetupLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.authUser?.user_id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      // Fetch user email for TOTP label
      const userResult = await query<{ email: string }>(
        'SELECT email FROM users WHERE user_id = $1',
        [userId],
      );
      const email = userResult.rows[0]?.email;
      if (!email) {
        res.status(404).json({ success: false, error: 'User not found' } as ApiResponse);
        return;
      }

      const result = await setupMfa(userId, email);

      res.json({
        success: true,
        data: result,
      } as ApiResponse);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already enabled')) {
        res.status(409).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      safeRouteError(res, error, 'MFA.Setup');
    }
  },
);

// ─── POST /confirm — Confirm Enrollment with First TOTP Code ────────────────

router.post(
  '/confirm',
  authMiddleware,
  mfaSetupLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.authUser?.user_id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const parsed = mfaConfirmSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid verification code. Enter the 6-digit code from your authenticator app.',
        } as ApiResponse);
        return;
      }

      const result = await confirmMfaSetup(userId, parsed.data.token);

      // Send security alert email
      const userResult = await query<{ email: string }>(
        'SELECT email FROM users WHERE user_id = $1',
        [userId],
      );
      const email = userResult.rows[0]?.email;
      if (email) {
        const locale = getEmailLocale(req);
        const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        enqueueSecurityAlertEmail(
          email,
          locale === 'ar' ? 'تم تفعيل المصادقة الثنائية' : 'Two-Factor Authentication Enabled',
          locale === 'ar'
            ? 'تم تفعيل المصادقة الثنائية (2FA) على حسابك في نمّرها. إذا لم تقم بهذا الإجراء، يُرجى تأمين حسابك فوراً.'
            : 'Two-factor authentication (2FA) has been enabled on your Nammerha account. If you did not perform this action, please secure your account immediately.',
          ip,
          locale,
          { sourceAction: 'mfa_enabled', sourceUserId: userId },
        );
      }

      res.json({
        success: true,
        data: {
          recovery_codes: result.recovery_codes,
          message:
            'MFA enabled successfully. Save your recovery codes — they will not be shown again.',
        },
      } as ApiResponse);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid verification code')) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      if (error instanceof Error && error.message.includes('already confirmed')) {
        res.status(409).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      safeRouteError(res, error, 'MFA.Confirm');
    }
  },
);

// ─── POST /verify — Login MFA Challenge (TOTP Code) ────────────────────────

router.post('/verify', mfaVerifyLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = mfaVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request. Provide mfa_token and 6-digit code.',
      } as ApiResponse);
      return;
    }

    const { mfa_token, code } = parsed.data;

    // Verify MFA challenge token
    // P0-W10-001 FIX: Extract `remember` flag to restore Remember-Me behavior.
    let userId: string;
    let remember = false;
    try {
      const payload = verifyMfaChallengeToken(mfa_token);
      userId = payload.userId;
      remember = payload.remember ?? false;
    } catch {
      res.status(401).json({
        success: false,
        error: 'MFA session expired. Please log in again.',
        code: 'MFA_TOKEN_EXPIRED',
      } as ApiResponse);
      return;
    }

    // Verify TOTP code
    const isValid = await verifyTotpCode(userId, code);
    if (!isValid) {
      res.status(401).json({
        success: false,
        error: 'Invalid verification code. Please try again.',
        code: 'MFA_INVALID_CODE',
      } as ApiResponse);
      return;
    }

    // ── MFA verified — issue real JWT ──
    // Fetch full user data (same as login flow in auth.routes.ts)
    const userResult = await query<{
      user_id: string;
      email: string;
      full_name: string;
      role: string;
      is_active: boolean;
      is_email_verified: boolean;
    }>(
      'SELECT user_id, email, full_name, role, is_active, is_email_verified FROM users WHERE user_id = $1',
      [userId],
    );

    const user = userResult.rows[0];
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' } as ApiResponse);
      return;
    }

    // Fetch all active roles
    const rolesResult = await query<{ role_name: string; is_primary: boolean }>(
      `SELECT r.role_name, ur.is_primary FROM user_roles ur
         JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = $1 AND ur.status = 'active'
         ORDER BY ur.is_primary DESC, r.sort_order`,
      [userId],
    );
    const allRoles = rolesResult.rows.map((r) => r.role_name);
    const primaryRole = rolesResult.rows.find((r) => r.is_primary)?.role_name ?? user.role;

    // Generate JWT
    // P0-W10-001 FIX: Use 30-day expiry when Remember Me was checked at login.
    const jwtExpiry = remember ? '30d' : undefined;
    const token = generateToken(
      user.user_id,
      primaryRole,
      allRoles.length > 0 ? allRoles : [user.role],
      jwtExpiry,
    );

    // Set httpOnly cookie (same as auth.routes.ts)
    const clientPlatform = req.headers['x-platform'] as string | undefined;
    const isMobileClient = clientPlatform === 'ios' || clientPlatform === 'android';

    if (!isMobileClient) {
      res.cookie('nammerha_jwt', token, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        // P0-W10-001 FIX: Respect Remember Me from MFA challenge token.
        // PREVIOUS: Always 24h — users with MFA who checked Remember Me
        // still got 24h sessions instead of 30d. The challenge token
        // stored the `remember` flag but it was never used here.
        maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          role: primaryRole,
          roles: allRoles.length > 0 ? allRoles : [user.role],
          is_active: user.is_active,
          is_email_verified: user.is_email_verified,
        },
        ...(isMobileClient ? { token } : {}),
      },
    } as ApiResponse);

    // P0-W10-002 FIX: Log MFA-verified login to audit_trail.
    const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    query(
      `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
         VALUES ('login_success', 'user', $1, $1, $2)`,
      [
        user.user_id,
        JSON.stringify({
          email: user.email,
          ip: clientIp,
          user_agent: req.headers['user-agent'] ?? 'unknown',
          method: 'mfa_totp',
          platform: isMobileClient ? clientPlatform : 'web',
          timestamp: new Date().toISOString(),
        }),
      ],
    ).catch(() => {
      /* fire-and-forget */
    });
  } catch (error) {
    safeRouteError(res, error, 'MFA.Verify');
  }
});

// ─── POST /recovery — Login MFA Challenge (Recovery Code) ───────────────────

router.post('/recovery', mfaVerifyLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = mfaRecoverySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request. Provide mfa_token and recovery_code.',
      } as ApiResponse);
      return;
    }

    const { mfa_token, recovery_code } = parsed.data;

    // Verify MFA challenge token
    // P0-W10-001 FIX: Extract `remember` flag for recovery path too.
    let userId: string;
    let remember = false;
    try {
      const payload = verifyMfaChallengeToken(mfa_token);
      userId = payload.userId;
      remember = payload.remember ?? false;
    } catch {
      res.status(401).json({
        success: false,
        error: 'MFA session expired. Please log in again.',
        code: 'MFA_TOKEN_EXPIRED',
      } as ApiResponse);
      return;
    }

    // Verify recovery code
    const isValid = await verifyRecoveryCode(userId, recovery_code);
    if (!isValid) {
      res.status(401).json({
        success: false,
        error: 'Invalid or already used recovery code.',
        code: 'MFA_INVALID_RECOVERY',
      } as ApiResponse);
      return;
    }

    // ── Recovery verified — issue real JWT (same as /verify) ──
    const userResult = await query<{
      user_id: string;
      email: string;
      full_name: string;
      role: string;
      is_active: boolean;
      is_email_verified: boolean;
    }>(
      'SELECT user_id, email, full_name, role, is_active, is_email_verified FROM users WHERE user_id = $1',
      [userId],
    );

    const user = userResult.rows[0];
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' } as ApiResponse);
      return;
    }

    const rolesResult = await query<{ role_name: string; is_primary: boolean }>(
      `SELECT r.role_name, ur.is_primary FROM user_roles ur
         JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = $1 AND ur.status = 'active'
         ORDER BY ur.is_primary DESC, r.sort_order`,
      [userId],
    );
    const allRoles = rolesResult.rows.map((r) => r.role_name);
    const primaryRole = rolesResult.rows.find((r) => r.is_primary)?.role_name ?? user.role;

    // P0-W10-001 FIX: Respect Remember Me on recovery path.
    const jwtExpiry = remember ? '30d' : undefined;
    const token = generateToken(
      user.user_id,
      primaryRole,
      allRoles.length > 0 ? allRoles : [user.role],
      jwtExpiry,
    );

    const clientPlatform = req.headers['x-platform'] as string | undefined;
    const isMobileClient = clientPlatform === 'ios' || clientPlatform === 'android';

    if (!isMobileClient) {
      res.cookie('nammerha_jwt', token, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        // P0-W10-001 FIX: 30-day cookie when Remember Me was checked.
        maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          role: primaryRole,
          roles: allRoles.length > 0 ? allRoles : [user.role],
          is_active: user.is_active,
          is_email_verified: user.is_email_verified,
        },
        ...(isMobileClient ? { token } : {}),
      },
    } as ApiResponse);

    // P0-W10-002 FIX: Log MFA-recovery login to audit_trail.
    const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    query(
      `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
         VALUES ('login_success', 'user', $1, $1, $2)`,
      [
        user.user_id,
        JSON.stringify({
          email: user.email,
          ip: clientIp,
          user_agent: req.headers['user-agent'] ?? 'unknown',
          method: 'mfa_recovery',
          platform: isMobileClient ? clientPlatform : 'web',
          timestamp: new Date().toISOString(),
        }),
      ],
    ).catch(() => {
      /* fire-and-forget */
    });
  } catch (error) {
    safeRouteError(res, error, 'MFA.Recovery');
  }
});

// ─── POST /disable — Disable MFA (Requires Password) ───────────────────────

router.post(
  '/disable',
  authMiddleware,
  mfaSetupLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.authUser?.user_id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const parsed = mfaDisableSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Password is required to disable MFA.',
        } as ApiResponse);
        return;
      }

      // Verify password before allowing MFA disable
      const userResult = await query<{ password_hash: string | null; email: string }>(
        'SELECT password_hash, email FROM users WHERE user_id = $1',
        [userId],
      );

      const user = userResult.rows[0];
      if (!user || !user.password_hash) {
        res.status(400).json({
          success: false,
          error: 'Cannot disable MFA for social-login-only accounts.',
        } as ApiResponse);
        return;
      }

      const passwordValid = await bcrypt.compare(parsed.data.password, user.password_hash);
      if (!passwordValid) {
        res.status(401).json({
          success: false,
          error: 'Incorrect password.',
        } as ApiResponse);
        return;
      }

      await disableMfa(userId);

      // Send security alert email
      const locale = getEmailLocale(req);
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      enqueueSecurityAlertEmail(
        user.email,
        locale === 'ar' ? 'تم إلغاء المصادقة الثنائية' : 'Two-Factor Authentication Disabled',
        locale === 'ar'
          ? 'تم إلغاء المصادقة الثنائية (2FA) من حسابك في نمّرها. إذا لم تقم بهذا الإجراء، يُرجى تأمين حسابك فوراً وتغيير كلمة المرور.'
          : 'Two-factor authentication (2FA) has been disabled on your Nammerha account. If you did not perform this action, please secure your account immediately and change your password.',
        ip,
        locale,
        { sourceAction: 'mfa_disabled', sourceUserId: userId },
      );

      res.json({
        success: true,
        message: 'MFA has been disabled.',
      } as ApiResponse);
    } catch (error) {
      safeRouteError(res, error, 'MFA.Disable');
    }
  },
);

// ─── GET /status — MFA Status for Profile ───────────────────────────────────

router.get('/status', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.authUser?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
      return;
    }

    const status = await getMfaStatus(userId);

    res.json({
      success: true,
      data: status,
    } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'MFA.Status');
  }
});

// ─── POST /recovery-codes — Regenerate Recovery Codes ───────────────────────

router.post(
  '/recovery-codes',
  authMiddleware,
  mfaSetupLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.authUser?.user_id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const newCodes = await regenerateRecoveryCodes(userId);

      res.json({
        success: true,
        data: {
          recovery_codes: newCodes,
          message: 'New recovery codes generated. Old codes are now invalid.',
        },
      } as ApiResponse);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not enabled')) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      safeRouteError(res, error, 'MFA.RegenerateCodes');
    }
  },
);

export default router;
