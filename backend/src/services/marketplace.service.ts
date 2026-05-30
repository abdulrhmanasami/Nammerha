// ============================================================================
// Nammerha Backend — Marketplace Service (Public Browse APIs)
// ============================================================================
// Extracted from crowdfunding.service.ts during Platinum Audit MEMO 59.
// These functions serve the public marketplace (no auth required):
//   1. Browse published projects on the map
//   2. View itemized BOQ (shopping basket) for a project
//   3. List verified suppliers for engineer BOQ picker
//
// DOMAIN LAW: These are READ-ONLY queries. No financial mutations.
// ============================================================================
import { query } from '../config/database';
import type { ProjectCard, BOQFunding } from '../types';

// ─── Browse Marketplace Projects ────────────────────────────────────────────

/**
 * Get all published projects for the public marketplace.
 * Uses the vw_project_cards view with funding percentages.
 */
export async function getMarketplaceProjects(filters?: {
  damage_type?: string;
  sort_by?: 'funded_percentage' | 'published_at';
  limit?: number;
  offset?: number;
}): Promise<ProjectCard[]> {
  // PLAT-AUD-001 FIX: Explicit column list — no SELECT * (prevents schema drift).
  let sql = `SELECT project_id, title, description, cover_image_url, address_text,
                    damage_type, status, total_estimated_cost, total_funded_amount,
                    funded_percentage, homeowner_name, latitude, longitude,
                    published_at, total_items, fully_funded_items
             FROM vw_project_cards`;
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (filters?.damage_type) {
    params.push(filters.damage_type);
    conditions.push(`damage_type = $${params.length}`);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  if (filters?.sort_by === 'funded_percentage') {
    sql += ' ORDER BY funded_percentage ASC'; // Show least-funded first
  } else {
    sql += ' ORDER BY published_at DESC'; // Newest first
  }

  // PLT-AUDIT-001 FIX: Enforce pagination to prevent unbounded result sets.
  // Without LIMIT, this endpoint returns every project in the database —
  // a memory exhaustion risk at scale, especially on degraded Syrian networks.
  const limit = Math.min(Math.max(filters?.limit ?? 25, 1), 100); // Clamp: 1–100
  const offset = Math.max(filters?.offset ?? 0, 0);
  params.push(limit);
  sql += ` LIMIT $${params.length}`;
  params.push(offset);
  sql += ` OFFSET $${params.length}`;

  const result = await query<ProjectCard>(sql, params);
  return result.rows;
}

// ─── Project BOQ (Bill of Quantities) ───────────────────────────────────────

/**
 * Get itemized BOQ with funding progress for the project details UI.
 * Uses the vw_boq_funding view.
 */
export async function getProjectBOQ(projectId: string): Promise<BOQFunding[]> {
  // PLAT-AUD-001 FIX: Explicit column list — no SELECT * (prevents schema drift).
  const result = await query<BOQFunding>(
    `SELECT item_id, project_id, material_name, material_category, unit,
                unit_price, required_quantity, total_cost, funded_amount,
                funded_percentage, status, image_url, oracle_reference_price,
                project_title, supplier_id, supplier_name, supplier_commercial_reg
         FROM vw_boq_funding
         WHERE project_id = $1
         ORDER BY material_category, material_name`,
    [projectId],
  );
  return result.rows;
}

// ─── Verified Supplier Network ──────────────────────────────────────────────

/**
 * List all verified, active suppliers for the engineer BOQ picker.
 * Per strategic study §7.2: engineers select pre-assigned suppliers when adding BOQ items.
 * Per strategic study §7.1: users see supplier name in the basket UI for transparency.
 *
 * NMR-AUD-M001 FIX: Added pagination to prevent unbounded PII exposure.
 */
export async function getVerifiedSuppliers(
  limit = 100,
  offset = 0,
): Promise<{ user_id: string; full_name: string; commercial_register_number: string | null }[]> {
  // Clamp limit to prevent abuse (max 500, min 1)
  const safeLim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeOff = Math.max(Number(offset) || 0, 0);

  const result = await query<{
    user_id: string;
    full_name: string;
    commercial_register_number: string | null;
  }>(
    `SELECT u.user_id, u.full_name, u.commercial_register_number
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id AND r.role_name = 'supplier'
         WHERE ur.status = 'active'
           AND u.is_active = TRUE
           AND u.kyc_verification_status = 'verified'
         ORDER BY u.full_name ASC
         LIMIT $1 OFFSET $2`,
    [safeLim, safeOff],
  );
  return result.rows;
}
