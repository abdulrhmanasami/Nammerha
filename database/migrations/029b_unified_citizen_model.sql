-- ============================================================================
-- Migration 029: Unified Citizen Model
-- Grants ALL self-assignable roles to ALL existing users as 'active'.
-- Creates profile rows for each role-specific profile table.
-- This migration is IDEMPOTENT — safe to run multiple times.
-- ============================================================================

BEGIN;

-- ─── 1. Grant ALL self-assignable roles to ALL existing users ───────────────
-- Every user becomes a full citizen with access to all platform tools.
-- Primary role remains unchanged (the one they originally registered with).

INSERT INTO user_roles (user_id, role_id, status, is_primary, activated_at)
SELECT u.user_id, r.role_id, 'active',
       (r.role_name = u.role),  -- preserve original primary flag
       NOW()
FROM users u
CROSS JOIN roles r
WHERE r.is_self_assignable = TRUE
ON CONFLICT (user_id, role_id) DO UPDATE SET
    status = 'active',  -- reactivate any deactivated roles
    activated_at = CASE
        WHEN user_roles.status = 'active' THEN user_roles.activated_at
        ELSE NOW()
    END;

-- ─── 2. Create donor_profiles for ALL users ────────────────────────────────
INSERT INTO donor_profiles (user_id, total_donated_amount, created_at)
SELECT u.user_id, 0, NOW()
FROM users u
ON CONFLICT (user_id) DO NOTHING;

-- ─── 3. Create homeowner_profiles for ALL users ────────────────────────────
INSERT INTO homeowner_profiles (user_id, created_at)
SELECT u.user_id, NOW()
FROM users u
ON CONFLICT (user_id) DO NOTHING;

-- ─── 4. Create engineer_profiles for ALL users ─────────────────────────────
INSERT INTO engineer_profiles (user_id, created_at)
SELECT u.user_id, NOW()
FROM users u
ON CONFLICT (user_id) DO NOTHING;

-- ─── 5. Create contractor_profiles for ALL users ───────────────────────────
INSERT INTO contractor_profiles (user_id, created_at)
SELECT u.user_id, NOW()
FROM users u
ON CONFLICT (user_id) DO NOTHING;

-- ─── 6. Create supplier_profiles for ALL users ─────────────────────────────
INSERT INTO supplier_profiles (user_id, created_at)
SELECT u.user_id, NOW()
FROM users u
ON CONFLICT (user_id) DO NOTHING;

-- ─── 7. Create tradesperson_profiles for ALL users ─────────────────────────
INSERT INTO tradesperson_profiles (user_id, created_at)
SELECT u.user_id, NOW()
FROM users u
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
