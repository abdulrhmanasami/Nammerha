-- PRODUCTION SAFETY GUARD: Prevent accidental execution in production
DO $$
BEGIN
  IF current_setting('server_version_num')::int > 0 THEN
    -- Check if this is a production database by looking for real user data
    IF EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datname LIKE '%prod%') THEN
      RAISE EXCEPTION '[SAFETY] demo_data.sql must NEVER run in production. Aborting.';
    END IF;
  END IF;
  -- Also check environment variable if available
  IF current_setting('app.environment', true) = 'production' THEN
    RAISE EXCEPTION '[SAFETY] demo_data.sql must NEVER run in production. Aborting.';
  END IF;
END $$;

-- ============================================================================
-- NAMMERHA PLATFORM — Complete Demo Seed Data (Platinum Edition)
-- ============================================================================
-- Populates ALL platform tables with realistic Syrian reconstruction data.
-- Prerequisite: All migrations (001–041) must be applied first.
--
-- Coverage:
--   Users: 14 (admin, auditor, 2 engineers, 2 contractors, 2 suppliers,
--              2 homeowners, 2 donors, 2 tradespersons)
--   Projects: 4 | BOQ Items: 8 | Escrow: 8 | Proofs: 2 | POs: 2
--   Supplier Catalog: 8 | Bids: 4 | Notifications: 12
--   Reviews: 6 | Impact Messages: 8 | Trade Assignments: 3
--   Service Requests: 2 | Oracle Entries: 6 | EPA: 1
--   Profiles (028): All 14 users | Milestones: 5
--
-- All demo users use a shared bcrypt hash (see seed documentation for credentials).
-- ============================================================================
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. USERS — 14 accounts across all roles
-- ═══════════════════════════════════════════════════════════════════════════

-- 1.1 Admin
INSERT INTO users (user_id, email, phone, full_name, role, password_hash, kyc_verification_status, is_active, is_email_verified)
VALUES ('a0000000-0000-0000-0000-000000000001', 'admin@nammerha.com', '+963911000001',
        'مدير المنصة', 'admin',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', TRUE, TRUE);

-- 1.2 Auditor
INSERT INTO users (user_id, email, phone, full_name, role, password_hash, kyc_verification_status, is_active, is_email_verified)
VALUES ('a0000000-0000-0000-0000-000000000002', 'auditor@nammerha.com', '+963911000002',
        'سارة الخطيب', 'auditor',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', TRUE, TRUE);

-- 1.3 Engineer: Khalid (structural specialist — Aleppo)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   engineering_license_number, guild_membership_id,
                   is_active, is_email_verified, specialty, bio, dynamic_score,
                   completed_projects_count, avg_response_hours, service_radius_km)
VALUES ('e0000000-0000-0000-0000-000000000001', 'khalid.eng@nammerha.com', '+963933100001',
        'م. خالد الحسن', 'engineer',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-01-15 10:00:00+03', 'a0000000-0000-0000-0000-000000000001',
        'ENG-SYR-2024-0891', 'GUILD-CE-4422',
        TRUE, TRUE, 'structural', 'مهندس إنشائي — 12 سنة خبرة في ترميم المباني التراثية بحلب القديمة', 87.50,
        24, 2.5, 75);

-- 1.4 Engineer: Lina (electrical specialist — Damascus)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   engineering_license_number, guild_membership_id,
                   is_active, is_email_verified, specialty, bio, dynamic_score,
                   completed_projects_count, avg_response_hours, service_radius_km)
VALUES ('e0000000-0000-0000-0000-000000000002', 'lina.eng@nammerha.com', '+963933100002',
        'م. لينا الأحمد', 'engineer',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-01-20 09:00:00+03', 'a0000000-0000-0000-0000-000000000001',
        'ENG-SYR-2024-1102', 'GUILD-EE-5511',
        TRUE, TRUE, 'electrical', 'مهندسة كهربائية — متخصصة في إعادة تأهيل الشبكات الكهربائية المنزلية', 79.20,
        18, 3.1, 50);

-- 1.5 Homeowner: Ahmad (Aleppo — project owner)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   is_active, is_email_verified)
VALUES ('a1000000-0000-0000-0000-000000000001', 'ahmad.owner@nammerha.com', '+963944200001',
        'أحمد المحمود', 'homeowner',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-01-20 14:30:00+03', 'a0000000-0000-0000-0000-000000000001',
        TRUE, TRUE);

-- 1.6 Homeowner: Fatima (Damascus)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   is_active, is_email_verified)
VALUES ('a1000000-0000-0000-0000-000000000002', 'fatima.home@nammerha.com', '+963944200002',
        'فاطمة العلي', 'homeowner',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-02-01 11:00:00+03', 'a0000000-0000-0000-0000-000000000001',
        TRUE, TRUE);

-- 1.7 Donor: Maria Schmidt (International — Germany)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   is_active, is_email_verified)
VALUES ('d0000000-0000-0000-0000-000000000001', 'donor1@example.com', '+491712345678',
        'Maria Schmidt', 'donor',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-02-01 09:00:00+01', 'a0000000-0000-0000-0000-000000000001',
        TRUE, TRUE);

-- 1.8 Donor: Omar Kattan (Diaspora — USA)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   is_active, is_email_verified)
VALUES ('d0000000-0000-0000-0000-000000000002', 'donor2@example.com', '+17185551234',
        'Omar Kattan', 'donor',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-02-05 11:30:00-05', 'a0000000-0000-0000-0000-000000000001',
        TRUE, TRUE);

-- 1.9 Supplier: Damascus Building Supplies
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   commercial_register_number, is_active, is_email_verified)
VALUES ('50000000-0000-0000-0000-000000000001', 'supplier@materials.sy', '+963112345678',
        'مواد البناء الدمشقية', 'supplier',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-01-25 08:00:00+03', 'a0000000-0000-0000-0000-000000000001',
        'CR-SYR-2024-00451', TRUE, TRUE);

-- 1.10 Supplier: Aleppo Steel Works
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   commercial_register_number, is_active, is_email_verified)
VALUES ('50000000-0000-0000-0000-000000000002', 'aleppo.steel@materials.sy', '+963212345678',
        'حديد حلب المتحدة', 'supplier',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-01-28 09:00:00+03', 'a0000000-0000-0000-0000-000000000001',
        'CR-SYR-2024-00622', TRUE, TRUE);

-- 1.11 Contractor: Hassan (General contracting — Aleppo)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   commercial_register_number, is_active, is_email_verified,
                   specialty, bio, dynamic_score, completed_projects_count,
                   bid_win_rate, service_radius_km)
VALUES ('c0000000-0000-0000-0000-000000000001', 'hassan.contractor@nammerha.com', '+963955100001',
        'حسان الدبس', 'contractor',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-02-01 08:00:00+03', 'a0000000-0000-0000-0000-000000000001',
        'CR-SYR-2025-00103', TRUE, TRUE,
        'structural', 'مقاول عام — 15 سنة خبرة في ترميم المنشآت السكنية والتجارية', 82.30, 31,
        68.50, 100);

-- 1.12 Contractor: Rami (Finishing — Damascus)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   commercial_register_number, is_active, is_email_verified,
                   specialty, bio, dynamic_score, completed_projects_count,
                   bid_win_rate, service_radius_km)
VALUES ('c0000000-0000-0000-0000-000000000002', 'rami.contractor@nammerha.com', '+963955100002',
        'رامي النعسان', 'contractor',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-02-05 10:00:00+03', 'a0000000-0000-0000-0000-000000000001',
        'CR-SYR-2025-00207', TRUE, TRUE,
        'finishing', 'مقاول تشطيبات — متخصص في الدهانات والديكورات الداخلية والأعمال الخشبية', 74.80, 22,
        55.00, 60);

-- 1.13 Tradesperson: Abu Ali (Tiling — Aleppo)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   is_active, is_email_verified,
                   trade, secondary_trades, hourly_rate, daily_rate,
                   availability, years_experience, completed_jobs_count, average_rating)
VALUES ('70000000-0000-0000-0000-000000000001', 'abuali.tiles@nammerha.com', '+963966100001',
        'أبو علي البلّاط', 'tradesperson',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-02-10 08:00:00+03', 'a0000000-0000-0000-0000-000000000001',
        TRUE, TRUE,
        'tiling', ARRAY['plastering']::trade_type[], 1500, 10000,
        'available', 20, 87, 4.70);

-- 1.14 Tradesperson: Mustafa (Electrical — Damascus)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash,
                   kyc_verification_status, kyc_verified_at, kyc_verified_by,
                   is_active, is_email_verified,
                   trade, secondary_trades, hourly_rate, daily_rate,
                   availability, years_experience, completed_jobs_count, average_rating)
VALUES ('70000000-0000-0000-0000-000000000002', 'mustafa.electrician@nammerha.com', '+963966100002',
        'مصطفى الكهربائي', 'tradesperson',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'verified', '2026-02-12 09:00:00+03', 'a0000000-0000-0000-0000-000000000001',
        TRUE, TRUE,
        'electrical', ARRAY['plumbing']::trade_type[], 2000, 14000,
        'busy', 14, 63, 4.50);

-- 1.15 Unverified (KYC pending — demonstrating gate)
INSERT INTO users (user_id, email, phone, full_name, role, password_hash, kyc_verification_status, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'pending@example.com', '+963955000001',
        'مستخدم قيد التحقق', 'engineer',
        '$2b$12$aa0vT.eCkNytuMGNXZBxQ.Qidx8ygXyw0cT6DUxVc.SmCCBSYrzoa',
        'pending', FALSE);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. COMPLIANCE RECORDS
-- ═══════════════════════════════════════════════════════════════════════════

-- Engineer Khalid's KYC documents
INSERT INTO compliance_records (user_id, document_type, document_number, document_url, status, reviewed_by, reviewed_at)
VALUES
    ('e0000000-0000-0000-0000-000000000001', 'national_id', 'SYR-ID-19850412-001',
     'https://storage.nammerha.com/docs/kyc/khalid_id.pdf', 'approved',
     'a0000000-0000-0000-0000-000000000001', '2026-01-15 09:30:00+03'),
    ('e0000000-0000-0000-0000-000000000001', 'engineering_license', 'ENG-SYR-2024-0891',
     'https://storage.nammerha.com/docs/kyc/khalid_license.pdf', 'approved',
     'a0000000-0000-0000-0000-000000000001', '2026-01-15 09:45:00+03');

-- Contractor Hassan's KYC
INSERT INTO compliance_records (user_id, document_type, document_number, document_url, status, reviewed_by, reviewed_at)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'commercial_register', 'CR-SYR-2025-00103',
     'https://storage.nammerha.com/docs/kyc/hassan_cr.pdf', 'approved',
     'a0000000-0000-0000-0000-000000000001', '2026-02-01 07:30:00+03');

-- Donors sanctions screening
INSERT INTO compliance_records (user_id, document_type, status, reviewed_by, reviewed_at, sanctions_check_result)
VALUES
    ('d0000000-0000-0000-0000-000000000001', 'sanctions_screening', 'approved',
     'a0000000-0000-0000-0000-000000000001', '2026-02-01 08:30:00+01',
     '{"provider": "OFAC_SDN", "result": "CLEAR", "checked_at": "2026-02-01T07:30:00Z", "list_version": "2026-01-31"}'),
    ('d0000000-0000-0000-0000-000000000002', 'sanctions_screening', 'approved',
     'a0000000-0000-0000-0000-000000000001', '2026-02-05 10:30:00-05',
     '{"provider": "OFAC_SDN", "result": "CLEAR", "checked_at": "2026-02-05T15:30:00Z", "list_version": "2026-02-04"}');

-- Supplier compliance
INSERT INTO compliance_records (user_id, document_type, document_number, document_url, status, reviewed_by, reviewed_at)
VALUES
    ('50000000-0000-0000-0000-000000000001', 'commercial_register', 'CR-SYR-2024-00451',
     'https://storage.nammerha.com/docs/kyc/supplier_cr.pdf', 'approved',
     'a0000000-0000-0000-0000-000000000001', '2026-01-25 07:30:00+03'),
    ('50000000-0000-0000-0000-000000000002', 'commercial_register', 'CR-SYR-2024-00622',
     'https://storage.nammerha.com/docs/kyc/aleppo_steel_cr.pdf', 'approved',
     'a0000000-0000-0000-0000-000000000001', '2026-01-28 08:30:00+03');


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. PROJECTS (OCDS-compliant)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT setval('ocds_project_id_seq', 1, false);

-- Project 1: Harbor View — in_progress — Aleppo (full lifecycle demo)
INSERT INTO projects (project_id, homeowner_id, assigned_engineer_id, assigned_contractor_id,
                      title, description, cover_image_url, gps_location, address_text,
                      damage_type, damage_severity, status, is_public, published_at)
VALUES (generate_ocds_project_id(), 'a1000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
        'ترميم مبنى إطلالة المرفأ',
        'إعادة تأهيل الواجهات التاريخية وتعزيز الهيكل الإنشائي للمبنى السكني في حي الجديدة — حلب. الأضرار تشمل الأساسات والجدران وأنظمة التسقيف.',
        'https://storage.nammerha.com/projects/harbor-view/cover.jpg',
        ST_SetSRID(ST_MakePoint(37.1613, 36.2021), 4326)::GEOGRAPHY,
        'حي الجديدة، حلب، سوريا', 'structural', 'severe', 'in_progress', TRUE, '2026-02-10 12:00:00+03');

-- Project 2: Al-Majidiya — published — Damascus
INSERT INTO projects (project_id, homeowner_id, assigned_engineer_id,
                      title, description, gps_location, address_text,
                      damage_type, damage_severity, status, is_public, published_at)
VALUES (generate_ocds_project_id(), 'a1000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000002',
        'ترميم مركز المجيدية المجتمعي',
        'إعادة تأهيل الواجهات التاريخية والتعزيز الإنشائي للمركز المجتمعي في قلب دمشق القديمة.',
        ST_SetSRID(ST_MakePoint(36.2927, 33.5138), 4326)::GEOGRAPHY,
        'حي المجيدية، دمشق، سوريا', 'mixed', 'moderate', 'published', TRUE, '2026-02-15 09:00:00+03');

-- Project 3: Civic Hub — published — Homs (open for bids)
INSERT INTO projects (project_id, homeowner_id, title, description, gps_location, address_text,
                      damage_type, status, is_public, published_at)
VALUES (generate_ocds_project_id(), 'a1000000-0000-0000-0000-000000000001',
        'المرحلة الثانية — المركز المدني',
        'تحديث السجل العقاري البلدي ببنية تحتية مرنة وطاقة خضراء.',
        ST_SetSRID(ST_MakePoint(36.7128, 34.7325), 4326)::GEOGRAPHY,
        'المنطقة المركزية، حمص، سوريا', 'structural', 'published', TRUE, '2026-02-20 08:00:00+03');

-- Project 4: Fatima's home — Damascus (draft — new homeowner)
INSERT INTO projects (project_id, homeowner_id, title, description, gps_location, address_text,
                      damage_type, damage_severity, status, is_public)
VALUES (generate_ocds_project_id(), 'a1000000-0000-0000-0000-000000000002',
        'ترميم منزل عائلة العلي',
        'إصلاح أضرار شبكة المياه والصرف الصحي بعد تعرض المبنى لقصف غير مباشر. يتطلب إعادة تأسيس التمديدات الصحية بالكامل.',
        ST_SetSRID(ST_MakePoint(36.3020, 33.5120), 4326)::GEOGRAPHY,
        'حي المهاجرين، دمشق', 'plumbing', 'moderate', 'draft', FALSE);


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. ITEMIZED BOQ (Bill of Quantities)
-- ═══════════════════════════════════════════════════════════════════════════

-- Project OCDS-SYR-00001 (Harbor View):
-- Item 1: 50 Bags Cement ($500 = 50000¢, $10/bag = 1000¢) — 80% funded
INSERT INTO itemized_boq (item_id, project_id, material_name, material_category, description, unit,
                           unit_price, required_quantity, funded_amount, oracle_reference_price, oracle_price_date,
                           status, created_by, image_url, preferred_supplier_id)
VALUES ('b0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001',
        'إسمنت بورتلاندي (درجة 43)', 'cement',
        'إسمنت OPC درجة 43 للأعمال الإنشائية الأساسية', 'bag',
        1000, 50, 40000, 900, '2026-02-08 12:00:00+03',
        'partially_funded', 'e0000000-0000-0000-0000-000000000001',
        'https://storage.nammerha.com/materials/cement.jpg',
        '50000000-0000-0000-0000-000000000001');

-- Item 2: 20m Copper Wiring ($120 = 12000¢, $6/m = 600¢) — 35% funded
INSERT INTO itemized_boq (item_id, project_id, material_name, material_category, description, unit,
                           unit_price, required_quantity, funded_amount, oracle_reference_price, oracle_price_date,
                           status, created_by, image_url)
VALUES ('b0000000-0000-0000-0000-000000000002', 'OCDS-SYR-00001',
        'أسلاك نحاسية (2.5مم²)', 'wiring',
        'أسلاك كهربائية نحاسية لتوزيع اللوحة الرئيسية', 'meter',
        600, 20, 4200, 600, '2026-02-08 12:00:00+03',
        'partially_funded', 'e0000000-0000-0000-0000-000000000001',
        'https://storage.nammerha.com/materials/wiring.jpg');

-- Item 3: TMT Steel Bars ($1,440 = 144000¢) — 100% funded!
INSERT INTO itemized_boq (item_id, project_id, material_name, material_category, description, unit,
                           unit_price, required_quantity, funded_amount, oracle_reference_price, oracle_price_date,
                           status, created_by, image_url, preferred_supplier_id)
VALUES ('b0000000-0000-0000-0000-000000000003', 'OCDS-SYR-00001',
        'حديد تسليح TMT (12مم)', 'steel',
        'قضبان حديد التسليح المعالجة حرارياً لأساسات المبنى', 'ton',
        72000, 2, 144000, 72000, '2026-02-08 12:00:00+03',
        'fully_funded', 'e0000000-0000-0000-0000-000000000001',
        'https://storage.nammerha.com/materials/steel.jpg',
        '50000000-0000-0000-0000-000000000002');

-- Item 4: Flush Wood Doors ($920 = 92000¢) — 0% funded
INSERT INTO itemized_boq (item_id, project_id, material_name, material_category, description, unit,
                           unit_price, required_quantity, funded_amount, oracle_reference_price, oracle_price_date,
                           status, created_by, image_url)
VALUES ('b0000000-0000-0000-0000-000000000004', 'OCDS-SYR-00001',
        'باب خشبي مسطح (32 بوصة)', 'doors',
        'باب خشبي داخلي حديث للغرف السكنية', 'unit',
        11500, 8, 0, 11500, '2026-02-08 12:00:00+03',
        'verified', 'e0000000-0000-0000-0000-000000000001',
        'https://storage.nammerha.com/materials/door.jpg');

-- Item 5: Ceramic Floor Tiles — Project 1
INSERT INTO itemized_boq (item_id, project_id, material_name, material_category, description, unit,
                           unit_price, required_quantity, funded_amount, oracle_reference_price, oracle_price_date,
                           status, created_by, image_url)
VALUES ('b0000000-0000-0000-0000-000000000005', 'OCDS-SYR-00001',
        'بلاط سيراميك (60×60سم)', 'tiles',
        'بلاط أرضيات سيراميك عالي الجودة مقاوم للخدش', 'm2',
        850, 120, 51000, 800, '2026-02-08 12:00:00+03',
        'partially_funded', 'e0000000-0000-0000-0000-000000000001',
        'https://storage.nammerha.com/materials/tiles.jpg');

-- Project OCDS-SYR-00002 (Al-Majidiya):
-- Item 6: Sand — partially funded
INSERT INTO itemized_boq (item_id, project_id, material_name, material_category, description, unit,
                           unit_price, required_quantity, funded_amount, status, created_by)
VALUES ('b0000000-0000-0000-0000-000000000006', 'OCDS-SYR-00002',
        'رمل ناعم للبناء', 'sand',
        'رمل نهري ناعم للخلطات الإسمنتية والقصارة', 'ton',
        3500, 10, 21000, 'partially_funded', 'e0000000-0000-0000-0000-000000000002');

-- Item 7: PVC Pipes
INSERT INTO itemized_boq (item_id, project_id, material_name, material_category, description, unit,
                           unit_price, required_quantity, funded_amount, status, created_by)
VALUES ('b0000000-0000-0000-0000-000000000007', 'OCDS-SYR-00002',
        'أنابيب PVC (4 بوصة)', 'plumbing',
        'أنابيب صرف صحي PVC قطر 4 بوصة — مادة عالية الكثافة', 'meter',
        400, 60, 0, 'verified', 'e0000000-0000-0000-0000-000000000002');

-- Item 8: Waterproofing
INSERT INTO itemized_boq (item_id, project_id, material_name, material_category, description, unit,
                           unit_price, required_quantity, funded_amount, status, created_by)
VALUES ('b0000000-0000-0000-0000-000000000008', 'OCDS-SYR-00002',
        'مادة عزل مائي (سيكا)', 'chemicals',
        'طبقة عزل مائي لمنع الرطوبة في الأساسات — ماركة Sika', 'kg',
        2200, 25, 27500, 'partially_funded', 'e0000000-0000-0000-0000-000000000002');


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. PROJECT MILESTONES
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO project_milestones (project_id, title, description, sequence_number, status, estimated_cost, started_at)
VALUES
    ('OCDS-SYR-00001', 'تقييم الأساسات والهيكل', 'تقييم شامل للموقع وتعزيز الأساسات', 1, 'completed', 50000, '2026-02-10 08:00:00+03'),
    ('OCDS-SYR-00001', 'صب الخرسانة', 'صب خرسانة الأساسات وفترة المعالجة', 2, 'in_progress', 125000, '2026-03-01 08:00:00+03'),
    ('OCDS-SYR-00001', 'التأطير الإنشائي', 'تسليح الحديد وتأطير الجدران', 3, 'pending', 100000, NULL),
    ('OCDS-SYR-00001', 'الكهرباء والسباكة', 'البنية التحتية للتمديدات الكهربائية والصحية', 4, 'pending', 45000, NULL),
    ('OCDS-SYR-00001', 'التشطيب والتسليم', 'تشطيب داخلي وتركيب أبواب وفحص نهائي', 5, 'pending', 30000, NULL);


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. ESCROW LEDGER — 8 entries
-- ═══════════════════════════════════════════════════════════════════════════

-- Donor 1: $250 cement (locked)
INSERT INTO escrow_ledger (donor_id, item_id, project_id, amount_locked, currency, payment_status, payment_method, payment_gateway_ref, locked_at)
VALUES ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001',
        25000, 'USD', 'locked', 'visa', 'PAY-VISA-2026-0001', '2026-02-15 14:00:00+03');

-- Donor 2: $150 cement (locked)
INSERT INTO escrow_ledger (donor_id, item_id, project_id, amount_locked, currency, payment_status, payment_method, payment_gateway_ref, locked_at)
VALUES ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001',
        15000, 'USD', 'locked', 'fatora', 'PAY-FAT-2026-0001', '2026-02-18 10:30:00+03');

-- Donor 1: $42 copper (locked)
INSERT INTO escrow_ledger (donor_id, item_id, project_id, amount_locked, currency, payment_status, payment_method, payment_gateway_ref, locked_at)
VALUES ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'OCDS-SYR-00001',
        4200, 'USD', 'locked', 'visa', 'PAY-VISA-2026-0002', '2026-02-20 09:00:00+03');

-- Donor 1: $720 steel (RELEASED — proof verified)
INSERT INTO escrow_ledger (donor_id, item_id, project_id, amount_locked, currency, payment_status, payment_method,
                           payment_gateway_ref, locked_at, released_at, released_by, blockchain_tx_hash)
VALUES ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'OCDS-SYR-00001',
        72000, 'USD', 'released', 'visa', 'PAY-VISA-2026-0003',
        '2026-02-22 11:00:00+03', '2026-03-05 15:30:00+03',
        'a0000000-0000-0000-0000-000000000002', '0x741ce9a2...f4d8');

-- Donor 2: $720 steel (RELEASED)
INSERT INTO escrow_ledger (donor_id, item_id, project_id, amount_locked, currency, payment_status, payment_method,
                           payment_gateway_ref, locked_at, released_at, released_by, blockchain_tx_hash)
VALUES ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'OCDS-SYR-00001',
        72000, 'USD', 'released', 'fatora', 'PAY-FAT-2026-0002',
        '2026-02-25 16:00:00+03', '2026-03-05 15:45:00+03',
        'a0000000-0000-0000-0000-000000000002', '0x892bc1d3...e7a9');

-- Donor 1: $510 tiles (locked)
INSERT INTO escrow_ledger (donor_id, item_id, project_id, amount_locked, currency, payment_status, payment_method, payment_gateway_ref, locked_at)
VALUES ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'OCDS-SYR-00001',
        51000, 'USD', 'locked', 'visa', 'PAY-VISA-2026-0004', '2026-03-10 11:00:00+03');

-- Donor 2: $210 sand (locked — project 2)
INSERT INTO escrow_ledger (donor_id, item_id, project_id, amount_locked, currency, payment_status, payment_method, payment_gateway_ref, locked_at)
VALUES ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000006', 'OCDS-SYR-00002',
        21000, 'USD', 'locked', 'fatora', 'PAY-FAT-2026-0003', '2026-03-12 14:00:00+03');

-- Donor 2: $275 waterproofing (locked — project 2)
INSERT INTO escrow_ledger (donor_id, item_id, project_id, amount_locked, currency, payment_status, payment_method, payment_gateway_ref, locked_at)
VALUES ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000008', 'OCDS-SYR-00002',
        27500, 'USD', 'locked', 'fatora', 'PAY-FAT-2026-0004', '2026-03-15 10:00:00+03');


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. SPATIAL PROOFS
-- ═══════════════════════════════════════════════════════════════════════════

-- Proof 1: Steel delivery verified
INSERT INTO spatial_proof (proof_id, item_id, project_id, engineer_id, gps_coordinates, gps_accuracy_meters, captured_at,
                           image_url, image_hash, description, device_info, verification_status, verified_by, verified_at)
VALUES ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'OCDS-SYR-00001',
        'e0000000-0000-0000-0000-000000000001',
        ST_SetSRID(ST_MakePoint(37.1615, 36.2023), 4326)::GEOGRAPHY, 3.50,
        '2026-03-05 14:45:00+03', 'https://storage.nammerha.com/proofs/steel-delivery-001.jpg',
        'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
        'حديد تسليح TMT (12مم) — طنان تم تسليمهما وتكديسهما في منطقة الأساسات. تأكيد بصري لعلامة المصنع والكمية.',
        '{"model": "Samsung Galaxy A54", "os": "Android 14", "app_version": "1.2.0", "battery_pct": 72}',
        'verified', 'a0000000-0000-0000-0000-000000000002', '2026-03-05 15:20:00+03');

-- Proof 2: Cement partial delivery (submitted, not yet verified)
INSERT INTO spatial_proof (proof_id, item_id, project_id, engineer_id, gps_coordinates, gps_accuracy_meters, captured_at,
                           image_url, image_hash, description, device_info, verification_status)
VALUES ('f0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001',
        'e0000000-0000-0000-0000-000000000001',
        ST_SetSRID(ST_MakePoint(37.1614, 36.2022), 4326)::GEOGRAPHY, 4.20,
        '2026-03-18 10:15:00+03', 'https://storage.nammerha.com/proofs/cement-delivery-001.jpg',
        'ff3344ee11bb22cc00dd55aa6677889900112233445566778899aabb33cc44dd',
        'استلام 30 كيس إسمنت OPC — الدفعة الأولى. مطابقة العلامة التجارية والكمية تمت بنجاح.',
        '{"model": "iPhone 15 Pro", "os": "iOS 18.2", "app_version": "1.2.1", "battery_pct": 85}',
        'submitted');

-- Link proof 1 to escrow releases
UPDATE escrow_ledger SET release_proof_id = 'f0000000-0000-0000-0000-000000000001'
WHERE item_id = 'b0000000-0000-0000-0000-000000000003' AND payment_status = 'released';


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. SUPPLIER CATALOG — 8 items
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO supplier_catalog (supplier_id, material_name, material_category, description, unit, unit_price_guide, min_order_qty, lead_time_days, is_active, image_url)
VALUES
    -- Damascus Building Supplies catalog
    ('50000000-0000-0000-0000-000000000001', 'إسمنت بورتلاندي (درجة 43)', 'cement', 'إسمنت OPC مستورد عالي الجودة — مناسب لجميع الأعمال الإنشائية', 'bag', 950, 10, 3, TRUE, 'https://storage.nammerha.com/catalog/cement_dbs.jpg'),
    ('50000000-0000-0000-0000-000000000001', 'أسلاك نحاسية (2.5مم²)', 'wiring', 'أسلاك كهربائية نحاسية معزولة — معيار سوري', 'meter', 580, 50, 2, TRUE, 'https://storage.nammerha.com/catalog/wiring_dbs.jpg'),
    ('50000000-0000-0000-0000-000000000001', 'باب خشبي مسطح (32 بوصة)', 'doors', 'باب خشبي داخلي — خشب زان طبيعي مع إطار حديدي', 'unit', 11000, 1, 7, TRUE, 'https://storage.nammerha.com/catalog/door_dbs.jpg'),
    ('50000000-0000-0000-0000-000000000001', 'بلاط سيراميك (60×60سم)', 'tiles', 'بلاط أرضيات سيراميك — مصنع سوري، ألوان متعددة', 'm2', 800, 20, 5, TRUE, 'https://storage.nammerha.com/catalog/tiles_dbs.jpg'),
    -- Aleppo Steel Works catalog
    ('50000000-0000-0000-0000-000000000002', 'حديد تسليح TMT (12مم)', 'steel', 'قضبان حديد تسليح معالجة حرارياً — مصنع حلب المتحدة', 'ton', 71000, 1, 5, TRUE, 'https://storage.nammerha.com/catalog/steel_asw.jpg'),
    ('50000000-0000-0000-0000-000000000002', 'حديد تسليح TMT (16مم)', 'steel', 'قضبان حديد تسليح ثقيلة للأعمدة والجسور', 'ton', 73000, 1, 5, TRUE, 'https://storage.nammerha.com/catalog/steel16_asw.jpg'),
    ('50000000-0000-0000-0000-000000000002', 'شبك حديد ملحوم (4مم)', 'steel', 'شبك حديد ملحوم للأسقف والأرضيات', 'sheet', 4500, 10, 3, TRUE, 'https://storage.nammerha.com/catalog/mesh_asw.jpg'),
    ('50000000-0000-0000-0000-000000000002', 'زوايا حديد (L50×50)', 'steel', 'زوايا حديدية للتقوية والإطارات', 'meter', 1200, 20, 4, TRUE, 'https://storage.nammerha.com/catalog/angle_asw.jpg');


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. PURCHASE ORDERS — 2 POs
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO purchase_orders (po_id, po_number, item_id, project_id, supplier_id,
                             amount, currency, status, material_name, quantity, unit, unit_price,
                             supplier_name, supplier_commercial_reg, generated_at, sent_at, acknowledged_at, shipped_at, delivered_at)
VALUES
    -- PO for steel bars (delivered)
    ('80000000-0000-0000-0000-000000000001', 'PO-1001',
     'b0000000-0000-0000-0000-000000000003', 'OCDS-SYR-00001', '50000000-0000-0000-0000-000000000002',
     144000, 'USD', 'delivered', 'حديد تسليح TMT (12مم)', 2, 'ton', 72000,
     'حديد حلب المتحدة', 'CR-SYR-2024-00622',
     '2026-02-26 08:00:00+03', '2026-02-26 08:30:00+03', '2026-02-27 09:00:00+03',
     '2026-03-02 07:00:00+03', '2026-03-05 14:00:00+03'),
    -- PO for cement (shipped — in transit)
    ('80000000-0000-0000-0000-000000000002', 'PO-1002',
     'b0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001', '50000000-0000-0000-0000-000000000001',
     50000, 'USD', 'shipped', 'إسمنت بورتلاندي (درجة 43)', 50, 'bag', 1000,
     'مواد البناء الدمشقية', 'CR-SYR-2024-00451',
     '2026-03-15 08:00:00+03', '2026-03-15 09:00:00+03', '2026-03-16 07:00:00+03',
     '2026-03-18 06:00:00+03', NULL);


-- ═══════════════════════════════════════════════════════════════════════════
-- 10. CONTRACTOR BIDS — 4 bids
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO contractor_bids (bid_id, engineer_id, contractor_id, project_id, proposed_cost, estimated_days,
                             cover_letter, methodology, status, engineer_score_snapshot, submitted_at, responded_at)
VALUES
    -- Hassan's accepted bid on Project 1
    ('90000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
     'OCDS-SYR-00001', 290000, 90,
     'خبرة 15 سنة في ترميم المباني التاريخية. فريق عمل من 12 فنياً معتمداً.',
     'المرحلة 1: تأمين الأساسات (3 أسابيع) → المرحلة 2: الهيكل الإنشائي (4 أسابيع) → المرحلة 3: التشطيبات (5 أسابيع)',
     'accepted', 82.30, '2026-02-12 10:00:00+03', '2026-02-14 14:00:00+03'),
    -- Rami's rejected bid on Project 1
    ('90000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
     'OCDS-SYR-00001', 350000, 120,
     'متخصص في التشطيبات الداخلية والديكور. حاصل على شهادة ISO.',
     'نهج تسلسلي كلاسيكي مع التركيز على جودة التشطيب النهائي.',
     'rejected', 74.80, '2026-02-13 11:00:00+03', '2026-02-14 14:00:00+03'),
    -- Hassan's pending bid on Project 2
    ('90000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
     'OCDS-SYR-00002', 180000, 60,
     'فريق متخصص في ترميم المراكز المجتمعية.',
     'خطة عمل مسرّعة بفضل توفر المواد الأولية.',
     'pending', 82.30, '2026-03-01 09:00:00+03', NULL),
    -- Rami's pending bid on Project 2
    ('90000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
     'OCDS-SYR-00002', 195000, 75,
     'عرض شامل يتضمن التشطيبات الداخلية والخارجية.',
     'المرحلة 1: التقوية الإنشائية → المرحلة 2: التمديدات → المرحلة 3: الطلاء والتشطيب',
     'pending', 74.80, '2026-03-02 10:00:00+03', NULL);


-- ═══════════════════════════════════════════════════════════════════════════
-- 11. TRADE ASSIGNMENTS (Subcontractor Mode)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO trade_assignments (contractor_id, tradesperson_id, project_id, trade_required, scope_description,
                               agreed_rate, rate_type, estimated_days, status, start_date, end_date, responded_at)
VALUES
    -- Abu Ali: tiling job on Project 1 (in progress)
    ('c0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001',
     'tiling', 'تبليط كامل الطابق الأرضي — 120 متر مربع سيراميك 60×60',
     10000, 'daily', 15, 'in_progress', '2026-03-20', '2026-04-05', '2026-03-15 08:00:00+03'),
    -- Mustafa: electrical job on Project 1 (accepted, not started)
    ('c0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'OCDS-SYR-00001',
     'electrical', 'تمديد الشبكة الكهربائية الرئيسية — لوحات توزيع وأسلاك',
     14000, 'daily', 10, 'accepted', '2026-04-10', '2026-04-20', '2026-03-20 09:00:00+03'),
    -- Abu Ali: tiling on Project 2 (pending)
    ('c0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'OCDS-SYR-00002',
     'tiling', 'تبليط صالة الاستقبال — 80 متر مربع',
     10000, 'daily', 10, 'pending', NULL, NULL, NULL);


-- ═══════════════════════════════════════════════════════════════════════════
-- 12. SERVICE REQUESTS (Thumbtack Mode)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO service_requests (homeowner_id, trade_needed, title, description, address_text,
                              urgency, budget_min, budget_max, assigned_tradesperson_id,
                              status, matched_at)
VALUES
    -- Fatima needs a plumber (matched to Mustafa's secondary trade)
    ('a1000000-0000-0000-0000-000000000002', 'plumbing',
     'إصلاح تسريب مياه في المطبخ',
     'يوجد تسريب مياه من أنبوب الصرف تحت المغسلة في المطبخ. المشكلة مستمرة منذ أسبوع.',
     'حي المهاجرين، دمشق', 'urgent', 5000, 15000,
     '70000000-0000-0000-0000-000000000002', 'matched', '2026-03-20 10:00:00+03'),
    -- Ahmad needs an electrician (open, no match yet)
    ('a1000000-0000-0000-0000-000000000001', 'electrical',
     'تركيب لوحة كهربائية جديدة',
     'اللوحة الكهربائية القديمة محروقة ونحتاج تركيب لوحة جديدة مع تمديد أسلاك لثلاث غرف.',
     'حي الجديدة، حلب', 'routine', 20000, 40000,
     NULL, 'open', NULL);


-- ═══════════════════════════════════════════════════════════════════════════
-- 13. NOTIFICATIONS — 12 entries across roles
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO notifications (user_id, type, title, body, data, channel, is_read, read_at, created_at)
VALUES
    -- Donor notifications
    ('d0000000-0000-0000-0000-000000000001', 'donation_received',
     'تم استلام تبرعك!', 'شكراً لدعمك مشروع "ترميم مبنى إطلالة المرفأ" بمبلغ $250.',
     '{"project_id": "OCDS-SYR-00001", "amount": 25000, "item": "إسمنت"}', 'in_app', TRUE, '2026-02-15 14:05:00+03', '2026-02-15 14:01:00+03'),
    ('d0000000-0000-0000-0000-000000000001', 'funds_released',
     'تم تحرير أموال الضمان!', 'تم تحرير $720 لموّرد "حديد حلب المتحدة" بعد التحقق من إثبات التسليم.',
     '{"project_id": "OCDS-SYR-00001", "amount": 72000, "supplier": "حديد حلب المتحدة"}', 'in_app', TRUE, '2026-03-05 16:00:00+03', '2026-03-05 15:35:00+03'),
    ('d0000000-0000-0000-0000-000000000001', 'proof_submitted',
     'إثبات تسليم جديد!', 'تم تقديم إثبات مكاني لتسليم الإسمنت — بانتظار التحقق.',
     '{"project_id": "OCDS-SYR-00001", "proof_id": "f0000000-0000-0000-0000-000000000002"}', 'in_app', FALSE, NULL, '2026-03-18 10:20:00+03'),
    -- Engineer notifications
    ('e0000000-0000-0000-0000-000000000001', 'engineer_assigned',
     'تم تعيينك على مشروع!', 'تم تعيينك كمهندس مشرف على مشروع "ترميم مبنى إطلالة المرفأ".',
     '{"project_id": "OCDS-SYR-00001"}', 'push', TRUE, '2026-02-10 13:00:00+03', '2026-02-10 12:05:00+03'),
    ('e0000000-0000-0000-0000-000000000001', 'po_generated',
     'أمر شراء جديد!', 'تم إنشاء أمر الشراء PO-1001 لحديد التسليح — بانتظار تأكيد المورد.',
     '{"po_number": "PO-1001", "supplier": "حديد حلب المتحدة", "amount": 144000}', 'in_app', TRUE, '2026-02-26 09:00:00+03', '2026-02-26 08:05:00+03'),
    -- Supplier notifications
    ('50000000-0000-0000-0000-000000000002', 'po_generated',
     'أمر شراء وارد!', 'تم استلام أمر شراء PO-1001 بقيمة $1,440 — حديد تسليح TMT. يرجى التأكيد.',
     '{"po_number": "PO-1001", "project_id": "OCDS-SYR-00001", "amount": 144000}', 'push', TRUE, '2026-02-26 09:30:00+03', '2026-02-26 08:35:00+03'),
    ('50000000-0000-0000-0000-000000000001', 'po_generated',
     'أمر شراء وارد!', 'تم استلام أمر شراء PO-1002 بقيمة $500 — إسمنت بورتلاندي. يرجى التأكيد.',
     '{"po_number": "PO-1002", "project_id": "OCDS-SYR-00001", "amount": 50000}', 'push', FALSE, NULL, '2026-03-15 09:05:00+03'),
    -- Contractor notifications
    ('c0000000-0000-0000-0000-000000000001', 'project_published',
     'مشروع جديد متاح للعطاء!', 'مشروع "ترميم مركز المجيدية" منشور ومفتوح للعطاءات.',
     '{"project_id": "OCDS-SYR-00002"}', 'in_app', TRUE, '2026-02-15 10:00:00+03', '2026-02-15 09:05:00+03'),
    ('c0000000-0000-0000-0000-000000000001', 'delivery_confirmed',
     'تأكيد تسليم مواد!', 'تم تأكيد تسليم حديد التسليح في موقع مشروع "إطلالة المرفأ".',
     '{"project_id": "OCDS-SYR-00001", "item": "حديد تسليح TMT"}', 'in_app', FALSE, NULL, '2026-03-05 15:00:00+03'),
    -- Homeowner notifications
    ('a1000000-0000-0000-0000-000000000001', 'project_published',
     'تم نشر مشروعك!', 'مشروع "ترميم مبنى إطلالة المرفأ" منشور الآن ويمكن للمتبرعين المساهمة فيه.',
     '{"project_id": "OCDS-SYR-00001"}', 'push', TRUE, '2026-02-10 12:10:00+03', '2026-02-10 12:05:00+03'),
    ('a1000000-0000-0000-0000-000000000001', 'donation_received',
     'تبرع جديد لمشروعك!', 'Maria Schmidt تبرعت بمبلغ $250 لمادة الإسمنت في مشروعك.',
     '{"project_id": "OCDS-SYR-00001", "donor": "Maria Schmidt", "amount": 25000}', 'in_app', FALSE, NULL, '2026-02-15 14:02:00+03'),
    -- Tradesperson notification
    ('70000000-0000-0000-0000-000000000001', 'engineer_assigned',
     'مهمة جديدة!', 'تم تعيينك لأعمال البلاط في مشروع "إطلالة المرفأ" — 120 متر مربع.',
     '{"project_id": "OCDS-SYR-00001", "trade": "tiling", "scope": "120 م²"}', 'push', TRUE, '2026-03-15 08:30:00+03', '2026-03-15 08:05:00+03');


-- ═══════════════════════════════════════════════════════════════════════════
-- 14. REVIEWS — 6 reviews
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO reviews (review_id, reviewer_id, reviewable_type, reviewable_id, project_id,
                     overall_rating, title, body, is_verified_interaction, status, created_at)
VALUES
    -- Donor reviews project transparency
    ('aa000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
     'project', 'a1000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001',
     5, 'شفافية مذهلة!', 'تجربة رائعة — أستطيع رؤية بالضبط أين ذهب تبرعي مع صور مثبتة بالـ GPS. نموذج يُحتذى في الشفافية.',
     TRUE, 'published', '2026-03-10 11:00:00+03'),
    -- Homeowner reviews contractor
    ('aa000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
     'contractor_profiles', 'c0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001',
     4, 'عمل ممتاز مع بعض التأخير', 'حسان وفريقه عملوا بكفاءة عالية — جودة العمل ممتازة لكن كان هناك تأخير أسبوع بسبب نقص المواد.',
     TRUE, 'published', '2026-03-15 14:00:00+03'),
    -- Homeowner reviews engineer
    ('aa000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
     'engineer_profiles', 'e0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001',
     5, 'مهندس محترف جداً', 'م. خالد أظهر احترافية عالية في التقييم والإشراف. تقاريره مفصلة ودقيقة.',
     TRUE, 'published', '2026-03-15 14:30:00+03'),
    -- Contractor reviews supplier
    ('aa000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001',
     'supplier_profiles', '50000000-0000-0000-0000-000000000002', 'OCDS-SYR-00001',
     4, 'توريد جيد مع تأخير بسيط', 'جودة الحديد ممتازة ومطابقة للمواصفات. التسليم تأخر يوم واحد عن الموعد المتفق عليه.',
     TRUE, 'published', '2026-03-08 10:00:00+03'),
    -- Homeowner reviews tradesperson
    ('aa000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001',
     'tradesperson_profiles', '70000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001',
     5, 'بلاط مثالي!', 'أبو علي معلم بلاط من الطراز الأول. العمل نظيف ودقيق والأسعار معقولة جداً.',
     TRUE, 'published', '2026-04-01 16:00:00+03'),
    -- Donor reviews project 2
    ('aa000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000002',
     'project', 'a1000000-0000-0000-0000-000000000001', 'OCDS-SYR-00002',
     4, 'مشروع واعد', 'بداية ممتازة والتقارير شفافة. أتطلع لرؤية مزيد من التحديثات المصورة.',
     FALSE, 'published', '2026-03-20 09:00:00+03');


-- ═══════════════════════════════════════════════════════════════════════════
-- 15. IMPACT MESSAGES — 8 messages (donor lifecycle)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO impact_messages (donor_id, project_id, event_type, title_en, title_ar, body_en, body_ar, metadata, read_at, created_at)
VALUES
    -- Maria's donation journey
    ('d0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001', 'donation_received',
     'Your donation was received!', 'تم استلام تبرعك!',
     'Thank you! Your $250 donation for cement is now held in secure escrow.', 'شكراً! تبرعك بمبلغ $250 للإسمنت محفوظ الآن في حساب الضمان.',
     '{"amount": 25000, "material": "OPC Cement", "funded_pct": 80}', '2026-02-15 15:00:00+03', '2026-02-15 14:01:00+03'),
    ('d0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001', 'contractor_assigned',
     'A contractor has been assigned!', 'تم تعيين مقاول!',
     'Hassan Al-Debs (82.3 score) has been assigned to execute your project.', 'حسان الدبس (تقييم 82.3) تم تعيينه لتنفيذ مشروعك.',
     '{"contractor_name": "حسان الدبس", "score": 82.3}', '2026-02-14 16:00:00+03', '2026-02-14 14:05:00+03'),
    ('d0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001', 'construction_started',
     'Construction has begun!', 'بدأت أعمال البناء!',
     'Foundation reinforcement work has started at the project site in Aleppo.', 'بدأت أعمال تعزيز الأساسات في موقع المشروع بحلب.',
     '{"milestone": "Foundation & Structural Assessment", "phase": 1}', '2026-02-10 20:00:00+03', '2026-02-10 12:10:00+03'),
    ('d0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001', 'photo_proof_added',
     'GPS-verified photo proof added!', 'تم إضافة إثبات مصور بالـ GPS!',
     'Engineer Khalid has uploaded a GPS-verified photo of the steel delivery at the site.', 'م. خالد رفع صورة مثبتة بالـ GPS لتسليم الحديد في الموقع.',
     '{"proof_id": "f0000000-0000-0000-0000-000000000001", "material": "TMT Steel Bars"}', '2026-03-05 17:00:00+03', '2026-03-05 15:25:00+03'),
    ('d0000000-0000-0000-0000-000000000001', 'OCDS-SYR-00001', 'escrow_released',
     'Escrow funds released!', 'تم تحرير أموال الضمان!',
     'Your $720 for steel bars has been released to Aleppo Steel Works after proof verification.', 'تم تحرير $720 لحديد التسليح لصالح "حديد حلب المتحدة" بعد التحقق من الإثبات.',
     '{"amount": 72000, "supplier": "حديد حلب المتحدة", "material": "TMT Steel Bars"}', '2026-03-05 18:00:00+03', '2026-03-05 15:50:00+03'),
    -- Omar's donation journey
    ('d0000000-0000-0000-0000-000000000002', 'OCDS-SYR-00001', 'donation_received',
     'Your donation was received!', 'تم استلام تبرعك!',
     'Thank you Omar! Your $150 for cement is now in secure escrow.', 'شكراً عمر! تبرعك بمبلغ $150 للإسمنت محفوظ في حساب الضمان.',
     '{"amount": 15000, "material": "OPC Cement"}', '2026-02-18 12:00:00+03', '2026-02-18 10:35:00+03'),
    ('d0000000-0000-0000-0000-000000000002', 'OCDS-SYR-00001', 'escrow_released',
     'Escrow funds released!', 'تم تحرير أموال الضمان!',
     'Your $720 for steel bars has been released after GPS-verified delivery proof.', 'تم تحرير $720 لحديد التسليح بعد التحقق من إثبات التسليم بالـ GPS.',
     '{"amount": 72000, "supplier": "حديد حلب المتحدة"}', NULL, '2026-03-05 15:55:00+03'),
    ('d0000000-0000-0000-0000-000000000002', 'OCDS-SYR-00002', 'donation_received',
     'Your donation was received!', 'تم استلام تبرعك!',
     'Thank you! Your $210 for sand is held in secure escrow for the Al-Majidiya project.', 'شكراً! تبرعك بمبلغ $210 للرمل محفوظ في ضمان مشروع المجيدية.',
     '{"amount": 21000, "material": "Sand", "project": "Al-Majidiya"}', NULL, '2026-03-12 14:05:00+03');


-- ═══════════════════════════════════════════════════════════════════════════
-- 16. PRICING ORACLE ENTRIES
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO pricing_oracle_entries (material_category, material_name, material_code, unit, base_price, current_price, price_change_pct,
                                    region, source, volatility_index, confidence_score)
VALUES
    ('steel', 'حديد تسليح TMT (12مم)', 'STL-TMT-12', 'ton', 83000, 85000, 2.40, 'Damascus', 'LME Real-time API', 8.40, 98.20),
    ('cement', 'إسمنت بورتلاندي (درجة 43)', 'CEM-OPC-43', 'bag', 4950, 5000, 1.10, 'Damascus', 'Local Mill Invoices', 2.10, 97.50),
    ('lumber', 'خشب بناء', 'LBR-CONST', 'mbf', 42500, 42290, -0.50, 'Aleppo', 'GASTAT', 3.20, 96.80),
    ('wiring', 'أسلاك نحاسية (2.5مم²)', 'WIR-CU-25', 'meter', 580, 600, 3.45, 'Damascus', 'Local Mill Invoices', 4.10, 95.30),
    ('doors', 'باب خشبي مسطح (32 بوصة)', 'DOR-FLUSH-32', 'unit', 11200, 11500, 2.68, 'Homs', 'GASTAT', 1.80, 94.60),
    ('tiles', 'بلاط سيراميك (60×60سم)', 'TIL-CER-60', 'm2', 780, 850, 8.97, 'Damascus', 'Local Factory Quotes', 5.50, 93.10);


-- ═══════════════════════════════════════════════════════════════════════════
-- 17. EPA ADJUSTMENTS (FIDIC 13.8)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO epa_adjustments (project_id, item_id, original_cost, adjustment_percentage, adjusted_cost,
                             fidic_formula_params, status, contract_reference)
VALUES ('OCDS-SYR-00001', 'b0000000-0000-0000-0000-000000000003', 12500000, 4.20, 13025000,
        '{"a": 0.15, "b": 0.30, "c": 0.25, "d": 0.30, "Ln": 850, "Lo": 800, "En": 110, "Eo": 100, "Mn": 920, "Mo": 900, "formula": "Pn = a + b(Ln/Lo) + c(En/Eo) + d(Mn/Mo)"}',
        'pending', '#CT-8892');


-- ═══════════════════════════════════════════════════════════════════════════
-- 18. MULTI-ROLE PROFILES (028_multi_role_schema)
-- ═══════════════════════════════════════════════════════════════════════════

-- Donor profiles
INSERT INTO donor_profiles (user_id, total_donated_amount, donation_count, preferred_causes, preferred_currency)
VALUES
    ('d0000000-0000-0000-0000-000000000001', 152200, 4, ARRAY['housing', 'infrastructure'], 'USD'),
    ('d0000000-0000-0000-0000-000000000002', 185500, 4, ARRAY['housing', 'education'], 'USD')
ON CONFLICT (user_id) DO UPDATE SET total_donated_amount = EXCLUDED.total_donated_amount, donation_count = EXCLUDED.donation_count;

-- Contractor profiles
INSERT INTO contractor_profiles (user_id, company_name, trade_category, commercial_license_number,
                                  years_experience, max_concurrent_projects, service_areas, verification_status, verified_at, verified_by)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'شركة الدبس للمقاولات', 'structural', 'CR-SYR-2025-00103',
     15, 5, ARRAY['حلب', 'إدلب', 'حماة'], 'verified', '2026-02-01 08:00:00+03', 'a0000000-0000-0000-0000-000000000001'),
    ('c0000000-0000-0000-0000-000000000002', 'ورشة النعسان للتشطيبات', 'finishing', 'CR-SYR-2025-00207',
     10, 3, ARRAY['دمشق', 'ريف دمشق'], 'verified', '2026-02-05 10:00:00+03', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;

-- Engineer profiles
INSERT INTO engineer_profiles (user_id, engineering_license_number, specialization, university,
                                graduation_year, years_experience, verification_status, verified_at, verified_by)
VALUES
    ('e0000000-0000-0000-0000-000000000001', 'ENG-SYR-2024-0891', 'structural', 'جامعة حلب — كلية الهندسة المدنية',
     2014, 12, 'verified', '2026-01-15 10:00:00+03', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000002', 'ENG-SYR-2024-1102', 'electrical', 'جامعة دمشق — كلية الهندسة الكهربائية',
     2016, 10, 'verified', '2026-01-20 09:00:00+03', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;

-- Supplier profiles
INSERT INTO supplier_profiles (user_id, company_name, commercial_register_number, warehouse_address,
                                supply_categories, delivery_radius_km, verification_status, verified_at, verified_by)
VALUES
    ('50000000-0000-0000-0000-000000000001', 'مواد البناء الدمشقية', 'CR-SYR-2024-00451',
     'المنطقة الصناعية، عدرا، ريف دمشق', ARRAY['cement', 'wiring', 'doors', 'tiles'], 150,
     'verified', '2026-01-25 08:00:00+03', 'a0000000-0000-0000-0000-000000000001'),
    ('50000000-0000-0000-0000-000000000002', 'حديد حلب المتحدة', 'CR-SYR-2024-00622',
     'الشيخ نجار، المنطقة الصناعية، حلب', ARRAY['steel'], 200,
     'verified', '2026-01-28 09:00:00+03', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;

-- Tradesperson profiles
INSERT INTO tradesperson_profiles (user_id, trade_type, guild_membership_id, years_experience,
                                    daily_rate, tools_owned, availability_status, verification_status, verified_at, verified_by)
VALUES
    ('70000000-0000-0000-0000-000000000001', 'tiling', 'GUILD-TL-7801', 20, 10000,
     ARRAY['قاطعة بلاط كهربائية', 'مسطرة ليزر', 'خلاطة غراء'], 'available',
     'verified', '2026-02-10 08:00:00+03', 'a0000000-0000-0000-0000-000000000001'),
    ('70000000-0000-0000-0000-000000000002', 'electrical', 'GUILD-EL-9102', 14, 14000,
     ARRAY['جهاز فحص كهربائي', 'مثقاب كهربائي', 'أدوات قطع أسلاك'], 'busy',
     'verified', '2026-02-12 09:00:00+03', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;

-- Homeowner profiles
INSERT INTO homeowner_profiles (user_id, property_address, property_type, family_size, displacement_status,
                                 verification_status, verified_at, verified_by)
VALUES
    ('a1000000-0000-0000-0000-000000000001', 'حي الجديدة، حلب', 'residential', 5, 'returned',
     'verified', '2026-01-20 14:30:00+03', 'a0000000-0000-0000-0000-000000000001'),
    ('a1000000-0000-0000-0000-000000000002', 'حي المهاجرين، دمشق', 'residential', 3, 'in_place',
     'verified', '2026-02-01 11:00:00+03', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- 19. AUDIT TRAIL
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO audit_trail (entity_type, entity_id, action, actor_id, new_values)
VALUES
    ('project', 'OCDS-SYR-00001', 'created', 'a1000000-0000-0000-0000-000000000001',
     '{"title": "ترميم مبنى إطلالة المرفأ", "damage_type": "structural"}'),
    ('project', 'OCDS-SYR-00001', 'status_changed', 'e0000000-0000-0000-0000-000000000001',
     '{"old_status": "draft", "new_status": "in_progress"}'),
    ('escrow_ledger', 'auto', 'fund_released', 'a0000000-0000-0000-0000-000000000002',
     '{"item": "حديد تسليح TMT", "amount": 144000, "proof_id": "f0000000-0000-0000-0000-000000000001"}'),
    ('contractor_bids', '90000000-0000-0000-0000-000000000001', 'bid_accepted', 'a1000000-0000-0000-0000-000000000001',
     '{"contractor": "حسان الدبس", "proposed_cost": 290000, "project_id": "OCDS-SYR-00001"}'),
    ('purchase_orders', 'PO-1001', 'po_delivered', '50000000-0000-0000-0000-000000000002',
     '{"material": "حديد تسليح TMT", "quantity": "2 tons", "project_id": "OCDS-SYR-00001"}');


COMMIT;

-- ============================================================================
-- SEED COMPLETE — Platinum Edition
-- ============================================================================
-- Users: 15 (admin, auditor, 2 engineers, 2 homeowners, 2 donors,
--             2 suppliers, 2 contractors, 2 tradespersons, 1 pending)
-- Projects: 4 (in_progress, published×2, draft)
-- BOQ Items: 8 (across 2 projects)
-- Escrow Entries: 8 (locked×6, released×2)
-- Spatial Proofs: 2 (verified×1, submitted×1)
-- Purchase Orders: 2 (delivered×1, shipped×1)
-- Supplier Catalog: 8 (across 2 suppliers)
-- Contractor Bids: 4 (accepted×1, rejected×1, pending×2)
-- Trade Assignments: 3 (in_progress×1, accepted×1, pending×1)
-- Service Requests: 2 (matched×1, open×1)
-- Notifications: 12 (all roles covered)
-- Reviews: 6 (project×2, contractor×1, engineer×1, supplier×1, tradesperson×1)
-- Impact Messages: 8 (full donor lifecycle)
-- Oracle Entries: 6 | EPA: 1 | Milestones: 5
-- Compliance: 7 | Profiles (028): All 14 users | Audit Trail: 5
-- ============================================================================