// ============================================================================
// Nammerha Backend — Geofencing Service
// Spatial compliance enforcement for project creation
// ============================================================================
import pool from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RestrictionType = 'sanctions' | 'conflict' | 'restricted' | 'environmental' | 'heritage';
export type Severity = 'block' | 'warn' | 'info';

export interface GeofencedZone {
    zone_id: string;
    zone_name: string;
    zone_polygon: unknown;
    restriction_type: RestrictionType;
    severity: Severity;
    authority: string | null;
    effective_from: Date;
    effective_until: Date | null;
    is_active: boolean;
    metadata: Record<string, unknown>;
    description: string | null;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface ComplianceCheckResult {
    is_compliant: boolean;
    has_blocking_violation: boolean;
    violations: {
        zone_id: string;
        zone_name: string;
        restriction_type: RestrictionType;
        severity: Severity;
        authority: string | null;
        description: string | null;
    }[];
}

export interface CreateZoneDTO {
    zone_name: string;
    zone_polygon_wkt: string;       // WKT POLYGON
    restriction_type: RestrictionType;
    severity?: Severity;
    authority?: string;
    effective_from?: string;        // ISO 8601
    effective_until?: string;       // ISO 8601
    metadata?: Record<string, unknown>;
    description?: string;
}

const VALID_RESTRICTION_TYPES: RestrictionType[] = [
    'sanctions', 'conflict', 'restricted', 'environmental', 'heritage',
];
const VALID_SEVERITIES: Severity[] = ['block', 'warn', 'info'];

// ─── Compliance Check ───────────────────────────────────────────────────────

/**
 * Check if a given GPS coordinate falls within any active geofenced zone.
 * This is the CRITICAL function called during project creation.
 *
 * Returns:
 *   - is_compliant: true if NO blocking violations exist
 *   - has_blocking_violation: true if any severity='block' zone is intersected
 *   - violations: all intersecting zones (block + warn + info)
 *
 * @param lat - Latitude of the point to check
 * @param lng - Longitude of the point to check
 */
export async function checkProjectCompliance(
    lat: number,
    lng: number,
): Promise<ComplianceCheckResult> {
    // Validate coordinates
    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error(`Invalid coordinates: lat=${lat}, lng=${lng}`);
    }

    const { rows } = await pool.query(
        `SELECT
            gz.zone_id,
            gz.zone_name,
            gz.restriction_type,
            gz.severity,
            gz.authority,
            gz.description
         FROM geofenced_zones gz
         WHERE gz.is_active = true
           AND (gz.effective_until IS NULL OR gz.effective_until > NOW())
           AND gz.effective_from <= NOW()
           AND ST_Intersects(
               gz.zone_polygon,
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY
           )
         ORDER BY
           CASE gz.severity
               WHEN 'block' THEN 1
               WHEN 'warn' THEN 2
               WHEN 'info' THEN 3
           END`,
        [lng, lat],     // PostGIS: lon, lat order
    );

    const violations = rows.map(row => ({
        zone_id: row.zone_id as string,
        zone_name: row.zone_name as string,
        restriction_type: row.restriction_type as RestrictionType,
        severity: row.severity as Severity,
        authority: row.authority as string | null,
        description: row.description as string | null,
    }));

    const hasBlockingViolation = violations.some(v => v.severity === 'block');

    return {
        is_compliant: !hasBlockingViolation,
        has_blocking_violation: hasBlockingViolation,
        violations,
    };
}

// ─── Zone Management ────────────────────────────────────────────────────────

/**
 * Create a new geofenced zone (admin only).
 */
export async function createZone(
    dto: CreateZoneDTO,
    adminId: string,
): Promise<GeofencedZone> {
    // Validate restriction type
    if (!VALID_RESTRICTION_TYPES.includes(dto.restriction_type)) {
        throw new Error(
            `Invalid restriction_type '${dto.restriction_type}'. Allowed: ${VALID_RESTRICTION_TYPES.join(', ')}`
        );
    }

    // Validate severity
    const severity = dto.severity ?? 'warn';
    if (!VALID_SEVERITIES.includes(severity)) {
        throw new Error(`Invalid severity '${severity}'. Allowed: ${VALID_SEVERITIES.join(', ')}`);
    }

    const { rows } = await pool.query(
        `INSERT INTO geofenced_zones (
            zone_name, zone_polygon, restriction_type, severity, authority,
            effective_from, effective_until, metadata, description, created_by
        ) VALUES (
            $1, ST_GeogFromText($2), $3, $4, $5,
            COALESCE($6::TIMESTAMPTZ, NOW()), $7::TIMESTAMPTZ, $8, $9, $10
        ) RETURNING *`,
        [
            dto.zone_name,
            dto.zone_polygon_wkt,
            dto.restriction_type,
            severity,
            dto.authority ?? null,
            dto.effective_from ?? null,
            dto.effective_until ?? null,
            JSON.stringify(dto.metadata ?? {}),
            dto.description ?? null,
            adminId,
        ],
    );

    return rows[0];
}

/**
 * Get all active geofenced zones as GeoJSON FeatureCollection.
 * Used for frontend visualization and admin map view.
 */
export async function getActiveZonesGeoJSON(): Promise<GeoJSON.FeatureCollection> {
    const { rows } = await pool.query(
        `SELECT
            gz.zone_id,
            gz.zone_name,
            gz.restriction_type,
            gz.severity,
            gz.authority,
            gz.effective_from,
            gz.effective_until,
            gz.description,
            ST_AsGeoJSON(gz.zone_polygon)::jsonb AS geometry
         FROM geofenced_zones gz
         WHERE gz.is_active = true
           AND (gz.effective_until IS NULL OR gz.effective_until > NOW())
           AND gz.effective_from <= NOW()
         ORDER BY gz.zone_name`,
    );

    return {
        type: 'FeatureCollection',
        features: rows.map(row => ({
            type: 'Feature' as const,
            id: row.zone_id,
            geometry: row.geometry,
            properties: {
                zone_id: row.zone_id,
                zone_name: row.zone_name,
                restriction_type: row.restriction_type,
                severity: row.severity,
                authority: row.authority,
                effective_from: row.effective_from,
                effective_until: row.effective_until,
                description: row.description,
            },
        })),
    };
}

/**
 * List all geofenced zones (admin view — includes inactive).
 */
export async function listAllZones(
    options?: { include_inactive?: boolean; limit?: number; offset?: number },
): Promise<{ zones: GeofencedZone[]; total: number }> {
    const conditions = options?.include_inactive ? [] : ['gz.is_active = true'];
    const params: unknown[] = [];
    let paramIdx = 1;

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count
    const countRes = await pool.query(
        `SELECT COUNT(*)::INT AS total FROM geofenced_zones gz ${whereClause}`,
        params,
    );
    const total: number = countRes.rows[0]?.total ?? 0;

    // Fetch
    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    params.push(limit);
    const limitParam = `$${paramIdx}`;
    paramIdx++;
    params.push(offset);
    const offsetParam = `$${paramIdx}`;

    const { rows } = await pool.query(
        `SELECT gz.*, ST_AsGeoJSON(gz.zone_polygon)::jsonb AS polygon_geojson
         FROM geofenced_zones gz
         ${whereClause}
         ORDER BY gz.created_at DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
    );

    return { zones: rows, total };
}

/**
 * Deactivate (soft-delete) a geofenced zone.
 */
export async function deactivateZone(zoneId: string): Promise<boolean> {
    const { rowCount } = await pool.query(
        `UPDATE geofenced_zones SET is_active = false, updated_at = NOW() WHERE zone_id = $1`,
        [zoneId],
    );
    return (rowCount ?? 0) > 0;
}
