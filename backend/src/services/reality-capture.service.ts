// ============================================================================
// Nammerha Backend — Reality Capture Service (Ticket 8.1)
// PlanRadar 360 + Houzz Pro LIDAR patterns — METADATA ONLY
// Heavy media files stored on disk/S3, NOT in PostgreSQL.
// ============================================================================
import pool from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export type CaptureType = 'photo_360' | 'video_360' | 'point_cloud' | 'photo_standard';
export type ConstructionPhase =
    | 'demolition' | 'foundation' | 'structural'
    | 'plumbing_pre_concrete' | 'electrical_pre_concrete' | 'concrete_pour'
    | 'masonry' | 'plastering' | 'finishing' | 'final_inspection';

export interface RealityCapture {
    capture_id: string;
    project_id: string;
    engineer_id: string;
    floor_plan_id: string | null;
    capture_type: CaptureType;
    construction_phase: ConstructionPhase;
    title: string | null;
    description: string | null;
    file_url: string;
    thumbnail_url: string | null;
    file_size_bytes: number | null;
    camera_model: string | null;
    horizontal_fov: number | null;
    heading: number | null;
    pitch: number | null;
    gps_coordinates: string | null;
    gps_accuracy_meters: number | null;
    altitude_meters: number | null;
    captured_at: Date;
    is_verified: boolean;
    verified_by: string | null;
    verified_at: Date | null;
    created_at: Date;
}

export interface SubmitCaptureDTO {
    capture_type?: CaptureType;
    construction_phase: ConstructionPhase;
    title?: string;
    description?: string;
    file_url: string;
    thumbnail_url?: string;
    file_size_bytes?: number;
    camera_model?: string;
    horizontal_fov?: number;
    heading?: number;
    pitch?: number;
    gps_lat?: number;
    gps_lng?: number;
    gps_accuracy_meters?: number;
    altitude_meters?: number;
    floor_plan_id?: string;
}

export interface CaptureAnnotation {
    annotation_id: string;
    capture_id: string;
    author_id: string;
    pos_x: number | null;
    pos_y: number | null;
    note: string;
    severity: 'info' | 'warning' | 'critical';
    status: 'open' | 'resolved' | 'dismissed';
    resolved_by: string | null;
    resolved_at: Date | null;
    resolution_note: string | null;
    created_at: Date;
}

export interface AddAnnotationDTO {
    pos_x?: number;
    pos_y?: number;
    note: string;
    severity?: 'info' | 'warning' | 'critical';
}

export interface FloorPlan {
    plan_id: string;
    project_id: string;
    uploaded_by: string;
    title: string;
    description: string | null;
    file_url: string;
    file_type: string;
    version: number;
    is_active: boolean;
    created_at: Date;
}

export interface UploadFloorPlanDTO {
    title: string;
    description?: string;
    file_url: string;
    file_type?: string;
}

// ─── GAP-2 FIX: GPS Proximity Validation ────────────────────────────────────
// Haversine formula to calculate great-circle distance between two GPS points.
// Used to validate that reality capture photos were taken at the project site.
// Threshold: 500 meters (accounts for GPS drift, building perimeter, etc.)

const GPS_PROXIMITY_THRESHOLD_METERS = 500;

/**
 * Calculate the Haversine distance between two points on Earth.
 * Returns distance in meters.
 */
function haversineDistanceMeters(
    lat1: number, lon1: number,
    lat2: number, lon2: number,
): number {
    const R = 6371e3; // Earth radius in meters
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Validate that the claimed GPS coordinates are within the proximity
 * threshold of the project's registered GPS location.
 *
 * GAP-2 FIX: Anti-fraud mechanism — prevents engineers from submitting
 * captures with GPS coordinates that don't match the actual project site.
 * Discrepancies are logged to audit_trail for compliance review.
 *
 * @returns null if valid, or an error message if GPS is too far from project.
 */
async function validateGPSProximity(
    projectId: string,
    claimedLat: number,
    claimedLng: number,
    engineerId: string,
): Promise<string | null> {
    // Fetch the project's registered GPS location
    const projRes = await pool.query(
        `SELECT
            ST_Y(gps_location::GEOMETRY) AS project_lat,
            ST_X(gps_location::GEOMETRY) AS project_lng
         FROM projects WHERE project_id = $1 AND gps_location IS NOT NULL`,
        [projectId]
    );

    if (projRes.rows.length === 0 || projRes.rows[0].project_lat === null) {
        // Project has no GPS location set — skip validation (allow capture)
        return null;
    }

    const { project_lat, project_lng } = projRes.rows[0];
    const distance = haversineDistanceMeters(
        Number(project_lat), Number(project_lng),
        claimedLat, claimedLng,
    );

    if (distance > GPS_PROXIMITY_THRESHOLD_METERS) {
        // Log the discrepancy to audit_trail for compliance review
        try {
            await pool.query(
                `INSERT INTO audit_trail
                    (entity_type, entity_id, action, actor_id, new_values)
                 VALUES ('reality_capture', $1, 'gps_proximity_violation', $2, $3)`,
                [
                    projectId,
                    engineerId,
                    JSON.stringify({
                        claimed_lat: claimedLat,
                        claimed_lng: claimedLng,
                        project_lat: Number(project_lat),
                        project_lng: Number(project_lng),
                        distance_meters: Math.round(distance),
                        threshold_meters: GPS_PROXIMITY_THRESHOLD_METERS,
                        timestamp: new Date().toISOString(),
                    }),
                ]
            );
        } catch (auditErr) {
            console.error('[RealityCapture] Failed to log GPS violation to audit_trail:', auditErr);
        }

        return `GPS location mismatch: capture was ${Math.round(distance)}m from the project site (max allowed: ${GPS_PROXIMITY_THRESHOLD_METERS}m). Photo must be taken on-site.`;
    }

    return null; // Valid — within threshold
}

// ─── Captures ───────────────────────────────────────────────────────────────

/**
 * Submit a reality capture (360 image, point cloud, etc.) metadata.
 * GPS auto-links to project by project_id.
 */
export async function submitCapture(
    engineerId: string,
    projectId: string,
    dto: SubmitCaptureDTO
): Promise<RealityCapture> {
    // Verify engineer is assigned to project
    const projRes = await pool.query(
        `SELECT assigned_engineer_id FROM projects WHERE project_id = $1`,
        [projectId]
    );
    if (projRes.rows.length === 0) {
        throw new Error(`Project ${projectId} not found`);
    }
    if (projRes.rows[0].assigned_engineer_id !== engineerId) {
        throw new Error('Only the assigned engineer can submit reality captures');
    }

    // Build GPS point if coordinates provided
    const gpsExpr = dto.gps_lat !== undefined && dto.gps_lat !== null
        && dto.gps_lng !== undefined && dto.gps_lng !== null
        ? `ST_SetSRID(ST_MakePoint($12, $11), 4326)::GEOGRAPHY`
        : 'NULL';

    // GAP-2 FIX: Validate GPS proximity BEFORE accepting the capture.
    // This prevents fraud where engineers submit photos from unrelated locations.
    if (dto.gps_lat !== undefined && dto.gps_lat !== null
        && dto.gps_lng !== undefined && dto.gps_lng !== null) {
        const gpsError = await validateGPSProximity(
            projectId, dto.gps_lat, dto.gps_lng, engineerId,
        );
        if (gpsError) {
            throw new Error(gpsError);
        }
    }

    const { rows } = await pool.query(
        `INSERT INTO reality_captures
            (project_id, engineer_id, floor_plan_id, capture_type,
             construction_phase, title, description, file_url, thumbnail_url,
             file_size_bytes, camera_model, horizontal_fov, heading, pitch,
             gps_coordinates, gps_accuracy_meters, altitude_meters)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $13, $14, $15, $16, ${gpsExpr}, $17, $18)
        RETURNING *`,
        [
            projectId,                              // $1
            engineerId,                             // $2
            dto.floor_plan_id || null,              // $3
            dto.capture_type || 'photo_360',        // $4
            dto.construction_phase,                 // $5
            dto.title || null,                      // $6
            dto.description || null,                // $7
            dto.file_url,                           // $8
            dto.thumbnail_url || null,              // $9
            dto.file_size_bytes || null,             // $10
            dto.gps_lat ?? null,                    // $11 (for ST_MakePoint Y)
            dto.gps_lng ?? null,                    // $12 (for ST_MakePoint X)
            dto.camera_model || null,               // $13
            dto.horizontal_fov ?? null,             // $14
            dto.heading ?? null,                    // $15
            dto.pitch ?? null,                      // $16
            dto.gps_accuracy_meters ?? null,        // $17
            dto.altitude_meters ?? null,            // $18
        ]
    );

    return rows[0];
}

/**
 * Get all captures for a project, ordered by capture date.
 * Filterable by construction_phase and capture_type.
 */
export async function getProjectCaptures(
    projectId: string,
    phase?: ConstructionPhase,
    captureType?: CaptureType,
    limit = 50,
    offset = 0
): Promise<RealityCapture[]> {
    let sql = `
        SELECT rc.*, u.full_name AS engineer_name
        FROM reality_captures rc
        JOIN users u ON u.user_id = rc.engineer_id
        WHERE rc.project_id = $1
    `;
    const params: unknown[] = [projectId];
    let paramIdx = 2;

    if (phase) {
        sql += ` AND rc.construction_phase = $${paramIdx}`;
        params.push(phase);
        paramIdx++;
    }
    if (captureType) {
        sql += ` AND rc.capture_type = $${paramIdx}`;
        params.push(captureType);
        paramIdx++;
    }

    sql += ` ORDER BY rc.captured_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(Math.min(limit, 100), offset);

    const { rows } = await pool.query(sql, params);
    return rows;
}

/**
 * Hidden Works Reveal Mode:
 * Returns captures from construction phases BEFORE concrete pour,
 * providing legal evidence of plumbing/electrical installation.
 */
export async function getHiddenWorks(projectId: string): Promise<RealityCapture[]> {
    const hiddenPhases: ConstructionPhase[] = [
        'plumbing_pre_concrete',
        'electrical_pre_concrete',
        'foundation',
        'structural',
    ];

    const { rows } = await pool.query(
        `SELECT rc.*, u.full_name AS engineer_name
         FROM reality_captures rc
         JOIN users u ON u.user_id = rc.engineer_id
         WHERE rc.project_id = $1
           AND rc.construction_phase = ANY($2)
         ORDER BY rc.construction_phase, rc.captured_at ASC`,
        [projectId, hiddenPhases]
    );

    return rows;
}

/**
 * Verify a reality capture (admin/auditor).
 */
export async function verifyCapture(
    captureId: string,
    verifierId: string
): Promise<RealityCapture> {
    const { rows } = await pool.query(
        `UPDATE reality_captures
         SET is_verified = true, verified_by = $1, verified_at = NOW()
         WHERE capture_id = $2
         RETURNING *`,
        [verifierId, captureId]
    );
    if (rows.length === 0) {
        throw new Error('Capture not found');
    }
    return rows[0];
}

// ─── Annotations ────────────────────────────────────────────────────────────

/**
 * Add a snagging annotation to a capture.
 */
export async function addAnnotation(
    captureId: string,
    authorId: string,
    dto: AddAnnotationDTO
): Promise<CaptureAnnotation> {
    // Verify capture exists
    const capRes = await pool.query(
        `SELECT capture_id FROM reality_captures WHERE capture_id = $1`,
        [captureId]
    );
    if (capRes.rows.length === 0) {
        throw new Error('Capture not found');
    }

    const { rows } = await pool.query(
        `INSERT INTO capture_annotations
            (capture_id, author_id, pos_x, pos_y, note, severity)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
            captureId,
            authorId,
            dto.pos_x ?? null,
            dto.pos_y ?? null,
            dto.note,
            dto.severity || 'info',
        ]
    );

    return rows[0];
}

/**
 * Get annotations for a capture.
 */
export async function getCaptureAnnotations(
    captureId: string
): Promise<CaptureAnnotation[]> {
    const { rows } = await pool.query(
        `SELECT ca.*, u.full_name AS author_name
         FROM capture_annotations ca
         JOIN users u ON u.user_id = ca.author_id
         WHERE ca.capture_id = $1
         ORDER BY ca.created_at DESC`,
        [captureId]
    );
    return rows;
}

// ─── Floor Plans ────────────────────────────────────────────────────────────

/**
 * Upload a floor plan for a project.
 */
export async function uploadFloorPlan(
    engineerId: string,
    projectId: string,
    dto: UploadFloorPlanDTO
): Promise<FloorPlan> {
    // Get next version number
    const versionRes = await pool.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM floor_plans WHERE project_id = $1`,
        [projectId]
    );

    const { rows } = await pool.query(
        `INSERT INTO floor_plans
            (project_id, uploaded_by, title, description, file_url, file_type, version)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
            projectId,
            engineerId,
            dto.title,
            dto.description || null,
            dto.file_url,
            dto.file_type || 'image',
            versionRes.rows[0].next_version,
        ]
    );

    return rows[0];
}

/**
 * Get floor plans for a project.
 */
export async function getFloorPlans(projectId: string): Promise<FloorPlan[]> {
    const { rows } = await pool.query(
        `SELECT fp.*, u.full_name AS uploaded_by_name
         FROM floor_plans fp
         JOIN users u ON u.user_id = fp.uploaded_by
         WHERE fp.project_id = $1 AND fp.is_active = true
         ORDER BY fp.version DESC`,
        [projectId]
    );
    return rows;
}
