import { PoolClient } from 'pg';
import { logger } from '../utils/logger';

export async function generatePurchaseOrder(itemId: string, client: PoolClient): Promise<void> {
  // 1. Check if a PO already exists for this item to ensure idempotency
  const existingPO = await client.query(
    `SELECT po_id FROM purchase_orders WHERE item_id = $1 LIMIT 1`,
    [itemId]
  );

  if (existingPO.rows.length > 0) {
    logger.info('[PO-GEN] Purchase order already exists for item', { itemId });
    return;
  }

  // 2. Get the BOQ item details to generate the PO
  const itemResult = await client.query(
    `SELECT b.item_id, b.project_id, b.material_name, b.material_category, 
            b.required_quantity, b.unit, b.unit_price, b.preferred_supplier_id,
            u.full_name AS supplier_name, u.commercial_register_number
     FROM itemized_boq b
     LEFT JOIN users u ON u.user_id = b.preferred_supplier_id
     WHERE b.item_id = $1 AND b.preferred_supplier_id IS NOT NULL`,
    [itemId]
  );

  if (itemResult.rows.length === 0) {
    logger.warn('[PO-GEN] Cannot generate PO: Item not found or has no preferred supplier', { itemId });
    return;
  }

  const item = itemResult.rows[0];
  const totalAmount = Math.round(Number(item.required_quantity) * Number(item.unit_price));

  // 3. Generate PO number using the sequence
  const poNumResult = await client.query(`SELECT generate_po_number() AS po_number`);
  const poNumber = poNumResult.rows[0].po_number;

  // 4. Insert the PO
  await client.query(
    `INSERT INTO purchase_orders (
        po_number, item_id, project_id, supplier_id,
        amount, currency, status, material_name, material_category,
        quantity, unit, unit_price, supplier_name, supplier_commercial_reg
     ) VALUES (
        $1, $2, $3, $4, $5, 'USD', 'generated', $6, $7, $8, $9, $10, $11, $12
     )`,
    [
      poNumber,
      item.item_id,
      item.project_id,
      item.preferred_supplier_id,
      totalAmount,
      item.material_name,
      item.material_category || null,
      item.required_quantity,
      item.unit,
      item.unit_price,
      item.supplier_name,
      item.commercial_register_number || null
    ]
  );

  logger.info('[PO-GEN] Auto-generated Purchase Order', {
    itemId,
    poNumber,
    supplierId: item.preferred_supplier_id,
    amount: totalAmount
  });
}
