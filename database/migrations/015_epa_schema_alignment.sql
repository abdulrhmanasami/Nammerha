-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 015: EPA Schema–Service Alignment
-- Fixes CRT-AUD-002, CRT-AUD-003, CRT-AUD-004, CRT-AUD-005
--
-- Root Cause: The epa-oracle.service.ts was developed against a later revision
-- of the schema that diverged from what migration 001 actually created.
-- This migration adds the columns/enum values the service requires.
-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
-- PostgreSQL requires this to be executed OUTSIDE of BEGIN/COMMIT.
-- We execute it first, then wrap all DDL in a transaction.
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CRT-AUD-003: Add 'pending_approval' to epa_status enum
--    Service inserts 'pending_approval' but enum only has: pending, approved, rejected
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE epa_status
ADD VALUE IF NOT EXISTS 'pending_approval';
BEGIN;
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CRT-AUD-005: Add columns the service INSERT expects
--    Service: adjustment_multiplier, original_amount, adjusted_amount,
--             adjustment_delta, calculated_by
--    Schema:  adjustment_percentage, original_cost, adjusted_cost  (no delta, no calculated_by)
--
--    Strategy: ADD new columns (non-breaking). Backfill from existing columns.
--    The old columns (original_cost, adjusted_cost, adjustment_percentage) are
--    retained for backward compatibility with any existing data.
-- ─────────────────────────────────────────────────────────────────────────────
-- 2a. adjustment_multiplier — the raw FIDIC Pn value (e.g. 1.12)
ALTER TABLE epa_adjustments
ADD COLUMN IF NOT EXISTS adjustment_multiplier DECIMAL(10, 6);
COMMENT ON COLUMN epa_adjustments.adjustment_multiplier IS 'FIDIC 13.8 Pn multiplier. E.g. 1.12 means 12% increase. Stored to 6 decimal places.';
-- 2b. original_amount — original cost synonym (service naming convention)
ALTER TABLE epa_adjustments
ADD COLUMN IF NOT EXISTS original_amount BIGINT DEFAULT 0;
COMMENT ON COLUMN epa_adjustments.original_amount IS 'Original cost in cents (service-layer name). Mirrors original_cost for API compatibility.';
-- 2c. adjusted_amount — adjusted cost synonym
ALTER TABLE epa_adjustments
ADD COLUMN IF NOT EXISTS adjusted_amount BIGINT DEFAULT 0;
COMMENT ON COLUMN epa_adjustments.adjusted_amount IS 'Adjusted cost in cents after EPA (service-layer name). Mirrors adjusted_cost for API compatibility.';
-- 2d. adjustment_delta — the difference (adjusted - original) in cents
ALTER TABLE epa_adjustments
ADD COLUMN IF NOT EXISTS adjustment_delta BIGINT DEFAULT 0;
COMMENT ON COLUMN epa_adjustments.adjustment_delta IS 'Cost difference in cents: adjusted_amount - original_amount. Positive = escalation, negative = deflation.';
-- 2e. calculated_by — the user who calculated this EPA adjustment
ALTER TABLE epa_adjustments
ADD COLUMN IF NOT EXISTS calculated_by UUID REFERENCES users(user_id);
COMMENT ON COLUMN epa_adjustments.calculated_by IS 'User who initiated the EPA calculation (engineer or admin).';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CRT-AUD-004: Add updated_at column + auto-refresh trigger
--    Service does SET updated_at = NOW() but column doesn't exist.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE epa_adjustments
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
COMMENT ON COLUMN epa_adjustments.updated_at IS 'Last modification timestamp. Auto-refreshed by trg_epa_updated_at trigger.';
CREATE TRIGGER trg_epa_updated_at BEFORE
UPDATE ON epa_adjustments FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CRT-AUD-002: Add entry_id generated column to pricing_oracle_entries
--    Service OracleEntry interface expects entry_id; schema PK is oracle_id.
--    Rather than renaming the PK (which would break FK references), we add
--    an alias column that mirrors oracle_id.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pricing_oracle_entries
ADD COLUMN IF NOT EXISTS entry_id UUID;
-- Backfill entry_id from oracle_id for existing rows
UPDATE pricing_oracle_entries
SET entry_id = oracle_id
WHERE entry_id IS NULL;
-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Add recorded_by and effective_date to pricing_oracle_entries
--    These are referenced by the service but missing from migration 001.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pricing_oracle_entries
ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES users(user_id);
ALTER TABLE pricing_oracle_entries
ADD COLUMN IF NOT EXISTS effective_date TIMESTAMPTZ DEFAULT NOW();
-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Backfill new epa_adjustments columns from legacy columns
--    Ensures any pre-existing data is correctly mirrored.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE epa_adjustments
SET original_amount = COALESCE(original_cost, 0),
    adjusted_amount = COALESCE(adjusted_cost, 0),
    adjustment_delta = COALESCE(adjusted_cost, 0) - COALESCE(original_cost, 0),
    adjustment_multiplier = CASE
        WHEN adjustment_percentage IS NOT NULL THEN 1.0 + (adjustment_percentage / 100.0)
        ELSE 1.0
    END
WHERE original_amount = 0
    OR original_amount IS NULL;
-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Indexes for new columns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_epa_calculated_by ON epa_adjustments (calculated_by);
CREATE INDEX IF NOT EXISTS idx_oracle_entry_id ON pricing_oracle_entries (entry_id);
COMMIT;
-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 015 COMPLETE
-- Fixed: CRT-AUD-002 (entry_id alias), CRT-AUD-003 (enum value),
--        CRT-AUD-004 (updated_at + trigger), CRT-AUD-005 (5 missing columns)
-- New columns: 7 on epa_adjustments, 3 on pricing_oracle_entries
-- New indexes: 2 | New trigger: 1 | New enum value: 1
-- ═══════════════════════════════════════════════════════════════════════════════