-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 007: Reality Capture 360 + Floor Plans
-- Phase 3: Spatial Technology (PlanRadar 360 / Houzz Pro LIDAR patterns)
-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTE: Heavy media files (360 images 20-50MB, point clouds 100MB+) are stored
-- on disk/S3, NOT in PostgreSQL. This schema stores METADATA + FILE URLS only.
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FLOOR PLANS — 2D engineering drawings uploaded per project
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE floor_plans (
    plan_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(user_id),
    -- Content
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_url TEXT NOT NULL,
    -- Path to 2D plan image/PDF on disk/S3
    file_type VARCHAR(20) NOT NULL DEFAULT 'image',
    -- 'image', 'pdf', 'dwg'
    version INT NOT NULL DEFAULT 1,
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE floor_plans IS 'Engineering floor plans (2D) uploaded per project. Captures are GPS-linked to these plans by project_id.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REALITY CAPTURES — 360° images + point cloud file metadata
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE capture_type AS ENUM (
    'photo_360',
    'video_360',
    'point_cloud',
    'photo_standard'
);
CREATE TYPE construction_phase AS ENUM (
    'demolition',
    -- هدم
    'foundation',
    -- أساسات
    'structural',
    -- هيكلي
    'plumbing_pre_concrete',
    -- سباكة قبل الصب
    'electrical_pre_concrete',
    -- كهرباء قبل الصب
    'concrete_pour',
    -- صب إسمنت
    'masonry',
    -- بناء جدران
    'plastering',
    -- تلبيس
    'finishing',
    -- إكساء
    'final_inspection' -- تفتيش نهائي
);
CREATE TABLE reality_captures (
    capture_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    engineer_id UUID NOT NULL REFERENCES users(user_id),
    floor_plan_id UUID REFERENCES floor_plans(plan_id),
    -- Capture metadata
    capture_type capture_type NOT NULL DEFAULT 'photo_360',
    construction_phase construction_phase NOT NULL,
    title VARCHAR(255),
    description TEXT,
    -- File reference (stored on disk/S3, NOT in DB)
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    file_size_bytes BIGINT,
    -- Camera metadata
    camera_model VARCHAR(100),
    -- e.g. 'Insta360 X4'
    horizontal_fov DECIMAL(5, 2),
    -- degrees (360 for panoramic)
    heading DECIMAL(5, 2),
    -- compass heading 0-360
    pitch DECIMAL(5, 2),
    -- vertical angle
    -- GPS (auto-linked to project via PostGIS)
    gps_coordinates GEOGRAPHY(POINT, 4326),
    gps_accuracy_meters DECIMAL(8, 2),
    altitude_meters DECIMAL(8, 2),
    -- Timestamps
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Verification
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_by UUID REFERENCES users(user_id),
    verified_at TIMESTAMPTZ,
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE reality_captures IS 'Reality Capture metadata (PlanRadar 360 pattern). Stores file URLs — actual media on disk/S3. construction_phase enables Hidden Works Reveal Mode.';
COMMENT ON COLUMN reality_captures.construction_phase IS 'Critical for Hidden Works: captures tagged plumbing_pre_concrete or electrical_pre_concrete become legal evidence after concrete pour.';
COMMENT ON COLUMN reality_captures.file_url IS 'Absolute path or S3 URL to the media file. NOT stored in PostgreSQL.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CAPTURE ANNOTATIONS — Auditor snagging notes on captures
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE annotation_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE annotation_status AS ENUM ('open', 'resolved', 'dismissed');
CREATE TABLE capture_annotations (
    annotation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    capture_id UUID NOT NULL REFERENCES reality_captures(capture_id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(user_id),
    -- Position on the capture (normalized 0-1 coordinates for 360 sphere)
    pos_x DECIMAL(6, 4),
    -- horizontal position 0.0-1.0
    pos_y DECIMAL(6, 4),
    -- vertical position 0.0-1.0
    -- Content
    note TEXT NOT NULL,
    severity annotation_severity NOT NULL DEFAULT 'info',
    status annotation_status NOT NULL DEFAULT 'open',
    -- Resolution
    resolved_by UUID REFERENCES users(user_id),
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE capture_annotations IS 'Snagging notes pinned on reality captures. Auditors/engineers flag issues directly on 360° images.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_floor_plans_project ON floor_plans (project_id);
CREATE INDEX idx_captures_project ON reality_captures (project_id, captured_at DESC);
CREATE INDEX idx_captures_engineer ON reality_captures (engineer_id, captured_at DESC);
CREATE INDEX idx_captures_phase ON reality_captures (project_id, construction_phase);
CREATE INDEX idx_captures_gps ON reality_captures USING GIST (gps_coordinates);
CREATE INDEX idx_annotations_capture ON capture_annotations (capture_id, status);
-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TRIGGERS for updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_floor_plans_updated_at BEFORE
UPDATE ON floor_plans FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_captures_updated_at BEFORE
UPDATE ON reality_captures FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_annotations_updated_at BEFORE
UPDATE ON capture_annotations FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
COMMIT;
-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 007 COMPLETE
-- New tables: floor_plans, reality_captures, capture_annotations
-- Enums: capture_type, construction_phase, annotation_severity, annotation_status
-- Indexes: 6 | Triggers: 3
-- ═══════════════════════════════════════════════════════════════════════════════