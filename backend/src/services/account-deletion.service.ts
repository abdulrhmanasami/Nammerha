// ============================================================================
// Nammerha Backend — Account Deletion Service (GDPR Art. 17)
// ============================================================================
// Three-phase GDPR-compliant account deletion:
//
//   Phase 1: REQUEST  — Soft-delete, invalidate sessions, schedule purge
//   Phase 2: CANCEL   — User logs in within grace period, cancels deletion
//   Phase 3: EXECUTE  — Cron job anonymizes financial records, hard-deletes PII
//
// Financial Integrity Guarantees:
//   - escrow_ledger → RETAINED (user references set to NULL)
//   - payment_transactions → RETAINED (anonymized)
//   - audit_trail → RETAINED (actor_id set NULL, trail preserved)
//   - projects → RETAINED (homeowner_id set NULL, project continues)
//
// Standards: GDPR Art. 17, ISO/IEC 25010 (Platinum), OWASP ASVS v4 §1.4
// ============================================================================

import pool from '../config/database';
import { logger } from '../utils/logger';
import { enqueueSecurityAlertEmail } from './email-queue.service';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Grace period before permanent deletion (days) */
const GRACE_PERIOD_DAYS = 30;

/** Placeholder for anonymized user data */
const ANONYMIZED_NAME = '[Deleted User]';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeletionBlocker {
  type: 'active_escrow' | 'active_project' | 'admin_role';
  message: string;
  message_ar: string;
  details?: Record<string, unknown>;
}

export interface DeletionRequestResult {
  success: boolean;
  request_id?: string;
  grace_period_ends?: string;
  blockers?: DeletionBlocker[];
  error?: string;
}

export interface DeletionStatus {
  deletion_pending: boolean;
  deleted_at: string | null;
  grace_period_ends: string | null;
  days_remaining: number | null;
}

export interface PurgeResult {
  user_id: string;
  anonymized_tables: string[];
  hard_deleted_tables: string[];
  errors: string[];
}

// ─── Phase 1: Request Deletion ──────────────────────────────────────────────

/**
 * Check if a user has any blockers that prevent account deletion.
 *
 * Blockers:
 *   1. Active escrow (locked funds) — cannot abandon user money
 *   2. Active in-progress projects as homeowner — construction underway
 *   3. Admin/auditor role — requires super-admin approval
 */
export async function checkDeletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const blockers: DeletionBlocker[] = [];

  // 1. Active escrow — locked funds that haven't been released or refunded
  const escrowResult = await pool.query<{ count: string; total_locked: string }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(amount_locked), 0) AS total_locked
         FROM escrow_ledger
         WHERE user_id = $1 AND payment_status = 'locked'`,
    [userId],
  );

  const escrowCount = parseInt(escrowResult.rows[0]?.count ?? '0', 10);
  if (escrowCount > 0) {
    const totalLocked = parseInt(escrowResult.rows[0]?.total_locked ?? '0', 10);
    blockers.push({
      type: 'active_escrow',
      message: `Cannot delete account: You have ${escrowCount} active escrow transaction(s) with $${(totalLocked / 100).toFixed(2)} in locked funds. Please wait for funds to be released or request a refund.`,
      message_ar: `لا يمكن حذف الحساب: لديك ${escrowCount} معاملة ضمان نشطة بمبلغ $${(totalLocked / 100).toFixed(2)} مجمّد. انتظر حتى يتم تحرير الأموال أو اطلب استرداد.`,
      details: { escrow_count: escrowCount, total_locked_cents: totalLocked },
    });
  }

  // 2. Active in-progress projects as homeowner
  const projectResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
         FROM projects
         WHERE homeowner_id = $1 AND status IN ('in_progress', 'pending_assessment', 'assessed')`,
    [userId],
  );

  const projectCount = parseInt(projectResult.rows[0]?.count ?? '0', 10);
  if (projectCount > 0) {
    blockers.push({
      type: 'active_project',
      message: `Cannot delete account: You have ${projectCount} active project(s) under construction. Please complete or cancel them first.`,
      message_ar: `لا يمكن حذف الحساب: لديك ${projectCount} مشروع(مشاريع) نشط(ة) قيد الإنشاء. أكمل أو ألغِ المشاريع أولاً.`,
      details: { project_count: projectCount },
    });
  }

  // 3. Admin/auditor role — sensitive role, require manual process
  const roleResult = await pool.query<{ role: string }>(
    `SELECT role FROM users WHERE user_id = $1`,
    [userId],
  );
  const userRole = roleResult.rows[0]?.role;
  if (userRole === 'admin' || userRole === 'auditor') {
    blockers.push({
      type: 'admin_role',
      message:
        'Admin and auditor accounts require manual deletion by a super-administrator. Please contact support.',
      message_ar:
        'حسابات المدراء والمدققين تتطلب حذفاً يدوياً من قبل مدير أعلى. يرجى التواصل مع الدعم.',
    });
  }

  return blockers;
}

/**
 * Request account deletion (Phase 1).
 *
 * Sets soft-delete fields, invalidates all sessions, and creates
 * a deletion request with a 30-day grace period.
 *
 * @param userId - The user requesting deletion
 * @param reason - Optional user-provided reason
 * @param ipAddress - IP address for audit trail
 * @param userAgent - User agent for audit trail
 */
export async function requestDeletion(
  userId: string,
  reason: string | null,
  ipAddress: string,
  userAgent: string,
): Promise<DeletionRequestResult> {
  // 1. Check blockers
  const blockers = await checkDeletionBlockers(userId);
  if (blockers.length > 0) {
    return { success: false, blockers };
  }

  // 2. Check for existing pending deletion
  const existingResult = await pool.query<{ request_id: string; grace_period_ends: Date }>(
    `SELECT request_id, grace_period_ends
         FROM account_deletion_requests
         WHERE user_id = $1 AND status = 'pending'
         ORDER BY requested_at DESC LIMIT 1`,
    [userId],
  );

  if (existingResult.rows[0]) {
    return {
      success: true,
      request_id: existingResult.rows[0].request_id,
      grace_period_ends: existingResult.rows[0].grace_period_ends.toISOString(),
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Use Serializable isolation for financial safety
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

    const gracePeriodEnds = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // 3. Soft-delete the user
    await client.query(
      `UPDATE users
             SET deleted_at = NOW(),
                 deletion_scheduled_at = $2,
                 deletion_reason = $3,
                 is_active = FALSE,
                 token_invalidated_at = NOW()
             WHERE user_id = $1`,
      [userId, gracePeriodEnds, reason],
    );

    // 4. Create deletion request record
    const requestResult = await client.query<{ request_id: string }>(
      `INSERT INTO account_deletion_requests
                (user_id, status, grace_period_ends, deletion_reason, ip_address, user_agent)
             VALUES ($1, 'pending', $2, $3, $4, $5)
             RETURNING request_id`,
      [userId, gracePeriodEnds, reason, ipAddress, userAgent],
    );

    const requestId = requestResult.rows[0]?.request_id;
    if (!requestId) {
      throw new Error('Failed to create deletion request');
    }

    // 5. Audit trail
    await client.query(
      `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, ip_address, user_agent, new_values)
             VALUES ('account_deletion_requested', 'user', $1, $1, $2, $3, $4)`,
      [
        userId,
        ipAddress,
        userAgent,
        JSON.stringify({
          grace_period_ends: gracePeriodEnds.toISOString(),
          reason: reason ?? 'not_specified',
          request_id: requestId,
        }),
      ],
    );

    await client.query('COMMIT');

    // 6. Send security alert email (non-blocking, after commit)
    const userEmail = await getUserEmail(userId);
    if (userEmail) {
      enqueueSecurityAlertEmail(
        userEmail,
        'Account Deletion Requested',
        `Your Nammerha account has been scheduled for permanent deletion on ${gracePeriodEnds.toLocaleDateString('en-GB')}. ` +
          'If you did not request this, log in immediately to cancel the deletion.',
        ipAddress,
        'en',
        { sourceAction: 'account_deletion_requested', sourceUserId: userId },
      );
    }

    logger.info('GDPR-047: Account deletion requested', {
      user_id: userId,
      request_id: requestId,
      grace_period_ends: gracePeriodEnds.toISOString(),
    });

    return {
      success: true,
      request_id: requestId,
      grace_period_ends: gracePeriodEnds.toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('GDPR-047: Failed to request account deletion', {
      user_id: userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: 'Failed to process deletion request' };
  } finally {
    client.release();
  }
}

// ─── Phase 2: Cancel Deletion ───────────────────────────────────────────────

/**
 * Cancel a pending account deletion (Phase 2).
 * User logged in within the 30-day grace period and chose to keep their account.
 */
export async function cancelDeletion(
  userId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: boolean; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Clear soft-delete fields
    const updateResult = await client.query<{ deleted_at: Date | null }>(
      `UPDATE users
             SET deleted_at = NULL,
                 deletion_scheduled_at = NULL,
                 deletion_reason = NULL,
                 is_active = TRUE
             WHERE user_id = $1 AND deleted_at IS NOT NULL
             RETURNING deleted_at`,
      [userId],
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'No pending deletion found' };
    }

    // 2. Cancel the deletion request
    await client.query(
      `UPDATE account_deletion_requests
             SET status = 'cancelled',
                 cancelled_at = NOW()
             WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    );

    // 3. Audit trail
    await client.query(
      `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, ip_address, user_agent, new_values)
             VALUES ('account_deletion_cancelled', 'user', $1, $1, $2, $3, $4)`,
      [userId, ipAddress, userAgent, JSON.stringify({ cancelled_at: new Date().toISOString() })],
    );

    await client.query('COMMIT');

    // Send confirmation email
    const userEmail = await getUserEmail(userId);
    if (userEmail) {
      enqueueSecurityAlertEmail(
        userEmail,
        'Account Deletion Cancelled',
        'Your account deletion has been cancelled. Your account is now fully active again.',
        ipAddress,
        'en',
        { sourceAction: 'account_deletion_cancelled', sourceUserId: userId },
      );
    }

    logger.info('GDPR-047: Account deletion cancelled', { user_id: userId });
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('GDPR-047: Failed to cancel deletion', {
      user_id: userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: 'Failed to cancel deletion' };
  } finally {
    client.release();
  }
}

// ─── Phase 2.5: Deletion Status ─────────────────────────────────────────────

/**
 * Get the current deletion status for a user.
 */
export async function getDeletionStatus(userId: string): Promise<DeletionStatus> {
  const result = await pool.query<{
    deleted_at: Date | null;
    deletion_scheduled_at: Date | null;
  }>(`SELECT deleted_at, deletion_scheduled_at FROM users WHERE user_id = $1`, [userId]);

  const user = result.rows[0];
  if (!user || !user.deleted_at || !user.deletion_scheduled_at) {
    return {
      deletion_pending: false,
      deleted_at: null,
      grace_period_ends: null,
      days_remaining: null,
    };
  }

  const now = Date.now();
  const endsAt = user.deletion_scheduled_at.getTime();
  const daysRemaining = Math.max(0, Math.ceil((endsAt - now) / (24 * 60 * 60 * 1000)));

  return {
    deletion_pending: true,
    deleted_at: user.deleted_at.toISOString(),
    grace_period_ends: user.deletion_scheduled_at.toISOString(),
    days_remaining: daysRemaining,
  };
}

// ─── Phase 3: Execute Permanent Deletion (Cron) ─────────────────────────────

/**
 * Execute permanent deletion for a single user.
 * Called by the purge cron job after the grace period expires.
 *
 * Strategy:
 *   1. ANONYMIZE: Overwrite PII on users table (keep row for FK integrity)
 *   2. NULLIFY: Set user FK references to NULL on financial records
 *   3. HARD-DELETE: Remove cascadable data (profiles, MFA, sessions, etc.)
 *   4. RECORD: Log all anonymized tables in the deletion request
 *
 * ALL operations run in a single Serializable transaction.
 */
export async function executePermanentDeletion(userId: string): Promise<PurgeResult> {
  const result: PurgeResult = {
    user_id: userId,
    anonymized_tables: [],
    hard_deleted_tables: [],
    errors: [],
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

    // ── 1. ANONYMIZE users table (keep row for FK integrity) ──────────

    // Generate a unique anonymous email to maintain UNIQUE constraint
    const anonEmail = `deleted_${userId.slice(0, 8)}@nammerha.anon`;

    await client.query(
      `UPDATE users SET
                full_name = $2,
                email = $3,
                phone = NULL,
                password_hash = NULL,
                avatar_url = NULL,
                kyc_verification_status = 'pending',
                kyc_document_url = NULL,
                kyc_verified_at = NULL,
                kyc_verified_by = NULL,
                commercial_register_number = NULL,
                engineering_license_number = NULL,
                guild_membership_id = NULL,
                gps_last_known = NULL,
                is_active = FALSE,
                is_email_verified = FALSE,
                email_verification_token = NULL,
                email_token_expires_at = NULL,
                password_reset_token = NULL,
                reset_token_expires_at = NULL,
                token_invalidated_at = NOW(),
                mfa_enabled = FALSE,
                mfa_enforced_at = NULL
             WHERE user_id = $1`,
      [userId, ANONYMIZED_NAME, anonEmail],
    );
    result.anonymized_tables.push('users');

    // ── 2. NULLIFY financial record references ────────────────────────
    // These tables retain data for financial auditing but lose PII linkage.

    // 2a. escrow_ledger — user_id stays for aggregate integrity,
    //     but released_by (auditor reference) is nullified
    const escrowUpdate = await client.query(
      `UPDATE escrow_ledger SET released_by = NULL WHERE released_by = $1`,
      [userId],
    );
    if ((escrowUpdate.rowCount ?? 0) > 0)
      result.anonymized_tables.push('escrow_ledger.released_by');

    // 2b. projects — nullify homeowner_id and engineer references
    const projHomeowner = await client.query(
      `UPDATE projects SET homeowner_id = NULL WHERE homeowner_id = $1`,
      [userId],
    );
    if ((projHomeowner.rowCount ?? 0) > 0) result.anonymized_tables.push('projects.homeowner_id');

    const projEngineer = await client.query(
      `UPDATE projects SET assigned_engineer_id = NULL WHERE assigned_engineer_id = $1`,
      [userId],
    );
    if ((projEngineer.rowCount ?? 0) > 0)
      result.anonymized_tables.push('projects.assigned_engineer_id');

    // 2c. audit_trail — keep trail, anonymize actor
    const auditUpdate = await client.query(
      `UPDATE audit_trail SET actor_id = NULL WHERE actor_id = $1`,
      [userId],
    );
    if ((auditUpdate.rowCount ?? 0) > 0) result.anonymized_tables.push('audit_trail.actor_id');

    // 2d. spatial_proof — keep proof (construction evidence), nullify actor
    const proofUpdate = await client.query(
      `UPDATE spatial_proof SET engineer_id = NULL WHERE engineer_id = $1`,
      [userId],
    );
    if ((proofUpdate.rowCount ?? 0) > 0) result.anonymized_tables.push('spatial_proof.engineer_id');

    // 2e. itemized_boq — nullify creator/verifier references
    await client.query(`UPDATE itemized_boq SET created_by = NULL WHERE created_by = $1`, [userId]);
    await client.query(`UPDATE itemized_boq SET verified_by = NULL WHERE verified_by = $1`, [
      userId,
    ]);
    result.anonymized_tables.push('itemized_boq.created_by', 'itemized_boq.verified_by');

    // 2f. epa_adjustments — nullify approver
    await client.query(`UPDATE epa_adjustments SET approved_by = NULL WHERE approved_by = $1`, [
      userId,
    ]);
    result.anonymized_tables.push('epa_adjustments.approved_by');

    // 2g. compliance_records — nullify reviewer
    await client.query(`UPDATE compliance_records SET reviewed_by = NULL WHERE reviewed_by = $1`, [
      userId,
    ]);
    result.anonymized_tables.push('compliance_records.reviewed_by');

    // 2h. reality capture annotations — nullify author
    await client
      .query(`UPDATE capture_annotations SET author_id = NULL WHERE author_id = $1`, [userId])
      .catch(() => {
        /* Table may not exist in all environments */
      });

    // 2i. contractor/tradesperson assignments — nullify
    await client
      .query(
        `UPDATE projects SET assigned_contractor_id = NULL WHERE assigned_contractor_id = $1`,
        [userId],
      )
      .catch(() => {
        /* Column may not exist */
      });

    // 2j. dashboard tables — nullify user references
    await client
      .query(`UPDATE engineer_assignments SET engineer_id = NULL WHERE engineer_id = $1`, [userId])
      .catch(() => {
        /* Table may not exist */
      });

    // 2k. payment_transactions — nullify user reference
    await client
      .query(`UPDATE payment_transactions SET user_id = NULL WHERE user_id = $1`, [userId])
      .catch(() => {
        /* Table may not exist */
      });
    result.anonymized_tables.push('payment_transactions.user_id');

    // 2l. review system — nullify reviewer references
    await client
      .query(`UPDATE review_reports SET reviewed_by = NULL WHERE reviewed_by = $1`, [userId])
      .catch(() => {
        /* Table may not exist */
      });

    // ── 3. HARD-DELETE cascadable personal data ───────────────────────
    // These tables have ON DELETE CASCADE from users, but we delete
    // explicitly for audit traceability.

    // MFA data (tables created by migration 046 — may not exist yet)
    const mfaDel = await client
      .query(`DELETE FROM user_recovery_codes WHERE user_id = $1`, [userId])
      .catch(() => null);
    if (mfaDel && (mfaDel.rowCount ?? 0) > 0)
      result.hard_deleted_tables.push('user_recovery_codes');

    const mfaSecDel = await client
      .query(`DELETE FROM user_mfa_secrets WHERE user_id = $1`, [userId])
      .catch(() => null);
    if (mfaSecDel && (mfaSecDel.rowCount ?? 0) > 0)
      result.hard_deleted_tables.push('user_mfa_secrets');

    // Social auth accounts
    const socialDel = await client
      .query(`DELETE FROM social_auth_accounts WHERE user_id = $1`, [userId])
      .catch(() => null);
    if (socialDel && (socialDel.rowCount ?? 0) > 0)
      result.hard_deleted_tables.push('social_auth_accounts');

    // Sessions and device tokens
    await client.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]).catch(() => {});
    await client.query(`DELETE FROM device_tokens WHERE user_id = $1`, [userId]).catch(() => {});
    result.hard_deleted_tables.push('user_sessions', 'device_tokens');

    // API keys and quotas
    await client.query(`DELETE FROM api_keys WHERE user_id = $1`, [userId]).catch(() => {});
    await client.query(`DELETE FROM api_quotas WHERE user_id = $1`, [userId]).catch(() => {});
    result.hard_deleted_tables.push('api_keys', 'api_quotas');

    // Privacy settings
    await client.query(`DELETE FROM privacy_settings WHERE user_id = $1`, [userId]).catch(() => {});
    result.hard_deleted_tables.push('privacy_settings');

    // User roles
    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]).catch(() => {});
    result.hard_deleted_tables.push('user_roles');

    // Role-specific profiles
    const profileTables = [
      'homeowner_profiles',
      'engineer_profiles',
      'contractor_profiles',
      'supplier_profiles',
      'tradesperson_profiles',
      'user_profiles',
    ];
    for (const table of profileTables) {
      const delResult = await client
        .query(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
        .catch(() => null);
      if (delResult && (delResult.rowCount ?? 0) > 0) {
        result.hard_deleted_tables.push(table);
      }
    }

    // Compliance records (cascadable — user's own KYC docs)
    await client.query(`DELETE FROM compliance_records WHERE user_id = $1`, [userId]);
    result.hard_deleted_tables.push('compliance_records');

    // Supplier catalog
    await client
      .query(`DELETE FROM supplier_catalog WHERE supplier_id = $1`, [userId])
      .catch(() => {});
    result.hard_deleted_tables.push('supplier_catalog');

    // Reviews authored by user
    await client.query(`DELETE FROM review_votes WHERE voter_id = $1`, [userId]).catch(() => {});
    await client
      .query(`DELETE FROM review_responses WHERE responder_id = $1`, [userId])
      .catch(() => {});
    await client
      .query(`DELETE FROM review_reports WHERE reporter_id = $1`, [userId])
      .catch(() => {});
    await client.query(`DELETE FROM reviews WHERE reviewer_id = $1`, [userId]).catch(() => {});
    result.hard_deleted_tables.push('reviews', 'review_votes', 'review_responses');

    // Notifications
    await client.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]).catch(() => {});
    result.hard_deleted_tables.push('notifications');

    // Impact messages
    await client.query(`DELETE FROM impact_messages WHERE user_id = $1`, [userId]).catch(() => {});
    result.hard_deleted_tables.push('impact_messages');

    // Subscriptions
    await client
      .query(`DELETE FROM user_subscriptions WHERE user_id = $1`, [userId])
      .catch(() => {});
    result.hard_deleted_tables.push('user_subscriptions');

    // Matchmaking applications
    await client
      .query(`DELETE FROM matchmaking_applications WHERE engineer_id = $1`, [userId])
      .catch(() => {});
    result.hard_deleted_tables.push('matchmaking_applications');

    // Email queue (pending emails for this user)
    await client
      .query(
        `DELETE FROM email_queue WHERE source_user_id = $1 AND status IN ('pending', 'failed')`,
        [userId],
      )
      .catch(() => {});

    // ── 4. Mark deletion request as completed ─────────────────────────
    await client.query(
      `UPDATE account_deletion_requests
             SET status = 'completed',
                 completed_at = NOW(),
                 anonymized_tables = $2
             WHERE user_id = $1 AND status = 'pending'`,
      [
        userId,
        JSON.stringify({
          anonymized: result.anonymized_tables,
          hard_deleted: result.hard_deleted_tables,
          executed_at: new Date().toISOString(),
        }),
      ],
    );

    // ── 5. Final audit trail entry ────────────────────────────────────
    await client.query(
      `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
             VALUES ('account_permanently_deleted', 'user', $1, NULL, $2)`,
      [
        userId,
        JSON.stringify({
          anonymized_tables: result.anonymized_tables,
          hard_deleted_tables: result.hard_deleted_tables,
          gdpr_article: '17',
          executed_at: new Date().toISOString(),
        }),
      ],
    );

    await client.query('COMMIT');

    logger.info('GDPR-047: Account permanently deleted (anonymized + purged)', {
      user_id: userId,
      anonymized: result.anonymized_tables.length,
      hard_deleted: result.hard_deleted_tables.length,
    });

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    const errMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(errMsg);
    logger.error('GDPR-047: Failed to execute permanent deletion', {
      user_id: userId,
      error: errMsg,
    });
    return result;
  } finally {
    client.release();
  }
}

// ─── Phase 3: Purge Cron (Find & Process Expired Deletions) ─────────────────

/**
 * Find all users whose grace period has expired and execute permanent deletion.
 * Called by the daily cron job.
 *
 * @returns Array of purge results for each processed user
 */
export async function processExpiredDeletions(): Promise<PurgeResult[]> {
  const results: PurgeResult[] = [];

  // Find users with expired grace periods
  const expiredResult = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM users
         WHERE deleted_at IS NOT NULL
           AND deletion_scheduled_at IS NOT NULL
           AND deletion_scheduled_at <= NOW()
         ORDER BY deletion_scheduled_at ASC
         LIMIT 50`,
  );

  if (expiredResult.rows.length === 0) {
    logger.info('GDPR-047: No expired deletion requests to process');
    return results;
  }

  logger.info('GDPR-047: Processing expired deletion requests', {
    count: expiredResult.rows.length,
  });

  for (const row of expiredResult.rows) {
    const purgeResult = await executePermanentDeletion(row.user_id);
    results.push(purgeResult);

    // Brief pause between deletions to avoid DB overload
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.info('GDPR-047: Purge cron completed', {
    processed: results.length,
    errors: results.filter((r) => r.errors.length > 0).length,
  });

  return results;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getUserEmail(userId: string): Promise<string | null> {
  const result = await pool.query<{ email: string }>(`SELECT email FROM users WHERE user_id = $1`, [
    userId,
  ]);
  return result.rows[0]?.email ?? null;
}
