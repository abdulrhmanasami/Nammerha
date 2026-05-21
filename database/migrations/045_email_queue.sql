-- ============================================================================
-- Migration 045: Email Queue with Exponential Backoff Retry
-- ============================================================================
-- PostgreSQL-backed email queue for transactional emails (verification,
-- password reset, security alerts). Replaces fire-and-forget pattern with
-- persistent retry queue.
--
-- Pattern: Mirrors webhook_dead_letter (ENH-6) — zero new infrastructure.
--
-- Retry schedule (exponential backoff, 4^attempt minutes):
--   Attempt 1: +1 minute
--   Attempt 2: +4 minutes
--   Attempt 3: +16 minutes
--   Attempt 4: +64 minutes  (~1h)
--   Attempt 5: +256 minutes (~4.3h)
--
-- After max_retries exhausted → status='exhausted', logged for admin review.
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_queue (
    email_queue_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Email payload (everything needed to reconstruct the sendEmail call)
    recipient       TEXT NOT NULL,
    template        TEXT NOT NULL CHECK (template IN ('verification', 'password-reset', 'security-alert')),
    subject         TEXT NOT NULL,
    variables       JSONB NOT NULL DEFAULT '{}',
    locale          TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ar')),

    -- Retry state machine: pending → processing → sent | failed → exhausted
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'exhausted')),
    retry_count     INT NOT NULL DEFAULT 0,
    max_retries     INT NOT NULL DEFAULT 5,
    next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error      TEXT,

    -- Traceability metadata
    source_action   TEXT,             -- e.g. 'register', 'forgot_password', 'lockout', 'api_key_created'
    source_user_id  UUID,             -- FK to users (nullable for pre-registration emails)
    resend_id       TEXT,             -- Resend API response ID on successful delivery

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance: Fast lookup of emails due for retry processing
CREATE INDEX IF NOT EXISTS idx_email_queue_retryable
    ON email_queue (next_retry_at)
    WHERE status IN ('pending', 'failed');

-- Observability: Find all emails for a specific user (support/debugging)
CREATE INDEX IF NOT EXISTS idx_email_queue_user
    ON email_queue (source_user_id)
    WHERE source_user_id IS NOT NULL;

-- Admin: Find exhausted emails that need manual intervention
CREATE INDEX IF NOT EXISTS idx_email_queue_exhausted
    ON email_queue (created_at DESC)
    WHERE status = 'exhausted';

-- Cleanup: Efficient deletion of old sent emails (30-day retention)
CREATE INDEX IF NOT EXISTS idx_email_queue_sent_cleanup
    ON email_queue (sent_at)
    WHERE status = 'sent';

COMMENT ON TABLE email_queue IS 'Persistent email retry queue with exponential backoff. Mirrors webhook_dead_letter pattern (ENH-6).';
