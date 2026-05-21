-- ============================================================================
-- Migration 046: MFA/2FA TOTP Support
-- ============================================================================
-- Adds TOTP-based two-factor authentication to the Nammerha platform.
--
-- Architecture:
--   - users.mfa_enabled: quick boolean check during login (avoids JOIN)
--   - user_mfa_secrets: AES-256-GCM encrypted TOTP seed (1 row per user)
--   - user_recovery_codes: SHA-256 hashed one-time backup codes (10 per user)
--
-- Standards: NIST SP 800-63B (AAL2), OWASP ASVS v4 §2.8, RFC 6238
-- ============================================================================

-- ─── Users Table: MFA Columns ───────────────────────────────────────────────
-- Added directly to users table for O(1) login-path check.
-- The login query already fetches from users — no extra JOIN needed.

ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enforced_at TIMESTAMPTZ;

-- ─── TOTP Secrets Table ─────────────────────────────────────────────────────
-- Stores the encrypted TOTP seed for each user.
-- One row per user (PRIMARY KEY on user_id enforces this).
-- The secret is AES-256-GCM encrypted — even if the DB is compromised,
-- the attacker cannot generate valid TOTP codes without MFA_ENCRYPTION_KEY.

CREATE TABLE IF NOT EXISTS user_mfa_secrets (
    user_id         UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    encrypted_secret TEXT NOT NULL,
    algorithm       VARCHAR(10) NOT NULL DEFAULT 'SHA1',
    digits          INT NOT NULL DEFAULT 6,
    period          INT NOT NULL DEFAULT 30,
    verified_at     TIMESTAMPTZ,          -- NULL until user confirms with first valid code
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_mfa_secrets IS 'TOTP secrets for MFA — encrypted at rest with AES-256-GCM';
COMMENT ON COLUMN user_mfa_secrets.encrypted_secret IS 'AES-256-GCM(iv:ciphertext:tag) — requires MFA_ENCRYPTION_KEY env to decrypt';
COMMENT ON COLUMN user_mfa_secrets.verified_at IS 'NULL = pending setup; NOT NULL = user confirmed with valid TOTP code';

-- ─── Recovery Codes Table ───────────────────────────────────────────────────
-- 10 one-time-use backup codes generated when MFA is enabled.
-- Codes are SHA-256 hashed before storage (same pattern as password_reset_token).
-- used_at is set when the code is consumed — prevents replay.

CREATE TABLE IF NOT EXISTS user_recovery_codes (
    code_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    code_hash   VARCHAR(64) NOT NULL,     -- SHA-256 hex digest of plaintext code
    used_at     TIMESTAMPTZ,              -- NULL = available, NOT NULL = consumed
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance: fetch available codes for a user during recovery login
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_available
    ON user_recovery_codes(user_id) WHERE used_at IS NULL;

-- Performance: admin observability — count consumed codes per user
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_used
    ON user_recovery_codes(user_id) WHERE used_at IS NOT NULL;

COMMENT ON TABLE user_recovery_codes IS 'One-time backup codes for MFA recovery — SHA-256 hashed';
COMMENT ON COLUMN user_recovery_codes.code_hash IS 'SHA-256(plaintext_code) — plaintext shown ONCE at enrollment';

-- ─── Audit Trail ────────────────────────────────────────────────────────────
-- MFA events are logged to the existing audit_trail table using these entity_types:
--   'mfa_enabled'  — user completed TOTP enrollment
--   'mfa_disabled' — user disabled MFA (requires password)
--   'mfa_login'    — successful MFA login (TOTP or recovery code)
--   'mfa_failed'   — failed MFA attempt (wrong code)
-- No schema change needed — audit_trail.entity_type is VARCHAR.
