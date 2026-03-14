-- ============================================================================
-- Migration 030: ABAC Credential Schema
-- ============================================================================
-- PURPOSE: Add credential expiry tracking columns and audit log table
-- to support Attribute-Based Access Control (ABAC).
--
-- The existing RBAC system checks role membership only. ABAC adds a layer
-- that validates credential attributes (insurance validity, license expiry,
-- registration status) BEFORE allowing high-stakes actions like bidding,
-- project assessment, or order fulfillment.
--
-- CHANGES:
--   1. engineer_profiles    — Add license_expiry, license_status
--   2. supplier_profiles    — Add commercial_register_expiry, register_status
--   3. tradesperson_profiles — Add guild_expiry, certification_expiry
--   4. credential_audit_log — Immutable append-only compliance trail
-- ============================================================================

BEGIN;

-- ─── 1. Engineer Profiles: License Expiry ──────────────────────────────────

ALTER TABLE engineer_profiles
    ADD COLUMN IF NOT EXISTS license_expiry DATE,
    ADD COLUMN IF NOT EXISTS license_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (license_status IN ('pending', 'valid', 'expired', 'suspended', 'revoked'));

COMMENT ON COLUMN engineer_profiles.license_expiry IS 'Engineering license expiration date — ABAC checks this before allowing assessments';
COMMENT ON COLUMN engineer_profiles.license_status IS 'Current credential status: pending → valid → expired/suspended/revoked';

-- ─── 2. Supplier Profiles: Commercial Register Expiry ──────────────────────

ALTER TABLE supplier_profiles
    ADD COLUMN IF NOT EXISTS commercial_register_expiry DATE,
    ADD COLUMN IF NOT EXISTS register_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (register_status IN ('pending', 'valid', 'expired', 'suspended', 'revoked'));

COMMENT ON COLUMN supplier_profiles.commercial_register_expiry IS 'Commercial register expiration date — ABAC checks before order fulfillment';
COMMENT ON COLUMN supplier_profiles.register_status IS 'Current registration status: pending → valid → expired/suspended/revoked';

-- ─── 3. Tradesperson Profiles: Guild & Certification Expiry ────────────────

ALTER TABLE tradesperson_profiles
    ADD COLUMN IF NOT EXISTS guild_expiry DATE,
    ADD COLUMN IF NOT EXISTS certification_expiry DATE;

COMMENT ON COLUMN tradesperson_profiles.guild_expiry IS 'Guild membership expiration — ABAC checks before accepting trade jobs';
COMMENT ON COLUMN tradesperson_profiles.certification_expiry IS 'Professional certification expiration — optional but checked if present';

-- ─── 4. Contractor Profiles: License Status ────────────────────────────────
-- insurance_expiry already exists from migration 028. Add status column.

ALTER TABLE contractor_profiles
    ADD COLUMN IF NOT EXISTS insurance_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (insurance_status IN ('pending', 'valid', 'expired', 'suspended', 'revoked'));

COMMENT ON COLUMN contractor_profiles.insurance_status IS 'Insurance credential status — ABAC checks before allowing bids';

-- ─── 5. Credential Audit Log ───────────────────────────────────────────────
-- Immutable append-only log. Every credential status change is recorded.

CREATE TABLE IF NOT EXISTS credential_audit_log (
    log_id           UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    credential_type  VARCHAR(50)  NOT NULL
                     CHECK (credential_type IN (
                         'insurance', 'commercial_license', 'engineering_license',
                         'commercial_register', 'guild_membership', 'certification',
                         'verification'
                     )),
    old_status       VARCHAR(20),
    new_status       VARCHAR(20)  NOT NULL,
    old_expiry       DATE,
    new_expiry       DATE,
    changed_by       UUID         REFERENCES users(user_id),
    reason           TEXT,
    metadata         JSONB,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credential_audit_user   ON credential_audit_log(user_id);
CREATE INDEX idx_credential_audit_type   ON credential_audit_log(credential_type);
CREATE INDEX idx_credential_audit_time   ON credential_audit_log(created_at DESC);

COMMENT ON TABLE credential_audit_log IS 'Immutable compliance trail: every credential status/expiry change is logged for audit';

-- ─── 6. Indexes for ABAC Query Performance ─────────────────────────────────
-- The ABAC middleware runs a single query per check. Ensure fast path.

CREATE INDEX IF NOT EXISTS idx_contractor_insurance_expiry
    ON contractor_profiles(user_id, insurance_expiry, insurance_status, verification_status);

CREATE INDEX IF NOT EXISTS idx_engineer_license_expiry
    ON engineer_profiles(user_id, license_expiry, license_status, verification_status);

CREATE INDEX IF NOT EXISTS idx_supplier_register_expiry
    ON supplier_profiles(user_id, commercial_register_expiry, register_status, verification_status);

CREATE INDEX IF NOT EXISTS idx_tradesperson_guild_expiry
    ON tradesperson_profiles(user_id, guild_expiry, verification_status);

COMMIT;
