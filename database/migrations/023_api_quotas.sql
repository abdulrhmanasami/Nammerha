-- ============================================================================
-- Migration 019: API Quotas (Feature 4: Webhook Notifications)
-- Usage tracking tables for rate limiting and quota alerts.
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_usage (
    usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    response_status INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Partition-friendly index for time-range queries
CREATE INDEX IF NOT EXISTS idx_api_usage_user_created ON api_usage(user_id, created_at DESC);
-- Composite for per-endpoint analytics
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint, created_at DESC);
CREATE TABLE IF NOT EXISTS quota_configs (
    quota_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL UNIQUE,
    -- 'donor', 'engineer', etc.
    max_requests_per_day INT DEFAULT 1000,
    max_projects INT DEFAULT 50,
    webhook_url TEXT,
    -- Per-role webhook URL for alerts
    alert_threshold_pct INT DEFAULT 80,
    -- Alert at 80% quota usage
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Seed default quota configs for each role
INSERT INTO quota_configs (
        role,
        max_requests_per_day,
        max_projects,
        alert_threshold_pct
    )
VALUES ('donor', 500, 0, 80),
    ('homeowner', 500, 10, 80),
    ('engineer', 1000, 50, 80),
    ('contractor', 1000, 50, 80),
    ('tradesperson', 500, 0, 80),
    ('supplier', 1000, 100, 80),
    ('admin', 5000, 999, 90),
    ('auditor', 5000, 999, 90) ON CONFLICT (role) DO NOTHING;