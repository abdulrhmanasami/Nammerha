// ============================================================================
// Nammerha Backend — Escrow Release Service (Path 4: Release & Notify)
// ============================================================================
// Handles the auditor verification and fund release flow:
//   1. Admin/auditor reviews pending spatial proofs matched with POs
//   2. Admin approves → escrow releases funds to supplier
//   3. System notifies all donors who funded the released item
//   4. OR: Admin flags discrepancy → spatial proof rejected
// ============================================================================
import { query, transaction } from '../config/database';
import { createNotification } from './notification.service';
import type {
    VerificationCase,
    SpatialProof,
    ReleaseEscrowDTO,
    FlagDiscrepancyDTO,
} from '../types';

// ─── Path 4.1: Get Pending Verifications ────────────────────────────────────

/**
 * Returns all spatial proofs awaiting admin verification.
 * Each case is enriched with the matching BOQ item, PO, escrow entries,
 * and engineer details — everything the admin needs to make a decision.
 */
export async function getPendingVerifications(): Promise<VerificationCase[]> {
    const result = await query<{
        // Proof fields
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
        proof_verification_status: string;
        proof_created_at: Date;
        // Project fields
        project_title: string;
        project_gps_location: string | null;
        project_address_text: string | null;
        // BOQ fields
        boq_material_name: string;
        boq_material_category: string | null;
        boq_unit_price: number;
        boq_required_quantity: number;
        // Engineer
        engineer_name: string;
    }>(
        `SELECT
      sp.proof_id,
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
      sp.verification_status AS proof_verification_status,
      sp.created_at AS proof_created_at,
      p.title AS project_title,
      p.gps_location AS project_gps_location,
      p.address_text AS project_address_text,
      b.material_name AS boq_material_name,
      b.material_category AS boq_material_category,
      b.unit_price AS boq_unit_price,
      b.required_quantity AS boq_required_quantity,
      u.full_name AS engineer_name
    FROM spatial_proof sp
    JOIN projects p ON p.project_id = sp.project_id
    JOIN itemized_boq b ON b.item_id = sp.item_id
    JOIN users u ON u.user_id = sp.engineer_id
    WHERE sp.verification_status = 'submitted'
    ORDER BY sp.captured_at ASC`
    );

    // Enrich each case with matching PO and escrow entries
    const cases: VerificationCase[] = [];

    for (const row of result.rows) {
        // Fetch matching PO
        const poResult = await query(
            'SELECT * FROM purchase_orders WHERE item_id = $1 AND project_id = $2 LIMIT 1',
            [row.proof_item_id, row.proof_project_id]
        );

        // Fetch escrow entries for this item
        const escrowResult = await query<{
            transaction_id: string;
            donor_id: string;
            amount_locked: number;
            payment_status: string;
        }>(
            `SELECT transaction_id, donor_id, amount_locked, payment_status
       FROM escrow_ledger
       WHERE item_id = $1 AND payment_status = 'locked'`,
            [row.proof_item_id]
        );

        cases.push({
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
            purchase_order: (poResult.rows[0] as VerificationCase['purchase_order']) ?? null,
            escrow_entries: escrowResult.rows.map((e) => ({
                transaction_id: e.transaction_id,
                donor_id: e.donor_id,
                amount_locked: e.amount_locked,
                payment_status: e.payment_status as 'locked',
            })),
            engineer_name: row.engineer_name,
        });
    }

    return cases;
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
 *   5. Notify every donor who funded this item
 */
export async function releaseEscrow(
    auditorId: string,
    dto: ReleaseEscrowDTO
): Promise<{ released_count: number; total_released: number }> {
    return transaction(async (client) => {
        // 1. Verify the proof exists and is in 'submitted' status
        const proofResult = await client.query<SpatialProof>(
            'SELECT * FROM spatial_proof WHERE proof_id = $1 FOR UPDATE',
            [dto.proof_id]
        );
        const proof = proofResult.rows[0];
        if (!proof) throw new Error(`Spatial proof ${dto.proof_id} not found`);
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
            [auditorId, dto.proof_id]
        );

        // 3. Release all locked escrow entries for this item
        const releaseResult = await client.query<{
            transaction_id: string;
            donor_id: string;
            amount_locked: number;
        }>(
            `UPDATE escrow_ledger
       SET payment_status = 'released',
           released_at = NOW(),
           released_by = $1,
           release_proof_id = $2
       WHERE item_id = $3
         AND payment_status = 'locked'
       RETURNING transaction_id, donor_id, amount_locked`,
            [auditorId, dto.proof_id, dto.item_id]
        );

        // 4. Update BOQ item status to 'delivered'
        await client.query(
            "UPDATE itemized_boq SET status = 'delivered' WHERE item_id = $1",
            [dto.item_id]
        );

        // 5. Get project info for notifications
        const projectResult = await client.query<{ title: string }>(
            'SELECT title FROM projects WHERE project_id = $1',
            [proof.project_id]
        );
        const projectTitle = projectResult.rows[0]?.title ?? proof.project_id;

        // 6. Get BOQ item info
        const boqResult = await client.query<{ material_name: string }>(
            'SELECT material_name FROM itemized_boq WHERE item_id = $1',
            [dto.item_id]
        );
        const materialName = boqResult.rows[0]?.material_name ?? 'Material';

        // 7. Notify ALL donors who funded this item
        const totalReleased = releaseResult.rows.reduce((sum, r) => sum + r.amount_locked, 0);
        const uniqueDonorIds = [...new Set(releaseResult.rows.map((r) => r.donor_id))];

        for (const donorId of uniqueDonorIds) {
            await createNotification(client, {
                user_id: donorId,
                type: 'delivery_confirmed',
                title: 'تم التوصيل بنجاح — Delivery Confirmed',
                body: `${materialName} has been delivered to the project "${projectTitle}" and verified with GPS proof. Your contribution made this possible.`,
                data: {
                    project_id: proof.project_id,
                    item_id: dto.item_id,
                    proof_id: dto.proof_id,
                    proof_image_url: proof.image_url,
                    material_name: materialName,
                },
                channel: 'in_app',
            });
        }

        return {
            released_count: releaseResult.rowCount ?? 0,
            total_released: totalReleased,
        };
    });
}

// ─── Path 4.3: Flag Discrepancy ─────────────────────────────────────────────

/**
 * Admin/auditor rejects a spatial proof due to discrepancy.
 * Marks the proof as 'rejected' and notifies the engineer.
 */
export async function flagDiscrepancy(
    auditorId: string,
    dto: FlagDiscrepancyDTO
): Promise<SpatialProof> {
    return transaction(async (client) => {
        // 1. Verify and update proof
        const result = await client.query<SpatialProof>(
            `UPDATE spatial_proof
       SET verification_status = 'rejected', verified_by = $1, verified_at = NOW(),
           description = COALESCE(description, '') || E'\n[REJECTED] ' || $2
       WHERE proof_id = $3 AND verification_status = 'submitted'
       RETURNING *`,
            [auditorId, dto.reason, dto.proof_id]
        );

        const proof = result.rows[0];
        if (!proof) throw new Error(`Proof ${dto.proof_id} not found or already processed`);

        // 2. Notify engineer
        await createNotification(client, {
            user_id: proof.engineer_id,
            type: 'discrepancy_flagged',
            title: 'تنبيه: تم رفض الدليل — Proof Rejected',
            body: `Your spatial proof for project ${proof.project_id} was flagged: "${dto.reason}". Please contact the admin for next steps.`,
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
