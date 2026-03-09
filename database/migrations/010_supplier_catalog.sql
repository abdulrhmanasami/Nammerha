-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 010: Supplier Catalog
-- Enables suppliers to list their material offerings with guide prices,
-- allowing engineers to discover and pre-assign suppliers when building BOQs.
-- ═══════════════════════════════════════════════════════════════════════════════
-- Per Strategic Study §7.2: "المهندس يختار البائع المعتمد عند إضافة عنصر BOQ"
-- This catalog is DISCOVERABLE — guide prices are informational only.
-- Actual PO amounts are determined by BOQ unit_price (set by EPA Oracle).
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SUPPLIER CATALOG TABLE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE supplier_catalog (
    catalog_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    -- Material Information
    material_name VARCHAR(500) NOT NULL,
    material_category VARCHAR(100) NOT NULL,
    description TEXT,
    image_url TEXT,
    unit VARCHAR(50) NOT NULL,
    -- e.g. 'kg', 'bag', 'm³', 'piece'
    -- Pricing (BIGINT cents — guide price only, NOT binding)
    unit_price_guide BIGINT NOT NULL CHECK (unit_price_guide > 0),
    -- Supply Capacity
    min_order_qty DECIMAL(12, 2) NOT NULL DEFAULT 1,
    lead_time_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
    -- Availability
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Prevent duplicate listings: same supplier can't list same material+unit twice
    CONSTRAINT uq_supplier_material UNIQUE (supplier_id, material_name, unit)
);
COMMENT ON TABLE supplier_catalog IS 'Supplier material catalog. Engineers browse this when selecting preferred_supplier_id for BOQ items. Guide prices are informational — actual PO amounts use EPA Oracle prices.';
COMMENT ON COLUMN supplier_catalog.unit_price_guide IS 'Informational guide price in cents. NOT used for PO generation — PO uses BOQ unit_price from EPA Oracle.';
COMMENT ON COLUMN supplier_catalog.lead_time_days IS 'Estimated delivery lead time in calendar days from order acknowledgment.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
-- Primary access pattern: engineer browses a supplier's catalog
CREATE INDEX idx_catalog_supplier ON supplier_catalog (supplier_id, is_active);
-- Category browsing: filter by material type
CREATE INDEX idx_catalog_category ON supplier_catalog (material_category, is_active);
-- Fuzzy search: engineer searches by material name
CREATE INDEX idx_catalog_name_trgm ON supplier_catalog USING GIN (material_name gin_trgm_ops);
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_supplier_catalog_updated_at BEFORE
UPDATE ON supplier_catalog FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMIT;
-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 010 COMPLETE
-- New Tables: supplier_catalog
-- New Indexes: 3 (supplier, category, trgm fuzzy)
-- New Triggers: 1 (updated_at)
-- ═══════════════════════════════════════════════════════════════════════════════