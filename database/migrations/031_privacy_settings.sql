-- ============================================================================
-- Migration 031: Per-Profile Privacy Controls
-- ============================================================================
-- PURPOSE: Granular field-level privacy settings for each user profile.
-- Uses JSONB for flexible, schema-evolvable visibility controls.
--
-- VISIBILITY TIERS:
--   'public'          — visible to any authenticated user
--   'project_members' — visible only to users sharing a project
--   'private'         — visible only to the profile owner (and admins)
--
-- TABLES CREATED:
--   1. privacy_settings — per-user JSONB privacy configuration
--
-- TRIGGER: Auto-creates default privacy settings when a profile is created
-- ============================================================================

BEGIN;

-- ─── 1. Privacy Settings Table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS privacy_settings (
    user_id           UUID         PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    settings          JSONB        NOT NULL DEFAULT '{}',
    consent_version   INT          NOT NULL DEFAULT 1,
    consent_given_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_reviewed_at  TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE privacy_settings IS 'Per-user field-level privacy: maps profile fields to visibility tiers (public/project_members/private)';
COMMENT ON COLUMN privacy_settings.settings IS 'JSONB: { "role_name": { "field_name": "public|project_members|private" } }';
COMMENT ON COLUMN privacy_settings.consent_version IS 'Incremented when privacy policy changes — user must re-consent';

CREATE INDEX idx_privacy_settings_updated ON privacy_settings(updated_at DESC);

-- ─── 2. Seed default privacy settings for existing users ───────────────────

-- Contractor defaults
INSERT INTO privacy_settings (user_id, settings)
SELECT cp.user_id, jsonb_build_object(
    'contractor', jsonb_build_object(
        'company_name',              'public',
        'trade_category',            'public',
        'years_experience',          'public',
        'service_areas',             'public',
        'portfolio_urls',            'public',
        'max_concurrent_projects',   'project_members',
        'commercial_license_number', 'project_members',
        'insurance_expiry',          'project_members',
        'insurance_status',          'project_members',
        'commercial_license_url',    'private',
        'insurance_document_url',    'private',
        'verification_status',       'private'
    )
)
FROM contractor_profiles cp
ON CONFLICT (user_id) DO UPDATE
    SET settings = privacy_settings.settings || EXCLUDED.settings;

-- Engineer defaults
INSERT INTO privacy_settings (user_id, settings)
SELECT ep.user_id, jsonb_build_object(
    'engineer', jsonb_build_object(
        'specialization',             'public',
        'university',                 'public',
        'graduation_year',            'public',
        'years_experience',           'public',
        'professional_memberships',   'public',
        'certification_urls',         'project_members',
        'engineering_license_number', 'project_members',
        'license_expiry',             'project_members',
        'license_status',             'project_members',
        'engineering_license_url',    'private',
        'verification_status',        'private'
    )
)
FROM engineer_profiles ep
ON CONFLICT (user_id) DO UPDATE
    SET settings = privacy_settings.settings || EXCLUDED.settings;

-- Supplier defaults
INSERT INTO privacy_settings (user_id, settings)
SELECT sp.user_id, jsonb_build_object(
    'supplier', jsonb_build_object(
        'company_name',               'public',
        'supply_categories',          'public',
        'delivery_radius_km',         'public',
        'min_order_amount',           'public',
        'warehouse_address',          'project_members',
        'commercial_register_number', 'project_members',
        'register_status',            'project_members',
        'commercial_register_expiry', 'project_members',
        'commercial_register_url',    'private',
        'verification_status',        'private'
    )
)
FROM supplier_profiles sp
ON CONFLICT (user_id) DO UPDATE
    SET settings = privacy_settings.settings || EXCLUDED.settings;

-- Tradesperson defaults
INSERT INTO privacy_settings (user_id, settings)
SELECT tp.user_id, jsonb_build_object(
    'tradesperson', jsonb_build_object(
        'trade_type',          'public',
        'years_experience',    'public',
        'daily_rate',          'public',
        'tools_owned',         'public',
        'availability_status', 'public',
        'guild_membership_id', 'project_members',
        'guild_expiry',        'project_members',
        'guild_document_url',  'private',
        'certification_expiry','project_members',
        'verification_status', 'private'
    )
)
FROM tradesperson_profiles tp
ON CONFLICT (user_id) DO UPDATE
    SET settings = privacy_settings.settings || EXCLUDED.settings;

-- Homeowner defaults
INSERT INTO privacy_settings (user_id, settings)
SELECT hp.user_id, jsonb_build_object(
    'homeowner', jsonb_build_object(
        'property_type',       'public',
        'displacement_status', 'project_members',
        'family_size',         'private',
        'property_address',    'private',
        'ownership_proof_url', 'private',
        'verification_status', 'private'
    )
)
FROM homeowner_profiles hp
ON CONFLICT (user_id) DO UPDATE
    SET settings = privacy_settings.settings || EXCLUDED.settings;

-- Donor defaults
INSERT INTO privacy_settings (user_id, settings)
SELECT dp.user_id, jsonb_build_object(
    'donor', jsonb_build_object(
        'preferred_causes',    'public',
        'preferred_currency',  'public',
        'is_anonymous_default','private',
        'donation_count',      'private',
        'total_donated_amount','private',
        'tax_receipt_email',   'private'
    )
)
FROM donor_profiles dp
ON CONFLICT (user_id) DO UPDATE
    SET settings = privacy_settings.settings || EXCLUDED.settings;

COMMIT;
