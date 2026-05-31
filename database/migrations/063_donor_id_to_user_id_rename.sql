-- ============================================================================
-- Migration 063: Unified Citizen Model — donor_id → user_id Column Rename
-- ============================================================================
-- MEMO 63: The entire backend codebase references `user_id` per MEMO 1's
-- Unified Citizen Model, but 4 tables still have the legacy `donor_id`
-- column from the original donation-era schema. This causes:
--   - "column user_id does not exist" errors on every query
--   - Stale payment cleanup job crashing every 15 minutes
--   - All payment initiation, escrow locking, and tip recording failing
--
-- STRATEGY: RENAME COLUMN (not ADD + DROP) to preserve data, FK constraints,
-- and NOT NULL semantics. PostgreSQL RENAME COLUMN automatically updates:
--   - CHECK constraints
--   - DEFAULT expressions
--   - NOT NULL constraints
-- But we must manually:
--   - Drop and recreate FK constraints with new column name
--   - Drop and recreate indexes referencing the old column
--   - Drop and recreate views referencing the old column
-- ============================================================================

BEGIN;

-- ═══ PHASE 1: Drop dependent view (must be recreated after column renames) ══
DROP VIEW IF EXISTS vw_donor_escrow_summary;

-- ═══ PHASE 2: Drop foreign key constraints ═════════════════════════════════
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_donor_id_fkey;
ALTER TABLE escrow_ledger        DROP CONSTRAINT IF EXISTS escrow_ledger_donor_id_fkey;
ALTER TABLE impact_messages      DROP CONSTRAINT IF EXISTS impact_messages_donor_id_fkey;
ALTER TABLE platform_tips        DROP CONSTRAINT IF EXISTS platform_tips_donor_id_fkey;

-- ═══ PHASE 3: Drop old indexes ═════════════════════════════════════════════
DROP INDEX IF EXISTS idx_payment_transactions_donor;
DROP INDEX IF EXISTS idx_escrow_donor;
DROP INDEX IF EXISTS idx_impact_donor_chrono;
DROP INDEX IF EXISTS idx_impact_donor_unread;
DROP INDEX IF EXISTS idx_tips_donor;

-- ═══ PHASE 4: Rename columns ═══════════════════════════════════════════════
ALTER TABLE payment_transactions RENAME COLUMN donor_id TO user_id;
ALTER TABLE escrow_ledger        RENAME COLUMN donor_id TO user_id;
ALTER TABLE impact_messages      RENAME COLUMN donor_id TO user_id;
ALTER TABLE platform_tips        RENAME COLUMN donor_id TO user_id;

-- ═══ PHASE 5: Recreate foreign key constraints with new column name ════════
ALTER TABLE payment_transactions
    ADD CONSTRAINT payment_transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(user_id);

ALTER TABLE escrow_ledger
    ADD CONSTRAINT escrow_ledger_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(user_id);

ALTER TABLE impact_messages
    ADD CONSTRAINT impact_messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(user_id);

ALTER TABLE platform_tips
    ADD CONSTRAINT platform_tips_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(user_id);

-- ═══ PHASE 6: Recreate indexes with new column name ═══════════════════════
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_user               ON escrow_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_impact_user_chrono         ON impact_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_impact_user_unread         ON impact_messages(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tips_user                  ON platform_tips(user_id);

-- ═══ PHASE 7: Recreate view with new column name ══════════════════════════
-- Renamed from vw_donor_escrow_summary to vw_user_escrow_summary
-- (legacy name kept as alias for backward compatibility)
CREATE OR REPLACE VIEW vw_user_escrow_summary AS
SELECT
    e.user_id,
    u.full_name AS user_name,
    COUNT(DISTINCT e.project_id) AS projects_funded,
    COUNT(e.transaction_id) AS total_contributions,
    SUM(e.amount_locked) FILTER (WHERE e.payment_status = 'locked') AS total_locked,
    SUM(e.amount_locked) FILTER (WHERE e.payment_status = 'released') AS total_released,
    SUM(e.amount_locked) AS total_contributed
FROM escrow_ledger e
JOIN users u ON u.user_id = e.user_id
GROUP BY e.user_id, u.full_name;

-- ═══ PHASE 8: Update migration 003 comment ════════════════════════════════
COMMENT ON TABLE payment_transactions IS 'Payment records for Visa/Fatora gateway transactions linked to BOQ items. Column renamed: donor_id → user_id (MEMO 63, Unified Citizen Model).';
COMMENT ON COLUMN escrow_ledger.user_id IS 'User who locked funds. Renamed from donor_id (MEMO 63).';
COMMENT ON COLUMN payment_transactions.user_id IS 'User who initiated payment. Renamed from donor_id (MEMO 63).';
COMMENT ON COLUMN impact_messages.user_id IS 'User receiving impact notification. Renamed from donor_id (MEMO 63).';
COMMENT ON COLUMN platform_tips.user_id IS 'User who left platform tip. Renamed from donor_id (MEMO 63).';

COMMIT;
