-- ============================================================================
-- Migration 039: Idempotency Keys Server-Side Support
-- Description: Creates a table to securely store idempotency keys mapped to
--              their API responses to prevent duplicated state-mutating
--              requests during network retries.
-- ============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    user_id UUID, -- Optional, can map to users.user_id if authenticated
    request_path VARCHAR(255) NOT NULL,
    request_method VARCHAR(10) NOT NULL,
    request_body_hash VARCHAR(64) NOT NULL,
    response_status INT,
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index for scheduled garbage collection of expired keys
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- Clean up older expired records on trigger or batch job (can be purged later)
