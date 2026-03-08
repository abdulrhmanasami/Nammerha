-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 008: Global Compliance & Security Events
-- Epic 09: OFAC SDN Screening, Export Controls, Cybersecurity Audit Logs
-- ═══════════════════════════════════════════════════════════════════════════════
-- Implements sections 5.2 + 5.3 of the Execution Plan:
--   "محرك الامتثال الدولي (Global Compliance Engine)"
--   SDN list is stored LOCALLY (downloaded CSV), NOT via real-time OFAC API.
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
-- Install pg_trgm if not already present (for fuzzy name matching)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SDN ENTRIES — Local mirror of OFAC Specially Designated Nationals list
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE sdn_entity_type AS ENUM ('individual', 'entity', 'vessel', 'aircraft');
CREATE TABLE sdn_entries (
    sdn_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- From OFAC SDN CSV fields
    sdn_name TEXT NOT NULL,
    -- Primary name
    sdn_type sdn_entity_type NOT NULL DEFAULT 'individual',
    aliases TEXT [],
    -- Array of AKAs
    country VARCHAR(3),
    -- ISO 3166-1 alpha-3
    id_numbers TEXT [],
    -- Passport, national ID, etc.
    source VARCHAR(50) NOT NULL DEFAULT 'OFAC_SDN',
    -- OFAC_SDN, EU, UN, etc.
    program TEXT,
    -- OFAC program (e.g. 'SYRIA')
    remarks TEXT,
    -- Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT true,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE sdn_entries IS 'Local mirror of OFAC SDN list + other sanctions lists. Updated via periodic CSV import. Fuzzy matched via pg_trgm trigram similarity.';
-- Trigram index for fuzzy name matching
CREATE INDEX idx_sdn_name_trgm ON sdn_entries USING GIN (sdn_name gin_trgm_ops);
CREATE INDEX idx_sdn_source ON sdn_entries (source, is_active);
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SANCTIONS SCREENING RESULTS — Per-user screening outcomes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE screening_status AS ENUM (
    'clear',
    'potential_match',
    'confirmed_match',
    'false_positive'
);
CREATE TABLE sanctions_screening_results (
    result_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    screened_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    -- Match details
    matched_sdn_id UUID REFERENCES sdn_entries(sdn_id),
    match_score DECIMAL(5, 4) NOT NULL DEFAULT 0,
    -- 0.0000 to 1.0000 similarity
    matched_name TEXT,
    -- The SDN name that matched
    screened_name TEXT NOT NULL,
    -- The user's name as submitted
    -- Status
    status screening_status NOT NULL DEFAULT 'clear',
    -- Review
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    -- Auto-action
    auto_blocked BOOLEAN NOT NULL DEFAULT false,
    -- Lifecycle
    screened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE sanctions_screening_results IS 'Results of SDN fuzzy matching per user. Admin reviews potential_match entries to clear or confirm.';
CREATE INDEX idx_screening_user ON sanctions_screening_results (screened_user_id, screened_at DESC);
CREATE INDEX idx_screening_status ON sanctions_screening_results (status)
WHERE status != 'clear';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CONTROLLED MATERIALS — Admin reference table for dual-use items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE controlled_materials (
    material_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_name TEXT NOT NULL,
    material_category VARCHAR(100) NOT NULL,
    hs_code VARCHAR(20),
    -- Harmonized System tariff code
    regulation TEXT NOT NULL DEFAULT 'EAR',
    -- EAR, ITAR, EU Dual-Use
    description TEXT,
    risk_level VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (
        risk_level IN ('low', 'medium', 'high', 'critical')
    ),
    -- Lifecycle
    added_by UUID REFERENCES users(user_id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE controlled_materials IS 'Admin-managed reference table of dual-use material categories subject to export controls.';
CREATE INDEX idx_controlled_category ON controlled_materials (material_category, is_active);
CREATE INDEX idx_controlled_name_trgm ON controlled_materials USING GIN (material_name gin_trgm_ops);
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ALTER itemized_boq — Add dual-use flag
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE itemized_boq
ADD COLUMN IF NOT EXISTS is_dual_use BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE itemized_boq
ADD COLUMN IF NOT EXISTS dual_use_regulation TEXT;
COMMENT ON COLUMN itemized_boq.is_dual_use IS 'Flagged by compliance service when material matches controlled_materials reference.';
COMMENT ON COLUMN itemized_boq.dual_use_regulation IS 'Applicable regulation (EAR, ITAR, EU) if dual-use flagged.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SECURITY EVENTS — Incident log (separate from audit_trail)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE security_event_type AS ENUM (
    'login_success',
    'login_failure',
    'access_denied',
    'escrow_locked',
    'escrow_released',
    'escrow_refunded',
    'sanctions_screening',
    'sanctions_match_found',
    'dual_use_flagged',
    'account_locked',
    'password_changed',
    'kyc_status_changed',
    'suspicious_activity'
);
CREATE TYPE security_severity AS ENUM ('info', 'low', 'medium', 'high', 'critical');
CREATE TABLE security_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type security_event_type NOT NULL,
    severity security_severity NOT NULL DEFAULT 'info',
    -- Actor (may be null for system events)
    actor_id UUID REFERENCES users(user_id),
    actor_role VARCHAR(20),
    -- Context
    target_entity_type VARCHAR(50),
    -- 'user', 'escrow', 'project', etc.
    target_entity_id TEXT,
    -- Network
    ip_address INET,
    user_agent TEXT,
    -- Payload (structured data for CEF/JSON export)
    payload JSONB NOT NULL DEFAULT '{}',
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE security_events IS 'Security incident log. Separate from audit_trail (business events). Exportable as CEF/JSON for SIEM integration and FATF AML/CTF compliance.';
CREATE INDEX idx_security_type ON security_events (event_type, created_at DESC);
CREATE INDEX idx_security_severity ON security_events (severity, created_at DESC)
WHERE severity IN ('high', 'critical');
CREATE INDEX idx_security_actor ON security_events (actor_id, created_at DESC);
-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_sdn_entries_updated_at BEFORE
UPDATE ON sdn_entries FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_controlled_materials_updated_at BEFORE
UPDATE ON controlled_materials FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMIT;
-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 008 COMPLETE
-- New tables: sdn_entries, sanctions_screening_results, controlled_materials,
--             security_events
-- Altered: itemized_boq (+is_dual_use, +dual_use_regulation)
-- Enums: sdn_entity_type, screening_status, security_event_type, security_severity
-- Extensions: pg_trgm (for fuzzy name matching)
-- ═══════════════════════════════════════════════════════════════════════════════