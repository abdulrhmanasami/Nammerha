-- ============================================================================
-- Migration 036: SaaS Subscription Tier Restructuring
-- Adds Pro ($15/mo) and Business ($49/mo) tiers for geo-appropriate pricing.
-- Renames existing Premium → Enterprise for INGOs/international orgs.
-- ============================================================================
-- RATIONALE: $99/mo is American pricing in a Syrian reconstruction market
-- where local contractors earn $300-500/mo. This migration introduces
-- affordable tiers to drive local adoption while preserving premium
-- pricing for international organizations that have the budget.
-- ============================================================================
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rename Premium → Enterprise
-- The existing $99/mo plan is repositioned for international organizations.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE subscription_plans
SET    slug         = 'enterprise',
       display_name = 'Enterprise',
       description  = 'Full-featured institutional suite for international organizations, NGOs, and large contractors. Unlimited everything with priority support.',
       sort_order   = 4,
       updated_at   = NOW()
WHERE  slug = 'premium';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Insert Pro Plan ($15/mo = 1500 cents)
-- Targeted at local Syrian contractors. Unlocks practical daily tools.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO subscription_plans (slug, display_name, description, price_cents, billing_interval, sort_order, features_summary)
VALUES (
    'pro',
    'Pro',
    'Essential professional tools for local contractors. Invoice management, expanded BOQ exports, and more project alerts.',
    1500,
    'monthly',
    2,
    '{"boq_exports": "15/mo", "whitelabel": false, "oracle": "basic", "alerts": "25/mo", "priority_search": false, "invoice_mgmt": true, "unlimited_bids": true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Pro plan feature matrix
INSERT INTO plan_features (plan_id, feature_slug, enabled, limit_value, description)
SELECT plan_id, feat.slug, feat.enabled, feat.lim, feat.descr
FROM subscription_plans sp,
LATERAL (VALUES
    ('boq_export',       TRUE,  15,  'Up to 15 BOQ exports per month'),
    ('boq_whitelabel',   FALSE, 0,   'White-labeled BOQ with company branding'),
    ('oracle_advanced',  FALSE, 0,   'Advanced price analytics & forecasting'),
    ('priority_alerts',  TRUE,  25,  'Up to 25 project alert notifications per month'),
    ('priority_search',  FALSE, 0,   'Priority ranking in search results'),
    ('invoice_mgmt',     TRUE,  -1,  'Professional invoice management'),
    ('unlimited_bids',   TRUE,  -1,  'Unlimited project bidding')
) AS feat(slug, enabled, lim, descr)
WHERE sp.slug = 'pro'
ON CONFLICT (plan_id, feature_slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Insert Business Plan ($49/mo = 4900 cents)
-- Targeted at larger regional contractors and firms. Unlocks everything
-- except priority support (Enterprise-only).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO subscription_plans (slug, display_name, description, price_cents, billing_interval, sort_order, features_summary)
VALUES (
    'business',
    'Business',
    'Complete professional suite for growing firms. Unlimited BOQ exports, branded reports, advanced analytics, and priority search.',
    4900,
    'monthly',
    3,
    '{"boq_exports": "unlimited", "whitelabel": true, "oracle": "advanced", "alerts": "unlimited", "priority_search": true, "invoice_mgmt": true, "unlimited_bids": true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Business plan feature matrix
INSERT INTO plan_features (plan_id, feature_slug, enabled, limit_value, description)
SELECT plan_id, feat.slug, feat.enabled, feat.lim, feat.descr
FROM subscription_plans sp,
LATERAL (VALUES
    ('boq_export',       TRUE,  -1,  'Unlimited BOQ exports'),
    ('boq_whitelabel',   TRUE,  -1,  'White-labeled BOQ with company branding'),
    ('oracle_advanced',  TRUE,  -1,  'Advanced price analytics & forecasting'),
    ('priority_alerts',  TRUE,  -1,  'Unlimited project alert notifications'),
    ('priority_search',  TRUE,  -1,  'Priority ranking in search results'),
    ('invoice_mgmt',     TRUE,  -1,  'Professional invoice management'),
    ('unlimited_bids',   TRUE,  -1,  'Unlimited project bidding')
) AS feat(slug, enabled, lim, descr)
WHERE sp.slug = 'business'
ON CONFLICT (plan_id, feature_slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Update feature matrix references for renamed Enterprise plan
-- The old 'premium' feature matrix rows already reference the plan_id (UUID),
-- not the slug, so they automatically carry over. No changes needed.
-- ─────────────────────────────────────────────────────────────────────────────

COMMIT;
-- ============================================================================
-- MIGRATION COMPLETE
-- Plans: 4 (free, pro, business, enterprise)
-- New feature rows: 14 (7 per new plan)
-- Renamed: premium → enterprise (slug + display_name)
-- ============================================================================
