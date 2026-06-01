// ============================================================================
// Nammerha Backend — Commission Service
// Tiered supplier commission engine per profitability study §1.
// Rates in basis points (bps): 1500 bps = 15.00%
// All monetary values in cents (BIGINT convention).
// ============================================================================
import { query } from '../config/database';
/**
 * Lightweight client shape matching the transaction client used in
 * autoGeneratePO(). Accepts both pg PoolClient and the project's
 * custom query wrapper — whichever `transaction()` provides.
 */
export interface TransactionClient {
  query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
}

export interface CommissionTier {
  tier_id: string;
  tier_name: string;
  min_revenue_cents: number;
  max_revenue_cents: number | null;
  commission_rate_bps: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CommissionEntry {
  commission_id: string;
  po_id: string;
  supplier_id: string;
  project_id: string;
  po_amount_cents: number;
  commission_rate_bps: number;
  commission_amount_cents: number;
  tier_name: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CommissionSummary {
  total_commissions: number;
  total_commission_revenue: number; // cents
  mtd_commission_revenue: number; // cents (month-to-date)
  average_rate_bps: number;
  top_tier: string;
}

// ─── Pure Functions (Testable without DB) ───────────────────────────────────

/**
 * Integer-safe commission calculation using BigInt arithmetic.
 * Mirrors the platform convention from payment.service.ts.
 *
 * @param poAmountCents - Purchase order amount in cents
 * @param rateBps - Commission rate in basis points (1500 = 15%)
 * @returns Commission amount in cents (always rounded down for platform safety)
 */
export function calculateCommission(poAmountCents: number, rateBps: number): number {
  if (poAmountCents <= 0 || rateBps <= 0) {
    return 0;
  }
  // BigInt-safe: (amount * rate) / 10000
  // 10000 because bps are 1/100th of a percent
  return Number((BigInt(poAmountCents) * BigInt(rateBps)) / 10000n);
}

/**
 * Determine the applicable commission tier based on supplier's
 * trailing 30-day revenue through the platform.
 *
 * @param tiers - Sorted commission tiers (ascending by min_revenue_cents)
 * @param monthlyRevenueCents - Supplier's trailing 30-day delivered PO revenue
 * @returns The matching tier, or the first (lowest) tier as fallback
 */
export function resolveApplicableTier(
  tiers: CommissionTier[],
  monthlyRevenueCents: number,
): CommissionTier | null {
  if (tiers.length === 0) {
    return null;
  }

  // Sort ascending by min_revenue_cents for bracket matching
  const sorted = [...tiers].sort((a, b) => a.min_revenue_cents - b.min_revenue_cents);

  // Walk brackets from highest to lowest — first match wins
  for (let i = sorted.length - 1; i >= 0; i--) {
    const tier = sorted[i];
    if (!tier) {
      continue;
    }
    if (monthlyRevenueCents >= tier.min_revenue_cents) {
      // Check upper bound (NULL = unlimited)
      if (tier.max_revenue_cents === null || monthlyRevenueCents <= tier.max_revenue_cents) {
        return tier;
      }
    }
  }

  // Fallback: lowest tier
  const fallback = sorted[0];
  return fallback ?? null;
}

// ─── Database Functions ─────────────────────────────────────────────────────

/**
 * Get all active commission tiers, ordered by bracket.
 */
export async function getCommissionConfig(): Promise<CommissionTier[]> {
  const result = await query<CommissionTier>(
    `SELECT tier_id, tier_name, min_revenue_cents, max_revenue_cents,
                commission_rate_bps, is_active, created_at, updated_at
         FROM commission_config
         WHERE is_active = true
         ORDER BY min_revenue_cents ASC`,
  );
  return result.rows;
}

/**
 * Admin updates a commission tier's rate.
 * Rate must be 0-5000 bps (0-50%).
 */
export async function updateCommissionRate(
  tierId: string,
  newRateBps: number,
): Promise<CommissionTier> {
  if (newRateBps < 0 || newRateBps > 5000) {
    throw new Error('Commission rate must be between 0 and 5000 basis points (0-50%)');
  }

  const result = await query<CommissionTier>(
    // FIX-03: Set updated_at on rate change — was missing, breaking audit freshness.
    `UPDATE commission_config
         SET commission_rate_bps = $1,
             updated_at = NOW()
         WHERE tier_id = $2
         RETURNING tier_id, tier_name, min_revenue_cents, max_revenue_cents,
                   commission_rate_bps, is_active, created_at, updated_at`,
    [newRateBps, tierId],
  );

  if (result.rows.length === 0) {
    throw new Error('Commission tier not found');
  }

  const tier = result.rows[0];
  if (!tier) {
    throw new Error('Commission tier not found');
  }
  return tier;
}

/**
 * Get supplier's trailing 30-day delivered PO revenue.
 * Used to determine which commission tier applies.
 */
export async function getSupplierMonthlyRevenue(supplierId: string): Promise<number> {
  const result = await query<{ revenue: string }>(
    `SELECT COALESCE(SUM(amount), 0) AS revenue
         FROM purchase_orders
         WHERE supplier_id = $1
           AND status = 'delivered'
           AND delivered_at >= NOW() - INTERVAL '30 days'`,
    [supplierId],
  );
  return parseInt(result.rows[0]?.revenue ?? '0', 10);
}

/**
 * Record a commission entry for a purchase order.
 * Called within a transaction from autoGeneratePO().
 *
 * @param client - Transaction client (for atomicity with PO creation)
 * @param poId - The purchase order ID
 * @param supplierId - The supplier receiving the PO
 * @param projectId - The project ID
 * @param poAmountCents - PO total amount in cents
 */
export async function recordCommissionInTransaction(
  client: TransactionClient,
  poId: string,
  supplierId: string,
  projectId: string,
  poAmountCents: number,
): Promise<CommissionEntry | null> {
  // ─── ETHICAL RULE: Humanitarian projects are ALWAYS exempt ────────
  // Per profitability study §1+§3: commissions apply ONLY to
  // commercial (homeowner-funded) projects. User-funded humanitarian
  // reconstruction is exempt — "إنساني معفى".
  // ─────────────────────────────────────────────────────────────────
  const projectRes = await client.query<{ project_type: string }>(
    `SELECT project_type FROM projects WHERE project_id = $1`,
    [projectId],
  );

  const projectType = projectRes.rows[0]?.project_type ?? 'commercial';

  if (projectType === 'humanitarian') {
    // Record a waived entry for audit transparency — $0 commission
    const waivedRes = await client.query<CommissionEntry>(
      `INSERT INTO commission_ledger
                (po_id, supplier_id, project_id, po_amount_cents,
                 commission_rate_bps, commission_amount_cents, tier_name, status)
             VALUES ($1, $2, $3, $4, 0, 0, 'humanitarian_exempt', 'waived')
             RETURNING commission_id, po_id, supplier_id, project_id,
                       po_amount_cents, commission_rate_bps, commission_amount_cents,
                       tier_name, status, created_at, updated_at`,
      [poId, supplierId, projectId, poAmountCents],
    );

    // Audit trail for exemption
    await client.query(
      `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
             VALUES ('commission_waived_humanitarian', 'commission_ledger', $1, $2, $3)`,
      [
        waivedRes.rows[0]?.commission_id ?? poId,
        supplierId,
        JSON.stringify({
          po_id: poId,
          po_amount: poAmountCents,
          reason: 'humanitarian_exempt',
          project_type: 'humanitarian',
        }),
      ],
    );

    return waivedRes.rows[0] ?? null;
  }

  // ─── Commercial project: apply tiered commission ─────────────────

  // 1. Get supplier's trailing 30-day revenue for tier resolution
  const revenueRes = await client.query<{ revenue: string }>(
    `SELECT COALESCE(SUM(amount), 0) AS revenue
         FROM purchase_orders
         WHERE supplier_id = $1
           AND status = 'delivered'
           AND delivered_at >= NOW() - INTERVAL '30 days'`,
    [supplierId],
  );
  const monthlyRevenue = parseInt(revenueRes.rows[0]?.revenue ?? '0', 10);

  // 2. Get active tiers
  const tiersRes = await client.query<CommissionTier>(
    `SELECT tier_id, tier_name, min_revenue_cents, max_revenue_cents,
                commission_rate_bps, is_active, created_at, updated_at
         FROM commission_config
         WHERE is_active = true
         ORDER BY min_revenue_cents ASC`,
  );

  if (tiersRes.rows.length === 0) {
    // No commission config — skip silently (platform not yet monetized)
    return null;
  }

  // 3. Resolve applicable tier
  const tier = resolveApplicableTier(tiersRes.rows, monthlyRevenue);
  if (!tier) {
    return null;
  }

  // 4. Calculate commission (integer-safe)
  const commissionAmount = calculateCommission(poAmountCents, tier.commission_rate_bps);

  if (commissionAmount <= 0) {
    return null;
  }

  // 5. Insert into commission_ledger
  const result = await client.query<CommissionEntry>(
    `INSERT INTO commission_ledger
            (po_id, supplier_id, project_id, po_amount_cents,
             commission_rate_bps, commission_amount_cents, tier_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING commission_id, po_id, supplier_id, project_id,
                   po_amount_cents, commission_rate_bps, commission_amount_cents,
                   tier_name, status, created_at, updated_at`,
    [
      poId,
      supplierId,
      projectId,
      poAmountCents,
      tier.commission_rate_bps,
      commissionAmount,
      tier.tier_name,
    ],
  );

  // 6. Audit trail
  await client.query(
    `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
         VALUES ('commission_recorded', 'commission_ledger', $1, $2, $3)`,
    [
      result.rows[0]?.commission_id ?? poId,
      supplierId,
      JSON.stringify({
        po_id: poId,
        po_amount: poAmountCents,
        rate_bps: tier.commission_rate_bps,
        commission: commissionAmount,
        tier: tier.tier_name,
      }),
    ],
  );

  return result.rows[0] ?? null;
}

/**
 * Get commission history for a specific supplier.
 * Used by the supplier dashboard.
 */
export async function getSupplierCommissions(
  supplierId: string,
  limit = 50,
  offset = 0,
): Promise<{ entries: CommissionEntry[]; total: number }> {
  const clamped = Math.min(limit, 100);

  const [entriesRes, countRes] = await Promise.all([
    query<CommissionEntry>(
      `SELECT commission_id, po_id, supplier_id, project_id,
                    po_amount_cents, commission_rate_bps, commission_amount_cents,
                    tier_name, status, created_at, updated_at
             FROM commission_ledger
             WHERE supplier_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
      [supplierId, clamped, offset],
    ),
    query<{ count: string }>(`SELECT COUNT(*) FROM commission_ledger WHERE supplier_id = $1`, [
      supplierId,
    ]),
  ]);

  return {
    entries: entriesRes.rows,
    total: parseInt(countRes.rows[0]?.count ?? '0', 10),
  };
}

/**
 * Admin: Get commission summary for a date range.
 */
export async function getCommissionSummary(
  startDate?: string,
  endDate?: string,
): Promise<CommissionSummary> {
  let dateFilter = '';
  const params: unknown[] = [];

  if (startDate && endDate) {
    dateFilter = `AND created_at >= $1 AND created_at <= $2`;
    params.push(startDate, endDate);
  }

  const result = await query<{
    total_commissions: string;
    total_commission_revenue: string;
    mtd_commission_revenue: string;
    average_rate_bps: string;
  }>(
    `SELECT
            COUNT(*) AS total_commissions,
            COALESCE(SUM(commission_amount_cents), 0) AS total_commission_revenue,
            COALESCE(SUM(commission_amount_cents) FILTER (
                WHERE created_at >= date_trunc('month', NOW())
            ), 0) AS mtd_commission_revenue,
            COALESCE(AVG(commission_rate_bps), 0) AS average_rate_bps
         FROM commission_ledger
         WHERE status != 'waived' ${dateFilter}`,
    params,
  );

  const row = result.rows[0];

  // Find the most common tier
  const tierRes = await query<{ tier_name: string }>(
    `SELECT tier_name FROM commission_ledger
         WHERE status != 'waived'
         GROUP BY tier_name
         ORDER BY COUNT(*) DESC
         LIMIT 1`,
  );

  return {
    total_commissions: parseInt(row?.total_commissions ?? '0', 10),
    total_commission_revenue: parseInt(row?.total_commission_revenue ?? '0', 10),
    mtd_commission_revenue: parseInt(row?.mtd_commission_revenue ?? '0', 10),
    average_rate_bps: Math.round(Number(row?.average_rate_bps ?? '0')),
    top_tier: tierRes.rows[0]?.tier_name ?? 'N/A',
  };
}

/**
 * Admin: List all commissions with optional filters.
 */
export async function getAllCommissions(
  limit = 50,
  offset = 0,
  supplierId?: string,
): Promise<{ entries: Array<CommissionEntry & { supplier_name: string }>; total: number }> {
  const clamped = Math.min(limit, 100);
  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];
  let paramIdx = 1;

  if (supplierId) {
    whereClause += ` AND cl.supplier_id = $${paramIdx}`;
    params.push(supplierId);
    paramIdx++;
  }

  const [entriesRes, countRes] = await Promise.all([
    query<CommissionEntry & { supplier_name: string }>(
      `SELECT cl.commission_id, cl.po_id, cl.supplier_id, cl.project_id,
                    cl.po_amount_cents, cl.commission_rate_bps, cl.commission_amount_cents,
                    cl.tier_name, cl.status, cl.created_at, cl.updated_at,
                    u.full_name AS supplier_name
             FROM commission_ledger cl
             JOIN users u ON u.user_id = cl.supplier_id
             ${whereClause}
             ORDER BY cl.created_at DESC
             LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, clamped, offset],
    ),
    query<{ count: string }>(`SELECT COUNT(*) FROM commission_ledger cl ${whereClause}`, params),
  ]);

  return {
    entries: entriesRes.rows,
    total: parseInt(countRes.rows[0]?.count ?? '0', 10),
  };
}
