-- ============================================================================
-- Migration 034: SaaS Subscription Infrastructure
-- Tiered subscription plans for contractors & engineers
-- Per profitability study Phase 2: SaaS Monetization
-- ============================================================================
-- MONETARY CONVENTION: All monetary values as BIGINT in cents.
-- FEATURE LIMITS: -1 = unlimited, 0 = disabled, >0 = numeric cap.
-- ============================================================================
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SUBSCRIPTION PLANS
-- Defines available tiers (free, premium, enterprise).
-- Price is stored in cents per billing_interval.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
    plan_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug             VARCHAR(50) NOT NULL,
    display_name     VARCHAR(100) NOT NULL,
    description      TEXT,
    -- Pricing
    price_cents      BIGINT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    currency         VARCHAR(3) NOT NULL DEFAULT 'USD',
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (
        billing_interval IN ('monthly', 'yearly', 'lifetime')
    ),
    -- Feature matrix (denormalized summary for quick reads)
    features_summary JSONB NOT NULL DEFAULT '{}',
    -- State
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_subscription_plan_slug UNIQUE (slug)
);

COMMENT ON TABLE subscription_plans IS 'Available subscription tiers. Per profitability study §2: Freemium → Premium SaaS.';
COMMENT ON COLUMN subscription_plans.price_cents IS 'Price per billing_interval in cents. 0 = free tier.';
COMMENT ON COLUMN subscription_plans.features_summary IS 'JSONB summary of included features for quick UI rendering.';

CREATE TRIGGER trg_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PLAN FEATURES (Granular Feature Matrix)
-- Defines per-plan feature access and numeric limits.
-- Composite PK: one row per (plan, feature).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_features (
    plan_id       UUID NOT NULL REFERENCES subscription_plans(plan_id) ON DELETE CASCADE,
    feature_slug  VARCHAR(100) NOT NULL,
    -- Access control
    enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    limit_value   INTEGER NOT NULL DEFAULT 0,
    -- -1 = unlimited, 0 = disabled, >0 = numeric cap per billing cycle
    description   TEXT,
    PRIMARY KEY (plan_id, feature_slug)
);

COMMENT ON TABLE plan_features IS 'Granular feature matrix per plan. Drives requireFeature() middleware.';
COMMENT ON COLUMN plan_features.limit_value IS '-1 = unlimited, 0 = disabled/not applicable, >0 = numeric cap per billing cycle.';
COMMENT ON COLUMN plan_features.feature_slug IS 'Machine-readable feature key: boq_export, boq_whitelabel, oracle_advanced, priority_alerts, priority_search.';

CREATE INDEX IF NOT EXISTS idx_plan_features_slug ON plan_features (feature_slug);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. USER SUBSCRIPTIONS
-- Tracks each user's active subscription binding.
-- One active subscription per user (UNIQUE constraint).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
    subscription_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(user_id),
    plan_id               UUID NOT NULL REFERENCES subscription_plans(plan_id),
    -- Status lifecycle: trialing → active → cancelled / past_due
    status                VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'trialing', 'cancelled', 'past_due', 'expired')
    ),
    -- Billing period
    current_period_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    -- External payment reference (Stripe/Fatora/etc.)
    payment_gateway       VARCHAR(20) CHECK (payment_gateway IN ('visa', 'fatora', 'manual')),
    payment_gateway_ref   VARCHAR(255),
    -- Cancellation
    cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at          TIMESTAMPTZ,
    -- Timestamps
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_subscriptions IS 'User subscription bindings. One active subscription per user.';
COMMENT ON COLUMN user_subscriptions.cancel_at_period_end IS 'When TRUE, subscription will expire at current_period_end instead of renewing.';
COMMENT ON COLUMN user_subscriptions.payment_gateway_ref IS 'External subscription ID from payment provider for reconciliation.';

-- Ensure only one active subscription per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sub_active
    ON user_subscriptions (user_id)
    WHERE status IN ('active', 'trialing');

CREATE INDEX IF NOT EXISTS idx_user_sub_plan ON user_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS idx_user_sub_status ON user_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_user_sub_period_end ON user_subscriptions (current_period_end)
    WHERE status IN ('active', 'trialing');

CREATE TRIGGER trg_user_subscriptions_updated_at
    BEFORE UPDATE ON user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SEED DATA: Default Plans + Feature Matrix
-- Per study §2: Freemium + Premium ($99/mo)
-- ─────────────────────────────────────────────────────────────────────────────

-- Plan: Free
INSERT INTO subscription_plans (slug, display_name, description, price_cents, billing_interval, sort_order, features_summary)
VALUES (
    'free',
    'Free',
    'Essential tools to get started. Perfect for individual contractors exploring the platform.',
    0,
    'monthly',
    1,
    '{"boq_exports": "3/mo", "whitelabel": false, "oracle": "basic", "alerts": "5/mo", "priority_search": false}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Plan: Premium
INSERT INTO subscription_plans (slug, display_name, description, price_cents, billing_interval, sort_order, features_summary)
VALUES (
    'premium',
    'Premium',
    'Full-featured professional suite. Unlimited BOQ exports, branded reports, priority access to funded projects.',
    9900,
    'monthly',
    2,
    '{"boq_exports": "unlimited", "whitelabel": true, "oracle": "advanced", "alerts": "unlimited", "priority_search": true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Feature matrix: Free plan
INSERT INTO plan_features (plan_id, feature_slug, enabled, limit_value, description)
SELECT plan_id, feat.slug, feat.enabled, feat.lim, feat.descr
FROM subscription_plans sp,
LATERAL (VALUES
    ('boq_export',       TRUE,  3,   'BOQ export to PDF/Excel'),
    ('boq_whitelabel',   FALSE, 0,   'White-labeled BOQ with company branding'),
    ('oracle_advanced',  FALSE, 0,   'Advanced price analytics & forecasting'),
    ('priority_alerts',  TRUE,  5,   'Project alert notifications'),
    ('priority_search',  FALSE, 0,   'Priority ranking in search results'),
    ('invoice_mgmt',     FALSE, 0,   'Professional invoice management'),
    ('unlimited_bids',   FALSE, 0,   'Unlimited project bidding')
) AS feat(slug, enabled, lim, descr)
WHERE sp.slug = 'free'
ON CONFLICT (plan_id, feature_slug) DO NOTHING;

-- Feature matrix: Premium plan
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
WHERE sp.slug = 'premium'
ON CONFLICT (plan_id, feature_slug) DO NOTHING;

COMMIT;
-- ============================================================================
-- MIGRATION COMPLETE
-- Tables: 3 | Indexes: 5 | Triggers: 2 | Seed: 2 plans + 14 feature rows
-- ============================================================================
