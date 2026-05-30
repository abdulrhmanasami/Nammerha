-- SAFETY: Prevent seed execution in production
DO $$ BEGIN 
    IF current_setting('app.environment', true) = 'production' THEN 
        RAISE EXCEPTION 'FATAL: Seeds cannot run in production environment'; 
    END IF; 
END $$;

-- Nammerha Demo Seed: Users
BEGIN;

-- bcrypt(12): $2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua

-- ═══ HOMEOWNERS ═══
INSERT INTO users (user_id, email, full_name, role, password_hash, is_active, is_email_verified, kyc_verification_status, phone, bio, gps_last_known)
VALUES
('d0000001-0000-0000-0000-000000000001','homeowner@demo.nammerha.com','أحمد الحلبي','homeowner','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963912345001','صاحب منزل في حي صلاح الدين، حلب. تضرر المنزل بشكل جزئي.',ST_SetSRID(ST_MakePoint(37.1343,36.2021),4326)),
('d0000001-0000-0000-0000-000000000002','fatima.dm@demo.nammerha.com','فاطمة الدمشقية','homeowner','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963912345002','أم لثلاثة أطفال، منزلنا في جوبر تضرر من القصف.',ST_SetSRID(ST_MakePoint(36.3465,33.5238),4326)),
('d0000001-0000-0000-0000-000000000003','omar.homs@demo.nammerha.com','عمر الحمصي','homeowner','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963912345003','صاحب بناء سكني في حي الوعر.',ST_SetSRID(ST_MakePoint(36.7137,34.7324),4326)),
('d0000001-0000-0000-0000-000000000004','layla.raqqa@demo.nammerha.com','ليلى الرقاوية','homeowner','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963912345004','معلمة متقاعدة، منزلي في الرقة بحاجة لترميم.',ST_SetSRID(ST_MakePoint(39.0068,35.9528),4326)),
('d0000001-0000-0000-0000-000000000005','khaled.deir@demo.nammerha.com','خالد الديري','homeowner','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963912345005','تاجر في دير الزور، المحل والمنزل تضررا.',ST_SetSRID(ST_MakePoint(40.1408,35.3359),4326)),
('d0000001-0000-0000-0000-000000000006','nour.daraa@demo.nammerha.com','نور الدرعاوي','homeowner','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963912345006','مزارع من درعا.',ST_SetSRID(ST_MakePoint(36.1050,32.6265),4326)),
('d0000001-0000-0000-0000-000000000007','hana.idlib@demo.nammerha.com','هناء الإدلبية','homeowner','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963912345007','ممرضة، بيتنا في معرة النعمان.',ST_SetSRID(ST_MakePoint(36.6347,35.9306),4326)),
('d0000001-0000-0000-0000-000000000008','sami.hama@demo.nammerha.com','سامي الحموي','homeowner','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963912345008','حرفي من حماة، ورشتي تحتاج ترميم.',ST_SetSRID(ST_MakePoint(36.7575,35.1318),4326))
ON CONFLICT (user_id) DO NOTHING;

-- ═══ DONORS ═══
INSERT INTO users (user_id, email, full_name, role, password_hash, is_active, is_email_verified, kyc_verification_status, phone, bio)
VALUES
('d0000002-0000-0000-0000-000000000001','donor@demo.nammerha.com','مؤسسة الأمل للإعمار','donor','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+971501234001','مؤسسة خيرية مقرها دبي متخصصة في إعادة إعمار سوريا.'),
('d0000002-0000-0000-0000-000000000002','return.fund@demo.nammerha.com','صندوق العودة السوري','donor','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+491701234002','صندوق ألماني لدعم عودة اللاجئين السوريين.'),
('d0000002-0000-0000-0000-000000000003','yusuf.donor@demo.nammerha.com','يوسف المهاجر','donor','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+12125551003','مغترب سوري في نيويورك.'),
('d0000002-0000-0000-0000-000000000004','sarah.uk@demo.nammerha.com','سارة الخطيب','donor','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+447911234004','ناشطة إنسانية في لندن.'),
('d0000002-0000-0000-0000-000000000005','rebuild.ngo@demo.nammerha.com','منظمة إعادة البناء','donor','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+41221234005','منظمة دولية مقرها جنيف.')
ON CONFLICT (user_id) DO NOTHING;

-- ═══ ENGINEERS ═══
INSERT INTO users (user_id, email, full_name, role, password_hash, is_active, is_email_verified, kyc_verification_status, phone, bio, specialty, engineering_license_number, completed_projects_count, dynamic_score)
VALUES
('d0000003-0000-0000-0000-000000000001','engineer@demo.nammerha.com','م. كريم البيطار','engineer','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963933456001','مهندس إنشائي خبرة 15 سنة في ترميم الأبنية المتضررة.','structural','ENG-SY-2024-0451',12,87.50),
('d0000003-0000-0000-0000-000000000002','sara.eng@demo.nammerha.com','م. سارة الأحمد','engineer','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963933456002','مهندسة معمارية متخصصة في ترميم المباني التراثية.','structural','ENG-SY-2024-0782',8,82.30),
('d0000003-0000-0000-0000-000000000003','hassan.eng@demo.nammerha.com','م. حسن القاسم','engineer','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963933456003','مهندس مدني متخصص في البنية التحتية.','structural','ENG-SY-2024-1103',5,75.00)
ON CONFLICT (user_id) DO NOTHING;

-- ═══ CONTRACTORS ═══
INSERT INTO users (user_id, email, full_name, role, password_hash, is_active, is_email_verified, kyc_verification_status, phone, bio, commercial_register_number, completed_projects_count, dynamic_score, bid_win_rate)
VALUES
('d0000004-0000-0000-0000-000000000001','contractor@demo.nammerha.com','شركة البناء السورية','contractor','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963112345001','شركة مقاولات عامة مرخصة، خبرة 20 سنة.','CR-DM-2024-5501',18,91.20,0.72),
('d0000004-0000-0000-0000-000000000002','alamar.co@demo.nammerha.com','مؤسسة الإعمار للمقاولات','contractor','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963112345002','متخصصون في ترميم الأبنية السكنية.','CR-AL-2024-3302',9,78.50,0.65),
('d0000004-0000-0000-0000-000000000003','binaa.plus@demo.nammerha.com','بناء بلس','contractor','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963112345003','مقاولات وتشطيبات.','CR-HM-2024-7703',4,70.00,0.55)
ON CONFLICT (user_id) DO NOTHING;

-- ═══ SUPPLIERS ═══
INSERT INTO users (user_id, email, full_name, role, password_hash, is_active, is_email_verified, kyc_verification_status, phone, bio, commercial_register_number)
VALUES
('d0000005-0000-0000-0000-000000000001','supplier@demo.nammerha.com','مستودعات الفرات','supplier','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963112345010','أكبر مورد مواد بناء في شمال سوريا.','CR-AL-2024-9901'),
('d0000005-0000-0000-0000-000000000002','sham.materials@demo.nammerha.com','مواد البناء الشام','supplier','$2b$12$KZ2Zg3p9f0ppH77cW6ElJu3Mc6OjKQkUmiIW2gfTAmRe.KgXD.Lua',true,true,'verified','+963112345011','موردون معتمدون للإسمنت والحديد.','CR-DM-2024-8802')
ON CONFLICT (user_id) DO NOTHING;

-- ═══ USER ROLES ═══
INSERT INTO user_roles (user_id, role_id, status, is_primary) VALUES
('d0000001-0000-0000-0000-000000000001',2,'active',true),
('d0000001-0000-0000-0000-000000000002',2,'active',true),
('d0000001-0000-0000-0000-000000000003',2,'active',true),
('d0000001-0000-0000-0000-000000000004',2,'active',true),
('d0000001-0000-0000-0000-000000000005',2,'active',true),
('d0000001-0000-0000-0000-000000000006',2,'active',true),
('d0000001-0000-0000-0000-000000000007',2,'active',true),
('d0000001-0000-0000-0000-000000000008',2,'active',true),
('d0000002-0000-0000-0000-000000000001',1,'active',true),
('d0000002-0000-0000-0000-000000000002',1,'active',true),
('d0000002-0000-0000-0000-000000000003',1,'active',true),
('d0000002-0000-0000-0000-000000000004',1,'active',true),
('d0000002-0000-0000-0000-000000000005',1,'active',true),
('d0000003-0000-0000-0000-000000000001',3,'active',true),
('d0000003-0000-0000-0000-000000000002',3,'active',true),
('d0000003-0000-0000-0000-000000000003',3,'active',true),
('d0000004-0000-0000-0000-000000000001',4,'active',true),
('d0000004-0000-0000-0000-000000000002',4,'active',true),
('d0000004-0000-0000-0000-000000000003',4,'active',true),
('d0000005-0000-0000-0000-000000000001',6,'active',true),
('d0000005-0000-0000-0000-000000000002',6,'active',true)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ═══ ROLE PROFILES ═══
INSERT INTO homeowner_profiles (user_id) VALUES
('d0000001-0000-0000-0000-000000000001'),('d0000001-0000-0000-0000-000000000002'),
('d0000001-0000-0000-0000-000000000003'),('d0000001-0000-0000-0000-000000000004'),
('d0000001-0000-0000-0000-000000000005'),('d0000001-0000-0000-0000-000000000006'),
('d0000001-0000-0000-0000-000000000007'),('d0000001-0000-0000-0000-000000000008')
ON CONFLICT DO NOTHING;

INSERT INTO donor_profiles (user_id, total_donated_amount, donation_count, preferred_causes, preferred_currency) VALUES
('d0000002-0000-0000-0000-000000000001', 2850000, 12, '{education,housing}', 'USD'),
('d0000002-0000-0000-0000-000000000002', 1500000, 8, '{housing,infrastructure}', 'EUR'),
('d0000002-0000-0000-0000-000000000003', 450000, 5, '{housing}', 'USD'),
('d0000002-0000-0000-0000-000000000004', 680000, 7, '{healthcare,education}', 'GBP'),
('d0000002-0000-0000-0000-000000000005', 5200000, 15, '{infrastructure,housing,healthcare}', 'USD')
ON CONFLICT DO NOTHING;

INSERT INTO engineer_profiles (user_id) VALUES
('d0000003-0000-0000-0000-000000000001'),('d0000003-0000-0000-0000-000000000002'),('d0000003-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO contractor_profiles (user_id) VALUES
('d0000004-0000-0000-0000-000000000001'),('d0000004-0000-0000-0000-000000000002'),('d0000004-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO supplier_profiles (user_id) VALUES
('d0000005-0000-0000-0000-000000000001'),('d0000005-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

COMMIT;
