-- ============================================================================
-- Migration 033: Monetization Infrastructure
-- Supplier commission engine + Donor tipping model
-- Per profitability study Phase 1: Market Liquidity & E-commerce Revenue
-- ============================================================================
-- MONETARY CONVENTION: All monetary values as BIGINT in cents.
-- RATE CONVENTION: Commission rates in basis points (bps). 1500 bps = 15.00%.
-- ============================================================================
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. COMMISSION TIER CONFIGURATION
-- Tiered rates per the study's recommendation: 15% → 12% → 10%
-- Brackets are defined by monthly supplier revenue through the platform.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_config (
    tier_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_name      VARCHAR(100) NOT NULL,
    -- 'standard', 'growth', 'enterprise'
    min_revenue_cents BIGINT NOT NULL DEFAULT 0,
    -- Lower bound of monthly revenue bracket (inclusive)
    max_revenue_cents BIGINT,
    -- Upper bound (NULL = unlimited)
    commission_rate_bps INTEGER NOT NULL CHECK (commission_rate_bps >= 0 AND commission_rate_bps <= 5000),
    -- Basis points (0–50%)
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_commission_tier_name UNIQUE (tier_name)
);

COMMENT ON TABLE commission_config IS 'Tiered supplier commission rates. Rates in basis points (1500 = 15%). Per profitability study §1.';
COMMENT ON COLUMN commission_config.commission_rate_bps IS 'Commission rate in basis points. 1500 bps = 15.00%.';
COMMENT ON COLUMN commission_config.min_revenue_cents IS 'Lower bound of monthly revenue bracket (inclusive), in cents.';
COMMENT ON COLUMN commission_config.max_revenue_cents IS 'Upper bound of monthly revenue bracket. NULL = unlimited (top tier).';

-- Auto-update timestamp
CREATE TRIGGER trg_commission_config_updated_at
    BEFORE UPDATE ON commission_config
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COMMISSION LEDGER
-- Immutable record of every commission charged on a purchase order.
-- One entry per PO. Linked to supplier and PO for full traceability.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_ledger (
    commission_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id               UUID NOT NULL REFERENCES purchase_orders(po_id),
    supplier_id         UUID NOT NULL REFERENCES users(user_id),
    project_id          VARCHAR(20) NOT NULL REFERENCES projects(project_id),
    -- Financial
    po_amount_cents     BIGINT NOT NULL CHECK (po_amount_cents > 0),
    commission_rate_bps INTEGER NOT NULL CHECK (commission_rate_bps >= 0),
    commission_amount_cents BIGINT NOT NULL CHECK (commission_amount_cents >= 0),
    -- Tier snapshot (denormalized for audit immutability)
    tier_name           VARCHAR(100) NOT NULL,
    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'recorded' CHECK (
        status IN ('recorded', 'invoiced', 'paid', 'waived')
    ),
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE commission_ledger IS 'Immutable commission records per PO. One entry per purchase order. Per profitability study §1.';
COMMENT ON COLUMN commission_ledger.commission_rate_bps IS 'Rate applied at time of PO creation, in basis points. Snapshot for audit.';
COMMENT ON COLUMN commission_ledger.tier_name IS 'Tier name at time of commission. Denormalized — tier config may change later.';

CREATE INDEX IF NOT EXISTS idx_commission_supplier ON commission_ledger (supplier_id);
CREATE INDEX IF NOT EXISTS idx_commission_po ON commission_ledger (po_id);
CREATE INDEX IF NOT EXISTS idx_commission_project ON commission_ledger (project_id);
CREATE INDEX IF NOT EXISTS idx_commission_created ON commission_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_status ON commission_ledger (status);

-- Auto-update timestamp
CREATE TRIGGER trg_commission_ledger_updated_at
    BEFORE UPDATE ON commission_ledger
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PLATFORM TIPS (Donor Tipping Model)
-- Optional tips from donors to support platform operations.
-- Per study §3: 100% of donation goes to project; tip is separate.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_tips (
    tip_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id            UUID NOT NULL REFERENCES users(user_id),
    -- Link to the donation that triggered this tip
    donation_reference  VARCHAR(255) NOT NULL,
    -- Payment reference from payment_transactions or escrow batch
    -- Financial
    tip_amount_cents    BIGINT NOT NULL CHECK (tip_amount_cents > 0),
    tip_percentage      DECIMAL(5, 2),
    -- % of donation chosen by donor (10, 15, 20, custom)
    currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
    -- Gateway
    payment_gateway     VARCHAR(20) CHECK (payment_gateway IN ('visa', 'fatora')),
    payment_gateway_ref VARCHAR(255),
    -- Status
    status              VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (
        status IN ('pending', 'completed', 'failed', 'refunded')
    ),
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE platform_tips IS 'Donor tips for platform operations. 100% of donation goes to project; tip is separate voluntary support. Per profitability study §3.';
COMMENT ON COLUMN platform_tips.tip_percentage IS 'Percentage of donation amount chosen by donor (10.00, 15.00, 20.00, or custom).';
COMMENT ON COLUMN platform_tips.donation_reference IS 'Links to payment_transactions.reference or escrow batch ID.';

CREATE INDEX IF NOT EXISTS idx_tips_donor ON platform_tips (donor_id);
CREATE INDEX IF NOT EXISTS idx_tips_created ON platform_tips (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_status ON platform_tips (status);
CREATE INDEX IF NOT EXISTS idx_tips_reference ON platform_tips (donation_reference);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SEED DATA: Default Commission Tiers
-- Per study §1: 15% (≤$10K/mo), 12% ($10K–$50K), 10% (>$50K)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO commission_config (tier_name, min_revenue_cents, max_revenue_cents, commission_rate_bps)
VALUES
    ('standard',   0,         1000000,  1500),   -- 0 – $10,000/mo → 15%
    ('growth',     1000001,   5000000,  1200),   -- $10,001 – $50,000/mo → 12%
    ('enterprise', 5000001,   NULL,     1000)    -- $50,001+ → 10%
ON CONFLICT (tier_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. REVENUE SUMMARY VIEW (Admin Dashboard)
-- Aggregates commission and tip revenue for the admin revenue dashboard.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_platform_revenue_summary AS
SELECT
    -- Commissions
    (SELECT COALESCE(SUM(commission_amount_cents), 0)
     FROM commission_ledger WHERE status != 'waived') AS total_commission_revenue,
    (SELECT COUNT(*)
     FROM commission_ledger WHERE status != 'waived') AS total_commissions_count,
    -- This month commissions
    (SELECT COALESCE(SUM(commission_amount_cents), 0)
     FROM commission_ledger
     WHERE status != 'waived'
       AND created_at >= date_trunc('month', NOW())) AS mtd_commission_revenue,
    -- Tips
    (SELECT COALESCE(SUM(tip_amount_cents), 0)
     FROM platform_tips WHERE status = 'completed') AS total_tip_revenue,
    (SELECT COUNT(*)
     FROM platform_tips WHERE status = 'completed') AS total_tips_count,
    -- This month tips
    (SELECT COALESCE(SUM(tip_amount_cents), 0)
     FROM platform_tips
     WHERE status = 'completed'
       AND created_at >= date_trunc('month', NOW())) AS mtd_tip_revenue,
    -- Combined
    (SELECT COALESCE(SUM(commission_amount_cents), 0)
     FROM commission_ledger WHERE status != 'waived')
    +
    (SELECT COALESCE(SUM(tip_amount_cents), 0)
     FROM platform_tips WHERE status = 'completed') AS total_platform_revenue;

COMMENT ON VIEW vw_platform_revenue_summary IS 'Admin revenue dashboard: aggregated commission + tip metrics.';

COMMIT;
-- ============================================================================
-- MIGRATION COMPLETE
-- Tables: 3 | Indexes: 9 | Triggers: 2 | Views: 1 | Seed Data: 3 tiers
-- ============================================================================
