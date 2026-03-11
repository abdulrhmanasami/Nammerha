-- ============================================================================
-- Migration 017: Email Verification Support
-- Adds email verification columns to users table for account activation flow.
-- ============================================================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
    ADD COLUMN IF NOT EXISTS email_token_expires_at TIMESTAMPTZ;
-- Partial index for fast token lookup (only non-null tokens)
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token)
WHERE email_verification_token IS NOT NULL;
-- Set existing active users as verified (grandfather clause)
UPDATE users
SET is_email_verified = TRUE
WHERE is_active = TRUE;