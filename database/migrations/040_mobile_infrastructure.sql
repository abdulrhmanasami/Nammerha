-- ============================================================================
-- NAMMERHA PLATFORM — Push Notification Token Registry
-- Migration: 040_push_tokens
-- Target: PostgreSQL 16
-- Created: 2026-04-17
-- ============================================================================
-- Phase 1 (Hybrid Architecture Migration): Stores device push notification
-- tokens for Flutter mobile app (iOS/Android) and Flutter Web (service worker).
--
-- Each user may have multiple devices registered. Tokens are refreshed on
-- each app launch and cleaned up when inactive for >90 days.
--
-- Platform values: 'ios', 'android', 'web'
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PUSH TOKENS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    device_token TEXT NOT NULL,
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    device_id VARCHAR(255),                    -- Unique device identifier
    app_version VARCHAR(20),                   -- App version at registration time
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate tokens per user
    CONSTRAINT uq_push_device_token UNIQUE (user_id, device_token)
);

COMMENT ON TABLE push_tokens IS 'Device push notification token registry for Flutter mobile (FCM/APNs) and web (service worker) clients.';
COMMENT ON COLUMN push_tokens.device_token IS 'FCM registration token (Android/Web) or APNs device token (iOS).';
COMMENT ON COLUMN push_tokens.platform IS 'Client platform: ios, android, or web.';
COMMENT ON COLUMN push_tokens.device_id IS 'Unique device fingerprint for multi-device management.';
COMMENT ON COLUMN push_tokens.last_used_at IS 'Updated on each app launch. Tokens inactive for >90 days are eligible for cleanup.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary lookup: find all active tokens for a user (push dispatch)
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_active
    ON push_tokens (user_id)
    WHERE is_active = TRUE;

-- Cleanup query: find stale tokens for garbage collection
CREATE INDEX IF NOT EXISTS idx_push_tokens_last_used
    ON push_tokens (last_used_at)
    WHERE is_active = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. REFRESH TOKEN TABLE (JWT Rotation)
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores refresh tokens for mobile clients that need long-lived sessions.
-- On each refresh, the old token is revoked and a new one is issued
-- (rotation prevents replay attacks from stolen refresh tokens).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,          -- SHA-256 hash (never store raw)
    device_id VARCHAR(255),                    -- Links to push_tokens device
    platform VARCHAR(10) CHECK (platform IN ('ios', 'android', 'web')),
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,

    -- Prevent duplicate active tokens per device
    CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash)
);

COMMENT ON TABLE refresh_tokens IS 'JWT refresh token storage for mobile session management. Tokens are hashed for security.';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of the refresh token. Raw token is never stored.';

-- Primary lookup: find token by hash during refresh
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash
    ON refresh_tokens (token_hash)
    WHERE is_revoked = FALSE;

-- Cleanup: find expired tokens for garbage collection
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
    ON refresh_tokens (expires_at)
    WHERE is_revoked = FALSE;

-- User lookup: find all tokens for a user (force logout all devices)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
    ON refresh_tokens (user_id)
    WHERE is_revoked = FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. API VERSION TRACKING
-- ─────────────────────────────────────────────────────────────────────────────
-- Tracks which API version each client is using. Enables:
--   - Forced upgrade gates (block clients below minimum version)
--   - Usage analytics for deprecation planning
--   - Feature flag targeting by client version
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    device_id VARCHAR(255),
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android', 'web', 'jaspr')),
    app_version VARCHAR(20) NOT NULL,          -- Semantic version: 1.0.0
    api_version VARCHAR(20) NOT NULL,          -- API contract version: 2026.1
    build_number INT,
    os_version VARCHAR(50),                    -- e.g., 'iOS 18.2', 'Android 15'
    device_model VARCHAR(100),                 -- e.g., 'iPhone 16', 'Pixel 9'
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Deduplication: one telemetry row per user + device combination.
    -- The upsert in device-auth.service.ts merges on this constraint.
    CONSTRAINT uq_client_version_user_device UNIQUE (user_id, device_id)
);

COMMENT ON TABLE client_versions IS 'Client version telemetry for forced upgrade gates and deprecation planning.';

CREATE INDEX IF NOT EXISTS idx_client_versions_user
    ON client_versions (user_id);

CREATE INDEX IF NOT EXISTS idx_client_versions_platform
    ON client_versions (platform, app_version);

COMMIT;
-- ============================================================================
-- MIGRATION COMPLETE
-- Tables: 3 (push_tokens, refresh_tokens, client_versions)
-- ============================================================================
