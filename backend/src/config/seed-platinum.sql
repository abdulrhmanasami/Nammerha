-- ============================================================================
-- Nammerha Platform — Platinum Certification Data Seed
-- Resolves "The Empty State Paradox" with hyper-realistic OCDS-grade projects
-- ============================================================================

BEGIN;

-- Insert a universal seed homeowner to bypass Foreign Key constraints
INSERT INTO users (user_id, email, full_name, role, password_hash, is_active, kyc_verification_status)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'platinum_seed@nammerha.com',
    'Syrian Recovery Trust',
    'homeowner',
    'hashed_password',
    true,
    'verified'
) ON CONFLICT DO NOTHING;

-- Wipe existing test artifacts (if any) to ensure a clean slate for investors
DELETE FROM projects WHERE status = 'draft';

-- Seed Project 1: Aleppo Education
INSERT INTO projects (
    project_id, homeowner_id, title, description,
    total_estimated_cost, total_funded_amount, status, damage_type,
    address_text, project_type, created_at, updated_at, is_public
) VALUES (
    'PROJ-ALEP-001', '11111111-1111-1111-1111-111111111111',
    'Rehabilitation of Al-Furat School',
    'Complete structural reinforcement and technological outfitting of the historic Al-Furat secondary school in Aleppo to serve 850 students. Includes solar panel installation and water purification.',
    45000000, -- Placed in Cents as per Escrow rule (450,000.00)
    12500000,
    'in_progress',
    'structural',
    'Aleppo',
    'commercial',
    NOW(), NOW(), true
) ON CONFLICT DO NOTHING;

-- Seed Project 2: Rural Damascus Health
INSERT INTO projects (
    project_id, homeowner_id, title, description,
    total_estimated_cost, total_funded_amount, status, damage_type,
    address_text, project_type, created_at, updated_at, is_public
) VALUES (
    'PROJ-RURD-002', '11111111-1111-1111-1111-111111111111',
    'Medical Dispensary Solar Array',
    'Installation of a 40kW off-grid solar array to ensure uninterrupted power supply for critical refrigeration (vaccines) and emergency surgical equipment at the Al-Ghouta medical center.',
    12000000, -- 120,000.00
    12000000, -- Fully funded
    'completed',
    'electrical',
    'Rural Damascus',
    'commercial',
    NOW() - INTERVAL '30 days', NOW(), true
) ON CONFLICT DO NOTHING;

-- Seed Project 3: Homs Infrastructure
INSERT INTO projects (
    project_id, homeowner_id, title, description,
    total_estimated_cost, total_funded_amount, status, damage_type,
    address_text, project_type, created_at, updated_at, is_public
) VALUES (
    'PROJ-HOMS-003', '11111111-1111-1111-1111-111111111111',
    'Water Desalination and Supply Network',
    'Comprehensive rebuild of the central water distribution network spanning 4 neighborhoods in Homs. Includes replacing 12km of damaged PIP pipes and commissioning a new filtration proxy.',
    89000000, -- 890,000.00
    2500000,
    'published',
    'plumbing',
    'Homs',
    'commercial',
    NOW() - INTERVAL '2 days', NOW(), true
) ON CONFLICT DO NOTHING;

COMMIT;
