-- ============================================================================
-- NAMMERHA PLATFORM — Migration 025: JWT Token Invalidation
-- MED-001 FIX: Add token_invalidated_at to users table
-- ============================================================================
-- This column enables server-side JWT invalidation after password reset,
-- email change, or account compromise. The auth middleware compares the
-- JWT's `iat` (issued-at) timestamp against this column — any token
-- issued BEFORE the invalidation timestamp is rejected.
-- ============================================================================
BEGIN;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS token_invalidated_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN users.token_invalidated_at IS
    'MED-001: When set, any JWT with iat < this timestamp is rejected. '
    'Updated on password reset, email change, or forced logout. '
    'NULL means no tokens have been invalidated.';

COMMIT;
-- ============================================================================
-- MIGRATION COMPLETE — token_invalidated_at column added to users table
-- ============================================================================
