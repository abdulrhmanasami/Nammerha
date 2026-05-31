// ============================================================================
// Nammerha Backend — Satellite Imagery Service
// STAC-compliant catalog for remote sensing data
// ============================================================================
import pool from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SatelliteImage {
  imagery_id: string;
  project_id: string;
  bbox: unknown;
  center_point: unknown;
  captured_at: Date;
  provider: string;
  resolution_cm: number;
  sensor_name: string | null;
  band_count: number | null;
  image_url: string;
  thumbnail_url: string | null;
  stac_metadata: Record<string, unknown>;
  cloud_cover_pct: number | null;
  quality_score: number | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RegisterImageryDTO {
  project_id: string;
  bbox_wkt: string; // WKT POLYGON
  center_lat: number;
  center_lng: number;
  captured_at: string; // ISO 8601
  provider: string;
  resolution_cm: number;
  sensor_name?: string;
  band_count?: number;
  image_url: string;
  thumbnail_url?: string;
  stac_metadata?: Record<string, unknown>;
  cloud_cover_pct?: number;
  quality_score?: number;
  notes?: string;
}

export type SatelliteProvider = 'planet' | 'airbus' | 'maxar' | 'skywatch' | 'manual';

const VALID_PROVIDERS: SatelliteProvider[] = ['planet', 'airbus', 'maxar', 'skywatch', 'manual'];

// ─── Register Imagery ───────────────────────────────────────────────────────

/**
 * Register a new satellite imagery capture for a project.
 * Admin-only operation — images are ingested from external providers or manual upload.
 */
export async function registerImagery(
  dto: RegisterImageryDTO,
  adminId: string,
): Promise<SatelliteImage> {
  // Validate provider
  if (!VALID_PROVIDERS.includes(dto.provider as SatelliteProvider)) {
    throw new Error(`Invalid provider '${dto.provider}'. Allowed: ${VALID_PROVIDERS.join(', ')}`);
  }

  // Validate resolution
  if (dto.resolution_cm <= 0) {
    throw new Error('resolution_cm must be a positive integer');
  }

  // Validate cloud cover
  if (dto.cloud_cover_pct !== undefined && (dto.cloud_cover_pct < 0 || dto.cloud_cover_pct > 100)) {
    throw new Error('cloud_cover_pct must be between 0 and 100');
  }

  const { rows } = await pool.query(
    `INSERT INTO satellite_imagery (
            project_id, bbox, center_point, captured_at,
            provider, resolution_cm, sensor_name, band_count,
            image_url, thumbnail_url, stac_metadata,
            cloud_cover_pct, quality_score, uploaded_by, notes
        ) VALUES (
            $1,
            ST_GeogFromText($2),
            ST_SetSRID(ST_MakePoint($3, $4), 4326)::GEOGRAPHY,
            $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14, $15, $16
        ) RETURNING imagery_id, project_id, bbox, center_point, captured_at,
                   provider, resolution_cm, sensor_name, band_count,
                   image_url, thumbnail_url, stac_metadata,
                   cloud_cover_pct, quality_score, uploaded_by, notes, created_at`,
    [
      dto.project_id,
      dto.bbox_wkt,
      dto.center_lng,
      dto.center_lat, // PostGIS: lon, lat order
      dto.captured_at,
      dto.provider,
      dto.resolution_cm,
      dto.sensor_name ?? null,
      dto.band_count ?? null,
      dto.image_url,
      dto.thumbnail_url ?? null,
      JSON.stringify(dto.stac_metadata ?? {}),
      dto.cloud_cover_pct ?? null,
      dto.quality_score ?? null,
      adminId,
      dto.notes ?? null,
    ],
  );

  return rows[0];
}

// ─── Timeline Queries ───────────────────────────────────────────────────────

/**
 * Get the chronological timeline of satellite imagery for a project.
 * Returns images sorted by capture date (newest first).
 */
export async function getTimelineForProject(
  projectId: string,
  options?: { provider?: string; limit?: number; offset?: number },
): Promise<{ images: SatelliteImage[]; total: number }> {
  const conditions = ['si.project_id = $1'];
  const params: unknown[] = [projectId];
  let paramIdx = 2;

  if (options?.provider) {
    conditions.push(`si.provider = $${paramIdx}`);
    params.push(options.provider);
    paramIdx++;
  }

  // Count total
  const countSql = `SELECT COUNT(*)::INT AS total FROM satellite_imagery si WHERE ${conditions.join(' AND ')}`;
  const countRes = await pool.query(countSql, params);
  const total: number = countRes.rows[0]?.total ?? 0;

  // Fetch page
  const limit = Math.min(options?.limit || 20, 100);
  const offset = options?.offset || 0;

  params.push(limit);
  const limitParam = `$${paramIdx}`;
  paramIdx++;
  params.push(offset);
  const offsetParam = `$${paramIdx}`;

  const sql = `
        SELECT
            si.imagery_id, si.project_id, si.bbox, si.center_point,
            si.captured_at, si.provider, si.resolution_cm, si.sensor_name,
            si.band_count, si.image_url, si.thumbnail_url, si.stac_metadata,
            si.cloud_cover_pct, si.quality_score, si.uploaded_by, si.notes,
            si.created_at, si.updated_at,
            ST_AsGeoJSON(si.bbox)::jsonb AS bbox_geojson,
            ST_AsGeoJSON(si.center_point)::jsonb AS center_geojson
        FROM satellite_imagery si
        WHERE ${conditions.join(' AND ')}
        ORDER BY si.captured_at DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

  const { rows } = await pool.query(sql, params);
  return { images: rows, total };
}

/**
 * Get a single satellite image by ID.
 */
export async function getImageryById(imageryId: string): Promise<SatelliteImage | null> {
  const { rows } = await pool.query(
    `SELECT si.imagery_id, si.project_id, si.bbox, si.center_point,
                si.captured_at, si.provider, si.resolution_cm, si.sensor_name,
                si.band_count, si.image_url, si.thumbnail_url, si.stac_metadata,
                si.cloud_cover_pct, si.quality_score, si.uploaded_by, si.notes,
                si.created_at, si.updated_at,
            ST_AsGeoJSON(si.bbox)::jsonb AS bbox_geojson,
            ST_AsGeoJSON(si.center_point)::jsonb AS center_geojson
         FROM satellite_imagery si
         WHERE si.imagery_id = $1`,
    [imageryId],
  );
  return rows[0] ?? null;
}

/**
 * Delete satellite imagery (admin only).
 * NOTE: This does NOT delete the actual file from S3 — that requires a separate storage operation.
 */
export async function deleteImagery(imageryId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM satellite_imagery WHERE imagery_id = $1`, [
    imageryId,
  ]);
  return (rowCount ?? 0) > 0;
}

/**
 * Get imagery stats for a project (for dashboard display).
 */
export async function getProjectImageryStats(projectId: string): Promise<{
  total_images: number;
  providers: string[];
  date_range: { earliest: string | null; latest: string | null };
  avg_resolution_cm: number | null;
}> {
  const { rows } = await pool.query(
    `SELECT
            COUNT(*)::INT AS total_images,
            ARRAY_AGG(DISTINCT provider) AS providers,
            MIN(captured_at)::TEXT AS earliest,
            MAX(captured_at)::TEXT AS latest,
            ROUND(AVG(resolution_cm))::INT AS avg_resolution_cm
         FROM satellite_imagery
         WHERE project_id = $1`,
    [projectId],
  );

  const row = rows[0];
  return {
    total_images: row?.total_images ?? 0,
    providers: row?.providers?.filter(Boolean) ?? [],
    date_range: {
      earliest: row?.earliest ?? null,
      latest: row?.latest ?? null,
    },
    avg_resolution_cm: row?.avg_resolution_cm ?? null,
  };
}
