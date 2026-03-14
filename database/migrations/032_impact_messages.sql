-- ============================================================================
-- Migration 032: Donation Impact Communications
-- ============================================================================
-- PURPOSE: Event-driven messaging system for donor impact tracking.
-- Stores bilingual messages triggered by project lifecycle events.
--
-- EVENT TYPES:
--   donation_received    — After escrow lock
--   contractor_assigned  — Bid accepted
--   construction_started — Status → in_progress
--   milestone_completed  — Phase update
--   photo_proof_added    — GPS-verified photo uploaded
--   escrow_released      — Payment released to supplier
--   project_completed    — Status → completed
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS impact_messages (
    message_id   UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
    donor_id     UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    project_id   VARCHAR(36)  REFERENCES projects(project_id) ON DELETE SET NULL,
    event_type   VARCHAR(50)  NOT NULL
                 CHECK (event_type IN (
                     'donation_received',
                     'contractor_assigned',
                     'construction_started',
                     'milestone_completed',
                     'photo_proof_added',
                     'escrow_released',
                     'project_completed'
                 )),
    title_en     TEXT         NOT NULL,
    title_ar     TEXT         NOT NULL,
    body_en      TEXT         NOT NULL,
    body_ar      TEXT         NOT NULL,
    metadata     JSONB        NOT NULL DEFAULT '{}',
    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE impact_messages IS 'Donor impact communications: event-driven bilingual messages tracking donation lifecycle';
COMMENT ON COLUMN impact_messages.metadata IS 'Event-specific data: amount, material_name, milestone_name, photo_url, etc.';

-- Donor inbox: unread messages, newest first
CREATE INDEX idx_impact_donor_unread
    ON impact_messages(donor_id, created_at DESC)
    WHERE read_at IS NULL;

-- Donor inbox: all messages chronologically
CREATE INDEX idx_impact_donor_chrono
    ON impact_messages(donor_id, created_at DESC);

-- Project event timeline
CREATE INDEX idx_impact_project_events
    ON impact_messages(project_id, created_at DESC);

-- Event type filtering
CREATE INDEX idx_impact_event_type
    ON impact_messages(event_type);

COMMIT;
