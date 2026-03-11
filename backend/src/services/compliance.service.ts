// ============================================================================
// Nammerha Backend — Compliance Service (Ticket 9.1 + 9.2)
// SDN Screening (local fuzzy match) + Export Controls (dual-use flagging)
// ============================================================================
// SDN list is stored LOCALLY in PostgreSQL, NOT fetched via real-time OFAC API.
// Matching uses pg_trgm trigram similarity for fuzzy name comparison.
// ============================================================================
import pool, { transaction } from '../config/database';
import type { PoolClient } from 'pg';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ScreeningStatus = 'clear' | 'potential_match' | 'confirmed_match' | 'false_positive';

export interface SDNEntry {
    sdn_id: string;
    sdn_name: string;
    sdn_type: string;
    aliases: string[] | null;
    country: string | null;
    id_numbers: string[] | null;
    source: string;
    program: string | null;
    remarks: string | null;
    is_active: boolean;
    imported_at: Date;
}

export interface ScreeningResult {
    result_id: string;
    screened_user_id: string;
    matched_sdn_id: string | null;
    match_score: number;
    matched_name: string | null;
    screened_name: string;
    status: ScreeningStatus;
    reviewed_by: string | null;
    reviewed_at: Date | null;
    review_notes: string | null;
    auto_blocked: boolean;
    screened_at: Date;
}

export interface ControlledMaterial {
    material_id: string;
    material_name: string;
    material_category: string;
    hs_code: string | null;
    regulation: string;
    description: string | null;
    risk_level: string;
    is_active: boolean;
    created_at: Date;
}

export interface ImportSDNDTO {
    entries: Array<{
        sdn_name: string;
        sdn_type?: string;
        aliases?: string[];
        country?: string;
        id_numbers?: string[];
        source?: string;
        program?: string;
        remarks?: string;
    }>;
}

export interface AddControlledMaterialDTO {
    material_name: string;
    material_category: string;
    hs_code?: string;
    regulation?: string;
    description?: string;
    risk_level?: string;
}

// SDN match threshold — scores above this are flagged for review
const SDN_MATCH_THRESHOLD = 0.4;
// Scores above this auto-block the user
const SDN_AUTO_BLOCK_THRESHOLD = 0.85;

// ─── SDN Screening ──────────────────────────────────────────────────────────

/**
 * Screen a user's name against the local SDN entries list.
 * Uses PostgreSQL trigram similarity (pg_trgm) for fuzzy matching.
 *
 * Returns the highest-scoring match or 'clear' if no match above threshold.
 */
export async function screenUserAgainstSDN(userId: string): Promise<ScreeningResult> {
    // 1. Get user name
    const userRes = await pool.query(
        `SELECT user_id, full_name, role FROM users WHERE user_id = $1`,
        [userId]
    );
    if (userRes.rows.length === 0) {
        throw new Error(`User ${userId} not found`);
    }
    const user = userRes.rows[0];
    const userName = user.full_name as string;

    // 2. Fuzzy match against SDN entries using trigram similarity
    //    Also check against aliases using ANY + similarity
    const matchRes = await pool.query(
        `SELECT
            sdn_id,
            sdn_name,
            GREATEST(
                similarity(sdn_name, $1),
                COALESCE(
                    (SELECT MAX(similarity(alias, $1))
                     FROM unnest(aliases) AS alias),
                    0
                )
            ) AS match_score
        FROM sdn_entries
        WHERE is_active = true
          AND (
            similarity(sdn_name, $1) > $2
            OR EXISTS (
                SELECT 1 FROM unnest(aliases) AS alias
                WHERE similarity(alias, $1) > $2
            )
          )
        ORDER BY match_score DESC
        LIMIT 1`,
        [userName, SDN_MATCH_THRESHOLD]
    );

    // 3. Determine status
    let status: ScreeningStatus = 'clear';
    let matchedSdnId: string | null = null;
    let matchedName: string | null = null;
    let matchScore = 0;
    let autoBlocked = false;

    if (matchRes.rows.length > 0) {
        const match = matchRes.rows[0];
        matchScore = parseFloat(match.match_score as string);
        matchedSdnId = match.sdn_id as string;
        matchedName = match.sdn_name as string;

        if (matchScore >= SDN_AUTO_BLOCK_THRESHOLD) {
            status = 'confirmed_match';
            autoBlocked = true;
        } else {
            status = 'potential_match';
        }
    }

    // 4. Store screening result + auto-block in a SINGLE transaction
    //    P2-003 FIX: Prevents orphaned user deactivation if INSERT fails.
    const { rows } = await transaction(async (client: PoolClient) => {
        if (autoBlocked) {
            await client.query(
                `UPDATE users SET is_active = false WHERE user_id = $1`,
                [userId]
            );
        }
        return client.query(
            `INSERT INTO sanctions_screening_results
                (screened_user_id, matched_sdn_id, match_score, matched_name,
                 screened_name, status, auto_blocked)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [userId, matchedSdnId, matchScore, matchedName, userName, status, autoBlocked]
        );
    });

    return rows[0];
}

/**
 * Get screening history for a user.
 */
export async function getScreeningResults(userId: string): Promise<ScreeningResult[]> {
    const { rows } = await pool.query(
        `SELECT ssr.*, u.full_name AS reviewer_name
         FROM sanctions_screening_results ssr
         LEFT JOIN users u ON u.user_id = ssr.reviewed_by
         WHERE ssr.screened_user_id = $1
         ORDER BY ssr.screened_at DESC`,
        [userId]
    );
    return rows;
}

/**
 * Admin reviews a potential SDN match.
 * Can clear (false_positive) or confirm the match.
 *
 * P1-NEW-003 FIX: Wrapped in transaction to eliminate TOCTOU race condition.
 * Previously, the screening result update and user status update were
 * in separate queries outside a transaction, allowing a concurrent request
 * to read stale user status between the two writes.
 */
export async function reviewScreeningResult(
    resultId: string,
    reviewerId: string,
    decision: 'false_positive' | 'confirmed_match',
    notes?: string
): Promise<ScreeningResult> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `UPDATE sanctions_screening_results
             SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3
             WHERE result_id = $4
             RETURNING *`,
            [decision, reviewerId, notes || null, resultId]
        );
        if (rows.length === 0) {
            throw new Error('Screening result not found');
        }

        // If confirmed, block the user
        if (decision === 'confirmed_match') {
            await client.query(
                `UPDATE users SET is_active = false
                 WHERE user_id = (SELECT screened_user_id FROM sanctions_screening_results WHERE result_id = $1)`,
                [resultId]
            );
        }
        // If false positive, reactivate user if was auto-blocked
        if (decision === 'false_positive') {
            const result = rows[0];
            if (result.auto_blocked) {
                await client.query(
                    `UPDATE users SET is_active = true WHERE user_id = $1`,
                    [result.screened_user_id]
                );
            }
        }

        await client.query('COMMIT');
        return rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Bulk import SDN entries from structured data (parsed from CSV).
 * Upserts based on sdn_name + source.
 */
export async function importSDNList(dto: ImportSDNDTO): Promise<{ imported: number }> {
    if (dto.entries.length === 0) {
        return { imported: 0 };
    }

    // P2-001 + P2-002 FIX: Batch INSERT with accurate count via RETURNING.
    // Instead of N sequential queries, we build a single multi-row VALUES clause.
    // ON CONFLICT DO NOTHING skips duplicates; RETURNING only counts actual inserts.
    const BATCH_SIZE = 500; // Limit parameter count per batch (Postgres max: 65535)
    let totalImported = 0;

    for (let i = 0; i < dto.entries.length; i += BATCH_SIZE) {
        const batch = dto.entries.slice(i, i + BATCH_SIZE);
        const values: unknown[] = [];
        const placeholders: string[] = [];

        for (let j = 0; j < batch.length; j++) {
            const entry = batch[j];
            if (!entry) { continue; }
            const offset = j * 8;
            placeholders.push(
                `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
            );
            values.push(
                entry.sdn_name,
                entry.sdn_type || 'individual',
                entry.aliases || null,
                entry.country || null,
                entry.id_numbers || null,
                entry.source || 'OFAC_SDN',
                entry.program || null,
                entry.remarks || null
            );
        }

        const result = await pool.query(
            `INSERT INTO sdn_entries
                (sdn_name, sdn_type, aliases, country, id_numbers, source, program, remarks)
            VALUES ${placeholders.join(', ')}
            ON CONFLICT DO NOTHING
            RETURNING sdn_id`,
            values
        );
        totalImported += result.rowCount ?? 0;
    }

    return { imported: totalImported };
}

/**
 * Get all pending screening results (potential matches awaiting review).
 */
export async function getPendingScreenings(): Promise<ScreeningResult[]> {
    const { rows } = await pool.query(
        `SELECT ssr.*, u.full_name AS user_name, u.role AS user_role, u.email AS user_email
         FROM sanctions_screening_results ssr
         JOIN users u ON u.user_id = ssr.screened_user_id
         WHERE ssr.status = 'potential_match'
         ORDER BY ssr.match_score DESC, ssr.screened_at ASC`
    );
    return rows;
}

// ─── Export Controls ────────────────────────────────────────────────────────

/**
 * Check if a BOQ material matches any controlled material in the reference table.
 * If match found, flags the item as dual-use.
 */
export async function checkDualUse(
    itemId: string,
    materialName: string,
    materialCategory?: string | null
): Promise<{ is_dual_use: boolean; regulation: string | null; match_score: number }> {
    // Fuzzy match against controlled materials
    const matchRes = await pool.query(
        `SELECT material_id, material_name, regulation,
                similarity(material_name, $1) AS match_score
         FROM controlled_materials
         WHERE is_active = true
           AND (
             similarity(material_name, $1) > 0.3
             OR ($2 IS NOT NULL AND material_category = $2)
           )
         ORDER BY match_score DESC
         LIMIT 1`,
        [materialName, materialCategory || null]
    );

    if (matchRes.rows.length > 0) {
        const match = matchRes.rows[0];
        const score = parseFloat(match.match_score as string);

        if (score > 0.3) {
            // Flag the BOQ item
            await pool.query(
                `UPDATE itemized_boq
                 SET is_dual_use = true, dual_use_regulation = $1
                 WHERE item_id = $2`,
                [match.regulation, itemId]
            );
            return {
                is_dual_use: true,
                regulation: match.regulation as string,
                match_score: score,
            };
        }
    }

    return { is_dual_use: false, regulation: null, match_score: 0 };
}

/**
 * Add a controlled material to the reference table.
 */
export async function addControlledMaterial(
    adminId: string,
    dto: AddControlledMaterialDTO
): Promise<ControlledMaterial> {
    const { rows } = await pool.query(
        `INSERT INTO controlled_materials
            (material_name, material_category, hs_code, regulation, description, risk_level, added_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
            dto.material_name,
            dto.material_category,
            dto.hs_code || null,
            dto.regulation || 'EAR',
            dto.description || null,
            dto.risk_level || 'medium',
            adminId,
        ]
    );
    return rows[0];
}

/**
 * List all controlled materials.
 */
export async function listControlledMaterials(): Promise<ControlledMaterial[]> {
    const { rows } = await pool.query(
        `SELECT * FROM controlled_materials WHERE is_active = true ORDER BY material_category, material_name`
    );
    return rows;
}

/**
 * Get all BOQ items flagged as dual-use across all projects.
 */
export async function getDualUseItems(): Promise<Record<string, unknown>[]> {
    const { rows } = await pool.query(
        `SELECT b.item_id, b.material_name, b.material_category, b.is_dual_use,
                b.dual_use_regulation, b.project_id, p.title AS project_title
         FROM itemized_boq b
         JOIN projects p ON p.project_id = b.project_id
         WHERE b.is_dual_use = true
         ORDER BY p.project_id, b.material_name`
    );
    return rows;
}
