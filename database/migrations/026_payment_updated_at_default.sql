-- ============================================================================
-- Migration 026: PLT-AUD-014 FIX — Add DEFAULT NOW() to updated_at column
-- in payment_transactions table.
--
-- ROOT CAUSE: Migration 003 defined updated_at TIMESTAMPTZ without a DEFAULT.
-- This means new payment_transactions records have updated_at = NULL until
-- the first UPDATE statement fires (e.g., webhook processing). This creates
-- a temporal gap where the column value is NULL despite there being a valid
-- "last modified" timestamp (the creation time).
--
-- FIX: ALTER COLUMN to set DEFAULT NOW(). This is non-destructive — existing
-- rows with NULL updated_at are NOT retroactively filled (that would alter
-- audit history). Only NEW inserts will default to NOW().
-- ============================================================================
BEGIN;

ALTER TABLE payment_transactions
    ALTER COLUMN updated_at SET DEFAULT NOW();

COMMENT ON COLUMN payment_transactions.updated_at IS
    'Last modification timestamp. Defaults to NOW() at INSERT, updated on webhook processing.';

COMMIT;
