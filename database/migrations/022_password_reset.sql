-- ============================================================================
-- Migration 018: Password Reset Support
-- Adds password reset token columns to users table for forgot-password flow.
-- ============================================================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
    ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
-- Partial index for fast token lookup (only non-null tokens)
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token)
WHERE password_reset_token IS NOT NULL;