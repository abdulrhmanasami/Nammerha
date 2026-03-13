// ============================================================================
// Nammerha Backend — Matchmaking Service (Ticket 7.1)
// BuildZoom-style Dynamic Scoring + PostgreSQL-native search + bidding
// + Georavity (Valhalla) real road distance ranking
// ============================================================================
import pool, { transaction } from '../config/database';
import { getDistanceMatrix } from './georavity.service';
import type { MatrixEntry } from './georavity.service';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';

export interface EngineerScore {
    user_id: string;
    full_name: string;
    specialty: string | null;
    completed_projects_count: number;
    avg_response_hours: number | null;
    bid_win_rate: number | null;
    dynamic_score: number;
    distance_km: number | null;
    /** Real road distance from Georavity (null = unavailable, fallback to Haversine) */
    road_distance_km: number | null;
    /** Real road travel time in seconds from Georavity */
    road_duration_seconds: number | null;
    engineering_license_number: string | null;
    guild_membership_id: string | null;
}

export interface ContractorBid {
    bid_id: string;
    engineer_id: string;
    project_id: string;
    proposed_cost: number;
    currency: string;
    estimated_days: number;
    cover_letter: string | null;
    methodology: string | null;
    status: BidStatus;
    engineer_score_snapshot: number | null;
    submitted_at: Date;
    responded_at: Date | null;
    expires_at: Date | null;
}

export interface SubmitBidDTO {
    proposed_cost: number;       // in cents
    estimated_days: number;
    cover_letter?: string;
    methodology?: string;
}

export interface SearchEngineersDTO {
    lat?: number;
    lng?: number;
    max_distance_km?: number;
    specialty?: string;
    query?: string;
    min_score?: number;
    limit?: number;
    offset?: number;
}

// ─── Dynamic Scoring Algorithm ──────────────────────────────────────────────
// Score = W1 × projects_factor + W2 × response_factor + W3 × win_factor + W4 × license_factor
// Range: 0–100
//
// Weights (per BuildZoom methodology):
//   W1 (completed projects) = 0.35
//   W2 (response speed)     = 0.20
//   W3 (bid win rate)       = 0.30
//   W4 (license status)     = 0.15

// LOW-AUD-002 FIX: Environment-configurable scoring weights.
// Defaults to BuildZoom methodology values. Can be tuned via env vars
// without redeployment: SCORE_W_PROJECTS, SCORE_W_RESPONSE, SCORE_W_WINRATE, SCORE_W_LICENSE
//
// P1-NEW-002 FIX: safeParseFloat guards against NaN injection.
// If SCORE_W_PROJECTS=abc or SCORE_W_PROJECTS= is set, parseFloat returns NaN
// which silently corrupts ALL engineer scores. This guard validates isFinite()
// and falls back to the documented BuildZoom default.

function safeParseFloat(envValue: string | undefined, fallback: number): number {
    if (envValue === undefined || envValue === '') {
        return fallback;
    }
    const parsed = parseFloat(envValue);
    if (!isFinite(parsed)) {
        logger.error('P1-NEW-002: Invalid numeric env var — using fallback', {
            raw_value: envValue,
            fallback,
        });
        return fallback;
    }
    return parsed;
}

const SCORE_WEIGHTS = {
    completed_projects: safeParseFloat(process.env['SCORE_W_PROJECTS'], 0.35),
    response_speed: safeParseFloat(process.env['SCORE_W_RESPONSE'], 0.20),
    bid_win_rate: safeParseFloat(process.env['SCORE_W_WINRATE'], 0.30),
    license_status: safeParseFloat(process.env['SCORE_W_LICENSE'], 0.15),
} as const;

// P1-NEW-002 FIX: Startup integrity check — weights must sum to 1.0 (±0.01 tolerance)
const weightSum = SCORE_WEIGHTS.completed_projects + SCORE_WEIGHTS.response_speed
    + SCORE_WEIGHTS.bid_win_rate + SCORE_WEIGHTS.license_status;
if (Math.abs(weightSum - 1.0) > 0.01) {
    logger.error('P1-NEW-002: Score weights do not sum to 1.0 — scoring integrity at risk', {
        weights: SCORE_WEIGHTS,
        sum: weightSum,
    });
}

// P2-005 FIX: Shared scoring factor calculator — single source of truth
export interface EngineerMetrics {
    completed_projects_count: number;
    avg_response_hours: number | null;
    bid_win_rate: number | null;
    engineering_license_number: string | null;
    guild_membership_id: string | null;
}

export interface ScoringFactors {
    projectsFactor: number;
    responseFactor: number;
    winFactor: number;
    licenseFactor: number;
    compositeScore: number;
}

export function calculateScoringFactors(eng: EngineerMetrics): ScoringFactors {
    // Factor 1: Completed projects (0–100, logarithmic scale, cap at 50 projects)
    const projectsFactor = Math.min(
        100,
        (Math.log2(1 + eng.completed_projects_count) / Math.log2(51)) * 100
    );

    // Factor 2: Response speed (0–100, inverse — faster = higher)
    // Target: 24h = 100, 72h = 50, >168h = 0
    let responseFactor = 50; // default if no data
    if (eng.avg_response_hours !== null) {
        responseFactor = Math.max(0, Math.min(100,
            100 - ((Number(eng.avg_response_hours) - 24) / (168 - 24)) * 100
        ));
    }

    // Factor 3: Bid win rate (0–100, direct mapping, null → 50)
    const winFactor = eng.bid_win_rate !== null ? Number(eng.bid_win_rate) : 50;

    // Factor 4: License status (binary)
    let licenseFactor = 20;
    if (eng.engineering_license_number && eng.guild_membership_id) {
        licenseFactor = 100;
    } else if (eng.engineering_license_number || eng.guild_membership_id) {
        licenseFactor = 60;
    }

    // Weighted composite score
    const compositeScore = Math.round(
        (SCORE_WEIGHTS.completed_projects * projectsFactor +
            SCORE_WEIGHTS.response_speed * responseFactor +
            SCORE_WEIGHTS.bid_win_rate * winFactor +
            SCORE_WEIGHTS.license_status * licenseFactor) * 100
    ) / 100;

    return { projectsFactor, responseFactor, winFactor, licenseFactor, compositeScore };
}

/**
 * Recalculate and persist the dynamic score for an engineer.
 * Call this after completing a project, responding to a match, or updating license.
 */
export async function recalculateScore(engineerId: string): Promise<number> {
    const client = await pool.connect();
    try {
        // P2-PLT-001 FIX: Wrapped in transaction with FOR UPDATE to prevent
        // race condition where two concurrent recalculations read stale metrics
        // and the last writer silently overwrites the other's score.
        await client.query('BEGIN');

        // Fetch current metrics — FOR UPDATE prevents concurrent recalculations
        const { rows } = await client.query(
            `SELECT
                completed_projects_count,
                avg_response_hours,
                bid_win_rate,
                engineering_license_number,
                guild_membership_id
            FROM users WHERE user_id = $1 AND role = 'engineer' FOR UPDATE`,
            [engineerId]
        );

        if (rows.length === 0) {
            await client.query('ROLLBACK');
            throw new Error(`Engineer ${engineerId} not found`);
        }

        // P2-005: Use shared scoring function (single source of truth)
        const { compositeScore } = calculateScoringFactors(rows[0]);

        // Persist
        await client.query(
            `UPDATE users SET dynamic_score = $1 WHERE user_id = $2`,
            [compositeScore, engineerId]
        );

        await client.query('COMMIT');
        return compositeScore;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => { /* swallow rollback failure */ });
        throw err;
    } finally {
        client.release();
    }
}

// ─── Search Engineers ───────────────────────────────────────────────────────

/**
 * Search engineers with spatial, text, and score filters.
 * Uses PostGIS ST_Distance + tsvector full-text search.
 */
export async function searchEngineers(dto: SearchEngineersDTO): Promise<EngineerScore[]> {
    const conditions: string[] = [
        `u.role = 'engineer'`,
        `u.is_active = TRUE`,
        `u.kyc_verification_status = 'verified'`,
        // GAP-1 FIX: CSBP/OFAC compliance gate — exclude sanctioned engineers.
        // Engineers with auto_blocked=true OR confirmed SDN match must NEVER
        // appear in matchmaking results. Required by FATF Rec 8 and OFAC GL-25.
        `NOT EXISTS (
            SELECT 1 FROM sanctions_screening_results ssr
            WHERE ssr.screened_user_id = u.user_id
              AND (ssr.auto_blocked = true OR ssr.status = 'confirmed_match')
        )`,
    ];
    const params: unknown[] = [];
    let paramIdx = 1;
    let distanceSelect = 'NULL::DECIMAL AS distance_km';

    // Spatial filter: distance from given lat/lng
    if (dto.lat !== undefined && dto.lng !== undefined) {
        const point = `ST_SetSRID(ST_MakePoint($${paramIdx}, $${paramIdx + 1}), 4326)::GEOGRAPHY`;
        distanceSelect = `ROUND((ST_Distance(u.gps_last_known, ${point}) / 1000)::DECIMAL, 2) AS distance_km`;
        params.push(dto.lng, dto.lat); // PostGIS: lon, lat order
        paramIdx += 2;

        if (dto.max_distance_km) {
            conditions.push(`ST_DWithin(u.gps_last_known, ${point}, $${paramIdx})`);
            params.push(dto.max_distance_km * 1000); // meters
            paramIdx++;
        }
    }

    // Specialty filter
    if (dto.specialty) {
        conditions.push(`u.specialty = $${paramIdx}`);
        params.push(dto.specialty);
        paramIdx++;
    }

    // Full-text search
    if (dto.query) {
        conditions.push(`u.search_vector @@ plainto_tsquery('english', $${paramIdx})`);
        params.push(dto.query);
        paramIdx++;
    }

    // Minimum score
    if (dto.min_score !== undefined) {
        conditions.push(`u.dynamic_score >= $${paramIdx}`);
        params.push(dto.min_score);
        paramIdx++;
    }

    const limit = Math.min(dto.limit || 20, 50);
    const offset = dto.offset || 0;

    // HGH-004: Parameterize LIMIT/OFFSET (was string-interpolated → SQL injection risk)
    params.push(limit);
    const limitParam = `$${paramIdx}`;
    paramIdx++;
    params.push(offset);
    const offsetParam = `$${paramIdx}`;

    // Also extract lat/lng for Georavity enrichment when spatial filter is active
    let coordSelect = '';
    if (dto.lat !== undefined && dto.lng !== undefined) {
        coordSelect = `,
            ST_Y(u.gps_last_known::GEOMETRY) AS engineer_lat,
            ST_X(u.gps_last_known::GEOMETRY) AS engineer_lng`;
    }

    const sql = `
        SELECT
            u.user_id,
            u.full_name,
            u.specialty,
            u.completed_projects_count,
            u.avg_response_hours,
            u.bid_win_rate,
            u.dynamic_score,
            ${distanceSelect},
            u.engineering_license_number,
            u.guild_membership_id
            ${coordSelect}
        FROM users u
        WHERE ${conditions.join(' AND ')}
        ORDER BY u.dynamic_score DESC, u.completed_projects_count DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const { rows } = await pool.query(sql, params);

    // Enrich with Georavity road distances when spatial filter is active
    if (dto.lat !== undefined && dto.lng !== undefined && rows.length > 0) {
        return enrichWithRoadDistances(rows, dto.lat, dto.lng);
    }

    // No spatial filter — return with null road distances
    return rows.map(row => ({
        ...row,
        road_distance_km: null,
        road_duration_seconds: null,
    }));
}

// ─── Auto-Match for Project (Thumbtack Pattern) ─────────────────────────────
// UPGRADED: Hybrid ST_DWithin pre-filter + Georavity real road distance ranking.
// Falls back gracefully to Haversine if Georavity is unavailable.

/**
 * Find the top 3 engineers nearest to the project location,
 * filtered by specialty match and minimum score threshold.
 *
 * Algorithm:
 *   1. PostGIS ST_DWithin pre-filter (GIST-indexed, fast) → 20 candidates
 *   2. Georavity sources_to_targets → real road distances for all candidates
 *   3. Re-rank by dynamic_score DESC, road_duration_seconds ASC
 *   4. Return top 3
 *
 * Graceful degradation: If Georavity is down, falls back to Haversine ordering.
 */
export async function matchProjectToEngineers(
    projectId: string
): Promise<EngineerScore[]> {
    // Get project location and damage type
    const projectRes = await pool.query(
        `SELECT
            gps_location,
            damage_type,
            address_text,
            ST_Y(gps_location::GEOMETRY) AS project_lat,
            ST_X(gps_location::GEOMETRY) AS project_lng
        FROM projects WHERE project_id = $1`,
        [projectId]
    );

    if (projectRes.rows.length === 0) {
        throw new Error(`Project ${projectId} not found`);
    }

    const project = projectRes.rows[0];

    if (!project.gps_location) {
        throw new Error('Project has no GPS location — cannot auto-match');
    }

    // Map damage_type to specialty
    const specialtyMap: Record<string, string> = {
        structural: 'structural',
        plumbing: 'plumbing',
        electrical: 'electrical',
        mixed: 'mixed',
    };

    // ─── Step 1: PostGIS pre-filter (GIST-indexed, O(log n)) ────────────
    // Fetch up to 20 candidates within service radius (Haversine pre-filter).
    // This prevents sending hundreds of HTTP requests to Georavity.
    const PRE_FILTER_LIMIT = 20;

    const sql = `
        SELECT
            u.user_id,
            u.full_name,
            u.specialty,
            u.completed_projects_count,
            u.avg_response_hours,
            u.bid_win_rate,
            u.dynamic_score,
            ROUND((ST_Distance(u.gps_last_known, p.gps_location) / 1000)::DECIMAL, 2) AS distance_km,
            ST_Y(u.gps_last_known::GEOMETRY) AS engineer_lat,
            ST_X(u.gps_last_known::GEOMETRY) AS engineer_lng,
            u.engineering_license_number,
            u.guild_membership_id
        FROM users u
        CROSS JOIN projects p
        WHERE p.project_id = $1
          AND u.role = 'engineer'
          AND u.is_active = TRUE
          AND u.kyc_verification_status = 'verified'
          AND u.gps_last_known IS NOT NULL
          AND (u.specialty = $2 OR u.specialty = 'mixed')
          AND ST_DWithin(u.gps_last_known, p.gps_location, u.service_radius_km * 1000)
          -- GAP-1 FIX: CSBP/OFAC compliance gate — exclude sanctioned engineers.
          AND NOT EXISTS (
              SELECT 1 FROM sanctions_screening_results ssr
              WHERE ssr.screened_user_id = u.user_id
                AND (ssr.auto_blocked = true OR ssr.status = 'confirmed_match')
          )
        ORDER BY u.dynamic_score DESC, ST_Distance(u.gps_last_known, p.gps_location) ASC
        LIMIT $3
    `;

    const { rows: candidates } = await pool.query(sql, [
        projectId,
        specialtyMap[project.damage_type] || 'mixed',
        PRE_FILTER_LIMIT,
    ]);

    if (candidates.length === 0) {
        return [];
    }

    // ─── Step 2: Georavity enrichment (real road distances) ─────────────
    const enrichedCandidates = await enrichWithRoadDistances(
        candidates,
        Number(project.project_lat),
        Number(project.project_lng),
    );

    // ─── Step 3: Re-rank by score DESC, then road duration ASC ──────────
    enrichedCandidates.sort((a, b) => {
        // Primary: dynamic_score DESC
        const scoreDiff = Number(b.dynamic_score) - Number(a.dynamic_score);
        if (Math.abs(scoreDiff) > 0.01) {
            return scoreDiff;
        }
        // Secondary: road_duration_seconds ASC (or Haversine fallback)
        const aDuration = a.road_duration_seconds ?? Infinity;
        const bDuration = b.road_duration_seconds ?? Infinity;
        return aDuration - bDuration;
    });

    // Return top 3
    return enrichedCandidates.slice(0, 3);
}

// ─── Georavity Road Distance Enrichment ─────────────────────────────────────

/**
 * Enrich engineer candidates with real road distances from Georavity.
 * Falls back gracefully to Haversine (distance_km) if the engine is unavailable.
 *
 * Design: ONE HTTP call to Georavity's sources_to_targets endpoint,
 * passing the project as source and all candidates as targets.
 * This is O(1) HTTP calls, not O(n).
 */
async function enrichWithRoadDistances(
    candidates: EngineerScore[],
    projectLat: number,
    projectLng: number,
): Promise<EngineerScore[]> {
    // The SQL query selects engineer_lat/engineer_lng alongside EngineerScore fields.
    // We access them via a typed view of the raw row.
    interface RowWithCoords {
        engineer_lat?: string | number;
        engineer_lng?: string | number;
    }

    // Extract candidate coordinates
    const targets = candidates.map(c => {
        const row = c as unknown as RowWithCoords;
        return {
            lat: Number(row.engineer_lat ?? 0),
            lng: Number(row.engineer_lng ?? 0),
        };
    });

    // Validate coordinates — skip Georavity if any are invalid
    const hasValidCoords = targets.every(
        t => t.lat !== 0 && t.lng !== 0 && isFinite(t.lat) && isFinite(t.lng)
    ) && isFinite(projectLat) && isFinite(projectLng) && projectLat !== 0 && projectLng !== 0;

    if (!hasValidCoords) {
        logger.warn('Invalid coordinates detected — skipping Georavity enrichment');
        return candidates.map(c => ({
            ...c,
            road_distance_km: null,
            road_duration_seconds: null,
        }));
    }

    let matrix: MatrixEntry[] | null = null;

    try {
        matrix = await getDistanceMatrix(
            { lat: projectLat, lng: projectLng },
            targets,
            'auto',
        );
    } catch (error) {
        // GRACEFUL DEGRADATION: Log and continue with Haversine distances
        logger.error('Georavity unavailable, falling back to Haversine ordering', {
            error: error instanceof Error ? error.message : String(error),
        });
    }

    // Enrich candidates with road distances
    return candidates.map((candidate, index) => {
        const entry = matrix?.[index] ?? null;
        return {
            ...candidate,
            road_distance_km: entry?.distance_km ?? null,
            road_duration_seconds: entry?.duration_seconds ?? null,
        };
    });
}

// ─── Bidding System ─────────────────────────────────────────────────────────

/**
 * Engineer submits a competitive bid on a published project.
 */
// P2-009 FIX: Wrapped in transaction to prevent duplicate-bid race condition.
// The UNIQUE (engineer_id, project_id) constraint provides DB-level safety,
// but the transaction ensures a clean, user-friendly error message.
export async function submitBid(
    engineerId: string,
    projectId: string,
    dto: SubmitBidDTO
): Promise<ContractorBid> {
    return transaction(async (client) => {
        // Validate project exists and is published
        const projectRes = await client.query(
            `SELECT status FROM projects WHERE project_id = $1`,
            [projectId]
        );

        if (projectRes.rows.length === 0) {
            throw new Error(`Project ${projectId} not found`);
        }

        if (projectRes.rows[0].status !== 'published') {
            throw new Error('Bids can only be submitted for published projects');
        }

        // Get current engineer score
        const scoreRes = await client.query(
            `SELECT dynamic_score, role FROM users WHERE user_id = $1 AND role IN ('engineer', 'contractor')`,
            [engineerId]
        );

        if (scoreRes.rows.length === 0) {
            throw new Error('Only engineers or contractors can submit bids');
        }

        const userRole = scoreRes.rows[0].role;

        // MED-009: Prevent duplicate bids on the same project (checked within transaction)
        const existingBid = await client.query(
            `SELECT bid_id FROM contractor_bids
             WHERE (engineer_id = $1 OR contractor_id = $1) AND project_id = $2 AND status IN ('pending', 'accepted')`,
            [engineerId, projectId]
        );
        if (existingBid.rows.length > 0) {
            throw new Error('You already have an active bid on this project');
        }

        const { rows } = await client.query(
            `INSERT INTO contractor_bids
                (engineer_id, contractor_id, project_id, proposed_cost, estimated_days,
                 cover_letter, methodology, engineer_score_snapshot)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                userRole === 'engineer' ? engineerId : null,
                userRole === 'contractor' ? engineerId : null,
                projectId,
                dto.proposed_cost,
                dto.estimated_days,
                dto.cover_letter || null,
                dto.methodology || null,
                scoreRes.rows[0].dynamic_score,
            ]
        );

        // Update bid_win_rate metrics (recalculate total bids)
        await client.query(
            `UPDATE users SET
                bid_win_rate = COALESCE(
                    (SELECT ROUND(
                        COUNT(*) FILTER (WHERE status = 'accepted')::DECIMAL /
                        NULLIF(COUNT(*), 0) * 100,
                    2) FROM contractor_bids WHERE engineer_id = $1 OR contractor_id = $1),
                0)
            WHERE user_id = $1`,
            [engineerId]
        );

        return rows[0];
    });
}

/**
 * Get all bids for a project (homeowner/admin view).
 */
// P1-NEW-005 FIX: Previous JOIN only matched engineer_id, ignoring contractor bids.
// Now uses COALESCE(contractor_id, engineer_id) to include both bid sources.
// PLT-2026-AUD-004 FIX: Added pagination to prevent memory exhaustion at scale.
export async function getProjectBids(
    projectId: string,
    limit = 50,
    offset = 0,
): Promise<ContractorBid[]> {
    const safeLim = Math.min(Math.max(1, limit), 50);
    const safeOff = Math.max(0, offset);
    const { rows } = await pool.query(
        `SELECT b.*, u.full_name AS engineer_name, u.dynamic_score AS current_score,
                u.completed_projects_count, u.engineering_license_number
         FROM contractor_bids b
         JOIN users u ON u.user_id = COALESCE(b.contractor_id, b.engineer_id)
         WHERE b.project_id = $1
         ORDER BY b.engineer_score_snapshot DESC, b.proposed_cost ASC
         LIMIT $2 OFFSET $3`,
        [projectId, safeLim, safeOff]
    );
    return rows;
}

/**
 * Accept a bid — assigns contractor to project for execution.
 */
export async function acceptBid(
    bidId: string,
    deciderId: string,
    deciderRole: string = 'homeowner'
): Promise<ContractorBid> {
    // HGH-006: Use canonical transaction() utility instead of manual BEGIN/COMMIT
    const bid = await transaction(async (client) => {
        // Get the bid
        // M-001 FIX: Explicit column list — prevents schema drift.
        const bidRes = await client.query(
            `SELECT bid_id, engineer_id, contractor_id, project_id,
                    proposed_cost, currency, estimated_days, cover_letter,
                    methodology, status, engineer_score_snapshot,
                    submitted_at, responded_at, expires_at
             FROM contractor_bids WHERE bid_id = $1 AND status = 'pending'`,
            [bidId]
        );

        if (bidRes.rows.length === 0) {
            throw new Error('Bid not found or not in pending status');
        }

        const foundBid = bidRes.rows[0];

        // DT-IDOR-002 FIX: Verify deciderId owns the project (admin bypasses)
        if (deciderRole !== 'admin') {
            const projectCheck = await client.query<{ homeowner_id: string }>(
                'SELECT homeowner_id FROM projects WHERE project_id = $1',
                [foundBid.project_id]
            );
            if (!projectCheck.rows[0] || projectCheck.rows[0].homeowner_id !== deciderId) {
                throw new Error('Access denied: you do not own this project');
            }
        }
        const bidderId = foundBid.contractor_id || foundBid.engineer_id;

        // Accept this bid
        await client.query(
            `UPDATE contractor_bids SET status = 'accepted', responded_at = NOW() WHERE bid_id = $1`,
            [bidId]
        );

        // Reject all other bids for this project
        await client.query(
            `UPDATE contractor_bids SET status = 'rejected', responded_at = NOW()
             WHERE project_id = $1 AND bid_id != $2 AND status = 'pending'`,
            [foundBid.project_id, bidId]
        );

        // Assign contractor to project (or engineer for backward compat)
        if (foundBid.contractor_id) {
            await client.query(
                `UPDATE projects SET assigned_contractor_id = $1, status = 'pending_execution'
                 WHERE project_id = $2`,
                [foundBid.contractor_id, foundBid.project_id]
            );
        } else {
            // Legacy path: engineer submitted bid directly
            await client.query(
                `UPDATE projects SET assigned_engineer_id = $1, status = 'pending_assessment'
                 WHERE project_id = $2`,
                [foundBid.engineer_id, foundBid.project_id]
            );
        }

        // Recalculate bid_win_rate
        await client.query(
            `UPDATE users SET
                bid_win_rate = COALESCE(
                    (SELECT ROUND(
                        COUNT(*) FILTER (WHERE status = 'accepted')::DECIMAL /
                        NULLIF(COUNT(*), 0) * 100,
                    2) FROM contractor_bids WHERE engineer_id = $1 OR contractor_id = $1),
                0)
            WHERE user_id = $1`,
            [bidderId]
        );

        return { ...foundBid, status: 'accepted' as BidStatus };
    });

    // Recalculate score outside transaction (non-critical)
    const bidderId = bid.contractor_id || bid.engineer_id;
    try {
        await recalculateScore(bidderId);
    } catch (err) {
        logger.error('Score recalculation failed', { bidderId, error: err instanceof Error ? err.message : String(err) });
    }

    return bid;
}

/**
 * Get engineer score breakdown.
 */
// P2-005 FIX: Uses shared calculateScoringFactors() — single source of truth
export async function getEngineerScoreBreakdown(engineerId: string): Promise<{
    user_id: string;
    full_name: string;
    dynamic_score: number;
    factors: {
        completed_projects: { value: number; raw: number; weight: number };
        response_speed: { value: number; raw: number | null; weight: number };
        bid_win_rate: { value: number; raw: number | null; weight: number };
        license_status: { value: number; has_license: boolean; has_guild: boolean; weight: number };
    };
}> {
    const { rows } = await pool.query(
        `SELECT user_id, full_name, dynamic_score, completed_projects_count,
                avg_response_hours, bid_win_rate,
                engineering_license_number, guild_membership_id
         FROM users WHERE user_id = $1 AND role = 'engineer'`,
        [engineerId]
    );

    if (rows.length === 0) {
        throw new Error(`Engineer ${engineerId} not found`);
    }

    const eng = rows[0];
    const factors = calculateScoringFactors(eng);

    return {
        user_id: eng.user_id,
        full_name: eng.full_name,
        dynamic_score: parseFloat(eng.dynamic_score),
        factors: {
            completed_projects: {
                value: Math.round(factors.projectsFactor * 100) / 100,
                raw: eng.completed_projects_count,
                weight: SCORE_WEIGHTS.completed_projects,
            },
            response_speed: {
                value: Math.round(factors.responseFactor * 100) / 100,
                raw: eng.avg_response_hours,
                weight: SCORE_WEIGHTS.response_speed,
            },
            bid_win_rate: {
                value: Math.round(factors.winFactor * 100) / 100,
                raw: eng.bid_win_rate,
                weight: SCORE_WEIGHTS.bid_win_rate,
            },
            license_status: {
                value: factors.licenseFactor,
                has_license: !!eng.engineering_license_number,
                has_guild: !!eng.guild_membership_id,
                weight: SCORE_WEIGHTS.license_status,
            },
        },
    };
}
