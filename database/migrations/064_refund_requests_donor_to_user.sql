-- Migration 064: Rename refund_requests.donor_id → user_id
-- Root Cause: Migration 063 renamed donor_id → user_id on 4 tables
-- (payment_transactions, escrow_ledger, impact_messages, platform_tips)
-- but MISSED refund_requests.donor_id (created in migration 038).
-- Backend code references user_id per MEMO 1 (Unified Citizen Model).
-- Standard: MEMO 63 completion, MEMO 1 compliance.

BEGIN;

-- Phase 1: Drop dependent FK constraint
ALTER TABLE refund_requests
  DROP CONSTRAINT IF EXISTS refund_requests_donor_id_fkey;

-- Phase 2: Drop dependent index
DROP INDEX IF EXISTS idx_refund_donor;

-- Phase 3: Rename column
ALTER TABLE refund_requests
  RENAME COLUMN donor_id TO user_id;

-- Phase 4: Recreate FK constraint with new name
ALTER TABLE refund_requests
  ADD CONSTRAINT refund_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

-- Phase 5: Recreate index with new name
CREATE INDEX idx_refund_user ON refund_requests(user_id);

-- Phase 6: Add documentation comment
COMMENT ON COLUMN refund_requests.user_id IS
  'Requesting user ID (renamed from donor_id in migration 064, MEMO 64 compliance)';

COMMIT;
