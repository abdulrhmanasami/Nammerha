-- ============================================================================
-- Migration 042: Social OAuth Authentication
-- Adds OAuth provider linking table and makes password_hash nullable
-- for users who register exclusively via Google/Apple/Facebook.
--
-- Pattern: ID Token Verification (Backend-for-Frontend)
-- Security: provider_user_id is the immutable sub claim from the provider's
--           ID token. Email is stored for display only — never used as key.
-- ============================================================================

-- ─── oauth_providers table ──────────────────────────────────────────────────
-- Links a user to one or more social login providers.
-- A user can have multiple providers (e.g., Google + Apple).
-- Each provider can only be linked once per user.
CREATE TABLE IF NOT EXISTS oauth_providers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    provider        VARCHAR(20) NOT NULL
                    CHECK (provider IN ('google', 'apple', 'facebook')),
    provider_user_id VARCHAR(255) NOT NULL,   -- immutable 'sub' claim from ID token
    provider_email   VARCHAR(255),            -- email from provider (display only)
    provider_avatar_url TEXT,                 -- avatar URL from provider
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One link per provider per user (can't link Google twice)
    CONSTRAINT uq_user_provider UNIQUE (user_id, provider),
    -- One user per provider account (can't link one Google to two Nammerha users)
    CONSTRAINT uq_oauth_provider_user UNIQUE (provider, provider_user_id)
);

-- Fast lookup: "does this Google sub exist?"
CREATE INDEX IF NOT EXISTS idx_oauth_provider_lookup
    ON oauth_providers(provider, provider_user_id);

-- Fast lookup: "what providers does this user have?"
CREATE INDEX IF NOT EXISTS idx_oauth_user_id
    ON oauth_providers(user_id);

-- ─── Make password_hash nullable ────────────────────────────────────────────
-- Social-only users have no password. Existing users are unaffected (they
-- already have a non-null password_hash).
-- SEC: auth.routes.ts login must check for NULL and return a clear error.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- ─── Migration metadata ────────────────────────────────────────────────────
COMMENT ON TABLE oauth_providers IS 'Links users to external OAuth providers (Google, Apple, Facebook). One row per provider per user.';
COMMENT ON COLUMN oauth_providers.provider_user_id IS 'Immutable subject identifier (sub claim) from the provider ID token. Never changes even if user changes email.';
