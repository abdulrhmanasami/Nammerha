// ============================================================================
// Nammerha Backend — Escrow Release Service (Path 4: Release & Notify)
// ============================================================================
// Handles the auditor verification and fund release flow:
//   1. Admin/auditor reviews pending spatial proofs matched with POs
//   2. Admin approves → escrow releases funds to supplier
//   3. System notifies all users who funded the released item
//   4. OR: Admin flags discrepancy → spatial proof rejected
// ============================================================================
import pool, { query, financialTransaction } from '../config/database';
import { createNotification } from './notification.service';
import {
  calculateEscrowFee,
  getActiveFeeConfig,
  recordEscrowFeeInTransaction,
} from './escrow-fee.service';
import { logger } from '../utils/logger';
import { redisLockManager } from '../config/redis.client';
import type {
  VerificationCase,
  SpatialProof,
  ReleaseEscrowDTO,
  FlagDiscrepancyDTO,
  EscrowLedger,
} from '../types';

// ─── Path 4.1: Get Pending Verifications ────────────────────────────────────

/**
 * Returns all spatial proofs awaiting admin verification.
 * Each case is enriched with the matching BOQ item, PO, escrow entries,
 * and engineer details — everything the admin needs to make a decision.
 *
 * MED-AUD-004 FIX: Accepts pagination parameters to prevent unbounded
 * result sets as the platform scales.
 */
export async function getPendingVerifications(
  limit = 25,
  offset = 0,
): Promise<{ cases: VerificationCase[]; total: number }> {
  // P2-PLT-003 FIX: Use window function COUNT(*) OVER() to get total count
  // atomically with the data query. The previous separate COUNT(*) query
  // could return a stale total if a new proof was submitted between queries.
  const result = await query<{
    proof_id: string;
    proof_item_id: string;
    proof_project_id: string;
    proof_engineer_id: string;
    proof_gps_coordinates: string;
    proof_gps_accuracy_meters: number | null;
    proof_captured_at: Date;
    proof_image_url: string;
    proof_image_hash: string | null;
    proof_description: string | null;
    proof_device_info: Record<string, unknown> | null;
    proof_created_at: Date;
    project_title: string;
    project_gps_location: string | null;
    project_address_text: string | null;
    boq_material_name: string;
    boq_material_category: string | null;
    boq_unit_price: string; // BIGINT cents — pg returns as string (MEMO 53)
    boq_required_quantity: number;
    engineer_name: string;
    po_data: unknown;
    escrow_data: unknown;
    total_count: string;
  }>(
    `
    SELECT
      sp.proof_id AS proof_id,
        sp.item_id AS proof_item_id,
        sp.project_id AS proof_project_id,
        sp.engineer_id AS proof_engineer_id,
        sp.gps_coordinates AS proof_gps_coordinates,
        sp.gps_accuracy_meters AS proof_gps_accuracy_meters,
        sp.captured_at AS proof_captured_at,
        sp.image_url AS proof_image_url,
        sp.image_hash AS proof_image_hash,
        sp.description AS proof_description,
        sp.device_info AS proof_device_info,
        sp.created_at AS proof_created_at,
        p.title AS project_title,
        p.gps_location AS project_gps_location,
        p.address_text AS project_address_text,
        b.material_name AS boq_material_name,
        b.material_category AS boq_material_category,
        b.unit_price AS boq_unit_price,
        b.required_quantity AS boq_required_quantity,
        u.full_name AS engineer_name,
        -- P2-016 FIX: Explicit column list — no row_to_json(po.*) schema drift.
        (SELECT json_build_object(
            'po_id', po.po_id,
            'po_number', po.po_number,
            'item_id', po.item_id,
            'status', po.status,
            'amount', po.amount,
            'currency', po.currency,
            'supplier_id', po.supplier_id,
            'supplier_name', po.supplier_name,
            'material_name', po.material_name,
            'quantity', po.quantity,
            'unit', po.unit,
            'unit_price', po.unit_price,
            'generated_at', po.generated_at
        ) FROM purchase_orders po
       WHERE po.item_id = sp.item_id AND po.project_id = sp.project_id LIMIT 1) AS po_data,
    (SELECT json_agg(json_build_object(
        'transaction_id', el.transaction_id,
        'user_id', el.user_id,
        'amount_locked', el.amount_locked,
        'payment_status', el.payment_status
    )) FROM escrow_ledger el
       WHERE el.item_id = sp.item_id AND el.payment_status = 'locked') AS escrow_data,
    COUNT(*) OVER() AS total_count
    FROM spatial_proof sp
    JOIN projects p ON p.project_id = sp.project_id
    JOIN itemized_boq b ON b.item_id = sp.item_id
    JOIN users u ON u.user_id = sp.engineer_id
    WHERE sp.verification_status = 'submitted'
    ORDER BY sp.captured_at ASC
    LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  // Extract total from the first row's window function result (0 if no rows)
  const total = result.rows.length > 0 ? parseInt(result.rows[0]?.total_count ?? '0', 10) : 0;

  const cases: VerificationCase[] = result.rows.map((row) => ({
    proof: {
      proof_id: row.proof_id,
      item_id: row.proof_item_id,
      project_id: row.proof_project_id,
      engineer_id: row.proof_engineer_id,
      gps_coordinates: row.proof_gps_coordinates,
      gps_accuracy_meters: row.proof_gps_accuracy_meters,
      captured_at: row.proof_captured_at,
      image_url: row.proof_image_url,
      image_hash: row.proof_image_hash,
      description: row.proof_description,
      device_info: row.proof_device_info,
      verification_status: 'submitted',
      verified_by: null,
      verified_at: null,
      created_at: row.proof_created_at,
    },
    project: {
      project_id: row.proof_project_id,
      title: row.project_title,
      gps_location: row.project_gps_location,
      address_text: row.project_address_text,
    },
    boq_item: {
      item_id: row.proof_item_id,
      material_name: row.boq_material_name,
      material_category: row.boq_material_category,
      unit_price: row.boq_unit_price,
      required_quantity: row.boq_required_quantity,
    },
    purchase_order: (row.po_data as VerificationCase['purchase_order']) ?? null,
    escrow_entries: (row.escrow_data as VerificationCase['escrow_entries']) ?? [],
    engineer_name: row.engineer_name,
  }));

  return { cases, total };
}

// ─── Path 4.2: Release Escrow (Admin Approves) ─────────────────────────────

/**
 * Admin/auditor verifies a spatial proof and releases all locked escrow
 * entries for the corresponding BOQ item.
 *
 * Steps:
 *   1. Mark spatial_proof as 'verified'
 *   2. Release all locked escrow entries for this item
 *   3. Link each escrow entry to the proof
 *   4. Update BOQ item status to 'delivered'
 *   5. Notify every user who funded this item
 */
export async function releaseEscrow(
  auditorId: string,
  dto: ReleaseEscrowDTO,
): Promise<{ released_count: number; total_released: number; fee_charged: number }> {
  const lockKey = `nammerha:escrow_release:lock:${dto.item_id}`;
  const lockToken = await redisLockManager.acquireLock(lockKey, 30);

  if (!lockToken) {
    logger.warn('Domain Law 1 Enforced: Redis Lock prevented concurrent escrow release', {
      item_id: dto.item_id,
    });
    throw new Error('Another release operation is currently in progress for this item.');
  }

  try {
    return await financialTransaction(async (client) => {
      // 1. Verify the proof exists and is in 'submitted' status
      // M-001 FIX: Explicit column list — prevents schema drift.
      const proofResult = await client.query<SpatialProof>(
        `SELECT proof_id, item_id, project_id, engineer_id,
                    gps_coordinates, gps_accuracy_meters, captured_at,
                    image_url, image_hash, description, device_info,
                    verification_status, verified_by, verified_at, created_at
             FROM spatial_proof WHERE proof_id = $1 FOR UPDATE`,
        [dto.proof_id],
      );
      const proof = proofResult.rows[0];
      if (!proof) {
        throw new Error(`Spatial proof ${dto.proof_id} not found`);
      }
      if (proof.verification_status !== 'submitted') {
        throw new Error(`Proof already processed: status is '${proof.verification_status}'`);
      }
      if (proof.item_id !== dto.item_id) {
        throw new Error('Proof item_id does not match the requested item_id');
      }

      // 2. Mark proof as verified
      await client.query(
        `UPDATE spatial_proof
       SET verification_status = 'verified', verified_by = $1, verified_at = NOW()
       WHERE proof_id = $2`,
        [auditorId, dto.proof_id],
      );

      // 3. Release all locked escrow entries for this item
      const releaseResult = await client.query<{
        transaction_id: string;
        user_id: string;
        amount_locked: string;
      }>(
        `UPDATE escrow_ledger
       SET payment_status = 'released',
        released_at = NOW(),
        released_by = $1,
        release_proof_id = $2
       WHERE item_id = $3
         AND payment_status = 'locked'
       RETURNING transaction_id, user_id, amount_locked`,
        [auditorId, dto.proof_id, dto.item_id],
      );

      // 4. Update BOQ item status to 'delivered'
      await client.query("UPDATE itemized_boq SET status = 'delivered' WHERE item_id = $1", [
        dto.item_id,
      ]);

      // 5. Get project info for notifications
      const projectResult = await client.query<{ title: string }>(
        'SELECT title FROM projects WHERE project_id = $1',
        [proof.project_id],
      );
      const projectTitle = projectResult.rows[0]?.title ?? proof.project_id;

      // 6. Get BOQ item info
      const boqResult = await client.query<{ material_name: string }>(
        'SELECT material_name FROM itemized_boq WHERE item_id = $1',
        [dto.item_id],
      );
      const materialName = boqResult.rows[0]?.material_name ?? 'Material';

      // 7. Notify ALL users who funded this item
      const totalReleased = releaseResult.rows.reduce((sum, r) => sum + Number(r.amount_locked), 0);
      const uniqueUserIds = [...new Set(releaseResult.rows.map((r) => r.user_id))];

      for (const userId of uniqueUserIds) {
        // HGH-AUD-007 FIX: Use i18n template keys instead of hardcoded bilingual strings.
        // The notification rendering layer resolves these keys per user locale.
        await createNotification(client, {
          user_id: userId,
          type: 'delivery_confirmed',
          title: 'notification.delivery_confirmed.title',
          body: 'notification.delivery_confirmed.body',
          data: {
            project_id: proof.project_id,
            item_id: dto.item_id,
            proof_id: dto.proof_id,
            proof_image_url: proof.image_url,
            material_name: materialName,
            project_title: projectTitle,
          },
          channel: 'in_app',
        });
      }

      // ─── Phase 3: Escrow Transaction Fee (Commercial Projects Only) ──────
      // Per study §5: 1-3% fee on commercial (homeowner-funded) projects.
      // Humanitarian projects (user-funded) are ALWAYS exempt.
      let feeCharged = 0;
      try {
        // Determine if commercial: check if users are the homeowner themselves
        const projectCheck = await client.query<{
          homeowner_id: string;
          user_count: string;
        }>(
          `SELECT p.homeowner_id,
                        (SELECT COUNT(DISTINCT user_id)
                         FROM escrow_ledger
                         WHERE project_id = p.project_id
                           AND user_id != p.homeowner_id) AS user_count
                 FROM projects p WHERE p.project_id = $1`,
          [proof.project_id],
        );
        const projectData = projectCheck.rows[0];
        const isCommercial = projectData && parseInt(projectData.user_count, 10) === 0;

        if (isCommercial && totalReleased > 0) {
          const feeConfig = await getActiveFeeConfig();
          if (feeConfig && feeConfig.is_active) {
            const feeCents = calculateEscrowFee(
              totalReleased,
              feeConfig.fee_rate_bps,
              feeConfig.min_fee_cents,
              feeConfig.max_fee_cents,
            );
            if (feeCents > 0) {
              await recordEscrowFeeInTransaction(
                client,
                proof.project_id,
                dto.item_id,
                totalReleased,
                feeConfig.fee_rate_bps,
                feeCents,
                feeConfig.fee_name,
              );
              feeCharged = feeCents;
            }
          }
        }
      } catch (feeErr) {
        // GAP-ACD-001 FIX: Enforce ACID Mutations.
        // Fee recording failure MUST block the escrow release. If we silently
        // swallow this error, the funds are released but the platform loses its fee.
        logger.error('Escrow fee recording failed, triggering transaction rollback', {
          projectId: proof.project_id,
          itemId: dto.item_id,
          error: feeErr instanceof Error ? feeErr.message : String(feeErr),
        });
        throw feeErr;
      }

      return {
        released_count: releaseResult.rowCount ?? 0,
        total_released: totalReleased,
        fee_charged: feeCharged,
      };
    });
  } finally {
    await redisLockManager.releaseLock(lockKey, lockToken);
  }
}

// ─── Path 4.3: Flag Discrepancy ─────────────────────────────────────────────

/**
 * Admin/auditor rejects a spatial proof due to discrepancy.
 * Marks the proof as 'rejected' and notifies the engineer.
 */
export async function flagDiscrepancy(
  auditorId: string,
  dto: FlagDiscrepancyDTO,
): Promise<SpatialProof> {
  return financialTransaction(async (client) => {
    // 1. Verify and update proof
    // PLAT-AUD-002 FIX: Explicit RETURNING column list — no RETURNING * (prevents schema drift).
    const result = await client.query<SpatialProof>(
      `UPDATE spatial_proof
       SET verification_status = 'rejected', verified_by = $1, verified_at = NOW(),
         description = COALESCE(description, '') || E'\n[REJECTED] ' || $2
       WHERE proof_id = $3 AND verification_status = 'submitted'
    RETURNING proof_id, item_id, project_id, engineer_id,
              gps_coordinates, gps_accuracy_meters, captured_at,
              image_url, image_hash, description, device_info,
              verification_status, verified_by, verified_at, created_at`,
      [auditorId, dto.reason, dto.proof_id],
    );

    const proof = result.rows[0];
    if (!proof) {
      throw new Error(`Proof ${dto.proof_id} not found or already processed`);
    }

    // Notify engineer
    // HGH-AUD-007 FIX: Use i18n template keys
    await createNotification(client, {
      user_id: proof.engineer_id,
      type: 'discrepancy_flagged',
      title: 'notification.proof_rejected.title',
      body: 'notification.proof_rejected.body',
      data: {
        project_id: proof.project_id,
        item_id: proof.item_id,
        proof_id: proof.proof_id,
        rejection_reason: dto.reason,
      },
      channel: 'in_app',
    });

    return proof;
  });
}

// ─── ENH-2: Partial Refund Request ──────────────────────────────────────────

export interface RefundRequestDTO {
  escrow_id: string;
  reason: string;
}

export interface RefundRequest {
  refund_id: string;
  escrow_id: string;
  user_id: string;
  reason: string;
  refund_amount: number;
  status: string;
  created_at: Date;
}

/**
 * User requests a refund for a locked escrow entry.
 * Creates a formal request record — does NOT immediately refund.
 * The admin must approve via processRefund().
 */
export async function requestRefund(userId: string, dto: RefundRequestDTO): Promise<RefundRequest> {
  return financialTransaction(async (client) => {
    // 1. Verify the escrow entry exists, belongs to this user, and is still locked
    const escrowResult = await client.query<{
      transaction_id: string;
      user_id: string;
      amount_locked: string;
      payment_status: string;
    }>(
      `SELECT transaction_id, user_id, amount_locked, payment_status
             FROM escrow_ledger
             WHERE transaction_id = $1
             FOR UPDATE`,
      [dto.escrow_id],
    );

    const escrow = escrowResult.rows[0];
    if (!escrow) {
      throw new Error('Escrow entry not found');
    }
    if (escrow.user_id !== userId) {
      throw new Error('You can only request refunds for your own donations');
    }
    if (escrow.payment_status !== 'locked') {
      throw new Error(`Cannot refund: escrow is already ${escrow.payment_status}`);
    }

    // 2. Check for existing pending/approved refund request
    const existingResult = await client.query(
      `SELECT refund_id FROM refund_requests
             WHERE escrow_id = $1 AND status IN ('pending', 'approved')
             LIMIT 1`,
      [dto.escrow_id],
    );
    if (existingResult.rows[0]) {
      throw new Error('A refund request already exists for this donation');
    }

    // 3. Create the refund request
    const refundResult = await client.query<RefundRequest>(
      `INSERT INTO refund_requests (escrow_id, user_id, reason, refund_amount)
             VALUES ($1, $2, $3, $4)
             RETURNING refund_id, escrow_id, user_id, reason, refund_amount, status, created_at`,
      [dto.escrow_id, userId, dto.reason, parseInt(escrow.amount_locked, 10)],
    );

    const refund = refundResult.rows[0];
    if (!refund) {
      throw new Error('Failed to create refund request');
    }

    // 4. Audit trail
    await client.query(
      `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
             VALUES ('refund_requested', 'refund_requests', $1, $2, $3)`,
      [
        refund.refund_id,
        userId,
        JSON.stringify({
          escrow_id: dto.escrow_id,
          amount: escrow.amount_locked,
          reason: dto.reason,
        }),
      ],
    );

    return refund;
  });
}

/**
 * Admin processes (approves OR rejects) a refund request.
 * On approval: escrow_ledger.payment_status → 'refunded', refunded_at set.
 * The funded_amount on itemized_boq is reversed by the existing DB trigger.
 */
export async function processRefund(
  adminId: string,
  refundId: string,
  decision: 'approved' | 'rejected',
  notes?: string,
): Promise<{ refund_id: string; status: string }> {
  const lockKey = `nammerha:refund:lock:${refundId}`;
  const lockToken = await redisLockManager.acquireLock(lockKey, 30);

  if (!lockToken) {
    logger.warn('Domain Law 1 Enforced: Redis Lock prevented concurrent refund processing', {
      refund_id: refundId,
    });
    throw new Error('Another refund processing operation is currently in progress.');
  }

  try {
    return await financialTransaction(async (client) => {
      // 1. Lock and validate the refund request
      const reqResult = await client.query<{
        refund_id: string;
        escrow_id: string;
        user_id: string;
        refund_amount: string;
        status: string;
      }>(
        `SELECT refund_id, escrow_id, user_id, refund_amount, status
             FROM refund_requests
             WHERE refund_id = $1
             FOR UPDATE`,
        [refundId],
      );

      const req = reqResult.rows[0];
      if (!req) {
        throw new Error('Refund request not found');
      }
      if (req.status !== 'pending') {
        throw new Error(`Refund request is already ${req.status}`);
      }

      if (decision === 'rejected') {
        // Simply mark as rejected
        await client.query(
          `UPDATE refund_requests
                 SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(),
                     review_notes = $2, updated_at = NOW()
                 WHERE refund_id = $3`,
          [adminId, notes ?? null, refundId],
        );

        // Notify user of rejection
        await createNotification(client, {
          user_id: req.user_id,
          type: 'refund_rejected',
          title: 'notification.refund_rejected.title',
          body: 'notification.refund_rejected.body',
          data: { refund_id: refundId, reason: notes },
          channel: 'in_app',
        });

        return { refund_id: refundId, status: 'rejected' };
      }

      // 2. Approved — update escrow to 'refunded'
      const escrowUpdate = await client.query(
        `UPDATE escrow_ledger
             SET payment_status = 'refunded', refunded_at = NOW(), updated_at = NOW()
             WHERE transaction_id = $1 AND payment_status = 'locked'
             RETURNING transaction_id`,
        [req.escrow_id],
      );

      if (!escrowUpdate.rows[0]) {
        throw new Error('Escrow entry is no longer in locked state — cannot refund');
      }

      // D-10 FIX: Reverse any matching pledges tied to this donation.
      // If a user refunds a matched donation, the sponsor's escrow MUST also
      // be refunded and the program's spent counter must be decremented.
      // Without this, the sponsor's funds would be orphaned forever.
      const matchResult = await client.query<{
        pledge_id: string;
        program_id: string;
        matched_escrow_id: string;
        match_amount: string;
      }>(
        `SELECT pledge_id, program_id, matched_escrow_id, match_amount
             FROM matching_pledges
             WHERE escrow_id = $1 AND matched_escrow_id IS NOT NULL`,
        [req.escrow_id],
      );

      for (const match of matchResult.rows) {
        // Refund sponsor's escrow entry
        const matchUpdateResult = await client.query(
          `UPDATE escrow_ledger
                 SET payment_status = 'refunded', refunded_at = NOW(), updated_at = NOW()
                 WHERE transaction_id = $1 AND payment_status = 'locked'
                 RETURNING transaction_id`,
          [match.matched_escrow_id],
        );

        // Titan Architect FIX: Silent De-sync Prevention
        // Only decrement the matching program's spent budget IF the sponsor's
        // escrow was genuinely locked and successfully updated to 'refunded'.
        // If it was already released (rowCount === 0), do NOT artificially lower 'spent'.
        if (matchUpdateResult.rowCount && matchUpdateResult.rowCount > 0) {
          // Reverse spent on matching program (atomic decrement)
          const matchAmount = parseInt(match.match_amount, 10);
          await client.query(
            `UPDATE matching_programs
                     SET spent = GREATEST(spent - $1, 0), updated_at = NOW()
                     WHERE program_id = $2`,
            [matchAmount, match.program_id],
          );

          // Audit the reversal
          await client.query(
            `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                     VALUES ('match_reversed', 'matching_pledges', $1, $2, $3)`,
            [
              match.pledge_id,
              adminId,
              JSON.stringify({
                reason: 'user_refund',
                original_escrow: req.escrow_id,
                sponsor_escrow: match.matched_escrow_id,
                match_amount: matchAmount,
              }),
            ],
          );

          logger.info('D-10: Matching pledge reversed due to refund', {
            pledge_id: match.pledge_id,
            program_id: match.program_id,
            match_amount: matchAmount,
          });
        } else {
          logger.warn(
            'Titan Architect Alert: Skipped sponsor refund de-sync. Escrow already released.',
            {
              pledge_id: match.pledge_id,
              escrow_id: match.matched_escrow_id,
            },
          );
        }
      }

      // 3. Update refund request to 'processed'
      await client.query(
        `UPDATE refund_requests
             SET status = 'processed', reviewed_by = $1, reviewed_at = NOW(),
                 review_notes = $2, updated_at = NOW()
             WHERE refund_id = $3`,
        [adminId, notes ?? null, refundId],
      );

      // 4. Audit trail
      await client.query(
        `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
             VALUES ('refund_processed', 'refund_requests', $1, $2, $3)`,
        [
          refundId,
          adminId,
          JSON.stringify({
            escrow_id: req.escrow_id,
            amount: req.refund_amount,
            decision,
          }),
        ],
      );

      // 5. Notify user of approval
      await createNotification(client, {
        user_id: req.user_id,
        type: 'refund_approved',
        title: 'notification.refund_approved.title',
        body: 'notification.refund_approved.body',
        data: {
          refund_id: refundId,
          amount: parseInt(req.refund_amount, 10),
        },
        channel: 'in_app',
      });

      return { refund_id: refundId, status: 'processed' };
    });
  } finally {
    await redisLockManager.releaseLock(lockKey, lockToken);
  }
}

/**
 * Get all pending refund requests (admin view).
 */
export async function getPendingRefunds(
  limit = 50,
  offset = 0,
): Promise<
  Array<
    RefundRequest & {
      project_title: string;
      material_name: string;
      user_name: string;
    }
  >
> {
  const clampedLimit = Math.min(limit, 200);
  const clampedOffset = Math.max(offset, 0);

  const result = await pool.query(
    `SELECT rr.refund_id, rr.escrow_id, rr.user_id, rr.reason,
                rr.refund_amount, rr.status, rr.created_at,
                p.title AS project_title,
                b.material_name,
                u.full_name AS user_name
         FROM refund_requests rr
         JOIN escrow_ledger el ON el.transaction_id = rr.escrow_id
         JOIN projects p ON p.project_id = el.project_id
         JOIN itemized_boq b ON b.item_id = el.item_id
         JOIN users u ON u.user_id = rr.user_id
         WHERE rr.status = 'pending'
         ORDER BY rr.created_at ASC
         LIMIT $1 OFFSET $2`,
    [clampedLimit, clampedOffset],
  );
  return result.rows;
}

// ─── User Escrow Queries ────────────────────────────────────────────────────
// Migrated from crowdfunding.service.ts during Platinum Audit MEMO 59.
// These are user-facing escrow read queries — their architectural home
// is the escrow service, not the (now-deleted) crowdfunding monolith.

/**
 * Get a user's escrow summary (totals for locked, released, refunded).
 */
export async function getUserEscrowSummary(userId: string) {
  // PLAT-AUD-001 FIX: Explicit column list — no SELECT * (prevents schema drift).
  const result = await query<{
    user_id: string;
    total_locked: number;
    total_released: number;
    total_refunded: number;
    active_escrows: number;
  }>(
    `SELECT user_id, total_locked, total_released, total_refunded, active_escrows
         FROM vw_user_escrow_summary
         WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

/**
 * Get a user's payment history.
 * NMR-AUD-203 FIX: Added pagination to prevent unbounded result sets at scale.
 */
export async function getUserPayments(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<EscrowLedger[]> {
  // PLT-2026-AUD-003 FIX: Enforce max limit to prevent DoS via unbounded result sets.
  // Matches the defensive Math.min() pattern used in searchEngineers and other queries.
  const safeLim = Math.min(Math.max(1, limit), 50);
  const safeOff = Math.max(0, offset);
  // PLAT-AUD-001 FIX: Explicit column list — no e.* (prevents schema drift).
  const result = await query<EscrowLedger>(
    `SELECT e.transaction_id, e.user_id, e.item_id, e.project_id,
                e.amount_locked, e.currency, e.payment_status, e.payment_method,
                e.payment_gateway_ref, e.locked_at, e.released_at, e.released_by,
                e.release_proof_id, e.refunded_at, e.blockchain_tx_hash,
                e.created_at, e.updated_at,
                b.material_name, p.title AS project_title
         FROM escrow_ledger e
         JOIN itemized_boq b ON b.item_id = e.item_id
         JOIN projects p ON p.project_id = e.project_id
         WHERE e.user_id = $1
         ORDER BY e.locked_at DESC
         LIMIT $2 OFFSET $3`,
    [userId, safeLim, safeOff],
  );
  return result.rows;
}
