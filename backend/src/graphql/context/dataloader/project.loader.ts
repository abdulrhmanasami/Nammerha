import DataLoader from 'dataloader';
import { query as dbQuery } from '../../../config/database';

export function createProjectLoader() {
    return new DataLoader<string, Record<string, unknown> | null>(async (projectIds) => {
        const result = await dbQuery(
            `SELECT project_id, homeowner_id, assigned_engineer_id, assigned_contractor_id,
                    title, description, cover_image_url, gps_location, address_text,
                    damage_type, damage_severity, status, is_public,
                    total_estimated_cost, total_funded_amount, progress,
                    created_at, updated_at
             FROM projects WHERE project_id = ANY($1)`,
            [projectIds]
        );
        const map = new Map();
        result.rows.forEach(r => map.set(r['project_id'], {
            projectId: r['project_id'],
            homeownerId: r['homeowner_id'],
            assignedEngineerId: r['assigned_engineer_id'],
            assignedContractorId: r['assigned_contractor_id'],
            title: r['title'],
            description: r['description'],
            coverImageUrl: r['cover_image_url'],
            damageType: String(r['damage_type']).toUpperCase(),
            damageSeverity: r['damage_severity'] ? String(r['damage_severity']).toUpperCase() : null,
            status: String(r['status']).toUpperCase(),
            isPublic: r['is_public'] ?? false,
            totalEstimatedCost: String(r['total_estimated_cost'] ?? '0'),
            totalFundedAmount: String(r['total_funded_amount'] ?? '0'),
            fundedPercentage: Number(r['progress'] ?? r['funded_percentage'] ?? 0),
            createdAt: r['created_at'],
            updatedAt: r['updated_at'],
        }));
        return projectIds.map(id => map.get(id) || null);
    });
}
