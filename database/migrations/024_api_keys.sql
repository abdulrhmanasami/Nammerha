-- ============================================================================
-- Migration 020: API Keys (Feature 5: API Key Management)
-- Secure API key storage with SHA-256 hashing and scope-based access.
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
    key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
    key_name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    -- First 8 chars (visible in UI: "nm_live_a1b2c3d4...")
    key_hash TEXT NOT NULL,
    -- SHA-256 of full key (only hash is stored)
    scopes TEXT [] DEFAULT '{}',
    -- e.g. {'read:projects', 'read:boq', 'write:donations'}
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);
-- Fast lookup by hash for API key authentication
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)
WHERE is_active = TRUE;
-- User's keys listing
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, created_at DESC);