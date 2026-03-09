// ============================================================================
// Nammerha Backend — Supplier Service
// Complete supplier journey: catalog management, purchase order tracking,
// and dashboard KPI aggregation.
// ============================================================================
import { query, transaction } from '../config/database';
import type {
    SupplierCatalogItem,
    AddCatalogItemDTO,
    UpdateCatalogItemDTO,
    SupplierStats,
    PurchaseOrder,
} from '../types';

// ─── Catalog Management ─────────────────────────────────────────────────────

/**
 * Add a material to the supplier's catalog.
 * UNIQUE constraint (supplier_id, material_name, unit) prevents duplicates.
 */
export async function addCatalogItem(
    supplierId: string,
    dto: AddCatalogItemDTO,
): Promise<SupplierCatalogItem> {
    const result = await query<SupplierCatalogItem>(
        `INSERT INTO supplier_catalog
            (supplier_id, material_name, material_category, description,
             image_url, unit, unit_price_guide, min_order_qty, lead_time_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
            supplierId,
            dto.material_name.trim(),
            dto.material_category.trim(),
            dto.description || null,
            dto.image_url || null,
            dto.unit.trim(),
            dto.unit_price_guide,
            dto.min_order_qty ?? 1,
            dto.lead_time_days ?? 7,
        ],
    );

    return result.rows[0]!;
}

/**
 * Update a catalog item. Only the owning supplier can update.
 * Uses dynamic SET to only update provided fields.
 */
export async function updateCatalogItem(
    supplierId: string,
    catalogId: string,
    dto: UpdateCatalogItemDTO,
): Promise<SupplierCatalogItem> {
    // Build dynamic SET clause — only update fields that are provided
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, keyof UpdateCatalogItemDTO> = {
        material_name: 'material_name',
        material_category: 'material_category',
        description: 'description',
        image_url: 'image_url',
        unit: 'unit',
        unit_price_guide: 'unit_price_guide',
        min_order_qty: 'min_order_qty',
        lead_time_days: 'lead_time_days',
    };

    for (const [column, dtoKey] of Object.entries(fieldMap)) {
        if (dto[dtoKey] !== undefined) {
            updates.push(`${column} = $${paramIdx}`);
            const val = dto[dtoKey];
            params.push(typeof val === 'string' ? val.trim() : val);
            paramIdx++;
        }
    }

    if (updates.length === 0) {
        throw new Error('No fields to update');
    }

    // Add ownership + ID params
    params.push(catalogId);    // $N
    params.push(supplierId);   // $N+1

    const result = await query<SupplierCatalogItem>(
        `UPDATE supplier_catalog
         SET ${updates.join(', ')}
         WHERE catalog_id = $${paramIdx} AND supplier_id = $${paramIdx + 1}
         RETURNING *`,
        params,
    );

    if (result.rows.length === 0) {
        throw new Error('Catalog item not found or not owned by you');
    }

    return result.rows[0]!;
}

/**
 * Soft-delete a catalog item (set is_active = false).
 * Only the owning supplier can deactivate.
 */
export async function deactivateCatalogItem(
    supplierId: string,
    catalogId: string,
): Promise<void> {
    const result = await query(
        `UPDATE supplier_catalog SET is_active = false
         WHERE catalog_id = $1 AND supplier_id = $2`,
        [catalogId, supplierId],
    );

    if ((result as { rowCount: number }).rowCount === 0) {
        throw new Error('Catalog item not found or not owned by you');
    }
}

/**
 * Get the supplier's own catalog (includes inactive items for management).
 */
export async function getMyCatalog(
    supplierId: string,
): Promise<SupplierCatalogItem[]> {
    const result = await query<SupplierCatalogItem>(
        `SELECT * FROM supplier_catalog
         WHERE supplier_id = $1
         ORDER BY material_category ASC, material_name ASC`,
        [supplierId],
    );
    return result.rows;
}

/**
 * Get a supplier's PUBLIC catalog (only active items).
 * Used by engineers when selecting preferred_supplier_id for BOQ items.
 */
export async function getSupplierCatalog(
    supplierId: string,
    category?: string,
): Promise<SupplierCatalogItem[]> {
    let sql = `SELECT * FROM supplier_catalog
               WHERE supplier_id = $1 AND is_active = true`;
    const params: unknown[] = [supplierId];

    if (category) {
        sql += ` AND material_category = $2`;
        params.push(category);
    }

    sql += ` ORDER BY material_category ASC, material_name ASC`;

    const result = await query<SupplierCatalogItem>(sql, params);
    return result.rows;
}

// ─── Purchase Orders (Supplier View) ────────────────────────────────────────

/**
 * Get all purchase orders assigned to this supplier.
 * Includes project title and BOQ item details for context.
 */
export async function getMyOrders(
    supplierId: string,
    status?: string,
): Promise<PurchaseOrder[]> {
    let sql = `SELECT po.*, p.title AS project_title
               FROM purchase_orders po
               JOIN projects p ON p.project_id = po.project_id
               WHERE po.supplier_id = $1`;
    const params: unknown[] = [supplierId];

    if (status) {
        sql += ` AND po.status = $2`;
        params.push(status);
    }

    sql += ` ORDER BY po.generated_at DESC`;

    const result = await query<PurchaseOrder>(sql, params);
    return result.rows;
}

/**
 * Supplier acknowledges a purchase order (status: generated → acknowledged).
 * Validates ownership and enforces valid status transitions.
 */
export async function acknowledgeOrder(
    supplierId: string,
    poId: string,
): Promise<PurchaseOrder> {
    return transaction(async (client) => {
        // Lock the PO row to prevent concurrent updates
        const poRes = await client.query<PurchaseOrder>(
            `SELECT * FROM purchase_orders
             WHERE po_id = $1 AND supplier_id = $2 FOR UPDATE`,
            [poId, supplierId],
        );

        if (poRes.rows.length === 0) {
            throw new Error('Purchase order not found or not assigned to you');
        }

        const po = poRes.rows[0]!;

        // Validate status transition: only 'generated' or 'sent_to_supplier' → 'acknowledged'
        if (po.status !== 'generated' && po.status !== 'sent_to_supplier') {
            throw new Error(
                `Cannot acknowledge PO in status '${po.status}'. Expected 'generated' or 'sent_to_supplier'.`,
            );
        }

        const result = await client.query<PurchaseOrder>(
            `UPDATE purchase_orders
             SET status = 'acknowledged', acknowledged_at = NOW()
             WHERE po_id = $1
             RETURNING *`,
            [poId],
        );

        // Audit trail
        await client.query(
            `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
             VALUES ('po_acknowledged', 'purchase_order', $1, $2, $3)`,
            [
                poId,
                supplierId,
                JSON.stringify({ po_number: po.po_number, project_id: po.project_id }),
            ],
        );

        return result.rows[0]!;
    });
}

/**
 * Supplier updates PO status: acknowledged → shipped → delivered.
 * Each transition is validated and logged to audit_trail.
 */
export async function updateOrderStatus(
    supplierId: string,
    poId: string,
    newStatus: 'shipped' | 'delivered',
): Promise<PurchaseOrder> {
    const validTransitions: Record<string, string[]> = {
        shipped: ['acknowledged'],
        delivered: ['shipped'],
    };

    const allowedFrom = validTransitions[newStatus];
    if (!allowedFrom) {
        throw new Error(`Invalid target status: ${newStatus}`);
    }

    return transaction(async (client) => {
        const poRes = await client.query<PurchaseOrder>(
            `SELECT * FROM purchase_orders
             WHERE po_id = $1 AND supplier_id = $2 FOR UPDATE`,
            [poId, supplierId],
        );

        if (poRes.rows.length === 0) {
            throw new Error('Purchase order not found or not assigned to you');
        }

        const po = poRes.rows[0]!;
        if (!allowedFrom.includes(po.status)) {
            throw new Error(
                `Cannot transition from '${po.status}' to '${newStatus}'. Expected: ${allowedFrom.join(', ')}`,
            );
        }

        const timestampField = newStatus === 'shipped' ? 'shipped_at' : 'delivered_at';

        const result = await client.query<PurchaseOrder>(
            `UPDATE purchase_orders
             SET status = $1, ${timestampField} = NOW()
             WHERE po_id = $2
             RETURNING *`,
            [newStatus, poId],
        );

        // Audit trail
        await client.query(
            `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
             VALUES ($1, 'purchase_order', $2, $3, $4)`,
            [
                `po_${newStatus}`,
                poId,
                supplierId,
                JSON.stringify({
                    po_number: po.po_number,
                    project_id: po.project_id,
                    previous_status: po.status,
                    new_status: newStatus,
                }),
            ],
        );

        return result.rows[0]!;
    });
}

// ─── Dashboard Stats ────────────────────────────────────────────────────────

/**
 * Aggregate KPIs for the supplier dashboard.
 * Single optimized query using conditional aggregation.
 */
export async function getMyStats(supplierId: string): Promise<SupplierStats> {
    const statsResult = await query<{
        pending_orders: string;
        won_contracts: string;
        in_transit: string;
        total_revenue: string;
        total_orders: string;
    }>(
        `SELECT
            COUNT(*) FILTER (WHERE status IN ('generated', 'sent_to_supplier')) AS pending_orders,
            COUNT(*) FILTER (WHERE status IN ('acknowledged', 'shipped', 'delivered')) AS won_contracts,
            COUNT(*) FILTER (WHERE status = 'shipped') AS in_transit,
            COALESCE(SUM(amount) FILTER (WHERE status = 'delivered'), 0) AS total_revenue,
            COUNT(*) AS total_orders
         FROM purchase_orders
         WHERE supplier_id = $1`,
        [supplierId],
    );

    const catalogResult = await query<{ count: string }>(
        `SELECT COUNT(*) FROM supplier_catalog
         WHERE supplier_id = $1 AND is_active = true`,
        [supplierId],
    );

    const stats = statsResult.rows[0];
    return {
        pending_orders: parseInt(stats?.pending_orders ?? '0', 10),
        won_contracts: parseInt(stats?.won_contracts ?? '0', 10),
        in_transit: parseInt(stats?.in_transit ?? '0', 10),
        total_revenue: parseInt(stats?.total_revenue ?? '0', 10),
        catalog_items: parseInt(catalogResult.rows[0]?.count ?? '0', 10),
        total_orders: parseInt(stats?.total_orders ?? '0', 10),
    };
}
