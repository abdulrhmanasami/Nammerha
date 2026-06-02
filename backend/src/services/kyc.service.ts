// ============================================================================
// Nammerha Backend — KYC Verification Service
// GAP-P3-009 FIX: Replaces hardcoded KYC queue with live database queries.
// Queries users.kyc_verification_status (Migration 001 schema).
// ============================================================================
import { query } from '../config/database';
import { logger } from '../utils/logger';
import type { KycStatus } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KycQueueEntry {
    user_id: string;
    full_name: string;
    email: string;
    role: string;
    kyc_verification_status: KycStatus;
    kyc_document_url: string | null;
    commercial_register_number: string | null;
    engineering_license_number: string | null;
    guild_membership_id: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface KycStats {
    pending: number;
    verified: number;
    rejected: number;
    total: number;
}

// ─── Get KYC Queue ──────────────────────────────────────────────────────────

/**
 * Retrieve users awaiting KYC review.
 * Default: shows 'pending' and 'submitted' statuses (unreviewed applications).
 * Ordered by most recent first — newest applications at the top.
 */
export async function getKycQueue(
    status?: KycStatus,
    limit = 25,
    offset = 0,
): Promise<{ entries: KycQueueEntry[]; total: number }> {
    const statusFilter = status
        ? `WHERE kyc_verification_status = $1`
        : `WHERE kyc_verification_status IN ('pending', 'submitted')`;

    const params: (string | number)[] = status
        ? [status, Math.min(limit, 100), Math.max(offset, 0)]
        : [Math.min(limit, 100), Math.max(offset, 0)];

    const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM users ${statusFilter}`,
        status ? [status] : [],
    );

    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const limitParam = status ? '$2' : '$1';
    const offsetParam = status ? '$3' : '$2';

    const result = await query<KycQueueEntry>(
        `SELECT user_id, full_name, email, role,
                kyc_verification_status, kyc_document_url,
                commercial_register_number, engineering_license_number,
                guild_membership_id, created_at, updated_at
         FROM users
         ${statusFilter}
         ORDER BY updated_at DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params,
    );

    return { entries: result.rows, total };
}

// ─── Get KYC Stats ──────────────────────────────────────────────────────────

/**
 * Aggregate KYC status counts across all users.
 * Returns pending (includes 'submitted'), verified, rejected, and total.
 */
export async function getKycStats(): Promise<KycStats> {
    const result = await query<{
        pending: string;
        verified: string;
        rejected: string;
        total: string;
    }>(
        `SELECT
            COUNT(*) FILTER (WHERE kyc_verification_status IN ('pending', 'submitted')) AS pending,
            COUNT(*) FILTER (WHERE kyc_verification_status = 'verified') AS verified,
            COUNT(*) FILTER (WHERE kyc_verification_status = 'rejected') AS rejected,
            COUNT(*) AS total
         FROM users
         WHERE role NOT IN ('admin', 'auditor')`,
    );

    const row = result.rows[0];
    return {
        pending: parseInt(row?.pending ?? '0', 10),
        verified: parseInt(row?.verified ?? '0', 10),
        rejected: parseInt(row?.rejected ?? '0', 10),
        total: parseInt(row?.total ?? '0', 10),
    };
}

// ─── Update KYC Status ──────────────────────────────────────────────────────

/**
 * Approve or reject a user's KYC application.
 * Sets kyc_verified_at and kyc_verified_by on approval.
 * Resets kyc_verified_at on rejection (allows resubmission).
 */
export async function updateKycStatus(
    userId: string,
    decision: 'verified' | 'rejected',
    adminId: string,
    reason?: string,
): Promise<KycQueueEntry> {
    if (!userId) {
        throw new Error('user_id is required');
    }
    if (!['verified', 'rejected'].includes(decision)) {
        throw new Error('decision must be "verified" or "rejected"');
    }

    const result = await query<KycQueueEntry>(
        `UPDATE users
         SET kyc_verification_status = $1,
             kyc_verified_at = ${decision === 'verified' ? 'NOW()' : 'NULL'},
             kyc_verified_by = $2,
             updated_at = NOW()
         WHERE user_id = $3
           AND kyc_verification_status IN ('pending', 'submitted')
         RETURNING user_id, full_name, email, role,
                   kyc_verification_status, kyc_document_url,
                   commercial_register_number, engineering_license_number,
                   guild_membership_id, created_at, updated_at`,
        [decision, adminId, userId],
    );

    const updated = result.rows[0];
    if (!updated) {
        throw new Error('User not found or KYC status already processed');
    }

    // Log the reason if provided (for audit trail — future: dedicated audit table)
    if (reason) {
        // MEMO-77 FIX: Replaced raw console.log with structured logger (KYC audit trail).
        logger.info('[KYC-AUDIT] Decision recorded', { userId, decision, adminId, reason });
    }

    return updated;
}
