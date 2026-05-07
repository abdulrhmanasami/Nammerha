-- ============================================================================
-- Nammerha Platform — Platinum Certification Data Seed
-- LOCALE-001: All seed data in Arabic — primary audience is Syrian.
-- Resolves "The Empty State Paradox" with hyper-realistic OCDS-grade projects
-- ============================================================================

BEGIN;

-- Insert a universal seed homeowner to bypass Foreign Key constraints
INSERT INTO users (user_id, email, full_name, role, password_hash, is_active, kyc_verification_status)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'platinum_seed@nammerha.com',
    'صندوق إعادة الإعمار السوري',
    'homeowner',
    'hashed_password',
    true,
    'verified'
) ON CONFLICT DO NOTHING;

-- Wipe existing test artifacts (if any) to ensure a clean slate for investors
DELETE FROM projects WHERE status = 'draft';

-- Seed Project 1: تعليم — حلب
INSERT INTO projects (
    project_id, homeowner_id, title, description,
    total_estimated_cost, total_funded_amount, status, damage_type,
    address_text, project_type, created_at, updated_at, is_public
) VALUES (
    'PROJ-ALEP-001', '11111111-1111-1111-1111-111111111111',
    'إعادة تأهيل مدرسة الفرات',
    'تعزيز هيكلي كامل وتجهيز تقني لمدرسة الفرات الثانوية التاريخية في حلب لخدمة ٨٥٠ طالباً. يشمل المشروع تركيب ألواح طاقة شمسية ومنظومة تنقية مياه.',
    45000000, -- بالقروش حسب قاعدة الضمان (٤٥٠,٠٠٠.٠٠)
    12500000,
    'in_progress',
    'structural',
    'حلب',
    'commercial',
    NOW(), NOW(), true
) ON CONFLICT DO NOTHING;

-- Seed Project 2: صحة — ريف دمشق
INSERT INTO projects (
    project_id, homeowner_id, title, description,
    total_estimated_cost, total_funded_amount, status, damage_type,
    address_text, project_type, created_at, updated_at, is_public
) VALUES (
    'PROJ-RURD-002', '11111111-1111-1111-1111-111111111111',
    'منظومة الطاقة الشمسية للمستوصف الطبي',
    'تركيب منظومة طاقة شمسية بقدرة ٤٠ كيلوواط لضمان إمداد كهربائي متواصل لتبريد اللقاحات ومعدات العمليات الجراحية الطارئة في مركز الغوطة الطبي.',
    12000000, -- ١٢٠,٠٠٠.٠٠
    12000000, -- مموّل بالكامل
    'completed',
    'electrical',
    'ريف دمشق',
    'commercial',
    NOW() - INTERVAL '30 days', NOW(), true
) ON CONFLICT DO NOTHING;

-- Seed Project 3: بنية تحتية — حمص
INSERT INTO projects (
    project_id, homeowner_id, title, description,
    total_estimated_cost, total_funded_amount, status, damage_type,
    address_text, project_type, created_at, updated_at, is_public
) VALUES (
    'PROJ-HOMS-003', '11111111-1111-1111-1111-111111111111',
    'شبكة تحلية المياه والتوزيع',
    'إعادة بناء شاملة لشبكة توزيع المياه المركزية في ٤ أحياء بمدينة حمص. يشمل استبدال ١٢ كم من أنابيب PVC المتضررة وتشغيل محطة تنقية جديدة.',
    89000000, -- ٨٩٠,٠٠٠.٠٠
    2500000,
    'published',
    'plumbing',
    'حمص',
    'commercial',
    NOW() - INTERVAL '2 days', NOW(), true
) ON CONFLICT DO NOTHING;

COMMIT;
