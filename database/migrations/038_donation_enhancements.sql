-- ============================================================================
-- NAMMERHA PLATFORM — Donation System Enhancements
-- Migration: 038_donation_enhancements
-- Target: PostgreSQL 16
-- Created: 2026-03-15
-- ============================================================================
-- This migration adds infrastructure for:
--   ENH-2: Partial Refund Mechanism (refund_requests table)
--   ENH-4: Gift Donations (escrow_ledger columns)
--   ENH-5: Zakat/Sadaqah Classification (escrow_ledger column)
--   ENH-6: Webhook Retry Queue (webhook_dead_letter table)
--   ENH-7: Donation Matching Programs (matching_programs + matching_pledges)
--
-- MONETARY CONVENTION: All monetary values are stored as BIGINT in the
-- smallest currency unit (cents). Example: $500.00 → 50000
-- ============================================================================
BEGIN;

-- ============================================================================
-- 1. REFUND REQUESTS TABLE (ENH-2)
-- Formal refund request workflow. Donors request, admins review and process.
-- The actual escrow_ledger status change ('locked' → 'refunded') happens
-- in the processRefund() service method, not by database trigger.
-- ============================================================================
CREATE TABLE refund_requests (
    refund_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escrow_id         UUID NOT NULL REFERENCES escrow_ledger(transaction_id),
    donor_id          UUID NOT NULL REFERENCES users(user_id),
    -- Request Details
    reason            TEXT NOT NULL,
    refund_amount     BIGINT NOT NULL CHECK (refund_amount > 0),
    -- Workflow State
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
    -- Admin Review
    reviewed_by       UUID REFERENCES users(user_id),
    reviewed_at       TIMESTAMPTZ,
    review_notes      TEXT,
    -- Gateway Refund (when the payment is actually reversed via Visa/Fatora)
    gateway_refund_ref VARCHAR(255),
    -- Timestamps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE refund_requests IS 'Formal refund request workflow (ENH-2). Donor requests refund → admin reviews → processed. Escrow status changes to "refunded" only after admin approval.';
COMMENT ON COLUMN refund_requests.refund_amount IS 'Refund amount in cents. Must match or be less than escrow_ledger.amount_locked.';
COMMENT ON COLUMN refund_requests.gateway_refund_ref IS 'External payment gateway refund reference (Visa/Fatora). Populated after successful gateway reversal.';

-- Prevent duplicate refund requests for the same escrow entry
CREATE UNIQUE INDEX idx_refund_escrow_pending
    ON refund_requests (escrow_id)
    WHERE status IN ('pending', 'approved');

CREATE INDEX idx_refund_donor ON refund_requests (donor_id);
CREATE INDEX idx_refund_status ON refund_requests (status);
CREATE INDEX idx_refund_created ON refund_requests (created_at DESC);

-- ============================================================================
-- 2. WEBHOOK DEAD LETTER TABLE (ENH-6)
-- Failed webhook payloads are stored here for retry with exponential backoff.
-- Only INTERNAL processing failures are queued — signature validation failures
-- are rejected permanently (they indicate a spoofed or corrupted payload).
-- ============================================================================
CREATE TABLE webhook_dead_letter (
    dead_letter_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Source
    gateway           VARCHAR(20) NOT NULL,       -- 'visa' | 'fatora'
    payload           JSONB NOT NULL,             -- raw parsed webhook payload
    raw_body          TEXT,                        -- original raw body for re-verification
    signature         TEXT,                        -- original signature header
    -- Failure Context
    error_message     TEXT NOT NULL,
    error_stack       TEXT,
    -- Retry State (exponential backoff: 1m, 4m, 16m, 64m, 256m)
    retry_count       INT NOT NULL DEFAULT 0,
    max_retries       INT NOT NULL DEFAULT 5,
    next_retry_at     TIMESTAMPTZ,
    -- Status
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'retrying', 'exhausted', 'resolved')),
    resolved_at       TIMESTAMPTZ,
    -- Timestamps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE webhook_dead_letter IS 'Failed webhook payloads for retry (ENH-6). Only internal processing failures are queued. Signature failures are permanently rejected.';
COMMENT ON COLUMN webhook_dead_letter.raw_body IS 'Original raw HTTP body for HMAC re-verification on retry.';

CREATE INDEX idx_dead_letter_status ON webhook_dead_letter (status, next_retry_at)
    WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_dead_letter_gateway ON webhook_dead_letter (gateway);

-- ============================================================================
-- 3. MATCHING PROGRAMS TABLE (ENH-7)
-- Corporate sponsors create matching programs with budget caps and filters.
-- Example: "Match 1:1 on all structural projects in Aleppo, up to $50,000"
-- ============================================================================
CREATE TABLE matching_programs (
    program_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sponsor_id        UUID NOT NULL REFERENCES users(user_id),
    -- Program Details
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    match_ratio       DECIMAL(5, 2) NOT NULL DEFAULT 1.00
                      CHECK (match_ratio > 0 AND match_ratio <= 10.00),
    -- Budget (cents)
    max_budget        BIGINT NOT NULL CHECK (max_budget > 0),
    spent             BIGINT NOT NULL DEFAULT 0 CHECK (spent >= 0),
    -- Targeting Filters (optional)
    project_filter    JSONB,                      -- {"damage_type": ["structural"], "region": ["Aleppo"]}
    -- Lifecycle
    is_active         BOOLEAN NOT NULL DEFAULT true,
    starts_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ,
    -- Timestamps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE matching_programs IS 'Corporate donation matching programs (ENH-7). Sponsors pledge to match individual donations at a configurable ratio up to a budget cap.';
COMMENT ON COLUMN matching_programs.match_ratio IS 'Match multiplier. 1.00 = 1:1 match. 0.50 = $0.50 per $1 donated. Max 10:1.';
COMMENT ON COLUMN matching_programs.project_filter IS 'Optional JSON filter: {"damage_type": [...], "region": [...]}. NULL = matches all projects.';
COMMENT ON COLUMN matching_programs.spent IS 'Total amount matched so far (cents). Updated atomically on match creation.';

CREATE INDEX idx_matching_active ON matching_programs (is_active, starts_at, expires_at)
    WHERE is_active = true;
CREATE INDEX idx_matching_sponsor ON matching_programs (sponsor_id);

-- ============================================================================
-- 4. MATCHING PLEDGES TABLE (ENH-7)
-- Individual match records: links a donation (escrow entry) to a matching program.
-- Each pledge creates a corresponding escrow_ledger entry with donor_id = sponsor_id.
-- ============================================================================
CREATE TABLE matching_pledges (
    pledge_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id        UUID NOT NULL REFERENCES matching_programs(program_id),
    escrow_id         UUID NOT NULL REFERENCES escrow_ledger(transaction_id),
    matched_escrow_id UUID REFERENCES escrow_ledger(transaction_id),
    -- Financial
    original_amount   BIGINT NOT NULL CHECK (original_amount > 0),
    match_amount      BIGINT NOT NULL CHECK (match_amount > 0),
    -- Timestamps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE matching_pledges IS 'Individual donation match records. Links an original donation to its matching program and the corresponding sponsor escrow entry.';
COMMENT ON COLUMN matching_pledges.original_amount IS 'The original donor contribution that triggered the match (cents).';
COMMENT ON COLUMN matching_pledges.match_amount IS 'The matched amount from the sponsor (cents).';
COMMENT ON COLUMN matching_pledges.matched_escrow_id IS 'The sponsor''s escrow_ledger entry created by the match.';

CREATE INDEX idx_pledges_program ON matching_pledges (program_id);
CREATE INDEX idx_pledges_escrow ON matching_pledges (escrow_id);

-- ============================================================================
-- 5. ESCROW LEDGER EXTENSIONS (ENH-4 + ENH-5)
-- Gift donation metadata and Zakat/Sadaqah intent classification.
-- These are nullable columns — fully backward-compatible.
-- ============================================================================

-- ENH-4: Gift Donations
ALTER TABLE escrow_ledger
    ADD COLUMN gift_recipient_name VARCHAR(255),
    ADD COLUMN gift_message TEXT;

COMMENT ON COLUMN escrow_ledger.gift_recipient_name IS 'ENH-4: Name of the gift recipient (e.g., "In honor of Ahmad"). NULL = normal donation.';
COMMENT ON COLUMN escrow_ledger.gift_message IS 'ENH-4: Personal message from donor to gift recipient.';

-- ENH-5: Zakat/Sadaqah Classification
ALTER TABLE escrow_ledger
    ADD COLUMN donation_intent VARCHAR(20) DEFAULT 'general'
        CHECK (donation_intent IN ('zakat', 'sadaqah', 'general'));

COMMENT ON COLUMN escrow_ledger.donation_intent IS 'ENH-5: Islamic charitable intent classification. zakat = obligatory, sadaqah = voluntary, general = non-classified.';

COMMIT;
