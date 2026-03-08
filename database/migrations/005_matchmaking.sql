-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 005: Matchmaking Engine
-- Phase 2: Dynamic Scoring + Contractor Bidding System
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SCORING COLUMNS on users (for engineers/contractors)
-- Dynamic Score = weighted formula of performance metrics
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
ADD COLUMN IF NOT EXISTS completed_projects_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avg_response_hours DECIMAL(8, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS bid_win_rate DECIMAL(5, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS dynamic_score DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS specialty VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS service_radius_km INT DEFAULT 50;
COMMENT ON COLUMN users.completed_projects_count IS 'Total completed projects (engineer/contractor).';
COMMENT ON COLUMN users.avg_response_hours IS 'Average time to respond to match requests (hours).';
COMMENT ON COLUMN users.bid_win_rate IS 'Percentage of submitted bids that resulted in a hire (0-100).';
COMMENT ON COLUMN users.dynamic_score IS 'BuildZoom-style composite score (0-100). Calculated by matchmaking engine.';
COMMENT ON COLUMN users.specialty IS 'Primary specialty: structural, plumbing, electrical, mixed, finishing.';
COMMENT ON COLUMN users.service_radius_km IS 'Max travel distance for project assignments (km).';
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ENUM for bid status
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE bid_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'withdrawn',
    'expired'
);
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CONTRACTOR BIDS TABLE
-- Engineers/contractors submit competitive bids on published projects
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE contractor_bids (
    bid_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    engineer_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    -- Financial
    proposed_cost BIGINT NOT NULL CHECK (proposed_cost > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    -- Timeline
    estimated_days INT NOT NULL CHECK (estimated_days > 0),
    -- Proposal
    cover_letter TEXT,
    methodology TEXT,
    -- Status
    status bid_status NOT NULL DEFAULT 'pending',
    -- Scoring snapshot at time of bid
    engineer_score_snapshot DECIMAL(5, 2),
    -- Lifecycle
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    -- Constraints
    CONSTRAINT uq_bid_engineer_project UNIQUE (engineer_id, project_id)
);
COMMENT ON TABLE contractor_bids IS 'BuildZoom-style competitive bidding. Engineers submit proposals on published projects.';
COMMENT ON COLUMN contractor_bids.proposed_cost IS 'Total proposed cost in cents. Must be > 0.';
COMMENT ON COLUMN contractor_bids.engineer_score_snapshot IS 'Dynamic score at time of bid submission for historical reference.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_bids_project ON contractor_bids (project_id, status);
CREATE INDEX idx_bids_engineer ON contractor_bids (engineer_id, status);
CREATE INDEX idx_bids_submitted ON contractor_bids (submitted_at DESC);
CREATE INDEX idx_users_score ON users (dynamic_score DESC)
WHERE role IN ('engineer');
CREATE INDEX idx_users_specialty ON users (specialty)
WHERE role IN ('engineer');
-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Full-Text Search vector for engineer profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX idx_users_fts ON users USING GIN (search_vector);
-- Trigger to auto-update search vector
CREATE OR REPLACE FUNCTION fn_update_user_search_vector() RETURNS TRIGGER AS $$ BEGIN NEW.search_vector := setweight(
        to_tsvector('english', COALESCE(NEW.full_name, '')),
        'A'
    ) || setweight(
        to_tsvector('english', COALESCE(NEW.specialty, '')),
        'B'
    ) || setweight(
        to_tsvector('english', COALESCE(NEW.bio, '')),
        'C'
    );
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_users_search_vector BEFORE
INSERT
    OR
UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_update_user_search_vector();
-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Updated_at trigger for bids
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_bids_updated_at BEFORE
UPDATE ON contractor_bids FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
-- Add updated_at column to bids
ALTER TABLE contractor_bids
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
COMMIT;
-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 005 COMPLETE
-- New columns: 7 on users | New table: contractor_bids | Indexes: 5 | FTS: 1
-- ═══════════════════════════════════════════════════════════════════════════════