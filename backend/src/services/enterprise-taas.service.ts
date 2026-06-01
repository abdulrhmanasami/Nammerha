// ============================================================================
// Nammerha Backend — Enterprise TaaS Service
// Transparency-as-a-Service for institutional users (NGOs, INGOs, funds).
// Per profitability study §6: OCDS-powered dashboards + API access.
// ============================================================================
import { query } from '../config/database';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnterpriseOrg {
  org_id: string;
  org_name: string;
  org_type: string;
  contact_email: string;
  tier: string;
  rate_limit_rpm: number;
  is_active: boolean;
  annual_fee_cents: number;
  currency: string;
  subscription_start: Date;
  subscription_end: Date | null;
  created_at: Date;
}

export interface EnterpriseDashboard {
  org: EnterpriseOrg;
  metrics: {
    total_projects_funded: number;
    total_amount_funded: number;
    projects_completed: number;
    projects_in_progress: number;
    total_spatial_proofs: number;
    api_calls_this_month: number;
  };
}

export interface ProjectAudit {
  project_id: string;
  title: string;
  status: string;
  total_budget_cents: number;
  funded_amount_cents: number;
  items_count: number;
  proofs_count: number;
  escrow_released_cents: number;
  escrow_locked_cents: number;
  created_at: Date;
  updated_at: Date;
}

export interface ImpactReport {
  total_projects: number;
  total_beneficiaries: number;
  total_funds_deployed: number;
  total_materials_delivered: number;
  completion_rate: number;
  verification_rate: number;
  avg_project_duration_days: number;
  currency: string;
}

// ─── API Key Management ─────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure API key.
 * Returns both the plaintext key (shown once) and its SHA-256 hash (stored).
 */
export function generateApiKey(): { key: string; hash: string } {
  const key = `nmh_ent_${crypto.randomBytes(24).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, hash };
}

/**
 * Validate an API key against stored hashes.
 * Returns the org if valid, null if invalid/inactive.
 */
export async function validateApiKey(apiKey: string): Promise<EnterpriseOrg | null> {
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const result = await query<EnterpriseOrg>(
    `SELECT org_id, org_name, org_type, contact_email, tier,
                rate_limit_rpm, is_active, annual_fee_cents, currency,
                subscription_start, subscription_end, created_at
         FROM enterprise_organizations
         WHERE api_key_hash = $1 AND is_active = TRUE`,
    [hash],
  );
  return result.rows[0] ?? null;
}

// ─── Organization CRUD ──────────────────────────────────────────────────────

/**
 * Admin: Create a new enterprise organization.
 * Returns the org with the plaintext API key (shown only once).
 */
export async function createOrganization(params: {
  org_name: string;
  org_type: string;
  contact_email: string;
  tier?: string;
  annual_fee_cents?: number;
}): Promise<EnterpriseOrg & { api_key_plaintext: string }> {
  const { key, hash } = generateApiKey();

  const result = await query<EnterpriseOrg>(
    `INSERT INTO enterprise_organizations
            (org_name, org_type, contact_email, tier, api_key, api_key_hash,
             annual_fee_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING org_id, org_name, org_type, contact_email, tier,
                   rate_limit_rpm, is_active, annual_fee_cents, currency,
                   subscription_start, subscription_end, created_at`,
    [
      params.org_name,
      params.org_type,
      params.contact_email,
      params.tier ?? 'basic',
      key, // stored for admin reference
      hash, // used for validation
      params.annual_fee_cents ?? 0,
    ],
  );

  if (!result.rows[0]) {
    throw new Error('Failed to create organization');
  }

  logger.info('Enterprise org created', {
    orgId: result.rows[0].org_id,
    orgName: params.org_name,
    tier: params.tier ?? 'basic',
  });

  return { ...result.rows[0], api_key_plaintext: key };
}

/**
 * Admin: List all enterprise organizations.
 */
export async function listOrganizations(): Promise<EnterpriseOrg[]> {
  const result = await query<EnterpriseOrg>(
    `SELECT org_id, org_name, org_type, contact_email, tier,
                rate_limit_rpm, is_active, annual_fee_cents, currency,
                subscription_start, subscription_end, created_at
         FROM enterprise_organizations
         ORDER BY created_at DESC`,
  );
  return result.rows;
}

// ─── Dashboard Data ─────────────────────────────────────────────────────────

/**
 * Enterprise: Get org-level dashboard with aggregated OCDS metrics.
 */
export async function getOrgDashboard(orgId: string): Promise<EnterpriseDashboard> {
  // Fetch org details
  const orgResult = await query<EnterpriseOrg>(
    `SELECT org_id, org_name, org_type, contact_email, tier,
                rate_limit_rpm, is_active, annual_fee_cents, currency,
                subscription_start, subscription_end, created_at
         FROM enterprise_organizations
         WHERE org_id = $1`,
    [orgId],
  );

  const org = orgResult.rows[0];
  if (!org) {
    throw new Error('Organization not found');
  }

  // Fetch platform-wide metrics (enterprise orgs see the full picture)
  const metricsResult = await query<{
    total_projects_funded: string;
    total_amount_funded: string;
    projects_completed: string;
    projects_in_progress: string;
    total_spatial_proofs: string;
  }>(
    `SELECT
            (SELECT COUNT(*) FROM projects WHERE is_public = true) AS total_projects_funded,
            (SELECT COALESCE(SUM(funded_amount), 0) FROM itemized_boq) AS total_amount_funded,
            (SELECT COUNT(*) FROM projects WHERE status = 'completed') AS projects_completed,
            (SELECT COUNT(*) FROM projects WHERE status IN ('in_progress', 'funded')) AS projects_in_progress,
            (SELECT COUNT(*) FROM spatial_proof WHERE verification_status = 'verified') AS total_spatial_proofs`,
  );

  const apiCallsResult = await query<{ count: string }>(
    `SELECT COUNT(*) FROM enterprise_api_log
         WHERE org_id = $1 AND created_at >= date_trunc('month', NOW())`,
    [orgId],
  );

  const m = metricsResult.rows[0];
  return {
    org,
    metrics: {
      total_projects_funded: parseInt(m?.total_projects_funded ?? '0', 10),
      total_amount_funded: parseInt(m?.total_amount_funded ?? '0', 10),
      projects_completed: parseInt(m?.projects_completed ?? '0', 10),
      projects_in_progress: parseInt(m?.projects_in_progress ?? '0', 10),
      total_spatial_proofs: parseInt(m?.total_spatial_proofs ?? '0', 10),
      api_calls_this_month: parseInt(apiCallsResult.rows[0]?.count ?? '0', 10),
    },
  };
}

// ─── Project Audit Trail ────────────────────────────────────────────────────

/**
 * Enterprise: Get detailed audit trail for a specific project.
 */
export async function getProjectAuditTrail(projectId: string): Promise<ProjectAudit> {
  const result = await query<{
    project_id: string;
    title: string;
    status: string;
    total_budget: string;
    funded_amount: string;
    items_count: string;
    proofs_count: string;
    escrow_released: string;
    escrow_locked: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT
            p.project_id, p.title, p.status,
            COALESCE(SUM(b.unit_price * b.required_quantity), 0) AS total_budget,
            COALESCE(SUM(b.funded_amount), 0) AS funded_amount,
            COUNT(DISTINCT b.item_id) AS items_count,
            (SELECT COUNT(*) FROM spatial_proof sp
             WHERE sp.project_id = p.project_id
               AND sp.verification_status = 'verified') AS proofs_count,
            COALESCE((SELECT SUM(amount_locked) FROM escrow_ledger
                      WHERE project_id = p.project_id
                        AND payment_status = 'released'), 0) AS escrow_released,
            COALESCE((SELECT SUM(amount_locked) FROM escrow_ledger
                      WHERE project_id = p.project_id
                        AND payment_status = 'locked'), 0) AS escrow_locked,
            p.created_at, p.updated_at
         FROM projects p
         LEFT JOIN itemized_boq b ON b.project_id = p.project_id
         WHERE p.project_id = $1 AND p.is_public = true
         GROUP BY p.project_id`,
    [projectId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Project ${projectId} not found or is not public`);
  }

  return {
    project_id: row.project_id,
    title: row.title,
    status: row.status,
    total_budget_cents: parseInt(row.total_budget, 10),
    funded_amount_cents: parseInt(row.funded_amount, 10),
    items_count: parseInt(row.items_count, 10),
    proofs_count: parseInt(row.proofs_count, 10),
    escrow_released_cents: parseInt(row.escrow_released, 10),
    escrow_locked_cents: parseInt(row.escrow_locked, 10),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─── Impact Report ──────────────────────────────────────────────────────────

/**
 * Enterprise: Generate ESG/SDG impact report with platform-wide metrics.
 */
export async function getImpactReport(): Promise<ImpactReport> {
  const result = await query<{
    total_projects: string;
    total_beneficiaries: string;
    total_funds_deployed: string;
    total_materials_delivered: string;
    projects_completed: string;
    total_proofs: string;
    avg_duration_days: string;
  }>(
    `SELECT
            (SELECT COUNT(*) FROM projects WHERE is_public = true) AS total_projects,
            (SELECT COUNT(DISTINCT homeowner_id) FROM projects) AS total_beneficiaries,
            (SELECT COALESCE(SUM(amount_locked), 0) FROM escrow_ledger
             WHERE payment_status = 'released') AS total_funds_deployed,
            (SELECT COUNT(DISTINCT item_id) FROM escrow_ledger
             WHERE payment_status = 'released') AS total_materials_delivered,
            (SELECT COUNT(*) FROM projects WHERE status = 'completed') AS projects_completed,
            (SELECT COUNT(*) FROM spatial_proof
             WHERE verification_status = 'verified') AS total_proofs,
            COALESCE((SELECT AVG(EXTRACT(DAY FROM (updated_at - created_at)))
             FROM projects WHERE status = 'completed'), 0) AS avg_duration_days`,
  );

  const r = result.rows[0];
  const totalProjects = parseInt(r?.total_projects ?? '0', 10);
  const completed = parseInt(r?.projects_completed ?? '0', 10);
  const totalProofs = parseInt(r?.total_proofs ?? '0', 10);
  const materialsDelivered = parseInt(r?.total_materials_delivered ?? '0', 10);

  return {
    total_projects: totalProjects,
    total_beneficiaries: parseInt(r?.total_beneficiaries ?? '0', 10),
    total_funds_deployed: parseInt(r?.total_funds_deployed ?? '0', 10),
    total_materials_delivered: materialsDelivered,
    completion_rate: totalProjects > 0 ? Math.round((completed / totalProjects) * 10000) / 100 : 0,
    verification_rate:
      materialsDelivered > 0 ? Math.round((totalProofs / materialsDelivered) * 10000) / 100 : 0,
    avg_project_duration_days: Math.round(parseFloat(r?.avg_duration_days ?? '0')),
    currency: 'USD',
  };
}

// ─── API Logging ────────────────────────────────────────────────────────────

/**
 * Log an enterprise API call for usage analytics.
 */
export async function logApiCall(
  orgId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseMs: number,
  ipAddress?: string,
): Promise<void> {
  await query(
    `INSERT INTO enterprise_api_log
            (org_id, endpoint, method, status_code, response_ms, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
    [orgId, endpoint, method, statusCode, responseMs, ipAddress ?? null],
  );
}
