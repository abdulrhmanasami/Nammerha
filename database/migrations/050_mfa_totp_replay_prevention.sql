-- ============================================================================
-- Migration 050: MFA TOTP Replay Prevention
-- CRIT-001 FIX: Add last_totp_counter column to track the last accepted
-- TOTP time-step counter value. This prevents replay attacks where an
-- intercepted TOTP code is reused within the 90-second validation window.
--
-- Standard: NIST SP 800-63B §5.1.4.2 (Single-use verifiers)
-- ============================================================================

ALTER TABLE user_mfa_secrets
    ADD COLUMN IF NOT EXISTS last_totp_counter BIGINT DEFAULT NULL;

COMMENT ON COLUMN user_mfa_secrets.last_totp_counter IS
    'Last accepted TOTP time-step counter. Used to prevent replay attacks (CRIT-001).';
