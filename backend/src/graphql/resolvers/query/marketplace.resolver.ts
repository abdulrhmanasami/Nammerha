// ============================================================================
// Nammerha GraphQL — Marketplace Query Resolvers
// ============================================================================
// Wraps existing service layer methods for public marketplace queries.
// These are the first resolvers implemented because they serve the
// Flutter mobile app's home screen and project discovery flow.
//
// Service mapping:
//   marketplace() → projectService.getPublishedProjects()
//   project()     → projectService.getProjectById()
//   projectBOQ()  → projectService.getProjectBOQ()
// ============================================================================

import type { GQLContext } from '../../context/auth.context';
import { query as dbQuery } from '../../../config/database';


// ─── Helper: Convert snake_case DB row to camelCase GraphQL response ────────

function mapProjectCard(row: Record<string, unknown>) {
    return {
        projectId: row['project_id'],
        title: row['title'],
        description: row['description'],
        coverImageUrl: row['cover_image_url'],
        addressText: row['address_text'],
        damageType: String(row['damage_type']).toUpperCase(),
        status: String(row['status']).toUpperCase(),
        totalEstimatedCost: String(row['total_estimated_cost'] ?? '0'),
        totalFundedAmount: String(row['total_funded_amount'] ?? '0'),
        fundedPercentage: Number(row['funded_percentage'] ?? 0),
        homeownerName: row['homeowner_name'],
        latitude: row['latitude'] ? Number(row['latitude']) : null,
        longitude: row['longitude'] ? Number(row['longitude']) : null,
        publishedAt: row['published_at'],
        totalItems: Number(row['total_items'] ?? 0),
        fullyFundedItems: Number(row['fully_funded_items'] ?? 0),
    };
}

function mapBOQItem(row: Record<string, unknown>) {
    const unitPrice = Number(row['unit_price'] ?? 0);
    const requiredQty = Number(row['required_quantity'] ?? 0);
    const fundedAmount = Number(row['funded_amount'] ?? 0);
    const totalCost = unitPrice * requiredQty;

    return {
        itemId: row['item_id'],
        projectId: row['project_id'],
        materialName: row['material_name'],
        materialCategory: row['material_category'],
        description: row['description'],
        imageUrl: row['image_url'],
        unit: row['unit'],
        unitPrice: String(unitPrice),
        requiredQuantity: requiredQty,
        fundedAmount: String(fundedAmount),
        fundedPercentage: totalCost > 0 ? Math.round((fundedAmount / totalCost) * 10000) / 100 : 0,
        oracleReferencePrice: row['oracle_reference_price'] ? String(row['oracle_reference_price']) : null,
        status: String(row['status']).toUpperCase().replace(/ /g, '_'),
        preferredSupplierId: row['preferred_supplier_id'],
        createdAt: row['created_at'],
        updatedAt: row['updated_at'],
    };
}

function mapProject(row: Record<string, unknown>) {
    const totalEstimated = Number(row['total_estimated_cost'] ?? 0);
    const totalFunded = Number(row['total_funded_amount'] ?? 0);

    return {
        projectId: row['project_id'],
        homeownerId: row['homeowner_id'],
        assignedEngineerId: row['assigned_engineer_id'],
        assignedContractorId: row['assigned_contractor_id'],
        title: row['title'],
        description: row['description'],
        coverImageUrl: row['cover_image_url'],
        gpsLocation: row['gps_location'],
        addressText: row['address_text'],
        damageType: String(row['damage_type']).toUpperCase(),
        damageSeverity: row['damage_severity'] ? String(row['damage_severity']).toUpperCase() : null,
        status: String(row['status']).toUpperCase(),
        isPublic: row['is_public'],
        totalEstimatedCost: String(totalEstimated),
        totalFundedAmount: String(totalFunded),
        fundedPercentage: totalEstimated > 0 ? Math.round((totalFunded / totalEstimated) * 10000) / 100 : 0,
        publishedAt: row['published_at'],
        completedAt: row['completed_at'],
        createdAt: row['created_at'],
        updatedAt: row['updated_at'],
    };
}

// ─── Query Resolvers ────────────────────────────────────────────────────────

export const marketplaceQueryResolvers = {
    /**
     * Browse published reconstruction projects.
     * Maps to: GET /api/marketplace/projects
     * Uses: vw_project_cards view from 001_core_schema.sql
     */
    marketplace: async (
        _parent: unknown,
        args: {
            filters?: {
                damageType?: string;
                status?: string;
                minFundedPercentage?: number;
                maxFundedPercentage?: number;
                search?: string;
                page?: number;
                pageSize?: number;
            };
        },
        _context: GQLContext,
    ) => {
        const filters = args.filters ?? {};
        const page = Math.max(1, filters.page ?? 1);
        const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 12));
        const offset = (page - 1) * pageSize;

        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (filters.damageType) {
            conditions.push(`damage_type = $${paramIndex++}`);
            params.push(filters.damageType.toLowerCase());
        }

        if (filters.search) {
            conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR address_text ILIKE $${paramIndex})`);
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        if (filters.minFundedPercentage !== undefined) {
            conditions.push(`funded_percentage >= $${paramIndex++}`);
            params.push(filters.minFundedPercentage);
        }

        if (filters.maxFundedPercentage !== undefined) {
            conditions.push(`funded_percentage <= $${paramIndex++}`);
            params.push(filters.maxFundedPercentage);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total for pagination
        const countResult = await dbQuery(
            `SELECT COUNT(*) as total FROM vw_project_cards ${whereClause}`,
            params,
        );
        const total = Number(countResult.rows[0]?.['total'] ?? 0);

        // M-1 FIX: PLAT-AUD-001 — explicit column list (no SELECT *) to prevent schema drift.
        const dataParams = [...params, pageSize, offset];
        const result = await dbQuery(
            `SELECT project_id, title, description, cover_image_url, address_text,
                    damage_type, status, total_estimated_cost, total_funded_amount,
                    funded_percentage, homeowner_name, latitude, longitude,
                    published_at, total_items, fully_funded_items
             FROM vw_project_cards ${whereClause}
             ORDER BY published_at DESC NULLS LAST
             LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            dataParams,
        );

        return {
            items: result.rows.map(mapProjectCard),
            total,
            page,
            pageSize,
            hasMore: offset + pageSize < total,
        };
    },

    /**
     * Get project details by ID.
     * Maps to: GET /api/projects/:id
     */
    project: async (
        _parent: unknown,
        args: { projectId: string },
        _context: GQLContext,
    ) => {
        // M-1 FIX: PLAT-AUD-001 — explicit column list (no SELECT *) to prevent schema drift.
        const result = await dbQuery(
            `SELECT project_id, homeowner_id, assigned_engineer_id, assigned_contractor_id,
                    title, description, cover_image_url, gps_location, address_text,
                    damage_type, damage_severity, status, is_public,
                    total_estimated_cost, total_funded_amount,
                    published_at, completed_at, created_at, updated_at
             FROM projects WHERE project_id = $1`,
            [args.projectId],
        );

        if (result.rows.length === 0) {
            throw new Error(`Project not found: ${args.projectId}`);
        }

        return mapProject(result.rows[0] as Record<string, unknown>);
    },

    /**
     * Get BOQ items for a project.
     * Maps to: GET /api/projects/:id/boq
     * Uses: vw_boq_funding view from 001_core_schema.sql
     */
    projectBOQ: async (
        _parent: unknown,
        args: { projectId: string },
        _context: GQLContext,
    ) => {
        const result = await dbQuery(
            `SELECT b.*, s.full_name as supplier_name
             FROM itemized_boq b
             LEFT JOIN users s ON s.user_id = b.preferred_supplier_id
             WHERE b.project_id = $1
             ORDER BY b.created_at ASC`,
            [args.projectId],
        );

        return result.rows.map(row => mapBOQItem(row as Record<string, unknown>));
    },
};

/**
 * Project field resolvers — resolve nested fields on the Project type.
 */
export const projectFieldResolvers = {
    Project: {
        /** Resolve the homeowner user for a project */
        homeowner: async (parent: { homeownerId: string }) => {
            if (!parent.homeownerId) return null;
            const result = await dbQuery(
                'SELECT user_id, email, full_name, role, avatar_url, kyc_verification_status, is_active FROM users WHERE user_id = $1',
                [parent.homeownerId],
            );
            if (result.rows.length === 0) return null;
            const row = result.rows[0] as Record<string, unknown>;
            return {
                userId: row['user_id'],
                email: row['email'],
                fullName: row['full_name'],
                role: String(row['role']).toUpperCase(),
                avatarUrl: row['avatar_url'],
                kycVerificationStatus: String(row['kyc_verification_status']).toUpperCase(),
                isActive: row['is_active'],
            };
        },

        // M-2 FIX: PLAT-AUD-001 — explicit column list (no SELECT *) to prevent schema drift.
        boqItems: async (parent: { projectId: string }) => {
            const result = await dbQuery(
                `SELECT item_id, project_id, material_name, material_category,
                        description, image_url, unit, unit_price, required_quantity,
                        funded_amount, status, preferred_supplier_id, oracle_reference_price,
                        created_at, updated_at
                 FROM itemized_boq WHERE project_id = $1 ORDER BY created_at ASC`,
                [parent.projectId],
            );
            return result.rows.map(row => mapBOQItem(row as Record<string, unknown>));
        },

        /** Resolve spatial proofs for a project */
        spatialProofs: async (parent: { projectId: string }) => {
            const result = await dbQuery(
                'SELECT * FROM spatial_proof WHERE project_id = $1 ORDER BY captured_at DESC',
                [parent.projectId],
            );
            return result.rows.map((row: Record<string, unknown>) => ({
                proofId: row['proof_id'],
                itemId: row['item_id'],
                projectId: row['project_id'],
                engineerId: row['engineer_id'],
                gpsCoordinates: row['gps_coordinates'],
                gpsAccuracyMeters: row['gps_accuracy_meters'] ? Number(row['gps_accuracy_meters']) : null,
                capturedAt: row['captured_at'],
                imageUrl: row['image_url'],
                imageHash: row['image_hash'],
                description: row['description'],
                deviceInfo: row['device_info'],
                verificationStatus: String(row['verification_status']).toUpperCase(),
                verifiedBy: row['verified_by'],
                verifiedAt: row['verified_at'],
                createdAt: row['created_at'],
            }));
        },
    },
};
