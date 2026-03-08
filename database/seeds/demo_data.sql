-- ============================================================================
-- NAMMERHA PLATFORM — Demo Seed Data
-- Populates all core tables with sample data matching the stitch UI screens.
-- Prerequisite: 001_core_schema.sql must be applied first.
-- ============================================================================
BEGIN;
-- ============================================================================
-- 1. USERS
-- ============================================================================
-- Admin (pre-verified)
INSERT INTO users (
        user_id,
        email,
        phone,
        full_name,
        role,
        password_hash,
        kyc_verification_status,
        is_active
    )
VALUES (
        'a0000000-0000-0000-0000-000000000001',
        'admin@nammerha.com',
        '+963911000001',
        'Platform Admin',
        'admin',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified',
        TRUE
    );
-- Auditor (pre-verified)
INSERT INTO users (
        user_id,
        email,
        phone,
        full_name,
        role,
        password_hash,
        kyc_verification_status,
        is_active
    )
VALUES (
        'a0000000-0000-0000-0000-000000000002',
        'auditor@nammerha.com',
        '+963911000002',
        'Sara Al-Auditor',
        'auditor',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified',
        TRUE
    );
-- Engineer Khalid (from donor_delivery_verification_notification UI)
INSERT INTO users (
        user_id,
        email,
        phone,
        full_name,
        role,
        password_hash,
        kyc_verification_status,
        kyc_verified_at,
        kyc_verified_by,
        engineering_license_number,
        guild_membership_id,
        is_active
    )
VALUES (
        'e0000000-0000-0000-0000-000000000001',
        'khalid.eng@nammerha.com',
        '+963933100001',
        'Engineer Khalid',
        'engineer',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified',
        '2026-01-15 10:00:00+03',
        'a0000000-0000-0000-0000-000000000001',
        'ENG-SYR-2024-0891',
        'GUILD-CE-4422',
        TRUE
    );
-- Homeowner: Ahmad (project owner)
INSERT INTO users (
        user_id,
        email,
        phone,
        full_name,
        role,
        password_hash,
        kyc_verification_status,
        kyc_verified_at,
        kyc_verified_by,
        is_active
    )
VALUES (
        'a1000000-0000-0000-0000-000000000001',
        'ahmad.owner@nammerha.com',
        '+963944200001',
        'Ahmad Al-Homeowner',
        'homeowner',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified',
        '2026-01-20 14:30:00+03',
        'a0000000-0000-0000-0000-000000000001',
        TRUE
    );
-- Donor 1: International Donor
INSERT INTO users (
        user_id,
        email,
        phone,
        full_name,
        role,
        password_hash,
        kyc_verification_status,
        kyc_verified_at,
        kyc_verified_by,
        is_active
    )
VALUES (
        'd0000000-0000-0000-0000-000000000001',
        'donor1@example.com',
        '+491712345678',
        'Maria Schmidt',
        'donor',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified',
        '2026-02-01 09:00:00+01',
        'a0000000-0000-0000-0000-000000000001',
        TRUE
    );
-- Donor 2: Diaspora Donor
INSERT INTO users (
        user_id,
        email,
        phone,
        full_name,
        role,
        password_hash,
        kyc_verification_status,
        kyc_verified_at,
        kyc_verified_by,
        is_active
    )
VALUES (
        'd0000000-0000-0000-0000-000000000002',
        'donor2@example.com',
        '+17185551234',
        'Omar Kattan',
        'donor',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified',
        '2026-02-05 11:30:00-05',
        'a0000000-0000-0000-0000-000000000001',
        TRUE
    );
-- Supplier: Building Materials
INSERT INTO users (
        user_id,
        email,
        phone,
        full_name,
        role,
        password_hash,
        kyc_verification_status,
        kyc_verified_at,
        kyc_verified_by,
        commercial_register_number,
        is_active
    )
VALUES (
        '50000000-0000-0000-0000-000000000001',
        'supplier@materials.sy',
        '+963112345678',
        'Damascus Building Supplies',
        'supplier',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified',
        '2026-01-25 08:00:00+03',
        'a0000000-0000-0000-0000-000000000001',
        'CR-SYR-2024-00451',
        TRUE
    );
-- Unverified user (KYC pending — demonstrating the gate)
INSERT INTO users (
        user_id,
        email,
        phone,
        full_name,
        role,
        password_hash,
        kyc_verification_status,
        is_active
    )
VALUES (
        '00000000-0000-0000-0000-000000000001',
        'pending@example.com',
        '+963955000001',
        'Pending User',
        'engineer',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'pending',
        FALSE
    );
-- ============================================================================
-- 2. COMPLIANCE RECORDS
-- ============================================================================
-- Engineer Khalid's compliance docs
INSERT INTO compliance_records (
        user_id,
        document_type,
        document_number,
        document_url,
        status,
        reviewed_by,
        reviewed_at
    )
VALUES (
        'e0000000-0000-0000-0000-000000000001',
        'national_id',
        'SYR-ID-19850412-001',
        'https://storage.nammerha.com/docs/kyc/khalid_id.pdf',
        'approved',
        'a0000000-0000-0000-0000-000000000001',
        '2026-01-15 09:30:00+03'
    ),
    (
        'e0000000-0000-0000-0000-000000000001',
        'engineering_license',
        'ENG-SYR-2024-0891',
        'https://storage.nammerha.com/docs/kyc/khalid_license.pdf',
        'approved',
        'a0000000-0000-0000-0000-000000000001',
        '2026-01-15 09:45:00+03'
    ),
    (
        'e0000000-0000-0000-0000-000000000001',
        'guild_membership',
        'GUILD-CE-4422',
        'https://storage.nammerha.com/docs/kyc/khalid_guild.pdf',
        'approved',
        'a0000000-0000-0000-0000-000000000001',
        '2026-01-15 09:50:00+03'
    );
-- Donor sanctions screening
INSERT INTO compliance_records (
        user_id,
        document_type,
        status,
        reviewed_by,
        reviewed_at,
        sanctions_check_result
    )
VALUES (
        'd0000000-0000-0000-0000-000000000001',
        'sanctions_screening',
        'approved',
        'a0000000-0000-0000-0000-000000000001',
        '2026-02-01 08:30:00+01',
        '{"provider": "OFAC_SDN", "result": "CLEAR", "checked_at": "2026-02-01T07:30:00Z", "list_version": "2026-01-31"}'
    ),
    (
        'd0000000-0000-0000-0000-000000000002',
        'sanctions_screening',
        'approved',
        'a0000000-0000-0000-0000-000000000001',
        '2026-02-05 10:30:00-05',
        '{"provider": "OFAC_SDN", "result": "CLEAR", "checked_at": "2026-02-05T15:30:00Z", "list_version": "2026-02-04"}'
    );
-- Supplier compliance
INSERT INTO compliance_records (
        user_id,
        document_type,
        document_number,
        document_url,
        status,
        reviewed_by,
        reviewed_at
    )
VALUES (
        '50000000-0000-0000-0000-000000000001',
        'commercial_register',
        'CR-SYR-2024-00451',
        'https://storage.nammerha.com/docs/kyc/supplier_cr.pdf',
        'approved',
        'a0000000-0000-0000-0000-000000000001',
        '2026-01-25 07:30:00+03'
    );
-- ============================================================================
-- 3. PROJECTS (OCDS)
-- ============================================================================
-- Set sequence to start from 1 (matching OCDS-SYR-00001)
SELECT setval('ocds_project_id_seq', 1, false);
-- Project 1: Matching the main UI screens (itemized_project_details, donor_construction_basket)
INSERT INTO projects (
        project_id,
        homeowner_id,
        assigned_engineer_id,
        title,
        description,
        cover_image_url,
        gps_location,
        address_text,
        damage_type,
        damage_severity,
        status,
        is_public,
        published_at
    )
VALUES (
        generate_ocds_project_id(),
        'a1000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000001',
        'Harbor View Reconstruction',
        'Reconstruction of the historic facades and structural reinforcement for the residential building in the central Aleppo district. Damage sustained during the conflict affecting foundations, walls, and roofing systems.',
        'https://storage.nammerha.com/projects/harbor-view/cover.jpg',
        ST_SetSRID(ST_MakePoint(37.1613, 36.2021), 4326)::GEOGRAPHY,
        -- Aleppo coordinates
        'حي الجديدة، حلب، سوريا',
        'structural',
        'severe',
        'in_progress',
        TRUE,
        '2026-02-10 12:00:00+03'
    );
-- Project 2: Secondary project (dashboard card #2)
INSERT INTO projects (
        project_id,
        homeowner_id,
        assigned_engineer_id,
        title,
        description,
        gps_location,
        address_text,
        damage_type,
        damage_severity,
        status,
        is_public,
        published_at
    )
VALUES (
        generate_ocds_project_id(),
        'a1000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000001',
        'Al-Majidiya Restoration',
        'Reconstruction of the historic facades and structural reinforcement for the community center.',
        ST_SetSRID(ST_MakePoint(36.2927, 33.5138), 4326)::GEOGRAPHY,
        -- Damascus coordinates
        'حي المجيدية، دمشق، سوريا',
        'mixed',
        'moderate',
        'published',
        TRUE,
        '2026-02-15 09:00:00+03'
    );
-- Project 3: Dashboard card #3
INSERT INTO projects (
        project_id,
        homeowner_id,
        title,
        description,
        gps_location,
        address_text,
        damage_type,
        status,
        is_public,
        published_at
    )
VALUES (
        generate_ocds_project_id(),
        'a1000000-0000-0000-0000-000000000001',
        'Civic Hub Phase II',
        'Modernizing the municipal registry with resilient infrastructure and green energy.',
        ST_SetSRID(ST_MakePoint(35.9284, 34.7325), 4326)::GEOGRAPHY,
        -- Homs coordinates
        'المنطقة المركزية، حمص، سوريا',
        'structural',
        'published',
        TRUE,
        '2026-02-20 08:00:00+03'
    );
-- ============================================================================
-- 4. ITEMIZED BOQ (Bill of Quantities)
-- Matching the donor_construction_basket & engineer_boq_builder UI screens
-- ============================================================================
-- Project OCDS-SYR-00001 BOQ items:
-- Item 1: 50 Bags of Cement ($500.00 = 50000 cents, $10.00/bag = 1000 cents)
INSERT INTO itemized_boq (
        item_id,
        project_id,
        material_name,
        material_category,
        description,
        unit,
        unit_price,
        required_quantity,
        funded_amount,
        oracle_reference_price,
        oracle_price_date,
        status,
        created_by,
        image_url
    )
VALUES (
        'b0000000-0000-0000-0000-000000000001',
        'OCDS-SYR-00001',
        'OPC Cement (Grade 43)',
        'cement',
        'Ordinary Portland Cement - Grade 43 for structural foundation work',
        'bag',
        1000,
        50,
        -- $10.00/bag × 50 bags = $500.00
        40000,
        -- 80% funded = $400.00
        900,
        -- Oracle: $9.00/bag
        '2026-02-08 12:00:00+03',
        'partially_funded',
        'e0000000-0000-0000-0000-000000000001',
        'https://storage.nammerha.com/materials/cement.jpg'
    );
-- Item 2: 20m Copper Wiring ($120.00 = 12000 cents, $6.00/m = 600 cents)
INSERT INTO itemized_boq (
        item_id,
        project_id,
        material_name,
        material_category,
        description,
        unit,
        unit_price,
        required_quantity,
        funded_amount,
        oracle_reference_price,
        oracle_price_date,
        status,
        created_by,
        image_url
    )
VALUES (
        'b0000000-0000-0000-0000-000000000002',
        'OCDS-SYR-00001',
        'Copper Wiring (2.5mm²)',
        'wiring',
        'Electrical grade copper wiring for main panel distribution',
        'meter',
        600,
        20,
        -- $6.00/m × 20m = $120.00
        4200,
        -- 35% funded = $42.00
        600,
        '2026-02-08 12:00:00+03',
        'partially_funded',
        'e0000000-0000-0000-0000-000000000001',
        'https://storage.nammerha.com/materials/wiring.jpg'
    );
-- Item 3: TMT Steel Bars ($1,440.00 = 144000 cents, $720.00/ton = 72000 cents)
INSERT INTO itemized_boq (
        item_id,
        project_id,
        material_name,
        material_category,
        description,
        unit,
        unit_price,
        required_quantity,
        funded_amount,
        oracle_reference_price,
        oracle_price_date,
        status,
        created_by,
        image_url
    )
VALUES (
        'b0000000-0000-0000-0000-000000000003',
        'OCDS-SYR-00001',
        'TMT Steel Bars (12mm)',
        'steel',
        'Thermo-Mechanically Treated reinforcement bars for structural foundations',
        'ton',
        72000,
        2,
        -- $720.00/ton × 2 tons = $1,440.00
        144000,
        -- 100% funded
        72000,
        '2026-02-08 12:00:00+03',
        'fully_funded',
        'e0000000-0000-0000-0000-000000000001',
        'https://storage.nammerha.com/materials/steel.jpg'
    );
-- Item 4: Flush Wood Doors ($920.00 = 92000 cents, $115.00/unit = 11500 cents)
INSERT INTO itemized_boq (
        item_id,
        project_id,
        material_name,
        material_category,
        description,
        unit,
        unit_price,
        required_quantity,
        funded_amount,
        oracle_reference_price,
        oracle_price_date,
        status,
        created_by,
        image_url
    )
VALUES (
        'b0000000-0000-0000-0000-000000000004',
        'OCDS-SYR-00001',
        'Flush Wood Door (32")',
        'doors',
        'Solid wood modern interior door for residential rooms',
        'unit',
        11500,
        8,
        -- $115.00/unit × 8 units = $920.00
        0,
        -- 0% funded
        11500,
        '2026-02-08 12:00:00+03',
        'verified',
        'e0000000-0000-0000-0000-000000000001',
        'https://storage.nammerha.com/materials/door.jpg'
    );
-- ============================================================================
-- 5. PROJECT MILESTONES
-- ============================================================================
INSERT INTO project_milestones (
        project_id,
        title,
        description,
        sequence_number,
        status,
        estimated_cost,
        started_at
    )
VALUES (
        'OCDS-SYR-00001',
        'Foundation & Structural Assessment',
        'Complete site assessment and foundation reinforcement',
        1,
        'completed',
        50000,
        '2026-02-10 08:00:00+03'
    ),
    (
        'OCDS-SYR-00001',
        'Concrete Pour',
        'Foundation concrete pour and curing period',
        2,
        'in_progress',
        125000,
        '2026-03-01 08:00:00+03'
    ),
    (
        'OCDS-SYR-00001',
        'Structural Framing',
        'Steel reinforcement and wall framing',
        3,
        'pending',
        100000,
        NULL
    ),
    (
        'OCDS-SYR-00001',
        'Electrical & Plumbing',
        'Complete electrical and plumbing infrastructure',
        4,
        'pending',
        45000,
        NULL
    ),
    (
        'OCDS-SYR-00001',
        'Finishing & Handover',
        'Interior finishing, doors installation, and final inspection',
        5,
        'pending',
        30000,
        NULL
    );
-- ============================================================================
-- 6. ESCROW LEDGER
-- ============================================================================
-- Donor 1 funds 50 bags of cement (partially: $250 of $500)
INSERT INTO escrow_ledger (
        donor_id,
        item_id,
        project_id,
        amount_locked,
        currency,
        payment_status,
        payment_method,
        payment_gateway_ref,
        locked_at
    )
VALUES (
        'd0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001',
        'OCDS-SYR-00001',
        25000,
        'USD',
        'locked',
        'visa',
        'PAY-VISA-2026-0001',
        '2026-02-15 14:00:00+03'
    );
-- Donor 2 funds cement ($150)
INSERT INTO escrow_ledger (
        donor_id,
        item_id,
        project_id,
        amount_locked,
        currency,
        payment_status,
        payment_method,
        payment_gateway_ref,
        locked_at
    )
VALUES (
        'd0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000001',
        'OCDS-SYR-00001',
        15000,
        'USD',
        'locked',
        'bank_transfer',
        'PAY-BANK-2026-0001',
        '2026-02-18 10:30:00+03'
    );
-- Donor 1 funds copper wiring ($42)
INSERT INTO escrow_ledger (
        donor_id,
        item_id,
        project_id,
        amount_locked,
        currency,
        payment_status,
        payment_method,
        payment_gateway_ref,
        locked_at
    )
VALUES (
        'd0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000002',
        'OCDS-SYR-00001',
        4200,
        'USD',
        'locked',
        'visa',
        'PAY-VISA-2026-0002',
        '2026-02-20 09:00:00+03'
    );
-- Donor 1 funds steel bars ($720 — first ton)
INSERT INTO escrow_ledger (
        donor_id,
        item_id,
        project_id,
        amount_locked,
        currency,
        payment_status,
        payment_method,
        payment_gateway_ref,
        locked_at,
        released_at,
        released_by,
        blockchain_tx_hash
    )
VALUES (
        'd0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000003',
        'OCDS-SYR-00001',
        72000,
        'USD',
        'released',
        'visa',
        'PAY-VISA-2026-0003',
        '2026-02-22 11:00:00+03',
        '2026-03-05 15:30:00+03',
        'a0000000-0000-0000-0000-000000000002',
        '0x741ce9a2...f4d8'
    );
-- Donor 2 funds steel bars ($720 — second ton)
INSERT INTO escrow_ledger (
        donor_id,
        item_id,
        project_id,
        amount_locked,
        currency,
        payment_status,
        payment_method,
        payment_gateway_ref,
        locked_at,
        released_at,
        released_by,
        blockchain_tx_hash
    )
VALUES (
        'd0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000003',
        'OCDS-SYR-00001',
        72000,
        'USD',
        'released',
        'bank_transfer',
        'PAY-BANK-2026-0002',
        '2026-02-25 16:00:00+03',
        '2026-03-05 15:45:00+03',
        'a0000000-0000-0000-0000-000000000002',
        '0x892bc1d3...e7a9'
    );
-- ============================================================================
-- 7. SPATIAL PROOF
-- Matching the donor_delivery_verification_notification UI
-- "Your 50 bags of cement have been received and verified on-site"
-- ============================================================================
-- Proof for steel bars delivery (already released from escrow)
INSERT INTO spatial_proof (
        proof_id,
        item_id,
        project_id,
        engineer_id,
        gps_coordinates,
        gps_accuracy_meters,
        captured_at,
        image_url,
        image_hash,
        description,
        device_info,
        verification_status,
        verified_by,
        verified_at
    )
VALUES (
        'f0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000003',
        'OCDS-SYR-00001',
        'e0000000-0000-0000-0000-000000000001',
        ST_SetSRID(ST_MakePoint(37.1615, 36.2023), 4326)::GEOGRAPHY,
        3.50,
        '2026-03-05 14:45:00+03',
        'https://storage.nammerha.com/proofs/steel-delivery-001.jpg',
        'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
        'TMT Steel Bars (12mm) — 2 tons delivered and stacked at foundation area. Visual confirmation of brand marking and quantity.',
        '{"model": "Samsung Galaxy A54", "os": "Android 14", "app_version": "1.2.0", "battery_pct": 72}',
        'verified',
        'a0000000-0000-0000-0000-000000000002',
        '2026-03-05 15:20:00+03'
    );
-- Link the proof to escrow releases
UPDATE escrow_ledger
SET release_proof_id = 'f0000000-0000-0000-0000-000000000001'
WHERE item_id = 'b0000000-0000-0000-0000-000000000003'
    AND payment_status = 'released';
-- ============================================================================
-- 8. PRICING ORACLE ENTRIES
-- Matching the pricing_oracle_epa_engine UI live market data
-- ============================================================================
INSERT INTO pricing_oracle_entries (
        material_category,
        material_name,
        unit,
        base_price,
        current_price,
        price_change_pct,
        region,
        source,
        volatility_index,
        confidence_score
    )
VALUES (
        'steel',
        'TMT Steel Bars (12mm)',
        'ton',
        83000,
        85000,
        2.40,
        'Damascus',
        'LME Real-time API',
        8.40,
        98.20
    ),
    (
        'cement',
        'OPC Cement (Grade 43)',
        'bag',
        4950,
        5000,
        1.10,
        'Damascus',
        'Local Mill Invoices',
        2.10,
        97.50
    ),
    (
        'lumber',
        'Construction Lumber',
        'mbf',
        42500,
        42290,
        -0.50,
        'Aleppo',
        'GASTAT',
        3.20,
        96.80
    ),
    (
        'wiring',
        'Copper Wiring (2.5mm²)',
        'meter',
        580,
        600,
        3.45,
        'Damascus',
        'Local Mill Invoices',
        4.10,
        95.30
    ),
    (
        'doors',
        'Flush Wood Door (32")',
        'unit',
        11200,
        11500,
        2.68,
        'Homs',
        'GASTAT',
        1.80,
        94.60
    );
-- ============================================================================
-- 9. EPA ADJUSTMENTS (FIDIC 13.8)
-- Matching the pricing_oracle_epa_engine right panel
-- ============================================================================
INSERT INTO epa_adjustments (
        project_id,
        item_id,
        original_cost,
        adjustment_percentage,
        adjusted_cost,
        fidic_formula_params,
        status,
        contract_reference
    )
VALUES (
        'OCDS-SYR-00001',
        'b0000000-0000-0000-0000-000000000003',
        12500000,
        -- $125,000.00 original
        4.20,
        13025000,
        -- $130,250.00 adjusted
        '{
       "a": 0.15, "b": 0.30, "c": 0.25, "d": 0.30,
       "Ln": 850, "Lo": 800,
       "En": 110, "Eo": 100,
       "Mn": 920, "Mo": 900,
       "formula": "Pn = a + b(Ln/Lo) + c(En/Eo) + d(Mn/Mo)"
     }',
        'pending',
        '#CT-8892'
    );
-- ============================================================================
-- 10. AUDIT TRAIL SAMPLES
-- ============================================================================
INSERT INTO audit_trail (
        entity_type,
        entity_id,
        action,
        actor_id,
        new_values
    )
VALUES (
        'project',
        'OCDS-SYR-00001',
        'created',
        'a1000000-0000-0000-0000-000000000001',
        '{"title": "Harbor View Reconstruction", "damage_type": "structural"}'
    ),
    (
        'project',
        'OCDS-SYR-00001',
        'status_changed',
        'e0000000-0000-0000-0000-000000000001',
        '{"old_status": "draft", "new_status": "in_progress"}'
    ),
    (
        'escrow_ledger',
        'auto',
        'fund_released',
        'a0000000-0000-0000-0000-000000000002',
        '{"item": "TMT Steel Bars", "amount": 144000, "proof_id": "f0000000-0000-0000-0000-000000000001"}'
    );
COMMIT;
-- ============================================================================
-- SEED COMPLETE
-- Users: 8 | Projects: 3 | BOQ Items: 4 | Escrow: 5 | Proofs: 1
-- Oracle Entries: 5 | EPA: 1 | Milestones: 5 | Compliance: 6 | Audit: 3
-- ============================================================================