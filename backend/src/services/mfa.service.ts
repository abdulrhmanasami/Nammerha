// ============================================================================
// Nammerha Backend — MFA/2FA TOTP Service
// ============================================================================
// Core Multi-Factor Authentication logic using TOTP (RFC 6238).
//
// Architecture:
//   - TOTP secrets encrypted at rest with AES-256-GCM
//   - Recovery codes hashed with SHA-256 (same pattern as password_reset_token)
//   - ±1 time window for clock skew tolerance
//   - Issuer: "Nammerha" (displays in authenticator apps)
//
// Standards: NIST SP 800-63B (AAL2), OWASP ASVS v4 §2.8, RFC 6238
// ============================================================================

import crypto from 'node:crypto';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { query } from '../config/database';
import { logger } from '../utils/logger';

// ─── Constants ──────────────────────────────────────────────────────────────

const TOTP_ISSUER = 'Nammerha';
const TOTP_ALGORITHM = 'SHA1'; // Google Authenticator compatibility
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30; // seconds
const TOTP_WINDOW = 1; // ±1 period (allows 30s clock skew)
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 8; // 8 alphanumeric chars per code

// ─── Encryption Key ─────────────────────────────────────────────────────────
// AES-256-GCM requires a 32-byte key. Loaded from environment.
// If missing, MFA operations will fail with a clear error.

function getEncryptionKey(): Buffer {
  const keyHex = process.env['MFA_ENCRYPTION_KEY'];
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      '[MFA FATAL] MFA_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return Buffer.from(keyHex, 'hex');
}

// ─── AES-256-GCM Encrypt/Decrypt ────────────────────────────────────────────

/**
 * Encrypts a plaintext TOTP secret using AES-256-GCM.
 * Returns a colon-separated string: iv:ciphertext:authTag (all hex).
 */
function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypts an AES-256-GCM encrypted TOTP secret.
 * Input format: iv:ciphertext:authTag (all hex).
 */
function decryptSecret(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, ciphertextHex, authTagHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

// ─── Hash Helper ────────────────────────────────────────────────────────────

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase().trim()).digest('hex');
}

// ─── Recovery Code Generation ───────────────────────────────────────────────

/**
 * Generates cryptographically secure recovery codes.
 * Format: XXXX-XXXX (uppercase alphanumeric, easy to read/type).
 */
function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  // Use uppercase alphanumeric without ambiguous chars (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const bytes = crypto.randomBytes(RECOVERY_CODE_LENGTH);
    let code = '';
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      const byte = bytes[j];
      if (byte === undefined) {
        throw new Error('Unexpected undefined byte in random generation');
      }
      code += chars[byte % chars.length];
    }
    // Format as XXXX-XXXX for readability
    codes.push(`${code.substring(0, 4)}-${code.substring(4)}`);
  }

  return codes;
}

// ─── TOTP Instance Factory ──────────────────────────────────────────────────

function createTotp(secret: OTPAuth.Secret, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: email,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret,
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Begin MFA enrollment. Generates a TOTP secret and stores it (unverified).
 * Returns the QR code data URL and manual entry key.
 *
 * IMPORTANT: The secret is stored but `verified_at` is NULL until the user
 * confirms with a valid TOTP code via `confirmMfaSetup()`.
 */
export async function setupMfa(
  userId: string,
  email: string,
): Promise<{
  secret: string;
  otpauth_uri: string;
  qr_data_url: string;
}> {
  // Check if MFA is already enabled
  const existing = await query<{ verified_at: Date | null }>(
    'SELECT verified_at FROM user_mfa_secrets WHERE user_id = $1',
    [userId],
  );

  if (existing.rows[0]?.verified_at) {
    throw new Error('MFA is already enabled. Disable it first to re-enroll.');
  }

  // Generate new TOTP secret
  const secret = new OTPAuth.Secret({ size: 20 }); // 160-bit secret (RFC recommended)
  const totp = createTotp(secret, email);
  const otpauthUri = totp.toString();

  // Encrypt and store (upsert — replaces any pending unverified setup)
  const encryptedSecret = encryptSecret(secret.base32);

  await query(
    `INSERT INTO user_mfa_secrets (user_id, encrypted_secret, algorithm, digits, period, verified_at)
     VALUES ($1, $2, $3, $4, $5, NULL)
     ON CONFLICT (user_id) DO UPDATE SET
       encrypted_secret = EXCLUDED.encrypted_secret,
       verified_at = NULL,
       created_at = NOW()`,
    [userId, encryptedSecret, TOTP_ALGORITHM, TOTP_DIGITS, TOTP_PERIOD],
  );

  // Generate QR code as data URL
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    width: 256,
    margin: 2,
    color: { dark: '#242424', light: '#FFFFFF' },
  });

  logger.info('MFA: Setup initiated', { userId });

  return {
    secret: secret.base32,
    otpauth_uri: otpauthUri,
    qr_data_url: qrDataUrl,
  };
}

/**
 * Confirm MFA setup by verifying the user's first TOTP code.
 * This proves the user successfully scanned the QR code.
 * On success: enables MFA, generates recovery codes.
 */
export async function confirmMfaSetup(
  userId: string,
  token: string,
): Promise<{ recovery_codes: string[] }> {
  // Fetch unverified secret
  const result = await query<{
    encrypted_secret: string;
    verified_at: Date | null;
  }>('SELECT encrypted_secret, verified_at FROM user_mfa_secrets WHERE user_id = $1', [userId]);

  const row = result.rows[0];
  if (!row) {
    throw new Error('No MFA setup in progress. Call /mfa/setup first.');
  }

  if (row.verified_at) {
    throw new Error('MFA is already confirmed and active.');
  }

  // Decrypt and verify TOTP
  const secretBase32 = decryptSecret(row.encrypted_secret);
  const secret = OTPAuth.Secret.fromBase32(secretBase32);
  const totp = createTotp(secret, ''); // label not needed for verification

  const delta = totp.validate({ token, window: TOTP_WINDOW });
  if (delta === null) {
    throw new Error('Invalid verification code. Please try again with the current code from your authenticator app.');
  }

  // ── Activate MFA (transactional) ──
  // 1. Mark secret as verified
  // 2. Set mfa_enabled on users table
  // 3. Generate and store recovery codes
  // 4. Log audit event

  const recoveryCodes = generateRecoveryCodes();

  await query('BEGIN');

  try {
    // Mark secret verified
    await query(
      'UPDATE user_mfa_secrets SET verified_at = NOW() WHERE user_id = $1',
      [userId],
    );

    // Enable MFA on user
    await query(
      'UPDATE users SET mfa_enabled = TRUE, mfa_enforced_at = NOW(), updated_at = NOW() WHERE user_id = $1',
      [userId],
    );

    // Delete any old recovery codes
    await query('DELETE FROM user_recovery_codes WHERE user_id = $1', [userId]);

    // Insert new recovery codes (hashed)
    for (const code of recoveryCodes) {
      await query(
        'INSERT INTO user_recovery_codes (user_id, code_hash) VALUES ($1, $2)',
        [userId, hashCode(code)],
      );
    }

    // Audit log
    await query(
      `INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, details)
       VALUES ('mfa_enabled', $1, 'mfa_totp_enabled', $1, $2)`,
      [userId, JSON.stringify({ method: 'totp', recovery_codes_generated: RECOVERY_CODE_COUNT })],
    );

    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }

  logger.info('MFA: Successfully enabled', { userId });

  return { recovery_codes: recoveryCodes };
}

/**
 * Verify a TOTP code during login.
 * Called after password verification when MFA is enabled.
 */
export async function verifyTotpCode(userId: string, token: string): Promise<boolean> {
  const result = await query<{
    encrypted_secret: string;
    verified_at: Date | null;
    last_totp_counter: number | null;
  }>('SELECT encrypted_secret, verified_at, last_totp_counter FROM user_mfa_secrets WHERE user_id = $1', [userId]);

  const row = result.rows[0];
  if (!row || !row.verified_at) {
    logger.warn('MFA: Verify called but no active MFA setup', { userId });
    return false;
  }

  const secretBase32 = decryptSecret(row.encrypted_secret);
  const secret = OTPAuth.Secret.fromBase32(secretBase32);
  const totp = createTotp(secret, '');

  const delta = totp.validate({ token, window: TOTP_WINDOW });

  if (delta === null) {
    // Log failed attempt
    await query(
      `INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, details)
       VALUES ('mfa_failed', $1, 'mfa_totp_failed', $1, '{"method":"totp"}')`,
      [userId],
    ).catch(() => { /* Non-blocking */ });

    return false;
  }

  // ── CRIT-001 FIX: TOTP Replay Prevention ──
  // Compute the absolute counter for the accepted code.
  // The current TOTP period counter = Math.floor(now / period).
  // delta tells us how many periods offset from current: actual_counter = current + delta.
  // Reject if this counter was already used (replay attack).
  const currentCounter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const acceptedCounter = currentCounter + delta;

  if (row.last_totp_counter !== null && acceptedCounter <= row.last_totp_counter) {
    logger.warn('MFA: TOTP replay detected — code already used', {
      userId,
      acceptedCounter,
      lastCounter: row.last_totp_counter,
    });

    await query(
      `INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, details)
       VALUES ('mfa_failed', $1, 'mfa_totp_replay_blocked', $1, $2)`,
      [userId, JSON.stringify({ method: 'totp', replay_counter: acceptedCounter })],
    ).catch(() => { /* Non-blocking */ });

    return false;
  }

  // Store the accepted counter to prevent replay
  await query(
    'UPDATE user_mfa_secrets SET last_totp_counter = $1 WHERE user_id = $2',
    [acceptedCounter, userId],
  );

  // Log successful MFA login
  await query(
    `INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, details)
     VALUES ('mfa_login', $1, 'mfa_totp_success', $1, '{"method":"totp"}')`,
    [userId],
  ).catch(() => { /* Non-blocking */ });

  return true;
}

/**
 * Verify a one-time recovery code during login.
 * The code is consumed (marked used_at) after successful verification.
 */
export async function verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
  const codeHash = hashCode(code);

  // Atomic: find + consume in one query (prevents race conditions)
  const result = await query<{ code_id: string }>(
    `UPDATE user_recovery_codes
     SET used_at = NOW()
     WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
     RETURNING code_id`,
    [userId, codeHash],
  );

  if (result.rows.length === 0) {
    // Log failed recovery attempt
    await query(
      `INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, details)
       VALUES ('mfa_failed', $1, 'mfa_recovery_failed', $1, '{"method":"recovery_code"}')`,
      [userId],
    ).catch(() => { /* Non-blocking */ });

    return false;
  }

  // Check remaining codes and warn if low
  const remaining = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM user_recovery_codes WHERE user_id = $1 AND used_at IS NULL',
    [userId],
  );
  const remainingCount = parseInt(remaining.rows[0]?.count ?? '0', 10);

  // Log successful recovery login
  await query(
    `INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, details)
     VALUES ('mfa_login', $1, 'mfa_recovery_success', $1, $2)`,
    [userId, JSON.stringify({ method: 'recovery_code', remaining_codes: remainingCount })],
  ).catch(() => { /* Non-blocking */ });

  if (remainingCount <= 2) {
    logger.warn('MFA: User running low on recovery codes', { userId, remaining: remainingCount });
  }

  return true;
}

/**
 * Disable MFA for a user. Requires password verification (done by caller).
 * Removes TOTP secret and all recovery codes.
 */
export async function disableMfa(userId: string): Promise<void> {
  await query('BEGIN');

  try {
    await query('DELETE FROM user_mfa_secrets WHERE user_id = $1', [userId]);
    await query('DELETE FROM user_recovery_codes WHERE user_id = $1', [userId]);
    await query(
      'UPDATE users SET mfa_enabled = FALSE, mfa_enforced_at = NULL, updated_at = NOW() WHERE user_id = $1',
      [userId],
    );

    // Audit log
    await query(
      `INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, details)
       VALUES ('mfa_disabled', $1, 'mfa_totp_disabled', $1, '{"method":"totp"}')`,
      [userId],
    );

    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }

  logger.info('MFA: Disabled', { userId });
}

/**
 * Get MFA status for the profile page.
 */
export async function getMfaStatus(
  userId: string,
): Promise<{
  enabled: boolean;
  enforced_at: string | null;
  recovery_codes_remaining: number;
}> {
  const userResult = await query<{ mfa_enabled: boolean; mfa_enforced_at: Date | null }>(
    'SELECT mfa_enabled, mfa_enforced_at FROM users WHERE user_id = $1',
    [userId],
  );

  const user = userResult.rows[0];
  if (!user) {
    throw new Error('User not found');
  }

  let recoveryCodesRemaining = 0;
  if (user.mfa_enabled) {
    const countResult = await query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM user_recovery_codes WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    );
    recoveryCodesRemaining = parseInt(countResult.rows[0]?.count ?? '0', 10);
  }

  return {
    enabled: user.mfa_enabled,
    enforced_at: user.mfa_enforced_at?.toISOString() ?? null,
    recovery_codes_remaining: recoveryCodesRemaining,
  };
}

/**
 * Regenerate recovery codes for a user who has MFA enabled.
 * Old codes are deleted and new ones are generated.
 */
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  // Verify MFA is enabled
  const check = await query<{ mfa_enabled: boolean }>(
    'SELECT mfa_enabled FROM users WHERE user_id = $1',
    [userId],
  );

  if (!check.rows[0]?.mfa_enabled) {
    throw new Error('MFA is not enabled');
  }

  const newCodes = generateRecoveryCodes();

  await query('BEGIN');
  try {
    // Delete old codes
    await query('DELETE FROM user_recovery_codes WHERE user_id = $1', [userId]);

    // Insert new codes
    for (const code of newCodes) {
      await query(
        'INSERT INTO user_recovery_codes (user_id, code_hash) VALUES ($1, $2)',
        [userId, hashCode(code)],
      );
    }

    // Audit
    await query(
      `INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, details)
       VALUES ('mfa_enabled', $1, 'mfa_recovery_regenerated', $1, $2)`,
      [userId, JSON.stringify({ new_codes_count: RECOVERY_CODE_COUNT })],
    );

    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }

  logger.info('MFA: Recovery codes regenerated', { userId });

  return newCodes;
}
