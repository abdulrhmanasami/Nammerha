import DataLoader from 'dataloader';
import { query as dbQuery } from '../../../config/database';

export function createBOQLoader() {
    return new DataLoader<string, Record<string, unknown>[]>(async (projectIds) => {
        const result = await dbQuery(
            `SELECT item_id, project_id, material_name, material_category,
                    description, image_url, unit, unit_price, required_quantity,
                    funded_amount, status, preferred_supplier_id, created_at, updated_at
             FROM itemized_boq WHERE project_id = ANY($1)
             ORDER BY created_at ASC`,
            [projectIds]
        );
        const map = new Map<string, Record<string, unknown>[]>();
        projectIds.forEach(id => map.set(id, []));
        
        result.rows.forEach(r => {
            const arr = map.get(r['project_id']) || [];
            const unitPrice = Number(r['unit_price'] ?? 0);
            const qty = Number(r['required_quantity'] ?? 0);
            const funded = Number(r['funded_amount'] ?? 0);
            const totalCost = unitPrice * qty;
            
            arr.push({
                itemId: r['item_id'],
                projectId: r['project_id'],
                materialName: r['material_name'],
                materialCategory: r['material_category'],
                description: r['description'],
                imageUrl: r['image_url'],
                unit: r['unit'],
                unitPrice: String(unitPrice),
                requiredQuantity: qty,
                fundedAmount: String(funded),
                fundedPercentage: totalCost > 0 ? Math.round((funded / totalCost) * 10000) / 100 : 0,
                status: String(r['status']).toUpperCase(),
                preferredSupplierId: r['preferred_supplier_id'],
                createdAt: r['created_at'],
                updatedAt: r['updated_at'],
            });
            map.set(r['project_id'], arr);
        });
        return projectIds.map(id => map.get(id) || []);
    });
}
