-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 011: Contractor Role Separation
-- Separates contractor from engineer per FIDIC duty-of-care separation.
-- Engineer = supervises/designs | Contractor = executes/bids
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add 'contractor' to user_role enum
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE user_role
ADD VALUE IF NOT EXISTS 'contractor';
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add assigned_contractor_id to projects table
--    Engineer assesses/supervises. Contractor executes.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS assigned_contractor_id UUID REFERENCES users(user_id);
COMMENT ON COLUMN projects.assigned_contractor_id IS 'The contractor (متعهد) assigned to execute this project. Set when a bid is accepted.';
CREATE INDEX IF NOT EXISTS idx_projects_contractor ON projects (assigned_contractor_id)
WHERE assigned_contractor_id IS NOT NULL;
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add contractor_id column to contractor_bids
--    Non-breaking: keeps engineer_id for backward compat, adds contractor_id
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE contractor_bids
ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES users(user_id);
COMMENT ON COLUMN contractor_bids.contractor_id IS 'The contractor who submitted this bid. Replaces engineer_id for new bids.';
CREATE INDEX IF NOT EXISTS idx_bids_contractor ON contractor_bids (contractor_id, status)
WHERE contractor_id IS NOT NULL;
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Update partial indexes to include contractor role
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_users_score;
CREATE INDEX idx_users_score ON users (dynamic_score DESC)
WHERE role IN ('engineer', 'contractor');
DROP INDEX IF EXISTS idx_users_specialty;
CREATE INDEX idx_users_specialty ON users (specialty)
WHERE role IN ('engineer', 'contractor');
COMMIT;
-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 011 COMPLETE
-- New enum value: contractor | New column: assigned_contractor_id, contractor_id
-- Updated indexes: 2 rebuilt with contractor role included
-- ═══════════════════════════════════════════════════════════════════════════════