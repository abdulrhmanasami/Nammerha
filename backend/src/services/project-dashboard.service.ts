// ============================================================================
// Nammerha Backend — Project Dashboard Service (Ticket 7.3)
// Bird's eye view for homeowner with daily logs + digital approvals
// ============================================================================
import pool, { transaction } from '../config/database';
import type { PoolClient } from 'pg';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DailyLog {
  log_id: string;
  project_id: string;
  engineer_id: string;
  description: string;
  work_completed: string | null;
  issues_encountered: string | null;
  weather_conditions: string | null;
  workers_on_site: number;
  images: string[];
  log_date: string;
  created_at: Date;
}

export interface DigitalApproval {
  approval_id: string;
  project_id: string;
  item_id: string | null;
  requester_id: string;
  approver_id: string | null;
  title: string;
  description: string | null;
  material_sample_url: string | null;
  material_options: unknown[];
  status: 'pending' | 'approved' | 'rejected';
  decision_note: string | null;
  decided_at: Date | null;
  created_at: Date;
}

export interface CreateDailyLogDTO {
  description: string;
  work_completed?: string;
  issues_encountered?: string;
  weather_conditions?: string;
  workers_on_site?: number;
  images?: string[];
}

export interface CreateApprovalDTO {
  item_id?: string;
  title: string;
  description?: string;
  material_sample_url?: string;
  material_options?: unknown[];
}

export interface DashboardOverview {
  project: {
    project_id: string;
    title: string;
    status: string;
    damage_type: string;
    total_estimated_cost: number;
    total_funded_amount: number;
    funded_percentage: number;
    created_at: Date;
  };
  engineer: {
    user_id: string;
    full_name: string;
  } | null;
  milestones: Array<{
    milestone_id: string;
    name: string;
    description: string | null;
    percentage: number;
    status: string;
  }>;
  boq_summary: {
    total_items: number;
    fully_funded: number;
    delivered: number;
    total_cost: number;
    total_funded: number;
  };
  recent_logs: DailyLog[];
  pending_approvals: DigitalApproval[];
}

// ─── Dashboard Overview ─────────────────────────────────────────────────────

/**
 * Get bird's eye view of a project for homeowner/user/engineer.
 */
export async function getDashboardOverview(projectId: string): Promise<DashboardOverview> {
  // Project + engineer
  const projectRes = await pool.query(
    `SELECT p.*, u.user_id AS eng_id, u.full_name AS eng_name
         FROM projects p
         LEFT JOIN users u ON u.user_id = p.assigned_engineer_id
         WHERE p.project_id = $1`,
    [projectId],
  );

  if (projectRes.rows.length === 0) {
    throw new Error(`Project ${projectId} not found`);
  }

  const proj = projectRes.rows[0];

  // Milestones
  const milestoneRes = await pool.query(
    `SELECT milestone_id, name, description, completion_percentage, status
         FROM project_milestones WHERE project_id = $1 ORDER BY created_at`,
    [projectId],
  );

  // BOQ summary
  const boqRes = await pool.query(
    `SELECT
            COUNT(*)::INT AS total_items,
            COUNT(*) FILTER (WHERE status = 'fully_funded')::INT AS fully_funded,
            COUNT(*) FILTER (WHERE status = 'delivered')::INT AS delivered,
            COALESCE(SUM(unit_price::NUMERIC * required_quantity::NUMERIC), 0)::BIGINT AS total_cost,
            COALESCE(SUM(funded_amount), 0)::BIGINT AS total_funded
         FROM itemized_boq WHERE project_id = $1`,
    [projectId],
  );

  // Recent logs (last 7)
  const logsRes = await pool.query(
    `SELECT dl.*, u.full_name AS engineer_name
         FROM daily_logs dl
         JOIN users u ON u.user_id = dl.engineer_id
         WHERE dl.project_id = $1
         ORDER BY dl.log_date DESC LIMIT 7`,
    [projectId],
  );

  // Pending approvals
  const approvalsRes = await pool.query(
    `SELECT da.*, u.full_name AS requester_name
         FROM digital_approvals da
         JOIN users u ON u.user_id = da.requester_id
         WHERE da.project_id = $1 AND da.status = 'pending'
         ORDER BY da.created_at DESC`,
    [projectId],
  );

  const boq = boqRes.rows[0];
  const totalEstimated = parseInt(proj.total_estimated_cost) || 0;
  const totalFunded = parseInt(proj.total_funded_amount) || 0;

  return {
    project: {
      project_id: proj.project_id,
      title: proj.title,
      status: proj.status,
      damage_type: proj.damage_type,
      total_estimated_cost: totalEstimated,
      total_funded_amount: totalFunded,
      funded_percentage:
        totalEstimated > 0 ? Math.round((totalFunded / totalEstimated) * 10000) / 100 : 0,
      created_at: proj.created_at,
    },
    engineer: proj.eng_id ? { user_id: proj.eng_id, full_name: proj.eng_name } : null,
    milestones: milestoneRes.rows.map((m) => ({
      milestone_id: m.milestone_id,
      name: m.name,
      description: m.description,
      percentage: parseFloat(m.completion_percentage) || 0,
      status: m.status,
    })),
    boq_summary: {
      total_items: boq.total_items,
      fully_funded: boq.fully_funded,
      delivered: boq.delivered,
      total_cost: parseInt(boq.total_cost) || 0,
      total_funded: parseInt(boq.total_funded) || 0,
    },
    recent_logs: logsRes.rows,
    pending_approvals: approvalsRes.rows,
  };
}

// ─── Daily Logs ─────────────────────────────────────────────────────────────

export async function getDailyLogs(projectId: string, limit = 30, offset = 0): Promise<DailyLog[]> {
  const { rows } = await pool.query(
    `SELECT dl.*, u.full_name AS engineer_name
         FROM daily_logs dl
         JOIN users u ON u.user_id = dl.engineer_id
         WHERE dl.project_id = $1
         ORDER BY dl.log_date DESC
         LIMIT $2 OFFSET $3`,
    [projectId, Math.min(limit, 100), offset],
  );
  return rows;
}

export async function createDailyLog(
  engineerId: string,
  projectId: string,
  dto: CreateDailyLogDTO,
): Promise<DailyLog> {
  // P3-004 FIX: Transaction prevents TOCTOU race condition.
  // Without it, engineer could be unassigned between check and INSERT.
  return transaction(async (client: PoolClient) => {
    // Verify engineer is assigned to this project (FOR UPDATE prevents concurrent changes)
    const projRes = await client.query(
      `SELECT assigned_engineer_id FROM projects WHERE project_id = $1 FOR UPDATE`,
      [projectId],
    );

    if (projRes.rows.length === 0) {
      throw new Error(`Project ${projectId} not found`);
    }

    if (projRes.rows[0].assigned_engineer_id !== engineerId) {
      throw new Error('Only the assigned engineer can submit daily logs');
    }

    const { rows } = await client.query(
      `INSERT INTO daily_logs
                (project_id, engineer_id, description, work_completed,
                 issues_encountered, weather_conditions, workers_on_site, images)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING log_id, project_id, engineer_id, description,
                      work_completed, issues_encountered, weather_conditions,
                      workers_on_site, images, created_at`,
      [
        projectId,
        engineerId,
        dto.description,
        dto.work_completed || null,
        dto.issues_encountered || null,
        dto.weather_conditions || null,
        dto.workers_on_site || 0,
        JSON.stringify(dto.images || []),
      ],
    );

    return rows[0];
  });
}

// ─── Digital Approvals ──────────────────────────────────────────────────────

export async function requestApproval(
  requesterId: string,
  projectId: string,
  dto: CreateApprovalDTO,
): Promise<DigitalApproval> {
  const { rows } = await pool.query(
    `INSERT INTO digital_approvals
            (project_id, item_id, requester_id, title,
             description, material_sample_url, material_options)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING approval_id, project_id, item_id, requester_id,
                  title, description, material_sample_url, material_options,
                  status, approver_id, decision_note, decided_at, created_at`,
    [
      projectId,
      dto.item_id || null,
      requesterId,
      dto.title,
      dto.description || null,
      dto.material_sample_url || null,
      JSON.stringify(dto.material_options || []),
    ],
  );

  return rows[0];
}

export async function respondToApproval(
  approvalId: string,
  approverId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<DigitalApproval> {
  const { rows } = await pool.query(
    `UPDATE digital_approvals
         SET status = $1, approver_id = $2, decision_note = $3, decided_at = NOW()
         WHERE approval_id = $4 AND status = 'pending'
         RETURNING approval_id, project_id, item_id, requester_id,
                   title, description, material_sample_url, material_options,
                   status, approver_id, decision_note, decided_at, created_at`,
    [decision, approverId, note || null, approvalId],
  );

  if (rows.length === 0) {
    throw new Error('Approval not found or already processed');
  }

  return rows[0];
}

export async function getApprovals(projectId: string, status?: string): Promise<DigitalApproval[]> {
  let sql = `
        SELECT da.*, u.full_name AS requester_name,
               a.full_name AS approver_name
        FROM digital_approvals da
        JOIN users u ON u.user_id = da.requester_id
        LEFT JOIN users a ON a.user_id = da.approver_id
        WHERE da.project_id = $1
    `;
  const params: unknown[] = [projectId];

  if (status) {
    sql += ` AND da.status = $2`;
    params.push(status);
  }

  sql += ` ORDER BY da.created_at DESC`;

  const { rows } = await pool.query(sql, params);
  return rows;
}
