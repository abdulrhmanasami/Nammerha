-- ============================================================================
-- Migration 047: GDPR Account Deletion (Right to Erasure)
-- ============================================================================
-- PURPOSE: Enable GDPR Article 17 compliant account deletion with:
--   1. Soft-delete with 30-day grace period (reactivation window)
--   2. Deferred data anonymization for financial records
--   3. Hard-delete for personal data after grace period
--
-- ARCHITECTURE:
--   Phase 1: User requests deletion → soft-delete (deleted_at set)
--   Phase 2: Within 30 days → user can cancel (login reactivates)
--   Phase 3: After 30 days → cron job anonymizes + hard-deletes
--
-- FINANCIAL INTEGRITY:
--   - escrow_ledger, payment_transactions, donations → RETAINED (anonymized)
--   - audit_trail → RETAINED (actor_id SET NULL)
--   - projects → RETAINED (homeowner_id SET NULL, project continues)
--
-- STANDARDS: GDPR Art. 17, ISO/IEC 25010 (Platinum), OWASP ASVS v4 §1.4
-- ============================================================================

BEGIN;

-- ─── 1. Soft-Delete Columns on Users ──────────────────────────────────────

ALTER TABLE users
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN users.deleted_at IS 'Soft-delete timestamp. Non-null means account deletion requested. Grace period: 30 days.';
COMMENT ON COLUMN users.deletion_scheduled_at IS 'When the permanent purge is scheduled. = deleted_at + 30 days.';
COMMENT ON COLUMN users.deletion_reason IS 'GDPR: User-stated reason for deletion (optional). For compliance audit.';

-- Index for the purge cron job: find expired soft-deleted accounts
CREATE INDEX IF NOT EXISTS idx_users_deletion_pending
ON users (deletion_scheduled_at)
WHERE deleted_at IS NOT NULL AND deletion_scheduled_at IS NOT NULL;

-- ─── 2. Account Deletion Requests Table ───────────────────────────────────
-- Tracks the full lifecycle of each deletion request for GDPR compliance.
-- Retained indefinitely as proof of erasure compliance.

CREATE TABLE IF NOT EXISTS account_deletion_requests (
    request_id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID         NOT NULL REFERENCES users(user_id),
    status                  VARCHAR(20)  NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'completed', 'cancelled')),
    requested_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    grace_period_ends       TIMESTAMPTZ  NOT NULL,
    completed_at            TIMESTAMPTZ,
    cancelled_at            TIMESTAMPTZ,
    -- Audit fields
    anonymized_tables       JSONB,       -- List of tables anonymized on completion
    deletion_reason         TEXT,        -- User-provided reason (optional)
    ip_address              INET,
    user_agent              TEXT,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE account_deletion_requests IS 'GDPR Art. 17: Tracks account deletion requests. Proof of compliance. Retained after user data is purged.';
COMMENT ON COLUMN account_deletion_requests.anonymized_tables IS 'JSONB array of tables that were anonymized/purged on completion. For audit.';
COMMENT ON COLUMN account_deletion_requests.grace_period_ends IS 'After this timestamp, the purge cron job will permanently anonymize/delete user data.';

CREATE INDEX IF NOT EXISTS idx_deletion_requests_pending
ON account_deletion_requests (grace_period_ends)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_deletion_requests_user
ON account_deletion_requests (user_id);

-- Apply updated_at trigger
CREATE TRIGGER trg_deletion_requests_updated_at BEFORE
UPDATE ON account_deletion_requests FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─── 3. Alter Non-Cascading Foreign Keys ──────────────────────────────────
-- These FKs reference users(user_id) WITHOUT ON DELETE CASCADE.
-- For anonymization, we need them to allow SET NULL so that financial
-- records are preserved without PII linkage.
--
-- Strategy:
--   - Financial records (escrow, payments, donations): keep rows, nullify user FK
--   - Project ownership: keep project, nullify homeowner_id
--   - Audit trail: keep trail, nullify actor_id (already nullable)
--
-- NOTE: We do NOT alter FKs here because PostgreSQL does not support
-- ALTER CONSTRAINT for changing ON DELETE behavior. Instead, the
-- account-deletion.service.ts will SET NULL manually in a transaction
-- before clearing user data. This avoids dangerous DDL on production.

COMMIT;
