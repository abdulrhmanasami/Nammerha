-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — Migration 017: Satellite Imagery & Geofenced Zones
-- Phase 3: Spatial Intelligence — remote sensing catalog + compliance zones
-- ═══════════════════════════════════════════════════════════════════════════════
-- Satellite images (Planet, Airbus, Maxar) are stored on S3/MinIO.
-- This schema stores METADATA + pre-signed URLs only.
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SATELLITE IMAGERY — STAC-compliant remote sensing catalog
-- ─────────────────────────────────────────────────────────────────────────────
-- Each row represents one satellite capture for a project area.
-- bbox + center_point use GEOGRAPHY(4326) for PostGIS spatial queries.
-- provider = 'planet' | 'airbus' | 'maxar' | 'skywatch' | 'manual'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE satellite_imagery (
    imagery_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    -- Spatial footprint
    bbox GEOGRAPHY(POLYGON, 4326) NOT NULL,
    center_point GEOGRAPHY(POINT, 4326),
    -- Temporal
    captured_at TIMESTAMPTZ NOT NULL,
    -- Source metadata
    provider VARCHAR(50) NOT NULL,
    -- 'planet', 'airbus', 'maxar', 'skywatch', 'manual'
    resolution_cm INT NOT NULL CHECK (resolution_cm > 0),
    -- spatial resolution in cm/pixel
    sensor_name VARCHAR(100),
    -- e.g. 'PlanetScope', 'Pléiades Neo'
    band_count INT,
    -- number of spectral bands
    -- File URLs (S3/MinIO pre-signed or CDN)
    image_url TEXT NOT NULL,
    -- full-resolution COG (Cloud Optimized GeoTIFF)
    thumbnail_url TEXT,
    -- preview thumbnail (256x256 JPEG)
    -- STAC interchange metadata (full SpatioTemporal Asset Catalog item)
    stac_metadata JSONB NOT NULL DEFAULT '{}',
    -- Quality
    cloud_cover_pct DECIMAL(5, 2) CHECK (
        cloud_cover_pct >= 0
        AND cloud_cover_pct <= 100
    ),
    quality_score DECIMAL(3, 2),
    -- 0.00-1.00 composite quality
    -- Admin
    uploaded_by UUID REFERENCES users(user_id),
    notes TEXT,
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE satellite_imagery IS 'STAC-compliant catalog of satellite imagery captures per project. Files stored on S3, metadata here.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. GEOFENCED ZONES — compliance, sanctions, and restricted areas
-- ─────────────────────────────────────────────────────────────────────────────
-- Used to enforce spatial compliance:
--   - Sanctions zones (OFAC, UN)
--   - Active conflict areas
--   - Government-restricted rebuilding zones
--   - Environmental protection zones
-- Projects inside active zones are flagged/blocked at creation time.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE geofenced_zones (
    zone_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_name VARCHAR(255) NOT NULL,
    zone_polygon GEOGRAPHY(POLYGON, 4326) NOT NULL,
    -- Classification
    restriction_type VARCHAR(50) NOT NULL,
    -- 'sanctions', 'conflict', 'restricted', 'environmental', 'heritage'
    severity VARCHAR(20) NOT NULL DEFAULT 'warn',
    -- 'block' | 'warn' | 'info'
    authority VARCHAR(100),
    -- 'OFAC', 'UN', 'local_gov', 'UNESCO'
    -- Temporal validity
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    -- NULL = indefinite
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Extended metadata
    metadata JSONB DEFAULT '{}',
    description TEXT,
    -- Admin
    created_by UUID REFERENCES users(user_id),
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE geofenced_zones IS 'Geospatial compliance zones. Projects intersecting active block-severity zones are rejected at creation.';
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEXES — performance-critical spatial and temporal queries
-- ─────────────────────────────────────────────────────────────────────────────
-- Satellite imagery: lookup by project (most common), then by capture date
CREATE INDEX idx_imagery_project_time ON satellite_imagery(project_id, captured_at DESC);
-- Satellite imagery: spatial overlap queries (find imagery covering an area)
CREATE INDEX idx_imagery_bbox_gist ON satellite_imagery USING GIST(bbox);
-- Satellite imagery: provider filter (catalog browsing)
CREATE INDEX idx_imagery_provider ON satellite_imagery(provider);
-- Geofenced zones: spatial containment/intersection (ST_Contains, ST_Intersects)
CREATE INDEX idx_zones_polygon_gist ON geofenced_zones USING GIST(zone_polygon);
-- Geofenced zones: active + severity filter (compliance checks)
CREATE INDEX idx_zones_active_severity ON geofenced_zones(is_active, severity)
WHERE is_active = true;
COMMIT;