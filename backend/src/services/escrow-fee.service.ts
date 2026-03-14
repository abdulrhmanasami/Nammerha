// ============================================================================
// Nammerha Backend — Escrow Fee Service
// Transaction fee logic for commercial escrow releases.
// Per profitability study §5: 1-3% on commercial projects.
// ETHICAL RULE: Humanitarian projects are ALWAYS exempt.
// All monetary values in cents (BIGINT convention).
// ============================================================================
import { query } from '../config/database';
import type { PoolClient } from 'pg';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EscrowFeeConfig {
    config_id: string;
    fee_name: string;
    fee_rate_bps: number;
    min_fee_cents: number;
    max_fee_cents: number | null;
    applies_to: string;
    is_active: boolean;
}

export interface EscrowFeeEntry {
    fee_id: string;
    project_id: string;
    item_id: string;
    escrow_amount_cents: number;
    fee_rate_bps: number;
    fee_amount_cents: number;
    fee_config_name: string;
    status: string;
    charged_at: Date;
}

export interface EscrowFeeSummary {
    total_fees_count: number;
    total_fee_revenue: number;
    mtd_fee_revenue: number;
    average_fee_cents: number;
    average_fee_rate_bps: number;
}

// ─── Pure Functions ─────────────────────────────────────────────────────────

/**
 * BigInt-safe escrow fee calculation.
 * Applies min/max caps after percentage calculation.
 *
 * @param amountCents - Escrow release amount in cents
 * @param rateBps - Fee rate in basis points (200 = 2%)
 * @param minCents - Minimum fee floor
 * @param maxCents - Maximum fee cap (null = uncapped)
 * @returns Fee amount in cents
 */
export function calculateEscrowFee(
    amountCents: number,
    rateBps: number,
    minCents: number = 0,
    maxCents: number | null = null,
): number {
    if (amountCents <= 0 || rateBps <= 0) {
        return 0;
    }

    // BigInt-safe percentage: amount * rate / 10000
    let fee = Number((BigInt(amountCents) * BigInt(rateBps)) / 10000n);

    // Apply floor
    if (fee < minCents) {
        fee = minCents;
    }

    // Apply cap
    if (maxCents !== null && fee > maxCents) {
        fee = maxCents;
    }

    return fee;
}

// ─── Database Functions ─────────────────────────────────────────────────────

/**
 * Get the active fee configuration.
 */
export async function getActiveFeeConfig(): Promise<EscrowFeeConfig | null> {
    const result = await query<EscrowFeeConfig>(
        `SELECT config_id, fee_name, fee_rate_bps, min_fee_cents, max_fee_cents,
                applies_to, is_active
         FROM escrow_fee_config
         WHERE is_active = TRUE
         ORDER BY created_at ASC
         LIMIT 1`,
    );
    return result.rows[0] ?? null;
}

/**
 * Record an escrow fee in the ledger.
 * Designed to run INSIDE an existing transaction (accepts PoolClient).
 *
 * @param client - Active transaction client from escrow.service.ts
 */
export async function recordEscrowFeeInTransaction(
    client: PoolClient,
    projectId: string,
    itemId: string,
    escrowAmountCents: number,
    feeRateBps: number,
    feeAmountCents: number,
    feeConfigName: string,
): Promise<EscrowFeeEntry> {
    const result = await client.query<EscrowFeeEntry>(
        `INSERT INTO escrow_fee_ledger
            (project_id, item_id, escrow_amount_cents, fee_rate_bps,
             fee_amount_cents, fee_config_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'charged')
         RETURNING *`,
        [projectId, itemId, escrowAmountCents, feeRateBps, feeAmountCents, feeConfigName],
    );

    if (!result.rows[0]) {
        throw new Error('Failed to record escrow fee');
    }

    logger.info('Escrow fee recorded', {
        projectId,
        itemId,
        escrowAmountCents,
        feeAmountCents,
        feeRateBps,
    });

    return result.rows[0];
}

/**
 * Admin: Get escrow fee summary metrics.
 */
export async function getEscrowFeeSummary(): Promise<EscrowFeeSummary> {
    const result = await query<{
        total_fees_count: string;
        total_fee_revenue: string;
        mtd_fee_revenue: string;
        average_fee_cents: string;
        average_fee_rate_bps: string;
    }>(
        `SELECT
            COUNT(*) AS total_fees_count,
            COALESCE(SUM(fee_amount_cents), 0) AS total_fee_revenue,
            COALESCE(SUM(fee_amount_cents) FILTER (
                WHERE charged_at >= date_trunc('month', NOW())
            ), 0) AS mtd_fee_revenue,
            COALESCE(AVG(fee_amount_cents), 0) AS average_fee_cents,
            COALESCE(AVG(fee_rate_bps), 0) AS average_fee_rate_bps
         FROM escrow_fee_ledger
         WHERE status = 'charged'`,
    );

    const row = result.rows[0];
    return {
        total_fees_count: parseInt(row?.total_fees_count ?? '0', 10),
        total_fee_revenue: parseInt(row?.total_fee_revenue ?? '0', 10),
        mtd_fee_revenue: parseInt(row?.mtd_fee_revenue ?? '0', 10),
        average_fee_cents: Math.round(parseFloat(row?.average_fee_cents ?? '0')),
        average_fee_rate_bps: Math.round(parseFloat(row?.average_fee_rate_bps ?? '0')),
    };
}

/**
 * Admin: Get all fee configs.
 */
export async function getAllFeeConfigs(): Promise<EscrowFeeConfig[]> {
    const result = await query<EscrowFeeConfig>(
        `SELECT config_id, fee_name, fee_rate_bps, min_fee_cents, max_fee_cents,
                applies_to, is_active
         FROM escrow_fee_config
         ORDER BY created_at ASC`,
    );
    return result.rows;
}

/**
 * Admin: Update fee rate.
 */
export async function updateFeeRate(
    configId: string,
    feeRateBps: number,
): Promise<EscrowFeeConfig> {
    if (feeRateBps < 0 || feeRateBps > 3000) {
        throw new Error('Fee rate must be between 0 and 3000 bps (0-30%)');
    }

    const result = await query<EscrowFeeConfig>(
        `UPDATE escrow_fee_config
         SET fee_rate_bps = $1, updated_at = NOW()
         WHERE config_id = $2
         RETURNING config_id, fee_name, fee_rate_bps, min_fee_cents, max_fee_cents,
                   applies_to, is_active`,
        [feeRateBps, configId],
    );

    if (!result.rows[0]) {
        throw new Error('Fee config not found');
    }

    logger.info('Escrow fee rate updated', { configId, feeRateBps });
    return result.rows[0];
}
