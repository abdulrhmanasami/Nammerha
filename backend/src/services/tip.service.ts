// ============================================================================
// Nammerha Backend — Tip Service
// User tipping model per profitability study §3.
// 100% of donation goes to the project; tip is separate voluntary support
// for platform operations.
// All monetary values in cents (BIGINT convention).
// ============================================================================
import { query, financialTransaction } from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlatformTip {
  tip_id: string;
  user_id: string;
  donation_reference: string;
  tip_amount_cents: number;
  tip_percentage: number | null;
  currency: string;
  payment_gateway: string | null;
  payment_gateway_ref: string | null;
  status: string;
  created_at: Date;
}

export interface TipSummary {
  total_tips_count: number;
  total_tip_revenue: number; // cents
  mtd_tip_revenue: number; // cents (month-to-date)
  average_tip_cents: number;
  average_tip_percentage: number;
  unique_tipping_users: number;
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Record a user tip for platform operational support.
 * Called after donation payment is confirmed.
 */
export async function recordTip(
  userId: string,
  donationReference: string,
  tipAmountCents: number,
  tipPercentage: number | null,
  gateway?: string,
  gatewayRef?: string,
): Promise<PlatformTip> {
  if (tipAmountCents <= 0) {
    throw new Error('Tip amount must be > 0');
  }

  return financialTransaction(async (client) => {
    const result = await client.query<PlatformTip>(
      `INSERT INTO platform_tips
              (user_id, donation_reference, tip_amount_cents, tip_percentage,
               currency, payment_gateway, payment_gateway_ref, status)
           VALUES ($1, $2, $3, $4, 'USD', $5, $6, 'completed')
           RETURNING tip_id, user_id, donation_reference, tip_amount_cents,
                     tip_percentage, currency, payment_gateway, payment_gateway_ref,
                     status, created_at`,
      [
        userId,
        donationReference,
        tipAmountCents,
        tipPercentage,
        gateway || null,
        gatewayRef || null,
      ],
    );

    if (!result.rows[0]) {
      throw new Error('Failed to record tip');
    }

    // Audit trail
    await client.query(
      `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
           VALUES ('tip_recorded', 'platform_tips', $1, $2, $3)`,
      [
        result.rows[0].tip_id,
        userId,
        JSON.stringify({
          amount: tipAmountCents,
          percentage: tipPercentage,
          donation_ref: donationReference,
        }),
      ],
    );

    return result.rows[0];
  });
}

/**
 * Admin: Get tip summary metrics for the revenue dashboard.
 */
export async function getTipSummary(startDate?: string, endDate?: string): Promise<TipSummary> {
  let dateFilter = '';
  const params: unknown[] = [];

  if (startDate && endDate) {
    dateFilter = `AND created_at >= $1 AND created_at <= $2`;
    params.push(startDate, endDate);
  }

  const result = await query<{
    total_tips_count: string;
    total_tip_revenue: string;
    mtd_tip_revenue: string;
    average_tip_cents: string;
    average_tip_percentage: string;
    unique_tipping_users: string;
  }>(
    `SELECT
            COUNT(*) AS total_tips_count,
            COALESCE(SUM(tip_amount_cents), 0) AS total_tip_revenue,
            COALESCE(SUM(tip_amount_cents) FILTER (
                WHERE created_at >= date_trunc('month', NOW())
            ), 0) AS mtd_tip_revenue,
            COALESCE(AVG(tip_amount_cents), 0) AS average_tip_cents,
            COALESCE(AVG(tip_percentage) FILTER (WHERE tip_percentage IS NOT NULL), 0) AS average_tip_percentage,
            COUNT(DISTINCT user_id) AS unique_tipping_users
         FROM platform_tips
         WHERE status = 'completed' ${dateFilter}`,
    params,
  );

  const row = result.rows[0];
  return {
    total_tips_count: parseInt(row?.total_tips_count ?? '0', 10),
    total_tip_revenue: parseInt(row?.total_tip_revenue ?? '0', 10),
    mtd_tip_revenue: parseInt(row?.mtd_tip_revenue ?? '0', 10),
    average_tip_cents: Math.round(parseFloat(row?.average_tip_cents ?? '0')),
    average_tip_percentage: Math.round(parseFloat(row?.average_tip_percentage ?? '0') * 100) / 100,
    unique_tipping_users: parseInt(row?.unique_tipping_users ?? '0', 10),
  };
}

/**
 * Get tip history for a specific user.
 */
export async function getUserTips(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<{ tips: PlatformTip[]; total: number }> {
  const clamped = Math.min(limit, 100);

  const [tipsRes, countRes] = await Promise.all([
    query<PlatformTip>(
      `SELECT tip_id, user_id, donation_reference, tip_amount_cents,
                    tip_percentage, currency, payment_gateway, payment_gateway_ref,
                    status, created_at
             FROM platform_tips
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
      [userId, clamped, offset],
    ),
    query<{ count: string }>(`SELECT COUNT(*) FROM platform_tips WHERE user_id = $1`, [userId]),
  ]);

  return {
    tips: tipsRes.rows,
    total: parseInt(countRes.rows[0]?.count ?? '0', 10),
  };
}

/**
 * Admin: Get combined platform revenue snapshot (commissions + tips).
 */
export async function getPlatformRevenueSummary(): Promise<{
  total_commission_revenue: number;
  total_tip_revenue: number;
  total_platform_revenue: number;
  mtd_commission_revenue: number;
  mtd_tip_revenue: number;
  total_commissions_count: number;
  total_tips_count: number;
}> {
  const result = await query<{
    total_commission_revenue: string;
    total_tip_revenue: string;
    total_platform_revenue: string;
    mtd_commission_revenue: string;
    mtd_tip_revenue: string;
    total_commissions_count: string;
    total_tips_count: string;
  }>(
    // FIX-04: Explicit column list — no SELECT * (prevents VIEW schema drift).
    `SELECT total_commission_revenue, total_tip_revenue, total_platform_revenue,
                mtd_commission_revenue, mtd_tip_revenue,
                total_commissions_count, total_tips_count
         FROM vw_platform_revenue_summary`,
  );

  const row = result.rows[0];
  return {
    total_commission_revenue: parseInt(row?.total_commission_revenue ?? '0', 10),
    total_tip_revenue: parseInt(row?.total_tip_revenue ?? '0', 10),
    total_platform_revenue: parseInt(row?.total_platform_revenue ?? '0', 10),
    mtd_commission_revenue: parseInt(row?.mtd_commission_revenue ?? '0', 10),
    mtd_tip_revenue: parseInt(row?.mtd_tip_revenue ?? '0', 10),
    total_commissions_count: parseInt(row?.total_commissions_count ?? '0', 10),
    total_tips_count: parseInt(row?.total_tips_count ?? '0', 10),
  };
}
