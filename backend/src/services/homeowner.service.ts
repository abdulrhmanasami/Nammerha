// ============================================================================
// Nammerha Backend — Homeowner Service (صاحب البيت / المتضرر)
// Dual mode: Reconstruction (damage report → engineer → contractor → escrow)
//          + Quick Repair (Thumbtack service request → tradesperson)
// ============================================================================
import { query, transaction } from '../config/database';
import type { RequestUrgency, TradeType } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HomeownerStats {
    active_projects: number;
    completed_projects: number;
    pending_approvals: number;
    active_service_requests: number;
    total_invested: number;         // cents — escrow deposits
    total_bids_received: number;
}

export interface HomeownerProject {
    project_id: string;
    title: string;
    damage_type: string;
    status: string;
    region: string | null;
    engineer_name: string | null;
    contractor_name: string | null;
    bid_count: number;
    total_boq_cost: number;         // cents
    created_at: Date;
}

export interface BidComparison {
    bid_id: string;
    bidder_id: string;
    bidder_name: string;
    bidder_role: string;
    proposed_cost: number;          // cents
    estimated_days: number;
    cover_letter: string | null;
    methodology: string | null;
    bidder_score: number;
    bid_win_rate: number;
    status: string;
    submitted_at: Date;
}

export interface HomeownerServiceRequest {
    request_id: string;
    trade_needed: string;
    title: string;
    description: string | null;
    address_text: string | null;
    urgency: string;
    budget_min: number | null;
    budget_max: number | null;
    status: string;
    tradesperson_name: string | null;
    tradesperson_trade: string | null;
    created_at: Date;
    matched_at: Date | null;
}

export interface PendingApproval {
    approval_id: string;
    project_id: string;
    project_title: string;
    title: string;
    description: string | null;
    engineer_name: string;
    status: string;
    created_at: Date;
}

export interface EscrowSummary {
    total_deposited: number;        // cents
    total_released: number;         // cents
    held_in_escrow: number;         // cents
    projects_with_escrow: number;
}

// ─── 1. My Projects ────────────────────────────────────────────────────────

/**
 * Get all homeowner's projects with assigned parties and bid counts.
 */
export async function getMyProjects(
    homeownerId: string,
): Promise<HomeownerProject[]> {
    const result = await query<HomeownerProject>(
        `SELECT
            p.project_id,
            p.title,
            p.damage_type,
            p.status,
            p.region,
            eng.full_name AS engineer_name,
            con.full_name AS contractor_name,
            COALESCE(bc.bid_count, 0)::INT AS bid_count,
            COALESCE(boq.total_cost, 0)::INT AS total_boq_cost,
            p.created_at
         FROM projects p
         LEFT JOIN users eng ON eng.user_id = p.assigned_engineer_id
         LEFT JOIN users con ON con.user_id = p.assigned_contractor_id
         LEFT JOIN (
            SELECT project_id, COUNT(*) AS bid_count
            FROM contractor_bids
            WHERE status IN ('pending', 'accepted')
            GROUP BY project_id
         ) bc ON bc.project_id = p.project_id
         LEFT JOIN (
             -- P2-BE-001 FIX: BIGINT cast for consistent financial arithmetic
             SELECT project_id, SUM(unit_price::BIGINT * required_quantity::BIGINT) AS total_cost
             FROM itemized_boq
             GROUP BY project_id
         ) boq ON boq.project_id = p.project_id
         WHERE p.homeowner_id = $1
         ORDER BY p.created_at DESC`,
        [homeownerId],
    );
    return result.rows;
}

// ─── 2. Dashboard KPIs ─────────────────────────────────────────────────────

/**
 * Aggregate homeowner KPIs across reconstruction + service requests.
 */
export async function getMyStats(
    homeownerId: string,
): Promise<HomeownerStats> {
    // P2-NEW-002 FIX: Consolidated 4 sequential queries into 1.
    // Before: 4 round-trips per dashboard load. Now: 1.
    const result = await query<{
        active: string;
        completed: string;
        total_bids: string;
        pending_approvals: string;
        active_service_requests: string;
        total_invested: string;
    }>(
        `SELECT
            -- Project stats with bid count
            (SELECT COUNT(*) FROM projects
             WHERE homeowner_id = $1
             AND status NOT IN ('completed', 'cancelled', 'draft')
            ) AS active,
            (SELECT COUNT(*) FROM projects
             WHERE homeowner_id = $1
             AND status = 'completed'
            ) AS completed,
            (SELECT COUNT(*) FROM contractor_bids cb
             JOIN projects p ON p.project_id = cb.project_id
             WHERE p.homeowner_id = $1 AND cb.status = 'pending'
            ) AS total_bids,

            -- Pending approvals
            (SELECT COUNT(*) FROM project_approvals pa
             JOIN projects p ON p.project_id = pa.project_id
             WHERE p.homeowner_id = $1 AND pa.status = 'pending'
            ) AS pending_approvals,

            -- Active service requests
            (SELECT COUNT(*) FROM service_requests
             WHERE homeowner_id = $1 AND status IN ('open', 'matched', 'in_progress')
            ) AS active_service_requests,

            -- Escrow total
            (SELECT COALESCE(SUM(el.amount_locked), 0)
             FROM escrow_ledger el
             JOIN projects p ON p.project_id = el.project_id
             WHERE p.homeowner_id = $1 AND el.payment_status = 'locked'
            ) AS total_invested`,
        [homeownerId],
    );

    const r = result.rows[0];
    return {
        active_projects: parseInt(r?.active ?? '0', 10),
        completed_projects: parseInt(r?.completed ?? '0', 10),
        pending_approvals: parseInt(r?.pending_approvals ?? '0', 10),
        active_service_requests: parseInt(r?.active_service_requests ?? '0', 10),
        total_invested: parseInt(r?.total_invested ?? '0', 10),
        total_bids_received: parseInt(r?.total_bids ?? '0', 10),
    };
}

// ─── 3. Bid Comparison ─────────────────────────────────────────────────────

/**
 * Get all bids for a specific project, with bidder scores for comparison.
 */
export async function getProjectBids(
    homeownerId: string,
    projectId: string,
): Promise<BidComparison[]> {
    // Verify ownership
    const ownerCheck = await query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM projects WHERE project_id = $1 AND homeowner_id = $2`,
        [projectId, homeownerId],
    );
    if (parseInt(ownerCheck.rows[0]?.cnt ?? '0', 10) === 0) {
        throw new Error('Project not found or you are not the owner');
    }

    const result = await query<BidComparison>(
        `SELECT
            cb.bid_id,
            COALESCE(cb.contractor_id, cb.engineer_id) AS bidder_id,
            u.full_name AS bidder_name,
            u.role AS bidder_role,
            cb.proposed_cost,
            cb.estimated_days,
            cb.cover_letter,
            cb.methodology,
            COALESCE(u.dynamic_score, 0) AS bidder_score,
            COALESCE(u.bid_win_rate, 0) AS bid_win_rate,
            cb.status,
            cb.submitted_at
         FROM contractor_bids cb
         JOIN users u ON u.user_id = COALESCE(cb.contractor_id, cb.engineer_id)
         WHERE cb.project_id = $1
         ORDER BY cb.engineer_score_snapshot DESC, cb.proposed_cost ASC`,
        [projectId],
    );
    return result.rows;
}

// ─── 4. Create Service Request (Thumbtack) ──────────────────────────────────

export interface CreateServiceRequestDTO {
    trade_needed: TradeType;
    title: string;
    description?: string;
    address_text?: string;
    urgency?: RequestUrgency;
    budget_min?: number;         // cents
    budget_max?: number;         // cents
    gps_lat?: number;
    gps_lng?: number;
}

/**
 * Homeowner creates a service request for a quick repair.
 */
export async function createServiceRequest(
    homeownerId: string,
    dto: CreateServiceRequestDTO,
): Promise<{ request_id: string; status: string }> {
    // CRT-NEW-001 FIX: Parameterized PostGIS query.
    // Previous implementation interpolated dto.gps_lng/gps_lat directly into
    // the SQL string — a classic SQL injection vector. Now uses CASE + casts.
    const hasGps = dto.gps_lat !== null && dto.gps_lat !== undefined
        && dto.gps_lng !== null && dto.gps_lng !== undefined;

    const result = await query<{ request_id: string }>(
        `INSERT INTO service_requests
            (homeowner_id, trade_needed, title, description, address_text,
             urgency, budget_min, budget_max, gps_location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 CASE WHEN $9::boolean
                      THEN ST_SetSRID(ST_MakePoint($10::float8, $11::float8), 4326)
                      ELSE NULL END)
         RETURNING request_id`,
        [
            homeownerId,
            dto.trade_needed,
            dto.title,
            dto.description || null,
            dto.address_text || null,
            dto.urgency || 'routine',
            dto.budget_min || null,
            dto.budget_max || null,
            hasGps,
            hasGps ? Number(dto.gps_lng) : null,
            hasGps ? Number(dto.gps_lat) : null,
        ],
    );

    const row = result.rows[0];
    if (!row) {
        throw new Error('Failed to create service request');
    }

    return { request_id: row.request_id, status: 'open' };
}

// ─── 5. My Service Requests ─────────────────────────────────────────────────

/**
 * List homeowner's service requests with matched tradesperson info.
 */
export async function getMyServiceRequests(
    homeownerId: string,
): Promise<HomeownerServiceRequest[]> {
    const result = await query<HomeownerServiceRequest>(
        `SELECT
            sr.request_id,
            sr.trade_needed,
            sr.title,
            sr.description,
            sr.address_text,
            sr.urgency,
            sr.budget_min,
            sr.budget_max,
            sr.status,
            tp.full_name AS tradesperson_name,
            tp.trade AS tradesperson_trade,
            sr.created_at,
            sr.matched_at
         FROM service_requests sr
         LEFT JOIN users tp ON tp.user_id = sr.assigned_tradesperson_id
         WHERE sr.homeowner_id = $1
         ORDER BY sr.created_at DESC
         LIMIT 50`,
        [homeownerId],
    );
    return result.rows;
}

// ─── 6. Pending Approvals ───────────────────────────────────────────────────

/**
 * Get approvals where homeowner needs to make a decision.
 */
export async function getMyApprovals(
    homeownerId: string,
    statusFilter?: string,
): Promise<PendingApproval[]> {
    let sql = `
        SELECT
            pa.approval_id,
            pa.project_id,
            p.title AS project_title,
            pa.title,
            pa.description,
            eng.full_name AS engineer_name,
            pa.status,
            pa.created_at
        FROM project_approvals pa
        JOIN projects p ON p.project_id = pa.project_id
        LEFT JOIN users eng ON eng.user_id = pa.requested_by
        WHERE p.homeowner_id = $1`;
    const params: unknown[] = [homeownerId];

    if (statusFilter) {
        sql += ` AND pa.status = $2`;
        params.push(statusFilter);
    }

    sql += ` ORDER BY pa.created_at DESC`;

    const result = await query<PendingApproval>(sql, params);
    return result.rows;
}

// ─── 7. Escrow Summary ─────────────────────────────────────────────────────

/**
 * Aggregate escrow totals across all homeowner's projects.
 */
export async function getMyEscrowSummary(
    homeownerId: string,
): Promise<EscrowSummary> {
    const result = await query<{
        deposited: string;
        released: string;
        project_count: string;
    }>(
        `SELECT
            COALESCE(SUM(el.amount_locked) FILTER (WHERE el.payment_status = 'locked'), 0) AS deposited,
            COALESCE(SUM(el.amount_locked) FILTER (WHERE el.payment_status = 'released'), 0) AS released,
            COUNT(DISTINCT el.project_id) AS project_count
         FROM escrow_ledger el
         JOIN projects p ON p.project_id = el.project_id
         WHERE p.homeowner_id = $1`,
        [homeownerId],
    );

    const r = result.rows[0];
    const deposited = parseInt(r?.deposited ?? '0', 10);
    const released = parseInt(r?.released ?? '0', 10);

    return {
        total_deposited: deposited,
        total_released: released,
        held_in_escrow: deposited - released,
        projects_with_escrow: parseInt(r?.project_count ?? '0', 10),
    };
}

// ─── Cancel Service Request ─────────────────────────────────────────────────

/**
 * Homeowner cancels an open service request.
 */
export function cancelServiceRequest(
    homeownerId: string,
    requestId: string,
): Promise<{ request_id: string; status: string }> {
    // P1-NEW-003 FIX: Wrapped in transaction with FOR UPDATE to prevent
    // TOCTOU race — concurrent cancellation could conflict with acceptance.
    return transaction(async (client) => {
        const check = await client.query<{ status: string; homeowner_id: string }>(
            `SELECT status, homeowner_id FROM service_requests WHERE request_id = $1 FOR UPDATE`,
            [requestId],
        );

        const row = check.rows[0];
        if (!row) {
            throw new Error('Service request not found');
        }

        if (row.homeowner_id !== homeownerId) {
            throw new Error('You are not the owner of this request');
        }

        if (!['open', 'matched'].includes(row.status)) {
            throw new Error('Can only cancel open or matched requests');
        }

        await client.query(
            `UPDATE service_requests SET status = 'cancelled' WHERE request_id = $1`,
            [requestId],
        );

        return { request_id: requestId, status: 'cancelled' };
    });
}
