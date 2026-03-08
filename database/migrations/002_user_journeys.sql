-- ============================================================================
-- NAMMERHA PLATFORM — User Journeys Database Extension
-- Migration: 002_user_journeys
-- Target: PostgreSQL 16 + PostGIS
-- Created: 2026-03-07
-- Depends on: 001_core_schema
-- ============================================================================
-- This migration adds tables required for the 4 secure data flow paths:
--   Path 1: Homeowner → Engineer (covered by existing tables)
--   Path 2: Donor → Escrow (covered by existing tables)
--   Path 3: Execution → Purchase Orders (NEW)
--   Path 4: Release → Notifications (NEW)
-- ============================================================================
BEGIN;
-- ============================================================================
-- 1. NEW ENUM TYPES
-- ============================================================================
CREATE TYPE po_status AS ENUM (
    'generated',
    'sent_to_supplier',
    'acknowledged',
    'shipped',
    'delivered',
    'cancelled'
);
CREATE TYPE notification_type AS ENUM (
    'donation_received',
    'proof_submitted',
    'funds_released',
    'delivery_confirmed',
    'engineer_assigned',
    'po_generated',
    'project_published',
    'kyc_approved',
    'kyc_rejected',
    'discrepancy_flagged'
);
CREATE TYPE notification_channel AS ENUM (
    'push',
    'email',
    'sms',
    'in_app'
);
-- ============================================================================
-- 2. SEQUENCES
-- ============================================================================
CREATE SEQUENCE po_number_seq START WITH 1000 INCREMENT BY 1;
-- ============================================================================
-- 3. NEW TABLES
-- ============================================================================
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1 PURCHASE ORDERS TABLE
-- Auto-generated when a BOQ item reaches fully_funded status.
-- Links the funded item to a verified supplier for material sourcing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE purchase_orders (
    po_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number VARCHAR(20) NOT NULL,
    item_id UUID NOT NULL REFERENCES itemized_boq(item_id),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id),
    supplier_id UUID NOT NULL REFERENCES users(user_id),
    -- Financial
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    -- Status Lifecycle
    status po_status NOT NULL DEFAULT 'generated',
    -- Descriptive
    material_name VARCHAR(500) NOT NULL,
    material_category VARCHAR(100),
    quantity DECIMAL(12, 2) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    unit_price BIGINT NOT NULL,
    -- Supplier Details Snapshot (denormalized for PO document)
    supplier_name VARCHAR(255) NOT NULL,
    supplier_commercial_reg VARCHAR(100),
    -- Lifecycle Timestamps
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    -- Audit
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_po_number UNIQUE (po_number)
);
COMMENT ON TABLE purchase_orders IS 'Auto-generated purchase orders. Created when BOQ item reaches fully_funded. Links item → verified supplier.';
COMMENT ON COLUMN purchase_orders.po_number IS 'Human-readable PO number: PO-NNNN';
COMMENT ON COLUMN purchase_orders.amount IS 'Total PO amount in cents (unit_price × quantity).';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2 NOTIFICATIONS TABLE
-- Push/email/SMS notification records for closing the transparency loop.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    -- Content
    type notification_type NOT NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    -- payload: { project_id, item_id, proof_image_url, ... }
    -- Delivery
    channel notification_channel NOT NULL DEFAULT 'in_app',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE notifications IS 'Notification records for donors, engineers, suppliers. Closes the transparency loop.';
COMMENT ON COLUMN notifications.data IS 'JSON payload: project_id, item_id, proof_image_url, amounts, etc.';
-- ============================================================================
-- 4. INDEXES
-- ============================================================================
-- Purchase Orders
CREATE INDEX idx_po_item ON purchase_orders (item_id);
CREATE INDEX idx_po_project ON purchase_orders (project_id);
CREATE INDEX idx_po_supplier ON purchase_orders (supplier_id);
CREATE INDEX idx_po_status ON purchase_orders (status);
CREATE INDEX idx_po_generated ON purchase_orders (generated_at DESC);
-- Notifications
CREATE INDEX idx_notif_user ON notifications (user_id, is_read);
CREATE INDEX idx_notif_type ON notifications (type);
CREATE INDEX idx_notif_created ON notifications (created_at DESC);
CREATE INDEX idx_notif_user_unread ON notifications (user_id)
WHERE is_read = FALSE;
-- Partial index for unread badge count
-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================
-- 5.1 updated_at for purchase_orders
CREATE TRIGGER trg_po_updated_at BEFORE
UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
-- 5.2 PO Number Generator
CREATE OR REPLACE FUNCTION generate_po_number() RETURNS VARCHAR(20) AS $$ BEGIN RETURN 'PO-' || LPAD(nextval('po_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
COMMIT;
-- ============================================================================
-- MIGRATION 002 COMPLETE
-- New Tables: 2 | New ENUMs: 3 | New Indexes: 9 | New Functions: 1
-- ============================================================================