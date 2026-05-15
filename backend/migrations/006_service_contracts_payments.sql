-- ============================================================================
-- Migration 006: Service Contracts + Milestones + Payments
-- ============================================================================
-- Phase 1 Backend: Full payment system for contractor/engineer/tradesperson/supplier
-- 
-- Tables:
--   service_contracts   — agreement between homeowner and provider
--   contract_milestones — phases of work within a contract
--   contract_payments   — individual payment records (Fatora/Cash/Transfer)
--
-- Enums:
--   contract_status     — draft|active|completed|disputed|cancelled
--   milestone_status    — pending|in_progress|verification|completed|disputed
--   contract_pay_status — pending|payer_confirmed|payee_confirmed|completed|disputed|cancelled
--   contract_pay_method — fatora|cash|bank_transfer
--   provider_type       — contractor|engineer|tradesperson|supplier
--
-- Security:
--   - All monetary columns use INTEGER (cents) — no floating-point
--   - RLS-ready: homeowner_id and provider_id indexed for row filtering
--   - Anti-self-dealing CHECK: homeowner_id ≠ provider_id
--   - Idempotency enforced via idempotency_key UNIQUE constraint
--
-- Applied: 2026-05-15 (Payment System Phase 1)
-- ============================================================================

-- ─── Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE contract_status AS ENUM (
        'draft', 'active', 'completed', 'disputed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE milestone_status AS ENUM (
        'pending', 'in_progress', 'verification', 'completed', 'disputed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE contract_pay_status AS ENUM (
        'pending', 'payer_confirmed', 'payee_confirmed', 'completed', 'disputed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE contract_pay_method AS ENUM (
        'fatora', 'cash', 'bank_transfer'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE provider_type AS ENUM (
        'contractor', 'engineer', 'tradesperson', 'supplier'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── service_contracts ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_contracts (
    contract_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL,
    homeowner_id        UUID NOT NULL,
    provider_id         UUID NOT NULL,
    provider_type       provider_type NOT NULL DEFAULT 'contractor',
    bid_id              UUID,
    total_agreed_amount INTEGER NOT NULL CHECK (total_agreed_amount > 0),
    currency            VARCHAR(3) NOT NULL DEFAULT 'SYP',
    status              contract_status NOT NULL DEFAULT 'draft',
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Anti-self-dealing: homeowner cannot be their own provider
    CONSTRAINT chk_no_self_dealing CHECK (homeowner_id <> provider_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_sc_homeowner    ON service_contracts (homeowner_id);
CREATE INDEX IF NOT EXISTS idx_sc_provider     ON service_contracts (provider_id);
CREATE INDEX IF NOT EXISTS idx_sc_project      ON service_contracts (project_id);
CREATE INDEX IF NOT EXISTS idx_sc_status       ON service_contracts (status);
CREATE INDEX IF NOT EXISTS idx_sc_bid          ON service_contracts (bid_id) WHERE bid_id IS NOT NULL;


-- ─── contract_milestones ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_milestones (
    milestone_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id         UUID NOT NULL REFERENCES service_contracts(contract_id) ON DELETE CASCADE,
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    milestone_order     INTEGER NOT NULL DEFAULT 0,
    amount              INTEGER NOT NULL CHECK (amount > 0),
    percentage          NUMERIC(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
    status              milestone_status NOT NULL DEFAULT 'pending',
    gps_verified        BOOLEAN NOT NULL DEFAULT FALSE,
    spatial_proof_id    UUID,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique ordering within a contract
    CONSTRAINT uq_milestone_order UNIQUE (contract_id, milestone_order)
);

CREATE INDEX IF NOT EXISTS idx_cm_contract ON contract_milestones (contract_id);
CREATE INDEX IF NOT EXISTS idx_cm_status   ON contract_milestones (status);


-- ─── contract_payments ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_payments (
    payment_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id         UUID NOT NULL REFERENCES service_contracts(contract_id) ON DELETE CASCADE,
    milestone_id        UUID REFERENCES contract_milestones(milestone_id) ON DELETE SET NULL,
    payer_id            UUID NOT NULL,
    payee_id            UUID NOT NULL,
    amount              INTEGER NOT NULL CHECK (amount > 0),
    currency            VARCHAR(3) NOT NULL DEFAULT 'SYP',
    payment_method      contract_pay_method NOT NULL DEFAULT 'cash',
    status              contract_pay_status NOT NULL DEFAULT 'pending',

    -- Fatora gateway fields
    fatora_reference    VARCHAR(200),
    fatora_checkout_url TEXT,

    -- Cash/Transfer evidence
    transfer_receipt_url TEXT,
    confirmation_note    TEXT,

    -- Dual-party confirmation timestamps
    payer_confirmed_at  TIMESTAMPTZ,
    payee_confirmed_at  TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,

    -- Idempotency protection (Nammerha Domain Law §1)
    idempotency_key     VARCHAR(255) UNIQUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Anti-self-dealing: payer ≠ payee
    CONSTRAINT chk_payment_no_self CHECK (payer_id <> payee_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_contract   ON contract_payments (contract_id);
CREATE INDEX IF NOT EXISTS idx_cp_payer      ON contract_payments (payer_id);
CREATE INDEX IF NOT EXISTS idx_cp_payee      ON contract_payments (payee_id);
CREATE INDEX IF NOT EXISTS idx_cp_milestone  ON contract_payments (milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cp_status     ON contract_payments (status);
CREATE INDEX IF NOT EXISTS idx_cp_idem       ON contract_payments (idempotency_key) WHERE idempotency_key IS NOT NULL;


-- ─── Trigger: auto-update updated_at on service_contracts ───────────────────

CREATE OR REPLACE FUNCTION update_sc_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sc_updated_at ON service_contracts;
CREATE TRIGGER trg_sc_updated_at
    BEFORE UPDATE ON service_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_sc_updated_at();
