-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 006: Client Dashboard
-- Phase 2: Daily Logs + Digital Approvals
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DAILY CONSTRUCTION LOGS
-- Engineers submit daily progress reports with images
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE daily_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    engineer_id UUID NOT NULL REFERENCES users(user_id),
    -- Content
    description TEXT NOT NULL,
    work_completed TEXT,
    issues_encountered TEXT,
    weather_conditions VARCHAR(50),
    workers_on_site INT DEFAULT 0,
    -- Media
    images JSONB DEFAULT '[]',
    -- Lifecycle
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One log per engineer per project per day
    CONSTRAINT uq_daily_log UNIQUE (project_id, engineer_id, log_date)
);
COMMENT ON TABLE daily_logs IS 'Construction daily logs (Houzz-Pro-style). Engineers submit daily progress.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DIGITAL APPROVALS
-- Homeowner/donor approves finishing materials before PO issuance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TABLE digital_approvals (
    approval_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    item_id UUID REFERENCES itemized_boq(item_id),
    -- Parties
    requester_id UUID NOT NULL REFERENCES users(user_id),
    approver_id UUID REFERENCES users(user_id),
    -- Content
    title VARCHAR(255) NOT NULL,
    description TEXT,
    material_sample_url TEXT,
    material_options JSONB DEFAULT '[]',
    -- Decision
    status approval_status NOT NULL DEFAULT 'pending',
    decision_note TEXT,
    decided_at TIMESTAMPTZ,
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE digital_approvals IS 'Digital approval workflow — homeowner/donor approves finishing materials electronically.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_daily_logs_project ON daily_logs (project_id, log_date DESC);
CREATE INDEX idx_daily_logs_engineer ON daily_logs (engineer_id, log_date DESC);
CREATE INDEX idx_approvals_project ON digital_approvals (project_id, status);
CREATE INDEX idx_approvals_approver ON digital_approvals (approver_id, status);
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TRIGGERS for updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_daily_logs_updated_at BEFORE
UPDATE ON daily_logs FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_approvals_updated_at BEFORE
UPDATE ON digital_approvals FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMIT;
-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 006 COMPLETE
-- New tables: daily_logs, digital_approvals | Indexes: 4 | Triggers: 2
-- ═══════════════════════════════════════════════════════════════════════════════