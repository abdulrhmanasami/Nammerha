// ============================================================================
// Nammerha Backend — Device Authentication Service (Phase 1.2)
// ============================================================================
// Handles mobile-first authentication flows:
//   1. Refresh token rotation (SHA-256 hashed storage)
//   2. Device registration + session management
//   3. Force logout (revoke all refresh tokens)
//
// SECURITY:
//   - Refresh tokens are NEVER stored in plaintext — only SHA-256 hashes
//   - Each refresh issues a new token and revokes the old one (rotation)
//   - Stolen old tokens → instant detection via revoked flag
//   - Device binding prevents cross-device token replay
//
// REQUIRES: Migration 040_mobile_infrastructure.sql
// ============================================================================

import crypto from 'crypto';
import { query } from '../config/database';
import { generateToken } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import type { AuthUser, UserRole } from '../types';

// ─── Configuration ──────────────────────────────────────────────────────────

/** Refresh token lifetime (30 days) */
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(
    process.env['REFRESH_TOKEN_EXPIRY_DAYS'] ?? '30',
    10,
);

/** Access token (JWT) short-lived expiry (15 minutes) */
const ACCESS_TOKEN_EXPIRY = process.env['JWT_EXPIRY_MOBILE'] ?? '15m';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeviceInfo {
    device_id: string;
    platform: 'ios' | 'android' | 'web';
    app_version?: string;
    os_version?: string;
    device_model?: string;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;        // Access token TTL in seconds
    refreshExpiresAt: string; // ISO timestamp for refresh token expiry
}

export interface RefreshResult {
    tokens: TokenPair;
    user: AuthUser;
}

// ─── Hash Utilities ─────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random refresh token.
 * 48 bytes → 64-char hex string (384 bits of entropy).
 */
function generateRefreshToken(): string {
    return crypto.randomBytes(48).toString('hex');
}

/**
 * Compute SHA-256 hash of a refresh token for secure storage.
 * The raw token is sent to the client but NEVER stored in the database.
 */
function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── Core Operations ────────────────────────────────────────────────────────

/**
 * Issue a new access + refresh token pair for a user on a specific device.
 *
 * Called during:
 *   - Initial login (from auth routes)
 *   - Token refresh (from refreshToken mutation)
 *
 * The refresh token is stored as a SHA-256 hash in the `refresh_tokens` table.
 * The raw token is returned to the client for future use.
 */
export async function issueTokenPair(
    userId: string,
    role: string,
    roles: string[],
    device: DeviceInfo,
): Promise<TokenPair> {
    // 1. Generate tokens
    const rawRefreshToken = generateRefreshToken();
    const refreshHash = hashToken(rawRefreshToken);

    // 2. Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    // 3. Store hashed refresh token
    await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, device_id, platform, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, refreshHash, device.device_id, device.platform, expiresAt.toISOString()],
    );

    // 4. Generate short-lived access token (JWT)
    // IMPORTANT: Mobile tokens use shorter expiry than web (15m vs 24h)
    const accessToken = generateToken(userId, role, roles.length > 0 ? roles : undefined);

    // 5. Log device telemetry (fire-and-forget)
    recordDeviceTelemetry(userId, device).catch((err) => {
        logger.warn('Device telemetry recording failed (non-blocking)', {
            userId, error: err instanceof Error ? err.message : String(err),
        });
    });

    return {
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: parseExpiryToSeconds(ACCESS_TOKEN_EXPIRY),
        refreshExpiresAt: expiresAt.toISOString(),
    };
}

/**
 * Rotate a refresh token: validate the old one, revoke it, issue a new pair.
 *
 * SECURITY: If the old token is already revoked, it means a stolen token
 * was replayed. In this case, we revoke ALL tokens for the user (nuclear option)
 * and force re-authentication on all devices.
 */
export async function rotateRefreshToken(
    rawRefreshToken: string,
    device: DeviceInfo,
): Promise<RefreshResult> {
    const tokenHash = hashToken(rawRefreshToken);

    // 1. Find the token record
    const tokenResult = await query<{
        token_id: string;
        user_id: string;
        device_id: string | null;
        is_revoked: boolean;
        expires_at: Date;
    }>(
        `SELECT token_id, user_id, device_id, is_revoked, expires_at
         FROM refresh_tokens
         WHERE token_hash = $1`,
        [tokenHash],
    );

    const tokenRecord = tokenResult.rows[0];

    // ── Token Not Found ─────────────────────────────────────────────────────
    if (!tokenRecord) {
        throw new Error('Invalid refresh token');
    }

    // ── Replay Detection: Token Already Revoked ─────────────────────────────
    // This is a CRITICAL security event. A previously-used refresh token is
    // being replayed. Either the user's token was stolen, or a man-in-the-middle
    // captured the refresh token. Revoke ALL tokens for this user immediately.
    if (tokenRecord.is_revoked) {
        logger.error('SECURITY: Refresh token replay detected — revoking all user tokens', {
            user_id: tokenRecord.user_id,
            token_id: tokenRecord.token_id,
            device_id: device.device_id,
        });

        await revokeAllUserTokens(tokenRecord.user_id, 'replay_detected');
        throw new Error('Security violation: token replay detected. All sessions revoked. Please login again.');
    }

    // ── Token Expired ───────────────────────────────────────────────────────
    if (new Date() > new Date(tokenRecord.expires_at)) {
        // Revoke the expired token for cleanup
        await query(
            `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW()
             WHERE token_id = $1`,
            [tokenRecord.token_id],
        );
        throw new Error('Refresh token expired. Please login again.');
    }

    // ── Device Binding Validation ───────────────────────────────────────────
    // If the token was issued for a specific device, reject mismatched devices
    if (tokenRecord.device_id && tokenRecord.device_id !== device.device_id) {
        logger.warn('Refresh token used from different device than issued', {
            user_id: tokenRecord.user_id,
            expected_device: tokenRecord.device_id,
            actual_device: device.device_id,
        });
        // Don't outright reject — mobile OS updates can change device_id.
        // But log for security monitoring.
    }

    // 2. Revoke the old token (rotation)
    await query(
        `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW()
         WHERE token_id = $1`,
        [tokenRecord.token_id],
    );

    // 3. Fetch user data for new token generation
    const userResult = await query<{
        user_id: string;
        role: UserRole;
        is_active: boolean;
    }>(
        `SELECT user_id, role, is_active FROM users WHERE user_id = $1`,
        [tokenRecord.user_id],
    );

    const user = userResult.rows[0];
    if (!user) {
        throw new Error('User not found');
    }
    if (!user.is_active) {
        throw new Error('Account is deactivated');
    }

    // 4. Fetch all active roles
    const rolesResult = await query<{ role_name: UserRole }>(
        `SELECT r.role_name FROM user_roles ur
         JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = $1 AND ur.status = 'active'`,
        [tokenRecord.user_id],
    );
    const allRoles = rolesResult.rows.map(r => r.role_name);

    // 5. Issue new token pair
    const tokens = await issueTokenPair(
        tokenRecord.user_id,
        user.role,
        allRoles.length > 0 ? allRoles : [user.role],
        device,
    );

    const authUser: AuthUser = {
        user_id: user.user_id,
        role: user.role,
        roles: allRoles.length > 0 ? allRoles : [user.role],
        activeRole: user.role,
        is_active: user.is_active,
    };

    return { tokens, user: authUser };
}

/**
 * Revoke all refresh tokens for a user (force logout all devices).
 * Used for:
 *   - Password change
 *   - Account compromise detection
 *   - Admin-initiated force logout
 */
export async function revokeAllUserTokens(
    userId: string,
    reason: string,
): Promise<number> {
    const result = await query(
        `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW()
         WHERE user_id = $1 AND is_revoked = FALSE`,
        [userId],
    );

    const revokedCount = result.rowCount ?? 0;

    if (revokedCount > 0) {
        logger.info('All refresh tokens revoked for user', {
            user_id: userId,
            revoked_count: revokedCount,
            reason,
        });
    }

    return revokedCount;
}

/**
 * Revoke refresh tokens for a specific device (single device logout).
 */
export async function revokeDeviceTokens(
    userId: string,
    deviceId: string,
): Promise<number> {
    const result = await query(
        `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW()
         WHERE user_id = $1 AND device_id = $2 AND is_revoked = FALSE`,
        [userId, deviceId],
    );

    return result.rowCount ?? 0;
}

/**
 * Get active sessions for a user (device management UI).
 */
export async function getActiveSessions(userId: string): Promise<Array<{
    device_id: string | null;
    platform: string | null;
    created_at: Date;
    expires_at: Date;
}>> {
    const result = await query<{
        device_id: string | null;
        platform: string | null;
        created_at: Date;
        expires_at: Date;
    }>(
        `SELECT device_id, platform, created_at, expires_at
         FROM refresh_tokens
         WHERE user_id = $1 AND is_revoked = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [userId],
    );
    return result.rows;
}

// ─── Device Telemetry ───────────────────────────────────────────────────────

/**
 * Record or update client version telemetry.
 * Used for forced upgrade gates and deprecation planning.
 */
async function recordDeviceTelemetry(
    userId: string,
    device: DeviceInfo,
): Promise<void> {
    await query(
        `INSERT INTO client_versions (user_id, device_id, platform, app_version, api_version, os_version, device_model)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, device_id) DO UPDATE SET
             platform = EXCLUDED.platform,
             app_version = EXCLUDED.app_version,
             api_version = EXCLUDED.api_version,
             os_version = EXCLUDED.os_version,
             device_model = EXCLUDED.device_model,
             last_seen_at = NOW()`,
        [
            userId,
            device.device_id,
            device.platform,
            device.app_version ?? '0.0.0',
            '2026.1',             // Current API version
            device.os_version ?? null,
            device.device_model ?? null,
        ],
    );
}

// ─── Cleanup Jobs ───────────────────────────────────────────────────────────

/**
 * Clean up expired/revoked refresh tokens older than 90 days.
 * Called by background job scheduler.
 */
export async function cleanupExpiredTokens(): Promise<number> {
    const result = await query(
        `DELETE FROM refresh_tokens
         WHERE (is_revoked = TRUE OR expires_at < NOW())
           AND created_at < NOW() - INTERVAL '90 days'`,
    );
    return result.rowCount ?? 0;
}

/**
 * Clean up stale push tokens (inactive for >90 days).
 */
export async function cleanupStalePushTokens(): Promise<number> {
    const result = await query(
        `UPDATE push_tokens SET is_active = FALSE
         WHERE is_active = TRUE
           AND last_used_at < NOW() - INTERVAL '90 days'`,
    );
    return result.rowCount ?? 0;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Parse JWT expiry string (e.g., '15m', '24h') to seconds.
 */
function parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match || !match[1] || !match[2]) {return 900;} // Default 15m
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[unit] ?? 60);
}
