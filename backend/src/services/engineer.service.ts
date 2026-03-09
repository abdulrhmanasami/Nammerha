// ============================================================================
// Nammerha Backend — Engineer Service
// Engineer journey: project listing, dashboard KPIs, bid history,
// profile/score, and recent captures.
// ============================================================================
import { query } from '../config/database';
import type { EngineerStats, EngineerProject } from '../types';

// ─── My Assigned Projects ───────────────────────────────────────────────────

/**
 * Get all projects assigned to this engineer.
 * Includes BOQ count, funded percentage (progress), and construction phase.
 * Optionally filter by project status.
 */
export async function getMyProjects(
    engineerId: string,
    status?: string,
): Promise<EngineerProject[]> {
    let sql = `
        SELECT
            p.project_id,
            p.title,
            COALESCE(p.region, '') AS region,
            p.status,
            COALESCE(p.construction_phase, p.status) AS phase,
            COALESCE(p.funded_percentage, 0)::int AS progress,
            (SELECT COUNT(*) FROM itemized_boq WHERE project_id = p.project_id)::int AS boq_count,
            NULL AS next_proof_due,
            p.created_at
        FROM projects p
        WHERE p.assigned_engineer_id = $1`;
    const params: unknown[] = [engineerId];

    if (status) {
        sql += ` AND p.status = $2`;
        params.push(status);
    }

    sql += ` ORDER BY p.created_at DESC`;

    const result = await query<EngineerProject>(sql, params);
    return result.rows;
}

// ─── Dashboard KPIs ─────────────────────────────────────────────────────────

/**
 * Aggregate KPIs for the engineer dashboard.
 * Uses conditional aggregation for efficiency.
 */
export async function getMyStats(engineerId: string): Promise<EngineerStats> {
    // 1. Project + proof stats
    const projectRes = await query<{
        assigned_projects: string;
        proofs_pending: string;
        proofs_verified: string;
        escrow_released: string;
    }>(
        `SELECT
            (SELECT COUNT(*) FROM projects WHERE assigned_engineer_id = $1) AS assigned_projects,
            (SELECT COUNT(*) FROM spatial_proofs sp
             JOIN projects p ON p.project_id = sp.project_id
             WHERE p.assigned_engineer_id = $1 AND sp.verification_status = 'submitted'
            ) AS proofs_pending,
            (SELECT COUNT(*) FROM spatial_proofs sp
             JOIN projects p ON p.project_id = sp.project_id
             WHERE p.assigned_engineer_id = $1 AND sp.verification_status = 'verified'
            ) AS proofs_verified,
            (SELECT COALESCE(SUM(et.amount), 0) FROM escrow_transactions et
             JOIN projects p ON p.project_id = et.project_id
             WHERE p.assigned_engineer_id = $1 AND et.transaction_type = 'release'
            ) AS escrow_released`,
        [engineerId],
    );

    // 2. Bid stats
    const bidRes = await query<{
        active_bids: string;
        total_bids: string;
    }>(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'pending') AS active_bids,
            COUNT(*) AS total_bids
         FROM contractor_bids
         WHERE engineer_id = $1`,
        [engineerId],
    );

    const p = projectRes.rows[0];
    const b = bidRes.rows[0];
    return {
        assigned_projects: parseInt(p?.assigned_projects ?? '0', 10),
        proofs_pending: parseInt(p?.proofs_pending ?? '0', 10),
        proofs_verified: parseInt(p?.proofs_verified ?? '0', 10),
        escrow_released: parseInt(p?.escrow_released ?? '0', 10),
        active_bids: parseInt(b?.active_bids ?? '0', 10),
        total_bids: parseInt(b?.total_bids ?? '0', 10),
    };
}

// ─── My Bids ────────────────────────────────────────────────────────────────

interface EngineerBid {
    bid_id: string;
    project_id: string;
    project_title: string;
    proposed_cost: number;
    estimated_days: number;
    cover_letter: string | null;
    status: string;
    engineer_score_snapshot: number | null;
    submitted_at: Date;
    responded_at: Date | null;
}

/**
 * Get all bids submitted by this engineer.
 * Joins project title for context. Optionally filter by bid status.
 */
export async function getMyBids(
    engineerId: string,
    status?: string,
): Promise<EngineerBid[]> {
    let sql = `
        SELECT
            cb.bid_id,
            cb.project_id,
            p.title AS project_title,
            cb.proposed_cost,
            cb.estimated_days,
            cb.cover_letter,
            cb.status,
            cb.engineer_score_snapshot,
            cb.submitted_at,
            cb.responded_at
        FROM contractor_bids cb
        JOIN projects p ON p.project_id = cb.project_id
        WHERE cb.engineer_id = $1`;
    const params: unknown[] = [engineerId];

    if (status) {
        sql += ` AND cb.status = $2`;
        params.push(status);
    }

    sql += ` ORDER BY cb.submitted_at DESC`;

    const result = await query<EngineerBid>(sql, params);
    return result.rows;
}

// ─── My Profile / Score ─────────────────────────────────────────────────────

interface EngineerProfile {
    user_id: string;
    full_name: string;
    specialty: string | null;
    engineering_license_number: string | null;
    guild_membership_id: string | null;
    dynamic_score: number;
    completed_projects_count: number;
    active_projects_count: number;
    total_bids: number;
    bid_win_rate: number;
}

/**
 * Get engineer's own profile with score and performance metrics.
 */
export async function getMyProfile(
    engineerId: string,
): Promise<EngineerProfile> {
    const result = await query<EngineerProfile>(
        `SELECT
            u.user_id,
            u.full_name,
            u.specialty,
            u.engineering_license_number,
            u.guild_membership_id,
            COALESCE(u.dynamic_score, 0) AS dynamic_score,
            (SELECT COUNT(*) FROM projects
             WHERE assigned_engineer_id = $1 AND status IN ('completed', 'delivered')
            )::int AS completed_projects_count,
            (SELECT COUNT(*) FROM projects
             WHERE assigned_engineer_id = $1 AND status NOT IN ('completed', 'delivered', 'cancelled')
            )::int AS active_projects_count,
            (SELECT COUNT(*) FROM contractor_bids WHERE engineer_id = $1)::int AS total_bids,
            COALESCE(
                (SELECT COUNT(*) FILTER (WHERE status = 'accepted')::float
                 / NULLIF(COUNT(*), 0)
                 FROM contractor_bids WHERE engineer_id = $1
                ), 0
            ) AS bid_win_rate
         FROM users u
         WHERE u.user_id = $1`,
        [engineerId],
    );

    if (result.rows.length === 0) {
        throw new Error('Engineer not found');
    }

    return result.rows[0] as EngineerProfile;
}

// ─── My Recent Captures ─────────────────────────────────────────────────────

interface EngineerCapture {
    capture_id: string;
    project_id: string;
    project_title: string;
    capture_type: string;
    construction_phase: string;
    title: string | null;
    file_url: string;
    is_verified: boolean;
    captured_at: Date;
}

/**
 * Get recent reality captures by this engineer across all projects.
 */
export async function getMyCaptures(
    engineerId: string,
    limit = 20,
): Promise<EngineerCapture[]> {
    const result = await query<EngineerCapture>(
        `SELECT
            rc.capture_id,
            rc.project_id,
            p.title AS project_title,
            rc.capture_type,
            rc.construction_phase,
            rc.title,
            rc.file_url,
            rc.is_verified,
            rc.captured_at
         FROM reality_captures rc
         JOIN projects p ON p.project_id = rc.project_id
         WHERE rc.engineer_id = $1
         ORDER BY rc.captured_at DESC
         LIMIT $2`,
        [engineerId, limit],
    );
    return result.rows;
}
