-- ============================================================================
-- Migration 027: Contact Inquiries Table
-- PLT-2026-MAR12-003 FIX: Provides persistence for contact form submissions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_inquiries (
    inquiry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100)  NOT NULL,
    email      VARCHAR(254)  NOT NULL,
    subject    VARCHAR(200)  NOT NULL,
    message    TEXT          NOT NULL,
    category   VARCHAR(30)   NOT NULL DEFAULT 'general',
    client_ip  VARCHAR(45)   NOT NULL DEFAULT 'unknown',
    status     VARCHAR(20)   NOT NULL DEFAULT 'new',
    responded_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for status-based admin queries (list new/pending inquiries)
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status ON contact_inquiries(status);
-- Index for chronological listing
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created ON contact_inquiries(created_at DESC);
