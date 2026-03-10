-- ============================================================================
-- Migration 018: Align project_status enum with application service layer
-- ============================================================================
-- The open-data.service.ts and OCDS mapping functions reference three
-- project_status values that don't exist in the database enum:
--   - 'under_review'    → projects awaiting final inspection
--   - 'funding_complete' → projects fully funded, before construction starts
--   - 'suspended'        → projects temporarily paused (distinct from cancelled)
--
-- This causes a 500 Internal Server Error on GET /api/open-data/stats because
-- the SQL query uses IN('in_progress','under_review') but 'under_review' is
-- not a valid enum value.
--
-- PostgreSQL ALTER TYPE ... ADD VALUE is transactional-safe since PG 12.
-- Values are added AFTER existing values in the enum order. The position
-- clauses ensure correct lifecycle ordering.
-- ============================================================================
BEGIN;
-- Add 'funding_complete' after 'published' (lifecycle step: funds secured → work begins)
ALTER TYPE project_status
ADD VALUE IF NOT EXISTS 'funding_complete'
AFTER 'published';
-- Add 'under_review' after 'in_progress' (lifecycle step: work done → pending inspection)
ALTER TYPE project_status
ADD VALUE IF NOT EXISTS 'under_review'
AFTER 'in_progress';
-- Add 'suspended' before 'cancelled' (lifecycle step: temporarily paused, may resume)
ALTER TYPE project_status
ADD VALUE IF NOT EXISTS 'suspended' BEFORE 'cancelled';
COMMIT;
-- ============================================================================
-- Fix cover_image_url: storage.nammerha.com has no DNS record.
-- Update to use the main domain with a /storage/ prefix that can be
-- proxied to the actual storage backend (MinIO/S3).
-- ============================================================================
UPDATE projects
SET cover_image_url = REPLACE(
        cover_image_url,
        'https://storage.nammerha.com/',
        '/storage/'
    )
WHERE cover_image_url LIKE 'https://storage.nammerha.com/%';
-- Verify the fix
-- SELECT cover_image_url FROM projects WHERE cover_image_url IS NOT NULL;