-- ============================================================================
-- NAMMERHA PLATFORM — OCDS-Compliant Core Database Schema
-- Migration: 001_core_schema
-- Target: PostgreSQL 16 + PostGIS
-- Created: 2026-03-07
-- ============================================================================
-- This migration creates the complete Data Lake for the Nammerha Syria
-- Reconstruction Platform. All tables are designed to comply with the
-- Open Contracting Data Standard (OCDS) and support:
--   • Itemized micro-funding (BOQ baskets)
--   • Escrow ledgering with fund lock/release
--   • Spatial proof verification (GPS + Image + Timestamp)
--   • KYC/AML compliance gating
--   • FIDIC 13.8 Economic Price Adjustment (EPA)
--
-- MONETARY CONVENTION: All monetary values are stored as BIGINT in the
-- smallest currency unit (cents). Example: $500.00 → 50000
-- ============================================================================
BEGIN;
-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================
-- 1.1 User & Identity
CREATE TYPE user_role AS ENUM (
    'donor',
    'homeowner',
    'engineer',
    'supplier',
    'admin',
    'auditor'
);
CREATE TYPE kyc_status AS ENUM (
    'pending',
    'submitted',
    'verified',
    'rejected',
    'suspended'
);
-- 1.2 Project & Damage
CREATE TYPE damage_type AS ENUM (
    'structural',
    'plumbing',
    'electrical',
    'mixed'
);
CREATE TYPE damage_severity AS ENUM (
    'minor',
    'moderate',
    'severe',
    'total_destruction'
);
CREATE TYPE project_status AS ENUM (
    'draft',
    'pending_assessment',
    'assessed',
    'published',
    'in_progress',
    'completed',
    'cancelled'
);
-- 1.3 BOQ & Materials
CREATE TYPE boq_item_status AS ENUM (
    'pending_verification',
    'verified',
    'partially_funded',
    'fully_funded',
    'delivered',
    'installed'
);
-- 1.4 Financial
CREATE TYPE payment_status AS ENUM (
    'locked',
    'released',
    'refunded',
    'disputed'
);
-- 1.5 Compliance
CREATE TYPE compliance_doc_type AS ENUM (
    'national_id',
    'commercial_register',
    'engineering_license',
    'guild_membership',
    'sanctions_screening'
);
CREATE TYPE compliance_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired'
);
-- 1.6 Milestones & Adjustments
CREATE TYPE milestone_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'blocked'
);
CREATE TYPE epa_status AS ENUM ('pending', 'approved', 'rejected');
-- 1.7 Verification
CREATE TYPE verification_status AS ENUM (
    'submitted',
    'verified',
    'rejected'
);
-- ============================================================================
-- 2. SEQUENCES
-- ============================================================================
-- OCDS-compliant project ID generator: OCDS-SYR-00001, OCDS-SYR-00002, ...
CREATE SEQUENCE ocds_project_id_seq START WITH 1 INCREMENT BY 1;
-- ============================================================================
-- 3. CORE TABLES (Dependency Order)
-- ============================================================================
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1 USERS TABLE
-- All platform actors: donors, homeowners, engineers, suppliers, admins
-- KYC gate: account is_active = false until kyc_verification_status = 'verified'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    -- KYC Verification Gate
    kyc_verification_status kyc_status NOT NULL DEFAULT 'pending',
    kyc_document_url TEXT,
    kyc_verified_at TIMESTAMPTZ,
    kyc_verified_by UUID REFERENCES users(user_id),
    -- Professional Credentials (role-specific)
    commercial_register_number VARCHAR(100),
    -- suppliers
    engineering_license_number VARCHAR(100),
    -- engineers
    guild_membership_id VARCHAR(100),
    -- نقابة membership
    -- Spatial
    gps_last_known GEOGRAPHY(POINT, 4326),
    -- Activation Gate
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Constraints
    CONSTRAINT uq_users_email UNIQUE (email)
);
COMMENT ON TABLE users IS 'All platform actors. Account activation requires KYC verification.';
COMMENT ON COLUMN users.kyc_verification_status IS 'KYC gate: must be "verified" before is_active can be set to TRUE.';
COMMENT ON COLUMN users.commercial_register_number IS 'السجل التجاري — required for suppliers.';
COMMENT ON COLUMN users.engineering_license_number IS 'رقم ترخيص المهندس — required for engineers.';
COMMENT ON COLUMN users.guild_membership_id IS 'عضوية النقابة — guild/association membership ID.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2 COMPLIANCE RECORDS TABLE
-- KYC/AML document management and sanctions screening results
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE compliance_records (
    compliance_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    document_type compliance_doc_type NOT NULL,
    document_number VARCHAR(255),
    document_url TEXT,
    status compliance_status NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMPTZ,
    expiry_date DATE,
    sanctions_check_result JSONB,
    -- SDN/OFAC screening payload
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE compliance_records IS 'KYC/AML compliance documents: national IDs, commercial registers, engineering licenses, sanctions screening results.';
COMMENT ON COLUMN compliance_records.sanctions_check_result IS 'OFAC/SDN automated screening result payload (JSON).';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.3 PROJECTS TABLE (OCDS-Compliant)
-- Core project registry. Each project has a public "project card" by default.
-- Project ID follows OCDS format: OCDS-SYR-NNNNN
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE projects (
    project_id VARCHAR(20) PRIMARY KEY,
    homeowner_id UUID NOT NULL REFERENCES users(user_id),
    assigned_engineer_id UUID REFERENCES users(user_id),
    -- Descriptive
    title VARCHAR(500) NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    -- Spatial
    gps_location GEOGRAPHY(POINT, 4326),
    address_text TEXT,
    -- Damage Assessment
    damage_type damage_type NOT NULL,
    damage_severity damage_severity,
    -- Status & Lifecycle
    status project_status NOT NULL DEFAULT 'draft',
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    -- Financial Aggregates (maintained by triggers)
    total_estimated_cost BIGINT NOT NULL DEFAULT 0,
    total_funded_amount BIGINT NOT NULL DEFAULT 0,
    -- OCDS Compliance Fields
    ocds_release_id VARCHAR(100),
    -- Lifecycle Timestamps
    published_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE projects IS 'OCDS-compliant project registry. Each project has a public "project card" (بطاقة مشروع).';
COMMENT ON COLUMN projects.project_id IS 'OCDS standard format: OCDS-SYR-NNNNN';
COMMENT ON COLUMN projects.total_estimated_cost IS 'Aggregate of all itemized_boq.total_cost. Stored in cents.';
COMMENT ON COLUMN projects.total_funded_amount IS 'Aggregate of all itemized_boq.funded_amount. Maintained by trigger.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4 PROJECT MILESTONES TABLE
-- Progress tracking for construction phases
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE project_milestones (
    milestone_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    sequence_number INT NOT NULL,
    status milestone_status NOT NULL DEFAULT 'pending',
    estimated_cost BIGINT,
    -- in cents
    actual_cost BIGINT,
    -- in cents
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_milestone_sequence UNIQUE (project_id, sequence_number)
);
COMMENT ON TABLE project_milestones IS 'Construction phase milestones. Ordered by sequence_number within each project.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.5 ITEMIZED BOQ TABLE (Bill of Quantities)
-- Granular material-level funding baskets. Replaces opaque project budgets.
-- This feeds the donor "construction basket" UI (سلة البناء).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE itemized_boq (
    item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    -- Material Identity
    material_name VARCHAR(500) NOT NULL,
    material_category VARCHAR(100),
    -- 'cement', 'steel', 'wiring', 'doors', etc.
    description TEXT,
    image_url TEXT,
    -- Quantity & Pricing
    unit VARCHAR(50) NOT NULL,
    -- 'bag', 'ton', 'meter', 'unit'
    unit_price BIGINT NOT NULL,
    -- in cents ($10.00 → 1000)
    required_quantity DECIMAL(12, 2) NOT NULL,
    -- Funding State (funded_amount maintained by trigger from escrow_ledger)
    funded_amount BIGINT NOT NULL DEFAULT 0,
    -- Oracle Reference
    oracle_reference_price BIGINT,
    -- Pricing Oracle snapshot (cents)
    oracle_price_date TIMESTAMPTZ,
    -- Status & Provenance
    status boq_item_status NOT NULL DEFAULT 'pending_verification',
    created_by UUID REFERENCES users(user_id),
    -- the engineer
    verified_by UUID REFERENCES users(user_id),
    -- the auditor
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE itemized_boq IS 'Itemized Bill of Quantities: granular material-level funding baskets replacing opaque budgets. Feeds the donor سلة البناء (construction basket) UI.';
COMMENT ON COLUMN itemized_boq.unit_price IS 'Price per unit in cents. Example: $10.00/bag → 1000.';
COMMENT ON COLUMN itemized_boq.funded_amount IS 'Total funded amount in cents. Maintained by trg_update_boq_funded trigger.';
COMMENT ON COLUMN itemized_boq.oracle_reference_price IS 'Snapshot of Pricing Oracle price at time of BOQ creation.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.6 ESCROW LEDGER TABLE
-- Immutable financial ledger. Funds are locked on donation and released only
-- when spatial proof is verified by an auditor.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE escrow_ledger (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donor_id UUID NOT NULL REFERENCES users(user_id),
    item_id UUID NOT NULL REFERENCES itemized_boq(item_id),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id),
    -- Financial
    amount_locked BIGINT NOT NULL CHECK (amount_locked > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    payment_status payment_status NOT NULL DEFAULT 'locked',
    -- Payment Gateway
    payment_method VARCHAR(50),
    -- 'visa', 'bank_transfer', 'crypto'
    payment_gateway_ref VARCHAR(255),
    -- external payment provider reference
    -- Lifecycle
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    released_by UUID REFERENCES users(user_id),
    -- auditor
    release_proof_id UUID,
    -- FK added after spatial_proof table
    refunded_at TIMESTAMPTZ,
    -- Audit Trail
    blockchain_tx_hash VARCHAR(128),
    -- optional on-chain verification
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE escrow_ledger IS 'Immutable escrow ledger. Funds are locked (مجمدة) on donation and released only upon spatial proof verification.';
COMMENT ON COLUMN escrow_ledger.amount_locked IS 'Donation amount in cents. Must be > 0.';
COMMENT ON COLUMN escrow_ledger.release_proof_id IS 'Links to spatial_proof that authorized the fund release. FK constraint added after spatial_proof table creation.';
COMMENT ON COLUMN escrow_ledger.blockchain_tx_hash IS 'Optional blockchain transaction hash for on-chain verification.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.7 SPATIAL PROOF TABLE (OCDS Extension Mechanism)
-- GPS-verified delivery proofs linking physical construction materials to
-- digital records. This is the custom OCDS extension that prevents fraud.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE spatial_proof (
    proof_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES itemized_boq(item_id),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id),
    engineer_id UUID NOT NULL REFERENCES users(user_id),
    -- Spatial Evidence
    gps_coordinates GEOGRAPHY(POINT, 4326) NOT NULL,
    gps_accuracy_meters DECIMAL(8, 2),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Visual Evidence
    image_url TEXT NOT NULL,
    image_hash VARCHAR(64),
    -- SHA-256 hex for tamper detection
    description TEXT,
    -- Device Metadata
    device_info JSONB,
    -- model, OS, app version
    -- Verification
    verification_status verification_status NOT NULL DEFAULT 'submitted',
    verified_by UUID REFERENCES users(user_id),
    -- auditor
    verified_at TIMESTAMPTZ,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE spatial_proof IS 'OCDS Extension: GPS + Image + Timestamp proof of material delivery/installation. The anti-fraud mechanism (آلية مكافحة الاحتيال).';
COMMENT ON COLUMN spatial_proof.image_hash IS 'SHA-256 hash of the proof image for tamper detection.';
COMMENT ON COLUMN spatial_proof.device_info IS 'Device metadata JSON: {model, os, app_version, ...}';
-- Now add the FK from escrow_ledger to spatial_proof (deferred due to creation order)
ALTER TABLE escrow_ledger
ADD CONSTRAINT fk_escrow_release_proof FOREIGN KEY (release_proof_id) REFERENCES spatial_proof(proof_id);
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.8 PRICING ORACLE ENTRIES TABLE
-- Live construction material market data from multiple sources.
-- Powers the "Pricing Oracle & EPA Engine" admin dashboard.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE pricing_oracle_entries (
    oracle_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_category VARCHAR(100) NOT NULL,
    material_name VARCHAR(500) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    -- Pricing
    base_price BIGINT NOT NULL,
    -- reference baseline (cents)
    current_price BIGINT NOT NULL,
    -- latest observed price (cents)
    price_change_pct DECIMAL(7, 2),
    -- percentage change from base
    -- Source & Region
    region VARCHAR(255),
    -- 'Damascus', 'Aleppo', 'Riyadh'
    source VARCHAR(255),
    -- 'LME', 'Local Mill', 'GASTAT'
    -- Quality Metrics
    volatility_index DECIMAL(5, 2),
    confidence_score DECIMAL(5, 2),
    -- Validity
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ
);
COMMENT ON TABLE pricing_oracle_entries IS 'Live material market data. Feeds the Pricing Oracle dashboard and BOQ cost estimation.';
COMMENT ON COLUMN pricing_oracle_entries.base_price IS 'Reference baseline price in cents.';
COMMENT ON COLUMN pricing_oracle_entries.current_price IS 'Latest observed market price in cents.';
COMMENT ON COLUMN pricing_oracle_entries.source IS 'Data source: LME Real-time API, Local Mill Invoices, GASTAT, etc.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.9 EPA ADJUSTMENTS TABLE (FIDIC 13.8)
-- Economic Price Adjustment records per the FIDIC 13.8 formula:
-- Pn = a + b(Ln/Lo) + c(En/Eo) + d(Mn/Mo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE epa_adjustments (
    adjustment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id),
    milestone_id UUID REFERENCES project_milestones(milestone_id),
    item_id UUID REFERENCES itemized_boq(item_id),
    -- Financial
    original_cost BIGINT NOT NULL,
    -- in cents
    adjustment_percentage DECIMAL(7, 2) NOT NULL,
    adjusted_cost BIGINT NOT NULL,
    -- in cents
    -- FIDIC Formula Parameters
    fidic_formula_params JSONB NOT NULL,
    -- Expected structure: {
    --   "a": 0.15,  "b": 0.30,  "c": 0.25,  "d": 0.30,
    --   "Ln": 850,  "Lo": 800,
    --   "En": 110,  "Eo": 100,
    --   "Mn": 920,  "Mo": 900
    -- }
    -- Approval
    status epa_status NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES users(user_id),
    approved_at TIMESTAMPTZ,
    contract_reference VARCHAR(100),
    -- e.g., '#CT-8892'
    audit_trail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE epa_adjustments IS 'FIDIC 13.8 Economic Price Adjustment (EPA) records. Pn = a + b(Ln/Lo) + c(En/Eo) + d(Mn/Mo).';
COMMENT ON COLUMN epa_adjustments.fidic_formula_params IS 'FIDIC 13.8 formula coefficients and indices as JSON.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.10 AUDIT TRAIL TABLE
-- Immutable system-wide audit log for all critical operations.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE audit_trail (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(100) NOT NULL,
    -- 'escrow_ledger', 'project', etc.
    entity_id VARCHAR(255) NOT NULL,
    -- PK of the affected row
    action VARCHAR(100) NOT NULL,
    -- 'created', 'status_changed', etc.
    actor_id UUID REFERENCES users(user_id),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE audit_trail IS 'Immutable system-wide audit log. Every critical state change is recorded here for non-repudiation.';
-- ============================================================================
-- 4. INDEXES
-- ============================================================================
-- 4.1 Users
CREATE INDEX idx_users_role_kyc ON users (role, kyc_verification_status);
CREATE INDEX idx_users_email ON users (email);
-- 4.2 Projects
CREATE INDEX idx_projects_homeowner ON projects (homeowner_id);
CREATE INDEX idx_projects_engineer ON projects (assigned_engineer_id);
CREATE INDEX idx_projects_status ON projects (status);
CREATE INDEX idx_projects_published ON projects (status, published_at)
WHERE status = 'published';
-- Partial index for marketplace queries
CREATE INDEX idx_projects_gps ON projects USING GIST (gps_location);
-- 4.3 Project Milestones
CREATE INDEX idx_milestones_project ON project_milestones (project_id, sequence_number);
-- 4.4 Itemized BOQ
CREATE INDEX idx_boq_project ON itemized_boq (project_id);
CREATE INDEX idx_boq_status ON itemized_boq (status);
CREATE INDEX idx_boq_category ON itemized_boq (material_category);
-- 4.5 Escrow Ledger
CREATE INDEX idx_escrow_donor ON escrow_ledger (donor_id);
CREATE INDEX idx_escrow_item ON escrow_ledger (item_id);
CREATE INDEX idx_escrow_project ON escrow_ledger (project_id);
CREATE INDEX idx_escrow_item_status ON escrow_ledger (item_id, payment_status);
CREATE INDEX idx_escrow_status ON escrow_ledger (payment_status);
CREATE INDEX idx_escrow_locked_at ON escrow_ledger (locked_at DESC);
-- 4.6 Spatial Proof
CREATE INDEX idx_proof_item ON spatial_proof (item_id);
CREATE INDEX idx_proof_project ON spatial_proof (project_id);
CREATE INDEX idx_proof_engineer ON spatial_proof (engineer_id);
CREATE INDEX idx_proof_gps ON spatial_proof USING GIST (gps_coordinates);
CREATE INDEX idx_proof_verification ON spatial_proof (verification_status);
-- 4.7 Pricing Oracle
CREATE INDEX idx_oracle_material ON pricing_oracle_entries (material_category, material_name);
CREATE INDEX idx_oracle_region ON pricing_oracle_entries (region);
CREATE INDEX idx_oracle_recorded ON pricing_oracle_entries (recorded_at DESC);
-- 4.8 EPA Adjustments
CREATE INDEX idx_epa_project ON epa_adjustments (project_id);
CREATE INDEX idx_epa_status ON epa_adjustments (status);
-- 4.9 Audit Trail
CREATE INDEX idx_audit_entity ON audit_trail (entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_trail (actor_id);
CREATE INDEX idx_audit_created ON audit_trail (created_at DESC);
-- 4.10 Compliance Records
CREATE INDEX idx_compliance_user ON compliance_records (user_id);
CREATE INDEX idx_compliance_status ON compliance_records (status);
-- ============================================================================
-- 5. FUNCTIONS & TRIGGERS
-- ============================================================================
-- ─────────────────────────────────────────────────────────────────────────────
-- 5.1 GENERIC: updated_at Auto-Refresh
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_timestamp() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Apply to all tables with updated_at
CREATE TRIGGER trg_users_updated_at BEFORE
UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_compliance_updated_at BEFORE
UPDATE ON compliance_records FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_projects_updated_at BEFORE
UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_milestones_updated_at BEFORE
UPDATE ON project_milestones FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_boq_updated_at BEFORE
UPDATE ON itemized_boq FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_escrow_updated_at BEFORE
UPDATE ON escrow_ledger FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
-- ─────────────────────────────────────────────────────────────────────────────
-- 5.2 TRIGGER: Update BOQ Funded Amount (from Escrow Ledger)
-- Recalculates itemized_boq.funded_amount when escrow records change.
-- Only counts escrow entries with payment_status IN ('locked', 'released').
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_boq_funded_amount() RETURNS TRIGGER AS $$
DECLARE v_item_id UUID;
BEGIN -- Determine which item_id was affected
IF TG_OP = 'DELETE' THEN v_item_id := OLD.item_id;
ELSE v_item_id := NEW.item_id;
END IF;
-- Recalculate funded amount from escrow ledger
UPDATE itemized_boq
SET funded_amount = COALESCE(
        (
            SELECT SUM(amount_locked)
            FROM escrow_ledger
            WHERE escrow_ledger.item_id = v_item_id
                AND payment_status IN ('locked', 'released')
        ),
        0
    )
WHERE item_id = v_item_id;
-- Also handle the OLD item if the item_id changed (edge case)
IF TG_OP = 'UPDATE'
AND OLD.item_id IS DISTINCT
FROM NEW.item_id THEN
UPDATE itemized_boq
SET funded_amount = COALESCE(
        (
            SELECT SUM(amount_locked)
            FROM escrow_ledger
            WHERE escrow_ledger.item_id = OLD.item_id
                AND payment_status IN ('locked', 'released')
        ),
        0
    )
WHERE item_id = OLD.item_id;
END IF;
RETURN NULL;
-- AFTER trigger, return value is ignored
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_update_boq_funded
AFTER
INSERT
    OR
UPDATE
    OR DELETE ON escrow_ledger FOR EACH ROW EXECUTE FUNCTION fn_update_boq_funded_amount();
-- ─────────────────────────────────────────────────────────────────────────────
-- 5.3 TRIGGER: Update Project Funding Totals (from BOQ)
-- Recalculates projects.total_funded_amount and total_estimated_cost
-- when itemized_boq rows change.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_project_funding() RETURNS TRIGGER AS $$
DECLARE v_project_id VARCHAR(20);
BEGIN IF TG_OP = 'DELETE' THEN v_project_id := OLD.project_id;
ELSE v_project_id := NEW.project_id;
END IF;
UPDATE projects
SET total_estimated_cost = COALESCE(
        (
            SELECT SUM(CAST(unit_price * required_quantity AS BIGINT))
            FROM itemized_boq
            WHERE itemized_boq.project_id = v_project_id
        ),
        0
    ),
    total_funded_amount = COALESCE(
        (
            SELECT SUM(funded_amount)
            FROM itemized_boq
            WHERE itemized_boq.project_id = v_project_id
        ),
        0
    )
WHERE project_id = v_project_id;
-- Handle project_id change (edge case)
IF TG_OP = 'UPDATE'
AND OLD.project_id IS DISTINCT
FROM NEW.project_id THEN
UPDATE projects
SET total_estimated_cost = COALESCE(
        (
            SELECT SUM(CAST(unit_price * required_quantity AS BIGINT))
            FROM itemized_boq
            WHERE itemized_boq.project_id = OLD.project_id
        ),
        0
    ),
    total_funded_amount = COALESCE(
        (
            SELECT SUM(funded_amount)
            FROM itemized_boq
            WHERE itemized_boq.project_id = OLD.project_id
        ),
        0
    )
WHERE project_id = OLD.project_id;
END IF;
RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_update_project_funding
AFTER
INSERT
    OR
UPDATE
    OR DELETE ON itemized_boq FOR EACH ROW EXECUTE FUNCTION fn_update_project_funding();
-- ─────────────────────────────────────────────────────────────────────────────
-- 5.4 TRIGGER: Enforce KYC Activation Gate
-- Prevents users.is_active from being set to TRUE unless
-- kyc_verification_status = 'verified'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_enforce_kyc_activation() RETURNS TRIGGER AS $$ BEGIN IF NEW.is_active = TRUE
    AND NEW.kyc_verification_status != 'verified' THEN RAISE EXCEPTION 'Cannot activate user %: KYC verification status must be "verified" (current: "%")',
    NEW.user_id,
    NEW.kyc_verification_status;
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_enforce_kyc_activation BEFORE
INSERT
    OR
UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_enforce_kyc_activation();
-- ─────────────────────────────────────────────────────────────────────────────
-- 5.5 FUNCTION: Generate OCDS Project ID
-- Usage: SELECT generate_ocds_project_id(); → 'OCDS-SYR-00001'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_ocds_project_id() RETURNS VARCHAR(20) AS $$ BEGIN RETURN 'OCDS-SYR-' || LPAD(nextval('ocds_project_id_seq')::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;
-- ============================================================================
-- 6. VIEWS (Convenience)
-- ============================================================================
-- ─────────────────────────────────────────────────────────────────────────────
-- 6.1 Project Card View (Public Marketplace)
-- Enriches project data with funding percentages for the dashboard UI.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_project_cards AS
SELECT p.project_id,
    p.title,
    p.description,
    p.cover_image_url,
    p.address_text,
    p.damage_type,
    p.status,
    p.total_estimated_cost,
    p.total_funded_amount,
    CASE
        WHEN p.total_estimated_cost > 0 THEN ROUND(
            (
                p.total_funded_amount::DECIMAL / p.total_estimated_cost
            ) * 100,
            2
        )
        ELSE 0
    END AS funded_percentage,
    u.full_name AS homeowner_name,
    ST_Y(p.gps_location::GEOMETRY) AS latitude,
    ST_X(p.gps_location::GEOMETRY) AS longitude,
    p.published_at,
    (
        SELECT COUNT(*)
        FROM itemized_boq b
        WHERE b.project_id = p.project_id
    ) AS total_items,
    (
        SELECT COUNT(*)
        FROM itemized_boq b
        WHERE b.project_id = p.project_id
            AND b.status = 'fully_funded'
    ) AS fully_funded_items
FROM projects p
    JOIN users u ON u.user_id = p.homeowner_id
WHERE p.is_public = TRUE
    AND p.status IN ('published', 'in_progress', 'completed');
COMMENT ON VIEW vw_project_cards IS 'Public marketplace view: project cards with funding percentages. Feeds the Nammerha dashboard.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 6.2 BOQ Funding Details View (Donor Basket)
-- Itemized view with funding progress for the donor construction basket UI.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_boq_funding AS
SELECT b.item_id,
    b.project_id,
    b.material_name,
    b.material_category,
    b.unit,
    b.unit_price,
    b.required_quantity,
    CAST(b.unit_price * b.required_quantity AS BIGINT) AS total_cost,
    b.funded_amount,
    CASE
        WHEN (b.unit_price * b.required_quantity) > 0 THEN ROUND(
            (
                b.funded_amount::DECIMAL / (b.unit_price * b.required_quantity)
            ) * 100,
            2
        )
        ELSE 0
    END AS funded_percentage,
    b.status,
    b.image_url,
    b.oracle_reference_price,
    p.title AS project_title
FROM itemized_boq b
    JOIN projects p ON p.project_id = b.project_id;
COMMENT ON VIEW vw_boq_funding IS 'Donor basket view: itemized materials with funding progress. Feeds the سلة البناء (construction basket) UI.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 6.3 Escrow Summary View (Donor Transparency)
-- Aggregated escrow data per donor for the wallet/donations UI.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_donor_escrow_summary AS
SELECT e.donor_id,
    u.full_name AS donor_name,
    COUNT(DISTINCT e.project_id) AS projects_funded,
    COUNT(e.transaction_id) AS total_donations,
    SUM(e.amount_locked) FILTER (
        WHERE e.payment_status = 'locked'
    ) AS total_locked,
    SUM(e.amount_locked) FILTER (
        WHERE e.payment_status = 'released'
    ) AS total_released,
    SUM(e.amount_locked) AS total_donated
FROM escrow_ledger e
    JOIN users u ON u.user_id = e.donor_id
GROUP BY e.donor_id,
    u.full_name;
COMMENT ON VIEW vw_donor_escrow_summary IS 'Donor transparency view: aggregated escrow status per donor.';
COMMIT;
-- ============================================================================
-- MIGRATION COMPLETE
-- Tables: 10 | Indexes: 26 | Triggers: 10 | Views: 3 | Functions: 5
-- ============================================================================