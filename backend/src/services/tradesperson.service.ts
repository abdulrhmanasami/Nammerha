// ============================================================================
// Nammerha Backend — Tradesperson Service (أصحاب المهن)
// Dual-mode: Thumbtack (direct homeowner requests) + Subcontractor (under contractor)
// ============================================================================
import { query, transaction } from '../config/database';
import type { TradespersonStats, ServiceRequest, TradeAssignment } from '../types';

// NMR-AUD-201 FIX: Single source of truth for hourly-rate earnings calculation.
// Previously getMyStats() used this value (default 10) but getMyEarnings() hardcoded 8,
// causing dashboard KPIs and earnings detail tab to show different totals.
const WORK_HOURS_PER_DAY = parseInt(process.env['WORK_HOURS_PER_DAY'] ?? '10', 10);

// ─── My Profile ─────────────────────────────────────────────────────────────

interface TradespersonProfile {
    user_id: string;
    full_name: string;
    trade: string | null;
    secondary_trades: string[] | null;
    hourly_rate: number | null;
    daily_rate: number | null;
    availability: string;
    years_experience: number | null;
    completed_jobs_count: number;
    average_rating: number | null;
    dynamic_score: number;
    specialty: string | null;
}

/**
 * Get tradesperson's own profile with trade info, rates, and rating.
 */
export async function getMyProfile(
    tradespersonId: string,
): Promise<TradespersonProfile> {
    const result = await query<TradespersonProfile>(
        `SELECT
            u.user_id,
            u.full_name,
            u.trade,
            u.secondary_trades,
            u.hourly_rate,
            u.daily_rate,
            COALESCE(u.availability, 'offline') AS availability,
            u.years_experience,
            u.completed_jobs_count,
            u.average_rating,
            COALESCE(u.dynamic_score, 0) AS dynamic_score,
            u.specialty
         FROM users u
         WHERE u.user_id = $1`,
        [tradespersonId],
    );

    if (result.rows.length === 0) {
        throw new Error('Tradesperson not found');
    }

    return result.rows[0] as TradespersonProfile;
}

// ─── Dashboard KPIs ─────────────────────────────────────────────────────────

/**
 * Aggregate tradesperson KPIs across both operating modes.
 */
export async function getMyStats(
    tradespersonId: string,
): Promise<TradespersonStats> {
    // P2-NEW-001 FIX: Consolidated 5 sequential queries into 1.
    // Before: 5 round-trips per dashboard load. Now: 1.
    const result = await query<{
        active_requests: string;
        completed_requests: string;
        active_assignments: string;
        completed_assignments: string;
        pending_requests: string;
        total_earnings: string;
        avg_rating: string | null;
    }>(
        `SELECT
            -- Direct jobs (service requests)
            (SELECT COUNT(*) FILTER (WHERE status = 'in_progress')
             FROM service_requests WHERE assigned_tradesperson_id = $1
            ) AS active_requests,
            (SELECT COUNT(*) FILTER (WHERE status = 'completed')
             FROM service_requests WHERE assigned_tradesperson_id = $1
            ) AS completed_requests,

            -- Contractor assignments
            (SELECT COUNT(*) FILTER (WHERE status IN ('accepted', 'in_progress'))
             FROM trade_assignments WHERE tradesperson_id = $1
            ) AS active_assignments,
            (SELECT COUNT(*) FILTER (WHERE status = 'completed')
             FROM trade_assignments WHERE tradesperson_id = $1
            ) AS completed_assignments,

            -- Pending requests matching my trade
            (SELECT COUNT(*)
             FROM service_requests sr
             JOIN users u ON u.user_id = $1
             WHERE sr.status = 'open'
             AND sr.trade_needed = u.trade
             AND sr.assigned_tradesperson_id IS NULL
            ) AS pending_requests,

            -- Total earnings from completed assignments
            (SELECT COALESCE(SUM(
                CASE
                    WHEN ta.rate_type = 'fixed' THEN ta.agreed_rate
                    WHEN ta.rate_type = 'daily' THEN ta.agreed_rate * COALESCE(ta.estimated_days, 1)
                    ELSE ta.agreed_rate * ${WORK_HOURS_PER_DAY} * COALESCE(ta.estimated_days, 1)
                END
             ), 0)
             FROM trade_assignments ta
             WHERE ta.tradesperson_id = $1 AND ta.status = 'completed'
            ) AS total_earnings,

            -- Rating
            (SELECT average_rating FROM users WHERE user_id = $1
            ) AS avg_rating`,
        [tradespersonId],
    );

    const r = result.rows[0];

    return {
        active_jobs: parseInt(r?.active_requests ?? '0', 10) +
            parseInt(r?.active_assignments ?? '0', 10),
        completed_jobs: parseInt(r?.completed_requests ?? '0', 10) +
            parseInt(r?.completed_assignments ?? '0', 10),
        pending_requests: parseInt(r?.pending_requests ?? '0', 10),
        active_assignments: parseInt(r?.active_assignments ?? '0', 10),
        total_earnings: parseInt(r?.total_earnings ?? '0', 10),
        average_rating: r?.avg_rating
            ? parseFloat(r.avg_rating)
            : null,
    };
}

// ─── Available Service Requests (Thumbtack Mode) ────────────────────────────

/**
 * Get open service requests matching tradesperson's primary trade.
 */
export async function getAvailableRequests(
    tradespersonId: string,
): Promise<ServiceRequest[]> {
    const result = await query<ServiceRequest>(
        `SELECT
            sr.request_id,
            sr.homeowner_id,
            u.full_name AS homeowner_name,
            sr.trade_needed,
            sr.title,
            sr.description,
            sr.address_text,
            sr.urgency,
            sr.budget_min,
            sr.budget_max,
            sr.status,
            sr.created_at
         FROM service_requests sr
         JOIN users u ON u.user_id = sr.homeowner_id
         WHERE sr.status = 'open'
         AND sr.assigned_tradesperson_id IS NULL
         AND sr.trade_needed = (SELECT trade FROM users WHERE user_id = $1)
         ORDER BY
            CASE sr.urgency
                WHEN 'emergency' THEN 1
                WHEN 'urgent' THEN 2
                ELSE 3
            END,
            sr.created_at DESC
         LIMIT 50`,
        [tradespersonId],
    );
    return result.rows;
}

// ─── Accept Service Request ─────────────────────────────────────────────────

/**
 * Accept a service request (Thumbtack mode). Assigns tradesperson to the request.
 */
export function acceptRequest(
    tradespersonId: string,
    requestId: string,
): Promise<{ request_id: string; status: string }> {
    // P1-NEW-001 FIX: Wrapped in transaction with FOR UPDATE.
    // Previous code had a TOCTOU race: two tradespersons could pass the
    // 'status === open' check concurrently — last writer wins silently.
    return transaction(async (client) => {
        // Lock the row to prevent concurrent acceptance
        const check = await client.query<{ status: string; trade_needed: string }>(
            `SELECT status, trade_needed FROM service_requests WHERE request_id = $1 FOR UPDATE`,
            [requestId],
        );

        const checkedRequest = check.rows[0];
        if (!checkedRequest) {
            throw new Error('Service request not found');
        }

        if (checkedRequest.status !== 'open') {
            throw new Error('Request is no longer available');
        }

        // Verify tradesperson matches the trade
        const tradeCheck = await client.query<{ trade: string }>(
            `SELECT trade FROM users WHERE user_id = $1`,
            [tradespersonId],
        );

        if (tradeCheck.rows[0]?.trade !== checkedRequest.trade_needed) {
            throw new Error('Your trade does not match this request');
        }

        // Assign tradesperson
        await client.query(
            `UPDATE service_requests
             SET assigned_tradesperson_id = $1, status = 'matched', matched_at = NOW()
             WHERE request_id = $2`,
            [tradespersonId, requestId],
        );

        return { request_id: requestId, status: 'matched' };
    });
}

// ─── My Contractor Assignments (Subcontractor Mode) ─────────────────────────

/**
 * Get all assignments from contractors on larger projects.
 */
export async function getMyAssignments(
    tradespersonId: string,
    status?: string,
): Promise<TradeAssignment[]> {
    let sql = `
        SELECT
            ta.assignment_id,
            ta.contractor_id,
            con.full_name AS contractor_name,
            ta.project_id,
            p.title AS project_title,
            ta.trade_required,
            ta.scope_description,
            ta.agreed_rate,
            ta.rate_type,
            ta.estimated_days,
            ta.status,
            ta.start_date,
            ta.end_date,
            ta.created_at
        FROM trade_assignments ta
        JOIN users con ON con.user_id = ta.contractor_id
        JOIN projects p ON p.project_id = ta.project_id
        WHERE ta.tradesperson_id = $1`;
    const params: unknown[] = [tradespersonId];

    if (status) {
        sql += ` AND ta.status = $2`;
        params.push(status);
    }

    sql += ` ORDER BY ta.created_at DESC`;

    const result = await query<TradeAssignment>(sql, params);
    return result.rows;
}

// ─── Respond to Assignment ──────────────────────────────────────────────────

/**
 * Accept or decline a contractor assignment.
 */
export function respondToAssignment(
    tradespersonId: string,
    assignmentId: string,
    accept: boolean,
): Promise<{ assignment_id: string; status: string }> {
    // P1-NEW-002 FIX: Wrapped in transaction with FOR UPDATE.
    // Previous code had a TOCTOU race: concurrent accept/decline could conflict.
    return transaction(async (client) => {
        const check = await client.query<{ status: string; tradesperson_id: string }>(
            `SELECT status, tradesperson_id FROM trade_assignments WHERE assignment_id = $1 FOR UPDATE`,
            [assignmentId],
        );

        const checkedAssignment = check.rows[0];
        if (!checkedAssignment) {
            throw new Error('Assignment not found');
        }

        if (checkedAssignment.tradesperson_id !== tradespersonId) {
            throw new Error('This assignment is not assigned to you');
        }

        if (checkedAssignment.status !== 'pending') {
            throw new Error('Assignment is no longer pending');
        }

        const newStatus = accept ? 'accepted' : 'declined';
        await client.query(
            `UPDATE trade_assignments
             SET status = $1, responded_at = NOW()
             WHERE assignment_id = $2`,
            [newStatus, assignmentId],
        );

        return { assignment_id: assignmentId, status: newStatus };
    });
}

// ─── My Earnings ────────────────────────────────────────────────────────────

interface EarningRecord {
    source_type: string;       // 'service_request' | 'assignment'
    source_id: string;
    title: string;
    amount: number;
    rate_type: string | null;
    status: string;
    completed_at: Date | null;
}

/**
 * Get earnings from completed jobs (both modes).
 */
export async function getMyEarnings(
    tradespersonId: string,
    limit = 50,
): Promise<EarningRecord[]> {
    const result = await query<EarningRecord>(
        `-- Completed assignments (subcontractor)
         SELECT
            'assignment' AS source_type,
            ta.assignment_id AS source_id,
            p.title AS title,
            CASE
                WHEN ta.rate_type = 'fixed' THEN ta.agreed_rate
                WHEN ta.rate_type = 'daily' THEN ta.agreed_rate * COALESCE(ta.estimated_days, 1)
                ELSE ta.agreed_rate * ${WORK_HOURS_PER_DAY} * COALESCE(ta.estimated_days, 1)
            END AS amount,
            ta.rate_type,
            ta.status,
            ta.completed_at
         FROM trade_assignments ta
         JOIN projects p ON p.project_id = ta.project_id
         WHERE ta.tradesperson_id = $1 AND ta.status = 'completed'

         UNION ALL

         -- Completed direct requests (Thumbtack)
         SELECT
            'service_request' AS source_type,
            sr.request_id AS source_id,
            sr.title AS title,
            COALESCE(sr.budget_max, sr.budget_min, 0) AS amount,
            NULL AS rate_type,
            sr.status,
            sr.completed_at
         FROM service_requests sr
         WHERE sr.assigned_tradesperson_id = $1 AND sr.status = 'completed'

         ORDER BY completed_at DESC NULLS LAST
         LIMIT $2`,
        [tradespersonId, limit],
    );
    return result.rows;
}

// ─── Update Availability ────────────────────────────────────────────────────

/**
 * Toggle tradesperson availability for matching.
 */
export async function updateAvailability(
    tradespersonId: string,
    status: 'available' | 'busy' | 'offline',
): Promise<{ availability: string }> {
    const validStatuses = ['available', 'busy', 'offline'];
    if (!validStatuses.includes(status)) {
        throw new Error(`Invalid availability status. Must be: ${validStatuses.join(', ')}`);
    }

    await query(
        `UPDATE users SET availability = $1 WHERE user_id = $2`,
        [status, tradespersonId],
    );

    return { availability: status };
}
