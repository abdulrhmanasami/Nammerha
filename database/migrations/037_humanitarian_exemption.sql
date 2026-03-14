-- ============================================================================
-- Migration 037: Humanitarian Commission Exemption
-- Adds project_type to projects table for explicit commercial/humanitarian
-- classification. Commission engine skips humanitarian projects.
-- ============================================================================
-- ETHICAL RULE: Supplier commissions (15%→12%→10%) apply ONLY to commercial
-- (homeowner-funded) projects. Humanitarian/donor-funded reconstruction
-- projects are ALWAYS exempt — "إنساني معفى".
-- This aligns with escrow fee exemption in migration 035.
-- ============================================================================
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add project_type column to projects table
-- Default: 'commercial' (backward compatible — all existing projects)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'project_type'
    ) THEN
        ALTER TABLE projects
        ADD COLUMN project_type VARCHAR(20) NOT NULL DEFAULT 'commercial'
        CHECK (project_type IN ('commercial', 'humanitarian'));
    END IF;
END $$;

COMMENT ON COLUMN projects.project_type IS
    'commercial = homeowner-funded (commissions apply). humanitarian = donor-funded (إنساني معفى — commissions exempt). Per study §1+§3.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Index for commission exemption queries
-- The commission service JOINs projects to check project_type on every PO.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects (project_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Auto-classify existing donor-funded projects as humanitarian
-- A project is donor-funded if it has received escrow deposits from donors
-- (i.e., total_funded_amount > 0 AND homeowner hasn't self-funded).
-- This is a heuristic — admin can reclassify manually if needed.
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: Conservative approach — only mark projects that are 100% donor-funded.
-- Leave mixed-funded projects as 'commercial' for manual admin review.
UPDATE projects
SET    project_type = 'humanitarian'
WHERE  total_funded_amount > 0
  AND  total_estimated_cost > 0
  AND  total_funded_amount >= total_estimated_cost;

COMMIT;
-- ============================================================================
-- MIGRATION COMPLETE
-- Column: projects.project_type (commercial | humanitarian)
-- Index: idx_projects_type
-- Heuristic: Fully donor-funded projects auto-classified as humanitarian
-- ============================================================================
