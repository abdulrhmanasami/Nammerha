-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 016: Auth0 Compatibility
-- Fixes CRT-AUD-001: password_hash NOT NULL conflicts with Auth0 RS256 flow
--
-- Root Cause: The users table requires password_hash NOT NULL, but Auth0
-- issues RS256 tokens externally — Auth0-registered users never provide a
-- password to Nammerha and therefore have no password hash to store.
--
-- Fix: Make password_hash nullable and set a safe default for Auth0 users.
-- The legacy HS256 login flow (generateToken) still works unchanged for
-- users who registered directly with email/password.
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
-- 1. Drop the NOT NULL constraint on password_hash
--    Auth0-only users will have NULL password_hash.
--    Legacy password-based users retain their existing hashes.
ALTER TABLE users
ALTER COLUMN password_hash DROP NOT NULL;
-- 2. Set a sensible default for new Auth0-only user rows
--    NULL clearly signals "this user authenticates via Auth0, not password."
--    This is semantically cleaner than storing an empty string or placeholder.
ALTER TABLE users
ALTER COLUMN password_hash
SET DEFAULT NULL;
-- 3. Update column comment to reflect dual-auth strategy
COMMENT ON COLUMN users.password_hash IS 'Bcrypt password hash for legacy HS256 login. NULL for Auth0 RS256 users (external authentication).';
COMMIT;
-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 016 COMPLETE
-- Modified: users.password_hash — dropped NOT NULL, set DEFAULT NULL
-- ═══════════════════════════════════════════════════════════════════════════════