-- ============================================================================
-- Migration 035: FinTech & Enterprise TaaS Infrastructure
-- Commercial escrow transaction fees + Enterprise transparency subscriptions
-- Per profitability study Phase 3: FinTech & Enterprise TaaS
-- ============================================================================
-- MONETARY CONVENTION: All monetary values as BIGINT in cents.
-- RATE CONVENTION: Fee rates in basis points (bps). 200 bps = 2.00%.
-- ETHICAL RULE: Fees apply ONLY to commercial projects, NEVER humanitarian.
-- ============================================================================
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ESCROW FEE CONFIGURATION
-- Configurable fee rates for commercial escrow transactions.
-- Only applies to project_type = 'commercial' (homeowner-funded).
-- Humanitarian/charity projects are always exempt.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escrow_fee_config (
    config_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_name        VARCHAR(100) NOT NULL,
    fee_rate_bps    INTEGER NOT NULL DEFAULT 200 CHECK (fee_rate_bps >= 0 AND fee_rate_bps <= 3000),
    -- 200 bps = 2.00%. Study recommends 1-3% (100-300 bps)
    min_fee_cents   BIGINT NOT NULL DEFAULT 100,
    -- Minimum fee per release ($1.00)
    max_fee_cents   BIGINT,
    -- Maximum fee cap per release (NULL = uncapped)
    applies_to      VARCHAR(20) NOT NULL DEFAULT 'commercial' CHECK (
        applies_to IN ('commercial', 'all')
    ),
    -- 'commercial' = homeowner-funded only; 'all' = includes humanitarian (NOT recommended)
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_escrow_fee_name UNIQUE (fee_name)
);

COMMENT ON TABLE escrow_fee_config IS 'Escrow transaction fee rates. Per study §5: 1-3% on commercial projects. Humanitarian exempt.';
COMMENT ON COLUMN escrow_fee_config.fee_rate_bps IS 'Fee rate in basis points. 200 bps = 2.00%.';
COMMENT ON COLUMN escrow_fee_config.applies_to IS 'commercial = homeowner-funded only. Humanitarian projects are always exempt (study §3).';

CREATE TRIGGER trg_escrow_fee_config_updated_at
    BEFORE UPDATE ON escrow_fee_config
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ESCROW FEE LEDGER
-- Immutable record of every fee charged on commercial escrow releases.
-- One entry per escrow release event.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escrow_fee_ledger (
    fee_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Source references
    project_id          VARCHAR(20) NOT NULL REFERENCES projects(project_id),
    item_id             UUID NOT NULL REFERENCES itemized_boq(item_id),
    -- Financial
    escrow_amount_cents BIGINT NOT NULL CHECK (escrow_amount_cents > 0),
    fee_rate_bps        INTEGER NOT NULL CHECK (fee_rate_bps >= 0),
    fee_amount_cents    BIGINT NOT NULL CHECK (fee_amount_cents >= 0),
    -- Denormalized snapshot of fee config at time of charge
    fee_config_name     VARCHAR(100) NOT NULL,
    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'charged' CHECK (
        status IN ('charged', 'waived', 'refunded')
    ),
    -- Timestamps
    charged_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE escrow_fee_ledger IS 'Immutable fee records per escrow release. Per study §5: 1-3% transaction fees on commercial projects.';
COMMENT ON COLUMN escrow_fee_ledger.fee_rate_bps IS 'Rate applied at time of release, in basis points. Snapshot for audit.';

CREATE INDEX IF NOT EXISTS idx_escrow_fee_project ON escrow_fee_ledger (project_id);
CREATE INDEX IF NOT EXISTS idx_escrow_fee_item ON escrow_fee_ledger (item_id);
CREATE INDEX IF NOT EXISTS idx_escrow_fee_charged_at ON escrow_fee_ledger (charged_at DESC);
CREATE INDEX IF NOT EXISTS idx_escrow_fee_status ON escrow_fee_ledger (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ENTERPRISE ORGANIZATIONS (TaaS Subscribers)
-- Institutional subscribers: NGOs, INGOs, development funds, government agencies.
-- Each org has an API key for programmatic OCDS data access.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_organizations (
    org_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_name        VARCHAR(255) NOT NULL,
    org_type        VARCHAR(50) NOT NULL CHECK (
        org_type IN ('ngo', 'ingo', 'government', 'development_fund', 'private_sector', 'academic')
    ),
    contact_email   VARCHAR(255) NOT NULL,
    -- Subscription tier
    tier            VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (
        tier IN ('basic', 'pro', 'enterprise')
    ),
    -- API access
    api_key         VARCHAR(64) NOT NULL,
    api_key_hash    VARCHAR(128) NOT NULL,
    rate_limit_rpm  INTEGER NOT NULL DEFAULT 60,
    -- Requests per minute
    -- State
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    -- Financial
    annual_fee_cents BIGINT NOT NULL DEFAULT 0,
    currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
    -- Timestamps
    subscription_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    subscription_end   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_enterprise_api_key_hash UNIQUE (api_key_hash)
);

COMMENT ON TABLE enterprise_organizations IS 'Enterprise TaaS subscribers. INGOs, development funds, governments. Per study §6: Transparency-as-a-Service.';
COMMENT ON COLUMN enterprise_organizations.api_key IS 'Plaintext API key — shown once on creation, then only hash is used for validation.';
COMMENT ON COLUMN enterprise_organizations.tier IS 'basic = OCDS feed only. pro = dashboard + audit trails. enterprise = full impact reports + custom integrations.';

CREATE INDEX IF NOT EXISTS idx_enterprise_org_type ON enterprise_organizations (org_type);
CREATE INDEX IF NOT EXISTS idx_enterprise_org_active ON enterprise_organizations (is_active) WHERE is_active = TRUE;

CREATE TRIGGER trg_enterprise_org_updated_at
    BEFORE UPDATE ON enterprise_organizations
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ENTERPRISE API ACCESS LOG
-- Tracks every API call per organization for usage analytics and rate limiting.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_api_log (
    log_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES enterprise_organizations(org_id),
    endpoint    VARCHAR(255) NOT NULL,
    method      VARCHAR(10) NOT NULL DEFAULT 'GET',
    status_code INTEGER NOT NULL,
    response_ms INTEGER,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE enterprise_api_log IS 'API usage tracking per enterprise organization. Rate limiting and analytics.';

CREATE INDEX IF NOT EXISTS idx_api_log_org ON enterprise_api_log (org_id);
CREATE INDEX IF NOT EXISTS idx_api_log_created ON enterprise_api_log (created_at DESC);
-- Partition-friendly: org + time range
CREATE INDEX IF NOT EXISTS idx_api_log_org_time ON enterprise_api_log (org_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SEED DATA
-- Default 2% escrow fee config for commercial projects
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO escrow_fee_config (fee_name, fee_rate_bps, min_fee_cents, max_fee_cents, applies_to)
VALUES (
    'standard_commercial',
    200,       -- 2.00%
    100,       -- $1.00 minimum
    NULL,      -- no cap
    'commercial'
)
ON CONFLICT (fee_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. REVENUE SUMMARY VIEW UPDATE
-- Extend the platform revenue summary to include escrow fees.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_platform_revenue_summary AS
SELECT
    -- Commissions
    (SELECT COALESCE(SUM(commission_amount_cents), 0)
     FROM commission_ledger WHERE status != 'waived') AS total_commission_revenue,
    (SELECT COUNT(*)
     FROM commission_ledger WHERE status != 'waived') AS total_commissions_count,
    (SELECT COALESCE(SUM(commission_amount_cents), 0)
     FROM commission_ledger
     WHERE status != 'waived'
       AND created_at >= date_trunc('month', NOW())) AS mtd_commission_revenue,
    -- Tips
    (SELECT COALESCE(SUM(tip_amount_cents), 0)
     FROM platform_tips WHERE status = 'completed') AS total_tip_revenue,
    (SELECT COUNT(*)
     FROM platform_tips WHERE status = 'completed') AS total_tips_count,
    (SELECT COALESCE(SUM(tip_amount_cents), 0)
     FROM platform_tips
     WHERE status = 'completed'
       AND created_at >= date_trunc('month', NOW())) AS mtd_tip_revenue,
    -- Escrow Fees (Phase 3)
    (SELECT COALESCE(SUM(fee_amount_cents), 0)
     FROM escrow_fee_ledger WHERE status = 'charged') AS total_escrow_fee_revenue,
    (SELECT COUNT(*)
     FROM escrow_fee_ledger WHERE status = 'charged') AS total_escrow_fees_count,
    (SELECT COALESCE(SUM(fee_amount_cents), 0)
     FROM escrow_fee_ledger
     WHERE status = 'charged'
       AND charged_at >= date_trunc('month', NOW())) AS mtd_escrow_fee_revenue,
    -- Combined
    (SELECT COALESCE(SUM(commission_amount_cents), 0)
     FROM commission_ledger WHERE status != 'waived')
    +
    (SELECT COALESCE(SUM(tip_amount_cents), 0)
     FROM platform_tips WHERE status = 'completed')
    +
    (SELECT COALESCE(SUM(fee_amount_cents), 0)
     FROM escrow_fee_ledger WHERE status = 'charged') AS total_platform_revenue;

COMMENT ON VIEW vw_platform_revenue_summary IS 'Admin revenue dashboard: aggregated commission + tip + escrow fee metrics.';

COMMIT;
-- ============================================================================
-- MIGRATION COMPLETE
-- Tables: 4 | Indexes: 9 | Triggers: 2 | Views: 1 (updated) | Seed: 1 fee config
-- ============================================================================
