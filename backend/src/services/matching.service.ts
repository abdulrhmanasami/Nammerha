// ============================================================================
// Nammerha Backend — Donation Matching Service (ENH-7)
// Corporate sponsors pledge to match individual donations at a configurable ratio.
// ============================================================================
import pool, { transaction } from '../config/database';
import { logger } from '../utils/logger';
import type { PoolClient } from 'pg';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MatchingProgram {
    program_id: string;
    sponsor_id: string;
    name: string;
    description: string | null;
    match_ratio: number;
    max_budget: number;          // cents
    spent: number;               // cents
    project_filter: Record<string, unknown> | null;
    is_active: boolean;
    starts_at: Date;
    expires_at: Date | null;
    created_at: Date;
}

export interface MatchingPledge {
    pledge_id: string;
    program_id: string;
    escrow_id: string;
    matched_escrow_id: string | null;
    original_amount: number;     // cents
    match_amount: number;        // cents
    created_at: Date;
}

export interface CreateMatchingProgramDTO {
    name: string;
    description?: string;
    match_ratio: number;         // e.g., 1.0 for 1:1
    max_budget: number;          // cents
    project_filter?: {
        damage_type?: string[];
        region?: string[];
    };
    starts_at?: Date;
    expires_at?: Date;
}

// ─── Program Management ─────────────────────────────────────────────────────

/**
 * Create a new matching program (admin/sponsor action).
 */
export async function createProgram(
    sponsorId: string,
    dto: CreateMatchingProgramDTO,
): Promise<MatchingProgram> {
    const result = await pool.query<MatchingProgram>(
        `INSERT INTO matching_programs
            (sponsor_id, name, description, match_ratio, max_budget,
             project_filter, starts_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING program_id, sponsor_id, name, description, match_ratio,
                  max_budget, spent, project_filter, is_active,
                  starts_at, expires_at, created_at`,
        [
            sponsorId,
            dto.name,
            dto.description ?? null,
            dto.match_ratio,
            dto.max_budget,
            dto.project_filter ? JSON.stringify(dto.project_filter) : null,
            dto.starts_at ?? new Date(),
            dto.expires_at ?? null,
        ],
    );

    const program = result.rows[0];
    if (!program) { throw new Error('Failed to create matching program'); }

    logger.info('ENH-7: Matching program created', {
        program_id: program.program_id,
        sponsor_id: sponsorId,
        name: dto.name,
        ratio: dto.match_ratio,
        budget: dto.max_budget,
    });

    return program;
}

/**
 * Get all active matching programs.
 */
export async function getActivePrograms(): Promise<MatchingProgram[]> {
    const result = await pool.query<MatchingProgram>(
        `SELECT program_id, sponsor_id, name, description, match_ratio,
                max_budget, spent, project_filter, is_active,
                starts_at, expires_at, created_at
         FROM matching_programs
         WHERE is_active = true
           AND starts_at <= NOW()
           AND (expires_at IS NULL OR expires_at > NOW())
           AND spent < max_budget
         ORDER BY created_at DESC`,
    );
    return result.rows;
}

/**
 * Get program stats for admin dashboard.
 */
export async function getProgramStats(programId: string): Promise<{
    program: MatchingProgram;
    total_pledges: number;
    total_matched: number;
    remaining_budget: number;
}> {
    const programResult = await pool.query<MatchingProgram>(
        `SELECT program_id, sponsor_id, name, description, match_ratio,
                max_budget, spent, project_filter, is_active,
                starts_at, expires_at, created_at
         FROM matching_programs WHERE program_id = $1`,
        [programId],
    );
    const program = programResult.rows[0];
    if (!program) { throw new Error('Program not found'); }

    const pledgeResult = await pool.query<{ count: string; total: string }>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(match_amount), 0) AS total
         FROM matching_pledges WHERE program_id = $1`,
        [programId],
    );
    const stats = pledgeResult.rows[0];

    return {
        program,
        total_pledges: parseInt(stats?.count ?? '0', 10),
        total_matched: parseInt(stats?.total ?? '0', 10),
        remaining_budget: program.max_budget - program.spent,
    };
}

// ─── Match Application ─────────────────────────────────────────────────────

/**
 * Find active matching programs that apply to a specific donation.
 * Checks project filters (damage_type, address_text) against the project.
 *
 * F-9 FIX: projects table has no 'region' column — use address_text with ILIKE.
 */
export async function findMatchingPrograms(
    projectId: string,
): Promise<MatchingProgram[]> {
    // Get project details for filter matching
    const projectResult = await pool.query<{
        damage_type: string;
        address_text: string | null;
    }>(
        'SELECT damage_type, address_text FROM projects WHERE project_id = $1',
        [projectId],
    );
    const project = projectResult.rows[0];
    if (!project) { return []; }

    const programs = await getActivePrograms();

    // Filter programs by project criteria
    return programs.filter((p) => {
        if (!p.project_filter) { return true; } // no filter = matches all

        const filter = p.project_filter as {
            damage_type?: string[];
            region?: string[];
        };

        // Check damage_type filter
        if (filter.damage_type && filter.damage_type.length > 0) {
            if (!filter.damage_type.includes(project.damage_type)) {
                return false;
            }
        }

        // F-9 FIX: Check region filter against address_text (projects has no region column)
        if (filter.region && filter.region.length > 0) {
            if (!project.address_text) { return false; }
            const addressLower = project.address_text.toLowerCase();
            const matches = filter.region.some((r) => addressLower.includes(r.toLowerCase()));
            if (!matches) { return false; }
        }

        return true;
    });
}

/**
 * Apply matching to a donation. Called after a successful donation.
 * Creates a matching pledge and corresponding sponsor escrow entry.
 *
 * F-6 FIX: Program selection + spent check moved INTO the transaction
 * with FOR UPDATE lock to prevent TOCTOU budget overrun.
 *
 * @returns Array of applied matches (may be empty if no programs match)
 */
export async function applyMatch(
    escrowId: string,
    donationAmount: number,
    itemId: string,
    projectId: string,
): Promise<MatchingPledge[]> {
    const programs = await findMatchingPrograms(projectId);
    if (programs.length === 0) { return []; }

    const pledges: MatchingPledge[] = [];

    for (const program of programs) {
        try {
            const pledge = await transaction(async (client: PoolClient) => {
                // F-6 FIX: Lock the program row and re-check spent inside transaction
                const lockedResult = await client.query<{
                    program_id: string;
                    max_budget: number;
                    spent: number;
                    match_ratio: number;
                    sponsor_id: string;
                }>(
                    `SELECT program_id, max_budget, spent, match_ratio, sponsor_id
                     FROM matching_programs
                     WHERE program_id = $1
                     FOR UPDATE`,
                    [program.program_id],
                );

                const locked = lockedResult.rows[0];
                if (!locked) { return null; }

                const remainingBudget = locked.max_budget - locked.spent;
                if (remainingBudget <= 0) { return null; }

                // Calculate match amount
                const rawMatch = Math.round(donationAmount * locked.match_ratio);
                const matchAmount = Math.min(rawMatch, remainingBudget);
                if (matchAmount <= 0) { return null; }

                // 1. Create sponsor escrow entry
                const escrowResult = await client.query<{ transaction_id: string }>(
                    `INSERT INTO escrow_ledger
                        (donor_id, item_id, project_id, amount_locked, currency,
                         payment_method, payment_gateway_ref)
                     VALUES ($1, $2, $3, $4, 'USD', 'matching', $5)
                     RETURNING transaction_id`,
                    [
                        locked.sponsor_id,
                        itemId,
                        projectId,
                        matchAmount,
                        `match-${locked.program_id}`,
                    ],
                );

                const matchedEscrowId = escrowResult.rows[0]?.transaction_id;
                if (!matchedEscrowId) { throw new Error('Failed to create matched escrow'); }

                // 2. Create matching pledge (F-3 FIX: explicit columns, no RETURNING *)
                const pledgeResult = await client.query<MatchingPledge>(
                    `INSERT INTO matching_pledges
                        (program_id, escrow_id, matched_escrow_id, original_amount, match_amount)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING pledge_id, program_id, escrow_id, matched_escrow_id,
                              original_amount, match_amount, created_at`,
                    [locked.program_id, escrowId, matchedEscrowId, donationAmount, matchAmount],
                );

                const p = pledgeResult.rows[0];
                if (!p) { throw new Error('Failed to create matching pledge'); }

                // 3. Update program spent (atomic, inside locked transaction)
                await client.query(
                    `UPDATE matching_programs
                     SET spent = spent + $1, updated_at = NOW()
                     WHERE program_id = $2`,
                    [matchAmount, locked.program_id],
                );

                // 4. Audit trail
                await client.query(
                    `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                     VALUES ('match_applied', 'matching_pledges', $1, $2, $3)`,
                    [
                        p.pledge_id,
                        locked.sponsor_id,
                        JSON.stringify({
                            program_name: program.name,
                            original_amount: donationAmount,
                            match_amount: matchAmount,
                            ratio: locked.match_ratio,
                        }),
                    ],
                );

                return p;
            });

            if (pledge) {
                pledges.push(pledge);

                logger.info('ENH-7: Donation match applied', {
                    program_id: program.program_id,
                    program_name: program.name,
                    original_escrow: escrowId,
                    match_amount: pledge.match_amount,
                    ratio: program.match_ratio,
                });
            }
        } catch (err) {
            // Log but don't fail the main donation — matching is best-effort
            logger.error('ENH-7: Failed to apply match', {
                program_id: program.program_id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return pledges;
}

