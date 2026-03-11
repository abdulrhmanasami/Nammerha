// ============================================================================
// Nammerha Backend — API Keys Service (Feature 5)
// ============================================================================
// Secure API key management: create, list, revoke, validate.
// Keys use SHA-256 hashing — the raw key is only shown once at creation.
// Dispatches email security alerts on create/revoke events.
// ============================================================================
import crypto from 'node:crypto';
import { query } from '../config/database';
import { sendSecurityAlertEmail } from './email.service';
import { logSecurityEvent } from './security-events.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ApiKey {
    key_id: string;
    user_id: string;
    key_name: string;
    key_prefix: string;
    scopes: string[];
    is_active: boolean;
    last_used_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
    revoked_at: Date | null;
}

interface ApiKeyWithHash extends ApiKey {
    key_hash: string;
}

export interface CreateKeyResult {
    key_id: string;
    key_name: string;
    key_prefix: string;
    raw_key: string;     // Shown ONCE at creation — never stored
    scopes: string[];
    expires_at: Date | null;
    created_at: Date;
}

// Valid scopes for API key access
const VALID_SCOPES = [
    'read:projects',
    'read:boq',
    'read:donations',
    'read:spatial-proofs',
    'read:open-data',
    'write:donations',
    'read:marketplace',
] as const;

// ─── Key Generation ─────────────────────────────────────────────────────────

/**
 * Generate a secure API key with the format: nm_live_{32 random hex chars}
 * Returns both the raw key (shown once) and its SHA-256 hash (stored in DB).
 */
function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
    const randomPart = crypto.randomBytes(32).toString('hex');
    const rawKey = `nm_live_${randomPart}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 16); // "nm_live_a1b2c3d4"

    return { rawKey, keyHash, keyPrefix };
}

// ─── Create Key ─────────────────────────────────────────────────────────────

/**
 * Create a new API key for a user.
 * Returns the raw key ONCE — it is never stored, only its SHA-256 hash.
 */
export async function createApiKey(
    userId: string,
    keyName: string,
    scopes: string[],
    expiresInDays?: number,
    ipAddress: string = 'unknown'
): Promise<CreateKeyResult> {
    // Validate key name
    if (!keyName || keyName.length < 2 || keyName.length > 100) {
        throw new Error('Key name must be between 2 and 100 characters');
    }

    // Validate scopes
    const invalidScopes = scopes.filter(s => !VALID_SCOPES.includes(s as typeof VALID_SCOPES[number]));
    if (invalidScopes.length > 0) {
        throw new Error(`Invalid scopes: ${invalidScopes.join(', ')}. Valid: ${VALID_SCOPES.join(', ')}`);
    }

    // Generate key
    const { rawKey, keyHash, keyPrefix } = generateApiKey();

    // Calculate expiry
    let expiresAt: Date | null = null;
    if (expiresInDays && expiresInDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Insert into DB
    const result = await query<ApiKey>(
        `INSERT INTO api_keys (user_id, key_name, key_prefix, key_hash, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING key_id, key_name, key_prefix, scopes, expires_at, created_at`,
        [userId, keyName, keyPrefix, keyHash, scopes, expiresAt]
    );

    const created = result.rows[0];
    if (!created) {
        throw new Error('Failed to create API key');
    }

    // Log security event
    logSecurityEvent({
        event_type: 'api_key_created',
        actor_id: userId,
        target_entity_type: 'api_key',
        target_entity_id: created.key_id,
        ip_address: ipAddress,
        payload: {
            action: 'api_key_created',
            key_name: keyName,
            key_prefix: keyPrefix,
            scopes,
        },
    }).catch(() => {
        // Non-blocking
    });

    // Send security alert email (fire-and-forget)
    sendKeyEventEmail(userId, 'API Key Created', keyName, keyPrefix, ipAddress).catch(() => {
        // Non-blocking
    });

    return {
        key_id: created.key_id,
        key_name: created.key_name,
        key_prefix: created.key_prefix,
        raw_key: rawKey, // Shown ONCE
        scopes: created.scopes,
        expires_at: created.expires_at,
        created_at: created.created_at,
    };
}

// ─── List Keys ──────────────────────────────────────────────────────────────

/**
 * List all API keys for a user. Raw key is never returned — only prefix.
 */
export async function listApiKeys(userId: string): Promise<ApiKey[]> {
    const result = await query<ApiKey>(
        `SELECT key_id, user_id, key_name, key_prefix, scopes, is_active,
                last_used_at, expires_at, created_at, revoked_at
         FROM api_keys
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
    );
    return result.rows;
}

// ─── Revoke Key ─────────────────────────────────────────────────────────────

/**
 * Revoke an API key. The key becomes permanently inactive.
 */
export async function revokeApiKey(
    userId: string,
    keyId: string,
    ipAddress: string = 'unknown'
): Promise<void> {
    const result = await query<ApiKey>(
        `UPDATE api_keys
         SET is_active = FALSE, revoked_at = NOW()
         WHERE key_id = $1 AND user_id = $2 AND is_active = TRUE
         RETURNING key_id, key_name, key_prefix`,
        [keyId, userId]
    );

    if (result.rows.length === 0) {
        throw new Error('API key not found, already revoked, or does not belong to this user');
    }

    const revoked = result.rows[0];
    if (!revoked) {
        throw new Error('Unexpected: revoked key row not found');
    }

    // Log security event
    logSecurityEvent({
        event_type: 'api_key_revoked',
        actor_id: userId,
        target_entity_type: 'api_key',
        target_entity_id: keyId,
        ip_address: ipAddress,
        payload: {
            action: 'api_key_revoked',
            key_name: revoked.key_name,
            key_prefix: revoked.key_prefix,
        },
    }).catch(() => {
        // Non-blocking
    });

    // Send security alert email (fire-and-forget)
    sendKeyEventEmail(userId, 'API Key Revoked', revoked.key_name, revoked.key_prefix, ipAddress).catch(() => {
        // Non-blocking
    });
}

// ─── Validate Key ───────────────────────────────────────────────────────────

/**
 * Validate a raw API key. Returns the associated user context if valid.
 * Updates `last_used_at` on successful validation.
 */
export async function validateApiKey(
    rawKey: string
): Promise<{ user_id: string; scopes: string[] } | null> {
    if (!rawKey || !rawKey.startsWith('nm_live_')) {
        return null;
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const result = await query<ApiKeyWithHash>(
        `SELECT key_id, user_id, scopes, is_active, expires_at
         FROM api_keys
         WHERE key_hash = $1 AND is_active = TRUE`,
        [keyHash]
    );

    const key = result.rows[0];
    if (!key) {
        return null;
    }

    // Check expiry
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
        // Auto-revoke expired key
        await query(
            'UPDATE api_keys SET is_active = FALSE, revoked_at = NOW() WHERE key_id = $1',
            [key.key_id]
        );
        return null;
    }

    // Update last used timestamp (fire-and-forget)
    query(
        'UPDATE api_keys SET last_used_at = NOW() WHERE key_id = $1',
        [key.key_id]
    ).catch(() => {
        // Non-blocking
    });

    return {
        user_id: key.user_id,
        scopes: key.scopes,
    };
}

// ─── Email Helpers ──────────────────────────────────────────────────────────

async function sendKeyEventEmail(
    userId: string,
    alertTitle: string,
    keyName: string,
    keyPrefix: string,
    ipAddress: string
): Promise<void> {
    // Look up user email
    const userResult = await query<{ email: string }>(
        'SELECT email FROM users WHERE user_id = $1',
        [userId]
    );

    const email = userResult.rows[0]?.email;
    if (!email) {
        return;
    }

    await sendSecurityAlertEmail(
        email,
        alertTitle,
        `A security-sensitive action was performed on your Nammerha account.\n\n` +
        `Action: ${alertTitle}\n` +
        `Key Name: ${keyName}\n` +
        `Key Prefix: ${keyPrefix}...\n\n` +
        `If you did not perform this action, please change your password immediately.`,
        ipAddress
    );
}
