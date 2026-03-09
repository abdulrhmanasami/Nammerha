-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 012: Tradesperson Role & Dual-Mode Tables
-- أصحاب المهن: بلاط، دهان، سباكة، كهرباء، نجارة، لحام، بناء، تجصيص، تكييف
-- Mode 1: Thumbtack (homeowner → tradesperson direct)
-- Mode 2: Subcontractor (contractor → assigns tradesperson to project)
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add 'tradesperson' to user_role enum
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE user_role
ADD VALUE IF NOT EXISTS 'tradesperson';
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trade type enum — 10 construction trades
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE trade_type AS ENUM (
    'tiling',
    -- بلاط
    'painting',
    -- دهان
    'plumbing',
    -- سباكة / تمديدات صحية
    'electrical',
    -- كهرباء
    'carpentry',
    -- نجارة
    'welding',
    -- لحام
    'masonry',
    -- بناء حجر / بلوك
    'plastering',
    -- تجصيص / قصارة
    'hvac',
    -- تدفئة وتكييف
    'general' -- أعمال عامة
);
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Availability status enum
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE availability_status AS ENUM (
    'available',
    -- متاح للعمل
    'busy',
    -- مشغول حالياً
    'offline' -- غير متصل
);
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Service request urgency
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE request_urgency AS ENUM (
    'routine',
    -- عادي
    'urgent',
    -- مستعجل
    'emergency' -- طارئ
);
-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Tradesperson-specific columns on users table
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
ADD COLUMN IF NOT EXISTS trade trade_type DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS secondary_trades trade_type [] DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS hourly_rate INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS daily_rate INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS availability availability_status DEFAULT 'offline',
    ADD COLUMN IF NOT EXISTS years_experience INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS completed_jobs_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3, 2) DEFAULT NULL;
COMMENT ON COLUMN users.trade IS 'Primary trade specialty for tradespeople (بلاط، دهان، الخ).';
COMMENT ON COLUMN users.secondary_trades IS 'Additional trades the person can perform.';
COMMENT ON COLUMN users.hourly_rate IS 'Hourly rate in cents (USD).';
COMMENT ON COLUMN users.daily_rate IS 'Daily rate in cents (USD).';
COMMENT ON COLUMN users.availability IS 'Current availability status for matching.';
COMMENT ON COLUMN users.years_experience IS 'Total years of trade experience.';
COMMENT ON COLUMN users.completed_jobs_count IS 'Total completed jobs (direct + subcontract).';
COMMENT ON COLUMN users.average_rating IS 'Average rating from homeowners/contractors (1.00-5.00).';
-- ─────────────────────────────────────────────────────────────────────────────
-- 6. SERVICE REQUESTS TABLE (Thumbtack Mode)
--    Homeowner posts a repair/maintenance request → matched to tradesperson
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE service_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    homeowner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    -- What trade is needed
    trade_needed trade_type NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    -- Location
    gps_location GEOGRAPHY(POINT, 4326) DEFAULT NULL,
    address_text VARCHAR(500) DEFAULT NULL,
    -- Urgency & Budget
    urgency request_urgency NOT NULL DEFAULT 'routine',
    budget_min INT DEFAULT NULL,
    -- cents
    budget_max INT DEFAULT NULL,
    -- cents
    -- Matching
    assigned_tradesperson_id UUID REFERENCES users(user_id),
    -- Status
    status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (
        status IN (
            'open',
            'matched',
            'in_progress',
            'completed',
            'cancelled',
            'expired'
        )
    ),
    -- Lifecycle
    matched_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE service_requests IS 'Thumbtack-style direct service requests from homeowners to tradespeople.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 7. TRADE ASSIGNMENTS TABLE (Subcontractor Mode)
--    Contractor assigns tradespeople to specific tasks within a project
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE trade_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    tradesperson_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    -- Task details
    trade_required trade_type NOT NULL,
    scope_description TEXT NOT NULL,
    -- Rate
    agreed_rate INT NOT NULL CHECK (agreed_rate > 0),
    -- cents
    rate_type VARCHAR(10) NOT NULL DEFAULT 'daily' CHECK (rate_type IN ('hourly', 'daily', 'fixed')),
    estimated_days INT DEFAULT NULL,
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'accepted',
            'declined',
            'in_progress',
            'completed',
            'cancelled'
        )
    ),
    -- Lifecycle
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL,
    responded_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Prevent duplicate assignments for same trade on same project
    CONSTRAINT uq_assignment_trade_project UNIQUE (tradesperson_id, project_id, trade_required)
);
COMMENT ON TABLE trade_assignments IS 'Contractor assigns tradespeople as subcontractors to specific project tasks.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 8. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
-- Users
CREATE INDEX IF NOT EXISTS idx_users_trade ON users (trade)
WHERE role = 'tradesperson';
CREATE INDEX IF NOT EXISTS idx_users_availability ON users (availability, trade)
WHERE role = 'tradesperson';
CREATE INDEX IF NOT EXISTS idx_users_rating ON users (average_rating DESC NULLS LAST)
WHERE role = 'tradesperson';
-- Service Requests
CREATE INDEX idx_sr_homeowner ON service_requests (homeowner_id, status);
CREATE INDEX idx_sr_trade ON service_requests (trade_needed, status)
WHERE status = 'open';
CREATE INDEX idx_sr_location ON service_requests USING GIST (gps_location)
WHERE status = 'open';
CREATE INDEX idx_sr_created ON service_requests (created_at DESC);
-- Trade Assignments
CREATE INDEX idx_ta_contractor ON trade_assignments (contractor_id, status);
CREATE INDEX idx_ta_tradesperson ON trade_assignments (tradesperson_id, status);
CREATE INDEX idx_ta_project ON trade_assignments (project_id);
-- ─────────────────────────────────────────────────────────────────────────────
-- 9. TRIGGERS — auto-update updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_sr_updated_at BEFORE
UPDATE ON service_requests FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_ta_updated_at BEFORE
UPDATE ON trade_assignments FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
-- Update partial indexes to include tradesperson in scoring
DROP INDEX IF EXISTS idx_users_score;
CREATE INDEX idx_users_score ON users (dynamic_score DESC)
WHERE role IN ('engineer', 'contractor', 'tradesperson');
DROP INDEX IF EXISTS idx_users_specialty;
CREATE INDEX idx_users_specialty ON users (specialty)
WHERE role IN ('engineer', 'contractor', 'tradesperson');
COMMIT;
-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 012 COMPLETE
-- New enum value: tradesperson | New enums: trade_type, availability_status, request_urgency
-- New columns: 8 on users | New tables: service_requests, trade_assignments
-- Indexes: 10 | Triggers: 2
-- ═══════════════════════════════════════════════════════════════════════════════