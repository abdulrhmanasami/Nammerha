-- ============================================================================
-- Migration 011: Add material_code to pricing_oracle_entries
-- P3-NEW-002 FIX: Backend epa-oracle.service.ts references material_code in
-- queries, INSERTs, and JOINs, but the column was missing from the schema.
-- ============================================================================
-- 1. Add the column (nullable first for safety)
ALTER TABLE pricing_oracle_entries
ADD COLUMN IF NOT EXISTS material_code VARCHAR(50);
-- 2. Backfill existing rows using material_category as the default
UPDATE pricing_oracle_entries
SET material_code = UPPER(REPLACE(material_category, ' ', '_'))
WHERE material_code IS NULL;
-- 3. Now enforce NOT NULL
ALTER TABLE pricing_oracle_entries
ALTER COLUMN material_code
SET NOT NULL;
-- 4. Add unique constraint for upsert operations
-- The service uses ON CONFLICT (material_code) DO UPDATE
ALTER TABLE pricing_oracle_entries
ADD CONSTRAINT uq_oracle_material_code UNIQUE (material_code);
-- 5. Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_oracle_material_code ON pricing_oracle_entries (material_code);
COMMENT ON COLUMN pricing_oracle_entries.material_code IS 'Unique machine-readable material identifier (e.g., REBAR_12MM, CEMENT_OPC). Used as the primary lookup key by the EPA Oracle service.';