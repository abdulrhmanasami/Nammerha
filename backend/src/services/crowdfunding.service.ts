// ============================================================================
// Nammerha Backend — Crowdfunding Service (Path 2: Donor → Escrow)
// ============================================================================
// Handles the itemized micro-funding flow:
//   1. Donor browses marketplace (published projects on map)
//   2. Donor selects specific BOQ items to fund
//   3. Payment processed via real gateway (Visa/Fatora) → funds locked in escrow
//   4. If item reaches fully_funded → triggers auto-PO generation
// ============================================================================
import { query, transaction } from '../config/database';
import { paymentService } from './payment.service';
import type {
    ProjectCard,
    BOQFunding,
    EscrowLedger,
    CreateDonationDTO,
} from '../types';

// ─── Path 2.1: Browse Marketplace ───────────────────────────────────────────

/**
 * Get all published projects for the donor marketplace.
 * Uses the vw_project_cards view with funding percentages.
 */
export async function getMarketplaceProjects(filters?: {
    damage_type?: string;
    sort_by?: 'funded_percentage' | 'published_at';
}): Promise<ProjectCard[]> {
    let sql = 'SELECT * FROM vw_project_cards';
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
        sql += ' ORDER BY published_at DESC';     // Newest first
    }

    const result = await query<ProjectCard>(sql, params);
    return result.rows;
}

// ─── Path 2.2: Get Project BOQ (Donor Basket) ──────────────────────────────

/**
 * Get itemized BOQ with funding progress for the donor basket UI.
 * Uses the vw_boq_funding view.
 */
export async function getProjectBOQ(projectId: string): Promise<BOQFunding[]> {
    const result = await query<BOQFunding>(
        'SELECT * FROM vw_boq_funding WHERE project_id = $1 ORDER BY material_category, material_name',
        [projectId]
    );
    return result.rows;
}

// ─── Path 2.3: Create Donation (Escrow Lock) ────────────────────────────────

/**
 * Processes a donor's contribution to specific BOQ items.
 * For each item:
 *   1. Validates the item exists and isn't over-funded
 *   2. Creates escrow_ledger entry with status='locked'
 *   3. Triggers trg_update_boq_funded → trg_update_project_funding
 *   4. Checks if item is now fully funded → triggers auto-PO
 *
 * Returns all created escrow entries.
 */
export async function createDonation(
    donorId: string,
    dto: CreateDonationDTO
): Promise<EscrowLedger[]> {
    // ═══════════════════════════════════════════════════════════════════════
    // P1-NEW-004 FIX: Decoupled gateway calls from database transaction.
    //
    // BEFORE: paymentService.initiate() (external HTTP, up to 30s) was called
    // INSIDE the transaction, holding a pool connection hostage.
    // With max=10 connections, 10 concurrent donations = total platform freeze.
    //
    // AFTER: 3-phase approach:
    //   Phase 1 (TX): Validate & reserve — create escrow as 'pending'
    //   Phase 2 (NO TX): Call gateway — DB connection returned to pool
    //   Phase 3 (TX): Finalize — update escrow with gateway ref & 'locked'
    // ═══════════════════════════════════════════════════════════════════════

    // Phase 1: Validate all items and create pending escrow entries
    const pendingItems = await transaction(async (client) => {
        const items: Array<{
            item_id: string;
            project_id: string;
            actual_amount: number;
            total_cost: number;
            boq_status: string;
            escrow_id: string;
        }> = [];

        for (const fundItem of dto.items) {
            // 1. Fetch BOQ item with lock
            const boqResult = await client.query<{
                item_id: string;
                project_id: string;
                unit_price: number;
                required_quantity: number;
                funded_amount: number;
                status: string;
            }>(
                `SELECT item_id, project_id, unit_price, required_quantity, funded_amount, status
                 FROM itemized_boq
                 WHERE item_id = $1
                 FOR UPDATE`,
                [fundItem.item_id]
            );

            const boqItem = boqResult.rows[0];
            if (!boqItem) {
                throw new Error(`BOQ item ${fundItem.item_id} not found`);
            }

            // 2. Calculate remaining need (P2-001: integer-safe arithmetic)
            const priceStr = String(boqItem.unit_price);
            const qtyStr = String(boqItem.required_quantity);
            const fundedStr = String(boqItem.funded_amount);

            const qtyParts = qtyStr.split('.');
            const qtyIntPart = qtyParts[0] ?? '0';
            const qtyDecPart = (qtyParts[1] ?? '').padEnd(2, '0').slice(0, 2);
            const qtyFixed = BigInt(qtyIntPart) * 100n + BigInt(qtyDecPart);

            const totalCost = Number((BigInt(priceStr) * qtyFixed) / 100n);
            const remainingNeed = totalCost - Number(BigInt(fundedStr));

            if (remainingNeed <= 0) {
                throw new Error(`BOQ item '${fundItem.item_id}' is already fully funded`);
            }

            // 3. Cap donation at remaining need (prevent over-funding)
            const actualAmount = Math.min(fundItem.amount, remainingNeed);
            if (actualAmount <= 0) {
                throw new Error(`Invalid donation amount for item ${fundItem.item_id}`);
            }

            // 4. Create escrow entry as 'pending' (no gateway ref yet)
            const escrowResult = await client.query<{ transaction_id: string }>(
                `INSERT INTO escrow_ledger (
                    donor_id, item_id, project_id, amount_locked, currency,
                    payment_status, payment_method, locked_at
                 ) VALUES ($1, $2, $3, $4, 'USD', 'pending', $5, NOW())
                 RETURNING transaction_id`,
                [donorId, fundItem.item_id, boqItem.project_id, actualAmount, dto.payment_method]
            );

            const escrowId = escrowResult.rows[0]?.transaction_id;
            if (!escrowId) {
                throw new Error('Failed to create escrow entry');
            }

            items.push({
                item_id: fundItem.item_id,
                project_id: boqItem.project_id,
                actual_amount: actualAmount,
                total_cost: totalCost,
                boq_status: boqItem.status,
                escrow_id: escrowId,
            });
        }

        return items;
    });

    // Phase 2: Call payment gateway OUTSIDE transaction (DB connection freed)
    const gateway = dto.payment_method === 'visa' ? 'visa' as const : 'fatora' as const;
    const gatewayResults: Array<{ escrow_id: string; reference: string }> = [];

    for (const item of pendingItems) {
        const paymentResult = await paymentService.initiate({
            donor_id: donorId,
            item_id: item.item_id,
            project_id: item.project_id,
            amount: item.actual_amount,
            currency: 'USD',
            gateway,
            return_url: dto.return_url,
        });
        gatewayResults.push({ escrow_id: item.escrow_id, reference: paymentResult.reference });
    }

    // Phase 3: Finalize — update escrow with gateway refs, check funding status
    const finalEntries = await transaction(async (client) => {
        const escrowEntries: EscrowLedger[] = [];

        for (let i = 0; i < pendingItems.length; i++) {
            const item = pendingItems[i];
            const gatewayResult = gatewayResults[i];
            if (!item || !gatewayResult) {
                throw new Error('Phase 3 invariant: item/gateway result mismatch');
            }
            const gatewayRef = gatewayResult.reference;

            // Update escrow with gateway reference and lock status
            const updatedEscrow = await client.query<EscrowLedger>(
                `UPDATE escrow_ledger
                 SET payment_status = 'locked', payment_gateway_ref = $1
                 WHERE transaction_id = $2
                 RETURNING *`,
                [gatewayRef, item.escrow_id]
            );

            const entry = updatedEscrow.rows[0];
            if (!entry) {
                throw new Error('Failed to update escrow entry');
            }
            escrowEntries.push(entry);

            // Check if item is now fully funded
            const updatedBoq = await client.query<{ funded_amount: number }>(
                'SELECT funded_amount FROM itemized_boq WHERE item_id = $1',
                [item.item_id]
            );
            const newFunded = updatedBoq.rows[0]?.funded_amount ?? 0;

            if (newFunded >= item.total_cost) {
                await client.query(
                    "UPDATE itemized_boq SET status = 'fully_funded' WHERE item_id = $1",
                    [item.item_id]
                );
                await autoGeneratePO(client, item.item_id, item.project_id);
            } else if (newFunded > 0 && item.boq_status === 'verified') {
                await client.query(
                    "UPDATE itemized_boq SET status = 'partially_funded' WHERE item_id = $1",
                    [item.item_id]
                );
            }
        }

        return escrowEntries;
    });

    return finalEntries;
}

// ─── Auto PO Generation (triggered from donation) ──────────────────────────

/**
 * Auto-generates a Purchase Order when a BOQ item is fully funded.
 * Uses the pre-assigned verified supplier from the BOQ item (per strategic study §7.2).
 * Fallback: if no preferred supplier (legacy data), selects random verified supplier with warning.
 */
async function autoGeneratePO(
    client: {
        query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
    },
    itemId: string,
    projectId: string
): Promise<void> {
    // 1. Get BOQ item details INCLUDING preferred supplier
    const boqResult = await client.query<{
        material_name: string;
        material_category: string | null;
        unit: string;
        unit_price: number;
        required_quantity: number;
        preferred_supplier_id: string | null;
    }>(
        `SELECT material_name, material_category, unit, unit_price,
                required_quantity, preferred_supplier_id
         FROM itemized_boq WHERE item_id = $1`,
        [itemId]
    );
    const boqItem = boqResult.rows[0];
    if (!boqItem) { return; }

    let supplierId: string;
    let supplierName: string;
    let supplierCommercialReg: string | null;

    if (boqItem.preferred_supplier_id) {
        // 2a. Use pre-assigned supplier (standard path per study)
        const supplierResult = await client.query<{
            user_id: string;
            full_name: string;
            commercial_register_number: string | null;
        }>(
            `SELECT user_id, full_name, commercial_register_number
             FROM users
             WHERE user_id = $1
               AND role = 'supplier'
               AND is_active = TRUE
               AND kyc_verification_status = 'verified'`,
            [boqItem.preferred_supplier_id]
        );
        const supplier = supplierResult.rows[0];
        if (!supplier) {
            console.error(`[PO] Pre-assigned supplier ${boqItem.preferred_supplier_id} is no longer active/verified for item ${itemId}`);
            return;
        }
        supplierId = supplier.user_id;
        supplierName = supplier.full_name;
        supplierCommercialReg = supplier.commercial_register_number;
    } else {
        // 2b. Legacy fallback: random verified supplier (items created before migration 009)
        console.warn(`[PO] Item ${itemId} has no preferred_supplier_id — using legacy random selection`);
        const supplierResult = await client.query<{
            user_id: string;
            full_name: string;
            commercial_register_number: string | null;
        }>(
            `SELECT user_id, full_name, commercial_register_number
             FROM users
             WHERE role = 'supplier'
               AND is_active = TRUE
               AND kyc_verification_status = 'verified'
             ORDER BY RANDOM()
             LIMIT 1`
        );
        const supplier = supplierResult.rows[0];
        if (!supplier) {
            console.warn(`[PO] No verified supplier available for item ${itemId}`);
            return;
        }
        supplierId = supplier.user_id;
        supplierName = supplier.full_name;
        supplierCommercialReg = supplier.commercial_register_number;
    }

    // 3. Generate PO — P1-002 FIX: BigInt-safe arithmetic (matches donate() pattern)
    // unit_price is BIGINT cents, required_quantity may have up to 2 decimal places
    const qtyParts = String(boqItem.required_quantity).split('.');
    const qtyIntPart = qtyParts[0] ?? '0';
    const qtyDecPart = (qtyParts[1] ?? '').padEnd(2, '0').slice(0, 2);
    const qtyFixed = BigInt(qtyIntPart) * 100n + BigInt(qtyDecPart);
    const totalAmount = Number((BigInt(boqItem.unit_price) * qtyFixed) / 100n);

    await client.query(
        `INSERT INTO purchase_orders (
      po_number, item_id, project_id, supplier_id, amount, status,
      material_name, material_category, quantity, unit, unit_price,
      supplier_name, supplier_commercial_reg
    ) VALUES (
      generate_po_number(), $1, $2, $3, $4, 'generated',
      $5, $6, $7, $8, $9, $10, $11
    )`,
        [
            itemId,
            projectId,
            supplierId,
            totalAmount,
            boqItem.material_name,
            boqItem.material_category,
            boqItem.required_quantity,
            boqItem.unit,
            boqItem.unit_price,
            supplierName,
            supplierCommercialReg,
        ]
    );

    console.log(`[PO] Auto-generated purchase order for item ${itemId} → supplier ${supplierName}`);
}

// ─── Donor Queries ──────────────────────────────────────────────────────────

/**
 * Get a donor's escrow summary.
 */
export async function getDonorEscrowSummary(donorId: string) {
    const result = await query(
        'SELECT * FROM vw_donor_escrow_summary WHERE donor_id = $1',
        [donorId]
    );
    return result.rows[0] ?? null;
}

/**
 * Get a donor's donation history.
 * NMR-AUD-203 FIX: Added pagination to prevent unbounded result sets at scale.
 */
export async function getDonorDonations(
    donorId: string,
    limit = 50,
    offset = 0,
): Promise<EscrowLedger[]> {
    const result = await query<EscrowLedger>(
        `SELECT e.*, b.material_name, p.title AS project_title
     FROM escrow_ledger e
     JOIN itemized_boq b ON b.item_id = e.item_id
     JOIN projects p ON p.project_id = e.project_id
     WHERE e.donor_id = $1
     ORDER BY e.locked_at DESC
     LIMIT $2 OFFSET $3`,
        [donorId, limit, offset]
    );
    return result.rows;
}

// ─── Supplier Network ───────────────────────────────────────────────────────

/**
 * List all verified, active suppliers for the engineer BOQ picker.
 * Per strategic study §7.2: engineers select pre-assigned suppliers when adding BOQ items.
 * Per strategic study §7.1: donors see supplier name in the basket UI for transparency.
 */
export async function getVerifiedSuppliers(): Promise<
    { user_id: string; full_name: string; commercial_register_number: string | null }[]
> {
    const result = await query<{
        user_id: string;
        full_name: string;
        commercial_register_number: string | null;
    }>(
        `SELECT user_id, full_name, commercial_register_number
         FROM users
         WHERE role = 'supplier'
           AND is_active = TRUE
           AND kyc_verification_status = 'verified'
         ORDER BY full_name ASC`
    );
    return result.rows;
}
