-- ============================================================================
-- Migration 043: UNIFIED ROLES — Grant All Roles to All Users
-- ============================================================================
-- Context: Nammerha is transitioning from a role-switching model to a unified
-- account model (inspired by Procore, Houzz, Buildertrend).
-- Every user gets all 5 active roles automatically. Donations (donor role)
-- are temporarily disabled via feature flag.
--
-- This migration is IDEMPOTENT: safe to run multiple times.
-- ============================================================================

-- Step 1: Grant all 5 roles to all existing users who don't have them
-- The first user's existing primary role stays as is_primary=TRUE.
-- All newly added roles get is_primary=FALSE.
INSERT INTO user_roles (user_id, role_id, status, is_primary)
SELECT u.user_id, r.role_id, 'active', FALSE
FROM users u
CROSS JOIN roles r
WHERE r.role_name IN ('homeowner', 'engineer', 'contractor', 'supplier', 'tradesperson')
  AND u.role NOT IN ('admin', 'auditor')  -- Don't touch admin/auditor accounts
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id
  );

-- Step 2: Create missing profile records for all users
-- Each profile table has ON CONFLICT DO NOTHING so this is safe to re-run.
INSERT INTO homeowner_profiles (user_id)
SELECT user_id FROM users WHERE role NOT IN ('admin', 'auditor')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO engineer_profiles (user_id)
SELECT user_id FROM users WHERE role NOT IN ('admin', 'auditor')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO contractor_profiles (user_id)
SELECT user_id FROM users WHERE role NOT IN ('admin', 'auditor')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO supplier_profiles (user_id)
SELECT user_id FROM users WHERE role NOT IN ('admin', 'auditor')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO tradesperson_profiles (user_id)
SELECT user_id FROM users WHERE role NOT IN ('admin', 'auditor')
ON CONFLICT (user_id) DO NOTHING;

-- Step 3: Verify — count should show all non-admin users × 5 roles
-- SELECT u.email, count(ur.role_id) as role_count
-- FROM users u
-- LEFT JOIN user_roles ur ON u.user_id = ur.user_id
-- WHERE u.role NOT IN ('admin', 'auditor')
-- GROUP BY u.email
-- ORDER BY role_count;
