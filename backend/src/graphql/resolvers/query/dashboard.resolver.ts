import { requireRole, type GQLContext } from '../../context/auth.context';
import * as supplierService from '../../../services/supplier.service';
import * as engineerService from '../../../services/engineer.service';
import * as contractorService from '../../../services/contractor.service';
import * as tradespersonService from '../../../services/tradesperson.service';
import { mapSupplierCatalogItem, mapPurchaseOrder } from '../_shared/row-mappers';

export const dashboardQueryResolvers = {
    supplierStats: async (_: unknown, __: unknown, context: GQLContext) => {
        const user = requireRole(context, 'supplier');
        const stats = await supplierService.getMyStats(user.user_id);
        return {
            pendingOrders: stats.pending_orders,
            wonContracts: stats.won_contracts,
            inTransit: stats.in_transit,
            totalRevenue: String(stats.total_revenue),
            catalogItems: stats.catalog_items,
            totalOrders: stats.total_orders,
        };
    },

    supplierCatalog: async (_: unknown, __: unknown, context: GQLContext) => {
        const user = requireRole(context, 'supplier');
        const result = await supplierService.getMyCatalog(user.user_id);
        return result.items.map(item => mapSupplierCatalogItem(item as unknown as Record<string, unknown>));
    },

    supplierOrders: async (_: unknown, __: unknown, context: GQLContext) => {
        const user = requireRole(context, 'supplier');
        const result = await supplierService.getMyOrders(user.user_id);
        return result.items.map(o => mapPurchaseOrder(o as unknown as Record<string, unknown>));
    },

    engineerStats: async (_: unknown, __: unknown, context: GQLContext) => {
        const user = requireRole(context, 'engineer');
        const stats = await engineerService.getMyStats(user.user_id);
        return {
            assignedProjects: stats.assigned_projects,
            proofsPending: stats.proofs_pending,
            proofsVerified: stats.proofs_verified,
            escrowReleased: String(stats.escrow_released),
            activeBids: stats.active_bids,
            totalBids: stats.total_bids,
        };
    },

    engineerProjects: async (_: unknown, __: unknown, context: GQLContext) => {
        const user = requireRole(context, 'engineer');
        const projects = await engineerService.getMyProjects(user.user_id);
        return projects.map(p => {
            const raw = p as unknown as Record<string, unknown>;
            return {
                projectId: raw['project_id'],
                homeownerId: raw['homeowner_id'] ?? null,
                assignedEngineerId: raw['assigned_engineer_id'] ?? null,
                assignedContractorId: raw['assigned_contractor_id'] ?? null,
                title: raw['title'],
                description: raw['description'] ?? null,
                coverImageUrl: raw['cover_image_url'] ?? null,
                gpsLocation: raw['gps_location'] ?? null,
                addressText: raw['address_text'] ?? null,
                damageType: String(raw['damage_type'] ?? 'mixed').toUpperCase(),
                damageSeverity: raw['damage_severity'] ? String(raw['damage_severity']).toUpperCase() : null,
                status: String(raw['status']).toUpperCase(),
                isPublic: raw['is_public'] ?? false,
                totalEstimatedCost: String(raw['total_estimated_cost'] ?? '0'),
                totalFundedAmount: String(raw['total_funded_amount'] ?? '0'),
                fundedPercentage: Number(raw['funded_percentage'] ?? raw['progress'] ?? 0),
                createdAt: raw['created_at'],
                updatedAt: raw['updated_at'] ?? raw['created_at'],
                boqItems: [],
                spatialProofs: [],
            };
        });
    },

    contractorStats: async (_: unknown, __: unknown, context: GQLContext) => {
        const user = requireRole(context, 'contractor');
        const stats = await contractorService.getMyStats(user.user_id);
        return {
            activeProjects: stats.active_projects,
            pendingBids: stats.pending_bids,
            wonBids: stats.won_bids,
            totalEscrowReceived: String(stats.total_escrow_received),
            totalBids: stats.total_bids,
            bidWinRate: stats.bid_win_rate,
        };
    },

    tradespersonStats: async (_: unknown, __: unknown, context: GQLContext) => {
        const user = requireRole(context, 'tradesperson');
        const stats = await tradespersonService.getMyStats(user.user_id);
        return {
            activeJobs: stats.active_jobs,
            completedJobs: stats.completed_jobs,
            pendingRequests: stats.pending_requests,
            activeAssignments: stats.active_assignments,
            totalEarnings: String(stats.total_earnings),
            averageRating: stats.average_rating,
        };
    },
};
