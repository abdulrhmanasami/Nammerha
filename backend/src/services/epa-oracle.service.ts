// ============================================================================
// Nammerha Backend — EPA Oracle Service (Ticket 7.2)
// FIDIC 13.8 Price Adjustment Engine + Oracle CRUD
// ============================================================================
import pool from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OracleEntry {
    entry_id: string;
    material_code: string;
    material_name: string;
    unit: string;
    base_price: number;        // cents at contract signing
    current_price: number;     // cents current market
    price_change_pct: number;
    source: string;
    recorded_by: string | null;
    effective_date: Date;
    created_at: Date;
}

export interface UpsertOracleDTO {
    material_code: string;
    material_name: string;
    unit: string;
    base_price: number;
    current_price: number;
    source?: string;
}

export interface FIDICParams {
    // a = fixed coefficient (overhead + profit, typically 0.10)
    a: number;
    // b, c, d = weight coefficients for labor, equipment, materials
    // Must satisfy: a + b + c + d = 1.0
    b: number; // labor weight
    c: number; // equipment weight
    d: number; // materials weight
    // Current indices (Ln, En, Mn)
    Ln: number; // current labor index
    En: number; // current equipment index
    Mn: number; // current materials index
    // Base indices (Lo, Eo, Mo) — at contract signing
    Lo: number; // base labor index
    Eo: number; // base equipment index
    Mo: number; // base materials index
}

export interface EPAAdjustment {
    adjustment_id: string;
    project_id: string;
    milestone_id: string | null;
    fidic_formula_params: FIDICParams;
    adjustment_multiplier: number;    // Pn
    original_amount: number;          // cents
    adjusted_amount: number;          // cents
    adjustment_delta: number;         // cents (adjusted - original)
    status: string;
    calculated_by: string;
    approved_by: string | null;
    created_at: Date;
}

export interface CalculateEPADTO {
    project_id: string;
    milestone_id?: string;
    fidic_params: FIDICParams;
    original_amount: number;     // cents
}

// ─── FIDIC 13.8 Formula ────────────────────────────────────────────────────
//
//   Pn = a + b(Ln/Lo) + c(En/Eo) + d(Mn/Mo)
//
// Where:
//   Pn = Adjustment multiplier
//   a  = Fixed portion (non-adjustable, typically 10%)
//   b  = Labor weight coefficient
//   c  = Equipment weight coefficient
//   d  = Materials weight coefficient
//   Ln/Lo = Current/Base Labor Cost Index ratio
//   En/Eo = Current/Base Equipment Cost Index ratio
//   Mn/Mo = Current/Base Materials Cost Index ratio
//
// Constraint: a + b + c + d = 1.0
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pure mathematical implementation of FIDIC 13.8 EPA formula.
 * Returns the adjustment multiplier Pn.
 * 
 * @throws if mathematical constraints are violated
 */
export function calculateFIDIC(params: FIDICParams): number {
    const { a, b, c, d, Ln, Lo, En, Eo, Mn, Mo } = params;

    // ── Validation ──────────────────────────────────────────────────────
    // 1. Coefficients must sum to 1.0 (tolerance: ±0.01)
    const coeffSum = a + b + c + d;
    if (Math.abs(coeffSum - 1.0) > 0.01) {
        throw new Error(
            `FIDIC constraint violation: a + b + c + d = ${coeffSum.toFixed(4)}, must equal 1.0 (±0.01)`
        );
    }

    // 2. Base indices must be positive (division by zero protection)
    if (Lo <= 0 || Eo <= 0 || Mo <= 0) {
        throw new Error(
            'FIDIC constraint violation: base indices (Lo, Eo, Mo) must be > 0'
        );
    }

    // 3. All indices must be non-negative
    if (Ln < 0 || En < 0 || Mn < 0) {
        throw new Error(
            'FIDIC constraint violation: current indices (Ln, En, Mn) must be ≥ 0'
        );
    }

    // 4. Coefficients must be non-negative
    if (a < 0 || b < 0 || c < 0 || d < 0) {
        throw new Error(
            'FIDIC constraint violation: all coefficients must be ≥ 0'
        );
    }

    // ── Calculation ─────────────────────────────────────────────────────
    const Pn = a + b * (Ln / Lo) + c * (En / Eo) + d * (Mn / Mo);

    // Round to 6 decimal places for precision
    return Math.round(Pn * 1_000_000) / 1_000_000;
}

/**
 * Calculate EPA adjustment for a project milestone and persist.
 */
export async function calculateAndStoreEPA(
    dto: CalculateEPADTO,
    calculatedBy: string
): Promise<EPAAdjustment> {
    // Validate original amount
    if (dto.original_amount <= 0) {
        throw new Error('Original amount must be > 0');
    }

    // Calculate FIDIC multiplier
    const Pn = calculateFIDIC(dto.fidic_params);

    // Calculate adjusted amount
    const adjustedAmount = Math.round(dto.original_amount * Pn);
    const delta = adjustedAmount - dto.original_amount;

    // Persist
    const { rows } = await pool.query(
        `INSERT INTO epa_adjustments
            (project_id, milestone_id, fidic_formula_params,
             adjustment_multiplier, original_amount, adjusted_amount,
             adjustment_delta, status, calculated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_approval', $8)
        RETURNING *`,
        [
            dto.project_id,
            dto.milestone_id || null,
            JSON.stringify(dto.fidic_params),
            Pn,
            dto.original_amount,
            adjustedAmount,
            delta,
            calculatedBy,
        ]
    );

    return rows[0];
}

/**
 * Approve or reject an EPA adjustment.
 */
export async function respondToEPA(
    adjustmentId: string,
    approverId: string,
    decision: 'approved' | 'rejected'
): Promise<EPAAdjustment> {
    const { rows } = await pool.query(
        `UPDATE epa_adjustments
         SET status = $1, approved_by = $2, updated_at = NOW()
         WHERE adjustment_id = $3 AND status = 'pending_approval'
         RETURNING *`,
        [decision, approverId, adjustmentId]
    );

    if (rows.length === 0) {
        throw new Error('EPA adjustment not found or already processed');
    }

    return rows[0];
}

/**
 * Get EPA adjustment history for a project.
 */
export async function getEPAHistory(projectId: string): Promise<EPAAdjustment[]> {
    const { rows } = await pool.query(
        `SELECT ea.*, u.full_name AS calculator_name
         FROM epa_adjustments ea
         LEFT JOIN users u ON u.user_id = ea.calculated_by
         WHERE ea.project_id = $1
         ORDER BY ea.created_at DESC`,
        [projectId]
    );
    return rows;
}

// ─── Oracle CRUD ────────────────────────────────────────────────────────────

/**
 * List oracle price entries with optional filters.
 */
export async function getOracleEntries(
    materialCode?: string
): Promise<OracleEntry[]> {
    let sql = `
        SELECT * FROM pricing_oracle_entries
        ORDER BY material_code, effective_date DESC
    `;
    const params: string[] = [];

    if (materialCode) {
        sql = `
            SELECT * FROM pricing_oracle_entries
            WHERE material_code = $1
            ORDER BY effective_date DESC
        `;
        params.push(materialCode);
    }

    const { rows } = await pool.query(sql, params);
    return rows;
}

/**
 * Create or update an oracle price entry.
 * Calculates price_change_pct automatically.
 */
export async function upsertOracleEntry(
    dto: UpsertOracleDTO,
    recordedBy: string
): Promise<OracleEntry> {
    if (dto.base_price <= 0 || dto.current_price <= 0) {
        throw new Error('Prices must be > 0');
    }

    const priceChangePct = Math.round(
        ((dto.current_price - dto.base_price) / dto.base_price) * 10000
    ) / 100; // 2 decimal places

    const { rows } = await pool.query(
        `INSERT INTO pricing_oracle_entries
            (material_code, material_name, unit, base_price,
             current_price, price_change_pct, source, recorded_by, effective_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *`,
        [
            dto.material_code,
            dto.material_name,
            dto.unit,
            dto.base_price,
            dto.current_price,
            priceChangePct,
            dto.source || 'manual_admin_entry',
            recordedBy,
        ]
    );

    return rows[0];
}

/**
 * Check EPA thresholds: Flag projects where material price drift > 5%.
 */
export async function checkEPAThresholds(): Promise<Array<{
    project_id: string;
    material_name: string;
    price_change_pct: number;
}>> {
    const { rows } = await pool.query(`
        SELECT DISTINCT p.project_id, poe.material_name, poe.price_change_pct
        FROM projects p
        JOIN itemized_boq ib ON ib.project_id = p.project_id
        JOIN pricing_oracle_entries poe ON poe.material_code = ib.material_category
        WHERE p.status IN ('published', 'in_progress')
          AND ABS(poe.price_change_pct) > 5.0
        ORDER BY ABS(poe.price_change_pct) DESC
    `);
    return rows;
}
