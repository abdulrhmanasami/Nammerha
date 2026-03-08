-- ============================================================================
-- Migration 009: BOQ Supplier Assignment
-- Adds pre-assigned supplier to BOQ items per strategic study requirements.
-- The donor sees supplier name before funding; autoGeneratePO() uses this
-- supplier instead of random selection.
-- ============================================================================
BEGIN;
-- 1. Add preferred_supplier_id FK to itemized_boq
ALTER TABLE itemized_boq
ADD COLUMN preferred_supplier_id UUID REFERENCES users(user_id);
COMMENT ON COLUMN itemized_boq.preferred_supplier_id IS 'Pre-assigned verified supplier for this material. Engineer selects from KYC-verified supplier network when creating the BOQ item. Used by autoGeneratePO() instead of random selection.';
-- 2. Recreate vw_boq_funding to include supplier information for the donor basket UI
-- Per study: "يختار المانح المغترب أياً من هذه العناصر لتمويلها بناءً على فواتير واضحة واسم المورد الرسمي"
CREATE OR REPLACE VIEW vw_boq_funding AS
SELECT b.item_id,
    b.project_id,
    b.material_name,
    b.material_category,
    b.unit,
    b.unit_price,
    b.required_quantity,
    CAST(b.unit_price * b.required_quantity AS BIGINT) AS total_cost,
    b.funded_amount,
    CASE
        WHEN (b.unit_price * b.required_quantity) > 0 THEN ROUND(
            (
                b.funded_amount::DECIMAL / (b.unit_price * b.required_quantity)
            ) * 100,
            2
        )
        ELSE 0
    END AS funded_percentage,
    b.status,
    b.image_url,
    b.oracle_reference_price,
    p.title AS project_title,
    -- Supplier info for donor transparency (per strategic study §7.1)
    b.preferred_supplier_id AS supplier_id,
    s.full_name AS supplier_name,
    s.commercial_register_number AS supplier_commercial_reg
FROM itemized_boq b
    JOIN projects p ON p.project_id = b.project_id
    LEFT JOIN users s ON s.user_id = b.preferred_supplier_id
    AND s.role = 'supplier';
COMMENT ON VIEW vw_boq_funding IS 'Donor basket view: itemized materials with funding progress and pre-assigned supplier identity. Feeds the سلة البناء (construction basket) UI.';
COMMIT;