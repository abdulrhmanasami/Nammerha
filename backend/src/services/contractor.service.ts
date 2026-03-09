// ============================================================================
// Nammerha Backend — Contractor Service
// Contractor (مقاول/متعهد): executes construction, manages workers, bids.
// Separated from Engineer (مهندس) per FIDIC duty-of-care.
// ============================================================================
import { query } from '../config/database';
import type { ContractorStats, AvailableProject, ContractorPayment } from '../types';

// ─── My Assigned Projects ───────────────────────────────────────────────────

interface ContractorProject {
    project_id: string;
    title: string;
    region: string;
    status: string;
    phase: string;
    progress: number;
    boq_count: number;
    engineer_name: string | null;
    created_at: Date;
}

/**
 * Get all projects where this contractor is assigned as executor.
 */
export async function getMyProjects(
    contractorId: string,
    status?: string,
): Promise<ContractorProject[]> {
    let sql = `
        SELECT
            p.project_id,
            p.title,
            COALESCE(p.region, '') AS region,
            p.status,
            COALESCE(p.construction_phase, p.status) AS phase,
            COALESCE(p.funded_percentage, 0)::int AS progress,
            (SELECT COUNT(*) FROM itemized_boq WHERE project_id = p.project_id)::int AS boq_count,
            eng.full_name AS engineer_name,
            p.created_at
        FROM projects p
        LEFT JOIN users eng ON eng.user_id = p.assigned_engineer_id
        WHERE p.assigned_contractor_id = $1`;
    const params: unknown[] = [contractorId];

    if (status) {
        sql += ` AND p.status = $2`;
        params.push(status);
    }

    sql += ` ORDER BY p.created_at DESC`;

    const result = await query<ContractorProject>(sql, params);
    return result.rows;
}

// ─── Dashboard KPIs ─────────────────────────────────────────────────────────

/**
 * Aggregate contractor KPIs for dashboard.
 */
export async function getMyStats(contractorId: string): Promise<ContractorStats> {
    // 1. Project stats
    const projectRes = await query<{ active_projects: string }>(
        `SELECT COUNT(*) AS active_projects
         FROM projects WHERE assigned_contractor_id = $1
         AND status NOT IN ('completed', 'delivered', 'cancelled')`,
        [contractorId],
    );

    // 2. Bid stats (check both contractor_id and engineer_id for backward compat)
    const bidRes = await query<{
        pending_bids: string;
        won_bids: string;
        total_bids: string;
    }>(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'pending') AS pending_bids,
            COUNT(*) FILTER (WHERE status = 'accepted') AS won_bids,
            COUNT(*) AS total_bids
         FROM contractor_bids
         WHERE contractor_id = $1 OR engineer_id = $1`,
        [contractorId],
    );

    // 3. Escrow received — CRT-NEW-003 FIX: escrow_transactions → escrow_ledger (actual table)
    const escrowRes = await query<{ total_escrow: string }>(
        `SELECT COALESCE(SUM(el.amount_locked), 0) AS total_escrow
         FROM escrow_ledger el
         JOIN projects p ON p.project_id = el.project_id
         WHERE p.assigned_contractor_id = $1
         AND el.payment_status = 'released'`,
        [contractorId],
    );

    const p = projectRes.rows[0];
    const b = bidRes.rows[0];
    const e = escrowRes.rows[0];
    const totalBids = parseInt(b?.total_bids ?? '0', 10);
    const wonBids = parseInt(b?.won_bids ?? '0', 10);

    return {
        active_projects: parseInt(p?.active_projects ?? '0', 10),
        pending_bids: parseInt(b?.pending_bids ?? '0', 10),
        won_bids: wonBids,
        total_escrow_received: parseInt(e?.total_escrow ?? '0', 10),
        total_bids: totalBids,
        bid_win_rate: totalBids > 0 ? wonBids / totalBids : 0,
    };
}

// ─── My Bids ────────────────────────────────────────────────────────────────

interface ContractorBid {
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
 * Get all bids submitted by this contractor.
 */
export async function getMyBids(
    contractorId: string,
    status?: string,
): Promise<ContractorBid[]> {
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
        WHERE (cb.contractor_id = $1 OR cb.engineer_id = $1)`;
    const params: unknown[] = [contractorId];

    if (status) {
        sql += ` AND cb.status = $2`;
        params.push(status);
    }

    sql += ` ORDER BY cb.submitted_at DESC`;

    const result = await query<ContractorBid>(sql, params);
    return result.rows;
}

// ─── Available Projects (Marketplace) ───────────────────────────────────────

/**
 * Get published projects matching contractor's specialty and radius.
 * These are projects ready for competitive bidding.
 */
export async function getAvailableProjects(
    contractorId: string,
): Promise<AvailableProject[]> {
    const result = await query<AvailableProject>(
        `SELECT
            p.project_id,
            p.title,
            COALESCE(p.region, '') AS region,
            p.damage_type,
            p.total_estimated_cost,
            (SELECT COUNT(*) FROM itemized_boq WHERE project_id = p.project_id)::int AS boq_count,
            p.published_at,
            (SELECT COUNT(*) FROM contractor_bids
             WHERE project_id = p.project_id AND status = 'pending')::int AS bid_count,
            NULL::float AS distance_km
         FROM projects p
         WHERE p.status = 'published'
         AND p.assigned_contractor_id IS NULL
         AND NOT EXISTS (
             SELECT 1 FROM contractor_bids
             WHERE project_id = p.project_id
             AND (contractor_id = $1 OR engineer_id = $1)
         )
         ORDER BY p.published_at DESC
         LIMIT 50`,
        [contractorId],
    );
    return result.rows;
}

// ─── My Profile / Score ─────────────────────────────────────────────────────

interface ContractorProfile {
    user_id: string;
    full_name: string;
    specialty: string | null;
    commercial_register_number: string | null;
    dynamic_score: number;
    completed_projects_count: number;
    active_projects_count: number;
    total_bids: number;
    bid_win_rate: number;
}

/**
 * Get contractor's own profile with score and performance metrics.
 */
export async function getMyProfile(
    contractorId: string,
): Promise<ContractorProfile> {
    const result = await query<ContractorProfile>(
        `SELECT
            u.user_id,
            u.full_name,
            u.specialty,
            u.commercial_register_number,
            COALESCE(u.dynamic_score, 0) AS dynamic_score,
            (SELECT COUNT(*) FROM projects
             WHERE assigned_contractor_id = $1 AND status IN ('completed', 'delivered')
            )::int AS completed_projects_count,
            (SELECT COUNT(*) FROM projects
             WHERE assigned_contractor_id = $1 AND status NOT IN ('completed', 'delivered', 'cancelled')
            )::int AS active_projects_count,
            (SELECT COUNT(*) FROM contractor_bids
             WHERE contractor_id = $1 OR engineer_id = $1
            )::int AS total_bids,
            COALESCE(
                (SELECT COUNT(*) FILTER (WHERE status = 'accepted')::float
                 / NULLIF(COUNT(*), 0)
                 FROM contractor_bids WHERE contractor_id = $1 OR engineer_id = $1
                ), 0
            ) AS bid_win_rate
         FROM users u
         WHERE u.user_id = $1`,
        [contractorId],
    );

    if (result.rows.length === 0) {
        throw new Error('Contractor not found');
    }

    return result.rows[0] as ContractorProfile;
}

// ─── My Payments / Escrow ───────────────────────────────────────────────────

/**
 * Get escrow transactions for projects assigned to this contractor.
 */
export async function getMyPayments(
    contractorId: string,
    limit = 50,
): Promise<ContractorPayment[]> {
    // CRT-NEW-003 FIX: escrow_transactions → escrow_ledger (actual table)
    const result = await query<ContractorPayment>(
        `SELECT
            el.transaction_id,
            el.project_id,
            p.title AS project_title,
            el.amount_locked AS amount,
            el.payment_status AS transaction_type,
            el.locked_at AS created_at
         FROM escrow_ledger el
         JOIN projects p ON p.project_id = el.project_id
         WHERE p.assigned_contractor_id = $1
         ORDER BY el.locked_at DESC
         LIMIT $2`,
        [contractorId, limit],
    );
    return result.rows;
}
