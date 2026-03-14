-- ============================================================================
-- Migration 028: Multi-Role Unified Identity Schema
-- ============================================================================
-- PURPOSE: Transform Nammerha from single-role-per-user to Unified Identity
-- with Contextual Profiles (Class Table Inheritance pattern).
--
-- BACKWARD COMPATIBILITY:
--   - users.role column is KEPT as primary_role (existing code unchanged)
--   - New user_roles junction table enables multi-role support
--   - Profile tables store role-specific data (replaces STI anti-pattern)
--
-- TABLES CREATED:
--   1. roles           — Lookup table for all platform roles
--   2. user_roles      — Many-to-many junction (user ↔ role)
--   3. donor_profiles  — Donor-specific data (1:1 with users)
--   4. contractor_profiles — Contractor-specific data (1:1 with users)
--   5. engineer_profiles   — Engineer-specific data (1:1 with users)
--   6. supplier_profiles   — Supplier-specific data (1:1 with users)
--   7. tradesperson_profiles — Tradesperson-specific data (1:1 with users)
--   8. homeowner_profiles  — Homeowner-specific data (1:1 with users)
-- ============================================================================

BEGIN;

-- ─── 0. Extend user_role ENUM with missing values ──────────────────────────
-- The PostgreSQL ENUM currently has: donor, homeowner, engineer, supplier, admin, auditor
-- Missing: contractor, tradesperson (added in later migrations as table columns
-- but the ENUM itself was never updated). Fix that here.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'contractor' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'contractor';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'tradesperson' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'tradesperson';
    END IF;
END $$;

-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction on PG < 12.
-- On PG 12+ it can. We COMMIT here and re-open to ensure ENUM values are visible.
COMMIT;

BEGIN;

-- ─── 1. Roles Lookup Table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
    role_id          SERIAL       PRIMARY KEY,
    role_name        user_role    UNIQUE NOT NULL,
    display_name_en  TEXT         NOT NULL,
    display_name_ar  TEXT         NOT NULL,
    description_en   TEXT,
    description_ar   TEXT,
    requires_kyc     BOOLEAN      NOT NULL DEFAULT FALSE,
    requires_kyb     BOOLEAN      NOT NULL DEFAULT FALSE,
    is_self_assignable BOOLEAN    NOT NULL DEFAULT TRUE,
    icon_name        VARCHAR(50),
    sort_order       INT          NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE roles IS 'Lookup table defining all available platform roles with i18n display names and verification requirements';

-- ─── 2. User Roles Junction Table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_roles (
    id            UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role_id       INT          NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
    status        VARCHAR(20)  NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'pending_kyc', 'pending_kyb', 'suspended', 'revoked')),
    is_primary    BOOLEAN      NOT NULL DEFAULT FALSE,
    activated_at  TIMESTAMPTZ  DEFAULT NOW(),
    suspended_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_roles_status  ON user_roles(user_id, status) WHERE status = 'active';

COMMENT ON TABLE user_roles IS 'Junction table enabling many-to-many relationship between users and roles';

-- Ensure at most one primary role per user
CREATE UNIQUE INDEX uq_user_roles_primary ON user_roles(user_id) WHERE is_primary = TRUE;

-- ─── 3. Donor Profiles ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS donor_profiles (
    user_id              UUID        PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    total_donated_amount BIGINT      NOT NULL DEFAULT 0,
    donation_count       INT         NOT NULL DEFAULT 0,
    preferred_causes     TEXT[],
    tax_receipt_email    VARCHAR(255),
    is_anonymous_default BOOLEAN     NOT NULL DEFAULT FALSE,
    preferred_currency   VARCHAR(3)  DEFAULT 'USD',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE donor_profiles IS 'Donor-specific profile data: donation history, preferences, tax settings';

-- ─── 4. Contractor Profiles ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contractor_profiles (
    user_id                    UUID         PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    company_name               VARCHAR(255),
    trade_category             VARCHAR(100),
    commercial_license_number  VARCHAR(100),
    commercial_license_url     TEXT,
    insurance_document_url     TEXT,
    insurance_expiry           DATE,
    portfolio_urls             TEXT[],
    years_experience           INT,
    max_concurrent_projects    INT          DEFAULT 5,
    service_areas              TEXT[],
    verification_status        kyc_status   NOT NULL DEFAULT 'pending',
    verified_at                TIMESTAMPTZ,
    verified_by                UUID         REFERENCES users(user_id),
    created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contractor_profiles IS 'Contractor-specific profile: business licenses, insurance, portfolio, verification';

-- ─── 5. Engineer Profiles ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineer_profiles (
    user_id                    UUID         PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    engineering_license_number VARCHAR(100),
    engineering_license_url    TEXT,
    specialization             VARCHAR(100),
    university                 VARCHAR(255),
    graduation_year            INT,
    years_experience           INT,
    certification_urls         TEXT[],
    professional_memberships   TEXT[],
    verification_status        kyc_status   NOT NULL DEFAULT 'pending',
    verified_at                TIMESTAMPTZ,
    verified_by                UUID         REFERENCES users(user_id),
    created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE engineer_profiles IS 'Engineer-specific profile: license, specialization, certifications, verification';

-- ─── 6. Supplier Profiles ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_profiles (
    user_id                    UUID         PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    company_name               VARCHAR(255),
    commercial_register_number VARCHAR(100),
    commercial_register_url    TEXT,
    warehouse_address          TEXT,
    supply_categories          TEXT[],
    delivery_radius_km         INT          DEFAULT 100,
    min_order_amount           BIGINT       DEFAULT 0,
    verification_status        kyc_status   NOT NULL DEFAULT 'pending',
    verified_at                TIMESTAMPTZ,
    verified_by                UUID         REFERENCES users(user_id),
    created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE supplier_profiles IS 'Supplier-specific profile: commercial registration, warehouse, supply categories';

-- ─── 7. Tradesperson Profiles ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tradesperson_profiles (
    user_id              UUID         PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    trade_type           VARCHAR(50),
    guild_membership_id  VARCHAR(100),
    guild_document_url   TEXT,
    years_experience     INT,
    daily_rate           BIGINT,
    tools_owned          TEXT[],
    availability_status  VARCHAR(20)  DEFAULT 'available'
                         CHECK (availability_status IN ('available', 'busy', 'offline')),
    verification_status  kyc_status   NOT NULL DEFAULT 'pending',
    verified_at          TIMESTAMPTZ,
    verified_by          UUID         REFERENCES users(user_id),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tradesperson_profiles IS 'Tradesperson-specific profile: trade type, guild membership, daily rate';

-- ─── 8. Homeowner Profiles ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS homeowner_profiles (
    user_id              UUID         PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    property_address     TEXT,
    property_type        VARCHAR(50),
    ownership_proof_url  TEXT,
    family_size          INT,
    displacement_status  VARCHAR(50),
    verification_status  kyc_status   NOT NULL DEFAULT 'pending',
    verified_at          TIMESTAMPTZ,
    verified_by          UUID         REFERENCES users(user_id),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE homeowner_profiles IS 'Homeowner-specific profile: property details, ownership proof, displacement status';

-- ─── 9. Seed Roles Data ─────────────────────────────────────────────────────

INSERT INTO roles (role_name, display_name_en, display_name_ar, description_en, description_ar, requires_kyc, requires_kyb, is_self_assignable, icon_name, sort_order)
VALUES
    ('donor',        'Donor',        'مانح',       'Fund reconstruction projects and track impact',        'تمويل مشاريع الإعمار وتتبع الأثر',    TRUE,  FALSE, TRUE,  'heart',       1),
    ('homeowner',    'Homeowner',    'صاحب منزل',  'Report property damage and request reconstruction',    'الإبلاغ عن أضرار الممتلكات وطلب الترميم', TRUE,  FALSE, TRUE,  'home',        2),
    ('engineer',     'Engineer',     'مهندس',      'Assess damage, create BOQs, and verify work',          'تقييم الأضرار وإنشاء جداول الكميات والتحقق', TRUE,  TRUE,  TRUE,  'hard-hat',    3),
    ('contractor',   'Contractor',   'مقاول',      'Bid on projects and manage reconstruction work',       'تقديم عطاءات وإدارة أعمال الإعمار',    TRUE,  TRUE,  TRUE,  'building',    4),
    ('tradesperson', 'Tradesperson', 'حرفي',       'Provide skilled trade services for reconstruction',    'تقديم خدمات حرفية متخصصة للإعمار',     TRUE,  TRUE,  TRUE,  'wrench',      5),
    ('supplier',     'Supplier',     'مورد',       'Supply construction materials and manage deliveries',  'توريد مواد البناء وإدارة عمليات التسليم', TRUE,  TRUE,  TRUE,  'truck',       6),
    ('admin',        'Admin',        'مدير',       'Platform administration and oversight',                'إدارة المنصة والإشراف',               FALSE, FALSE, FALSE, 'shield',      7),
    ('auditor',      'Auditor',      'مدقق',       'Financial auditing and compliance verification',       'التدقيق المالي والتحقق من الامتثال',    FALSE, FALSE, FALSE, 'clipboard',   8)
ON CONFLICT (role_name) DO NOTHING;

-- ─── 10. Migrate Existing Users to user_roles ───────────────────────────────

-- Insert each existing user's current single role into user_roles as their primary
INSERT INTO user_roles (user_id, role_id, status, is_primary, activated_at)
SELECT
    u.user_id,
    r.role_id,
    'active',
    TRUE,
    u.created_at  -- preserve original activation time
FROM users u
JOIN roles r ON r.role_name = u.role
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ─── 11. Create donor_profiles for existing donors ──────────────────────────

INSERT INTO donor_profiles (user_id, total_donated_amount, created_at)
SELECT u.user_id, 0, u.created_at
FROM users u
WHERE u.role = 'donor'
ON CONFLICT (user_id) DO NOTHING;

-- ─── 12. Create contractor_profiles for existing contractors ────────────────

INSERT INTO contractor_profiles (user_id, commercial_license_number, verification_status, created_at)
SELECT u.user_id, u.commercial_register_number, u.kyc_verification_status, u.created_at
FROM users u
WHERE u.role = 'contractor'
ON CONFLICT (user_id) DO NOTHING;

-- ─── 13. Create engineer_profiles for existing engineers ────────────────────

INSERT INTO engineer_profiles (user_id, engineering_license_number, specialization, verification_status, created_at)
SELECT u.user_id, u.engineering_license_number, u.specialty, u.kyc_verification_status, u.created_at
FROM users u
WHERE u.role = 'engineer'
ON CONFLICT (user_id) DO NOTHING;

-- ─── 14. Create supplier_profiles for existing suppliers ────────────────────

INSERT INTO supplier_profiles (user_id, commercial_register_number, verification_status, created_at)
SELECT u.user_id, u.commercial_register_number, u.kyc_verification_status, u.created_at
FROM users u
WHERE u.role = 'supplier'
ON CONFLICT (user_id) DO NOTHING;

-- ─── 15. Create tradesperson_profiles for existing tradespersons ────────────

INSERT INTO tradesperson_profiles (user_id, guild_membership_id, verification_status, created_at)
SELECT u.user_id, u.guild_membership_id, u.kyc_verification_status, u.created_at
FROM users u
WHERE u.role = 'tradesperson'
ON CONFLICT (user_id) DO NOTHING;

-- ─── 16. Create homeowner_profiles for existing homeowners ──────────────────

INSERT INTO homeowner_profiles (user_id, verification_status, created_at)
SELECT u.user_id, u.kyc_verification_status, u.created_at
FROM users u
WHERE u.role = 'homeowner'
ON CONFLICT (user_id) DO NOTHING;

-- ─── 17. Updated_at trigger for profile tables ──────────────────────────────

-- Reuse existing fn_update_timestamp for all profile tables
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'donor_profiles', 'contractor_profiles', 'engineer_profiles',
        'supplier_profiles', 'tradesperson_profiles', 'homeowner_profiles'
    ]) LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW
             EXECUTE FUNCTION fn_update_timestamp()',
            tbl, tbl
        );
    END LOOP;
END $$;

COMMIT;
