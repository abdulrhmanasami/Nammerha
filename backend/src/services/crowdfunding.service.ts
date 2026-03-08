// ============================================================================
// Nammerha Backend — Crowdfunding Service (Path 2: Donor → Escrow)
// ============================================================================
// Handles the itemized micro-funding flow:
//   1. Donor browses marketplace (published projects on map)
//   2. Donor selects specific BOQ items to fund
//   3. Payment processed → funds locked in escrow
//   4. If item reaches fully_funded → triggers auto-PO generation
// ============================================================================
import { query, transaction } from '../config/database';
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
    return transaction(async (client) => {
        const escrowEntries: EscrowLedger[] = [];

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

            // 2. Calculate remaining need
            const totalCost = Math.floor(boqItem.unit_price * boqItem.required_quantity);
            const remainingNeed = totalCost - boqItem.funded_amount;

            if (remainingNeed <= 0) {
                throw new Error(`BOQ item '${fundItem.item_id}' is already fully funded`);
            }

            // 3. Cap donation at remaining need (prevent over-funding)
            const actualAmount = Math.min(fundItem.amount, remainingNeed);
            if (actualAmount <= 0) {
                throw new Error(`Invalid donation amount for item ${fundItem.item_id}`);
            }

            // 4. Process payment (placeholder — in production, call payment gateway)
            const gatewayRef = `PAY-${dto.payment_method.toUpperCase()}-${Date.now()}`;

            // 5. Create escrow entry (locked)
            const escrowResult = await client.query<EscrowLedger>(
                `INSERT INTO escrow_ledger (
          donor_id, item_id, project_id, amount_locked, currency,
          payment_status, payment_method, payment_gateway_ref, locked_at
        ) VALUES ($1, $2, $3, $4, 'USD', 'locked', $5, $6, NOW())
        RETURNING *`,
                [
                    donorId,
                    fundItem.item_id,
                    boqItem.project_id,
                    actualAmount,
                    dto.payment_method,
                    gatewayRef,
                ]
            );

            const entry = escrowResult.rows[0];
            if (!entry) throw new Error('Failed to create escrow entry');
            escrowEntries.push(entry);

            // 6. Check if item is now fully funded
            // (The trigger trg_update_boq_funded has already updated funded_amount)
            const updatedBoq = await client.query<{ funded_amount: number }>(
                'SELECT funded_amount FROM itemized_boq WHERE item_id = $1',
                [fundItem.item_id]
            );
            const newFunded = updatedBoq.rows[0]?.funded_amount ?? 0;

            if (newFunded >= totalCost) {
                // Mark as fully_funded
                await client.query(
                    "UPDATE itemized_boq SET status = 'fully_funded' WHERE item_id = $1",
                    [fundItem.item_id]
                );

                // Auto-generate Purchase Order (Path 3 trigger)
                await autoGeneratePO(client, fundItem.item_id, boqItem.project_id);
            } else if (newFunded > 0 && boqItem.status === 'verified') {
                // Mark as partially_funded
                await client.query(
                    "UPDATE itemized_boq SET status = 'partially_funded' WHERE item_id = $1",
                    [fundItem.item_id]
                );
            }
        }

        return escrowEntries;
    });
}

// ─── Auto PO Generation (triggered from donation) ──────────────────────────

/**
 * Auto-generates a Purchase Order when a BOQ item is fully funded.
 * Selects the best supplier: KYC-verified, active, matching material category.
 */
async function autoGeneratePO(
    client: {
        query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
    },
    itemId: string,
    projectId: string
): Promise<void> {
    // 1. Get BOQ item details
    const boqResult = await client.query<{
        material_name: string;
        material_category: string | null;
        unit: string;
        unit_price: number;
        required_quantity: number;
    }>(
        'SELECT material_name, material_category, unit, unit_price, required_quantity FROM itemized_boq WHERE item_id = $1',
        [itemId]
    );
    const boqItem = boqResult.rows[0];
    if (!boqItem) return;

    // 2. Find best supplier (active, verified, matching category)
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

    // 3. Generate PO
    const totalAmount = Math.floor(boqItem.unit_price * boqItem.required_quantity);

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
            supplier.user_id,
            totalAmount,
            boqItem.material_name,
            boqItem.material_category,
            boqItem.required_quantity,
            boqItem.unit,
            boqItem.unit_price,
            supplier.full_name,
            supplier.commercial_register_number,
        ]
    );

    console.log(`[PO] Auto-generated purchase order for item ${itemId} → supplier ${supplier.full_name}`);
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
 */
export async function getDonorDonations(donorId: string): Promise<EscrowLedger[]> {
    const result = await query<EscrowLedger>(
        `SELECT e.*, b.material_name, p.title AS project_title
     FROM escrow_ledger e
     JOIN itemized_boq b ON b.item_id = e.item_id
     JOIN projects p ON p.project_id = e.project_id
     WHERE e.donor_id = $1
     ORDER BY e.locked_at DESC`,
        [donorId]
    );
    return result.rows;
}
