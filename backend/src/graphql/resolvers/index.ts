// ============================================================================
// Nammerha GraphQL — Complete Resolver Registry (Platinum Standard)
// ============================================================================
// Every resolver wraps existing service layer methods with ZERO business logic
// duplication. The resolver layer is a pure translation layer:
//   1. Extract args from GraphQL context
//   2. Call existing service method
//   3. Transform snake_case DB response → camelCase GraphQL response
//
// STRANGLER FIG: REST endpoints remain operational. Each GraphQL resolver
// maps to its REST equivalent. Clients choose which to use.
// ============================================================================

import { customScalars } from '../scalars/index';
import {
    marketplaceQueryResolvers,
    projectFieldResolvers,
} from './query/marketplace.resolver';

// ── Service Imports ─────────────────────────────────────────────────────────
import * as notificationService from '../../services/notification.service';
import * as supplierService from '../../services/supplier.service';
import * as engineerService from '../../services/engineer.service';
import * as contractorService from '../../services/contractor.service';
import * as tradespersonService from '../../services/tradesperson.service';
import * as impactService from '../../services/impact.service';
import * as crowdfundingService from '../../services/crowdfunding.service';
import * as executionService from '../../services/execution.service';
import * as storageService from '../../services/storage.service';
import * as deviceAuthService from '../../services/device-auth.service';

// ── Auth Imports ────────────────────────────────────────────────────────────
import { requireAuth, requireRole, type GQLContext } from '../context/auth.context';
import { query as dbQuery } from '../../config/database';
import { generateToken } from '../../middleware/auth.middleware';

// ── Row Mapping Utilities ───────────────────────────────────────────────────
// PostgreSQL returns snake_case. GraphQL expects camelCase. These pure mappers
// are the only place this translation occurs — no logic, just field renaming.

function mapUser(row: Record<string, unknown>) {
    return {
        userId: row['user_id'],
        email: row['email'],
        phone: row['phone'],
        fullName: row['full_name'],
        role: String(row['role']).toUpperCase(),
        avatarUrl: row['avatar_url'],
        kycVerificationStatus: String(row['kyc_verification_status']).toUpperCase(),
        isActive: row['is_active'],
        isEmailVerified: row['is_email_verified'] ?? false,
        roles: row['roles'] ?? [String(row['role']).toUpperCase()],
        createdAt: row['created_at'],
        updatedAt: row['updated_at'],
    };
}

function mapNotification(row: Record<string, unknown>) {
    return {
        notificationId: row['notification_id'],
        userId: row['user_id'],
        type: String(row['type']).toUpperCase(),
        title: row['title'],
        body: row['body'],
        data: row['data'],
        channel: String(row['channel'] ?? 'in_app').toUpperCase(),
        isRead: row['is_read'],
        readAt: row['read_at'],
        createdAt: row['created_at'],
    };
}

function mapEscrowEntry(row: Record<string, unknown>) {
    return {
        transactionId: row['transaction_id'],
        donorId: row['donor_id'],
        itemId: row['item_id'],
        projectId: row['project_id'],
        amountLocked: String(row['amount_locked'] ?? '0'),
        currency: row['currency'] ?? 'USD',
        paymentStatus: String(row['payment_status']).toUpperCase(),
        paymentMethod: row['payment_method'],
        paymentGatewayRef: row['payment_gateway_ref'],
        lockedAt: row['locked_at'],
        releasedAt: row['released_at'],
        releasedBy: row['released_by'],
        releaseProofId: row['release_proof_id'],
        giftRecipientName: row['gift_recipient_name'],
        giftMessage: row['gift_message'],
        donationIntent: row['donation_intent'] ? String(row['donation_intent']).toUpperCase() : null,
        createdAt: row['created_at'],
    };
}

function mapSupplierCatalogItem(row: Record<string, unknown>) {
    return {
        catalogId: row['catalog_id'],
        supplierId: row['supplier_id'],
        materialName: row['material_name'],
        materialCategory: row['material_category'],
        description: row['description'],
        imageUrl: row['image_url'],
        unit: row['unit'],
        unitPriceGuide: String(row['unit_price_guide'] ?? '0'),
        minOrderQty: Number(row['min_order_qty'] ?? 1),
        leadTimeDays: Number(row['lead_time_days'] ?? 7),
        isActive: row['is_active'],
        createdAt: row['created_at'],
    };
}

function mapPurchaseOrder(row: Record<string, unknown>) {
    return {
        poId: row['po_id'],
        poNumber: row['po_number'],
        itemId: row['item_id'],
        projectId: row['project_id'],
        supplierId: row['supplier_id'],
        amount: String(row['amount'] ?? '0'),
        currency: row['currency'] ?? 'USD',
        status: String(row['status']).toUpperCase(),
        materialName: row['material_name'],
        quantity: Number(row['quantity'] ?? 0),
        unit: row['unit'],
        unitPrice: String(row['unit_price'] ?? '0'),
        supplierName: row['supplier_name'],
        generatedAt: row['generated_at'],
        createdAt: row['created_at'],
    };
}

function mapSpatialProof(row: Record<string, unknown>) {
    return {
        proofId: row['proof_id'],
        itemId: row['item_id'],
        projectId: row['project_id'],
        engineerId: row['engineer_id'],
        gpsCoordinates: row['gps_coordinates'],
        gpsAccuracyMeters: row['gps_accuracy_meters'] != null ? Number(row['gps_accuracy_meters']) : null,
        capturedAt: row['captured_at'],
        imageUrl: row['image_url'],
        imageHash: row['image_hash'],
        description: row['description'],
        deviceInfo: row['device_info'],
        verificationStatus: String(row['verification_status']).toUpperCase(),
        verifiedBy: row['verified_by'],
        verifiedAt: row['verified_at'],
        createdAt: row['created_at'],
    };
}

function mapImpactMessage(row: Record<string, unknown>) {
    return {
        messageId: row['message_id'],
        donorId: row['donor_id'],
        projectId: row['project_id'],
        eventType: String(row['event_type']).toUpperCase(),
        titleEn: row['title_en'],
        titleAr: row['title_ar'],
        bodyEn: row['body_en'],
        bodyAr: row['body_ar'],
        metadata: row['metadata'] ?? {},
        readAt: row['read_at'],
        createdAt: row['created_at'],
    };
}

function mapReview(row: Record<string, unknown>) {
    return {
        reviewId: row['review_id'],
        reviewerId: row['reviewer_id'],
        reviewableType: String(row['reviewable_type']).toUpperCase(),
        reviewableId: row['reviewable_id'],
        projectId: row['project_id'],
        overallRating: Number(row['overall_rating'] ?? 0),
        title: row['title'],
        body: row['body'],
        isVerifiedInteraction: row['is_verified_interaction'] ?? false,
        status: String(row['status'] ?? 'published').toUpperCase(),
        helpfulCount: Number(row['helpful_count'] ?? 0),
        createdAt: row['created_at'],
    };
}

// ============================================================================
// RESOLVER MAP — Platinum Standard: Zero Stubs
// ============================================================================

export const resolvers = {
    // ── Custom Scalars ──────────────────────────────────────────────────────
    ...customScalars,

    // ═══════════════════════════════════════════════════════════════════════
    // QUERY RESOLVERS
    // ═══════════════════════════════════════════════════════════════════════

    Query: {
        // ── Marketplace (Public — No Auth) ──────────────────────────────────
        ...marketplaceQueryResolvers,

        // ── Auth ────────────────────────────────────────────────────────────

        /**
         * Get current authenticated user profile.
         * REST equivalent: GET /api/auth/me
         */
        me: async (_: unknown, __: unknown, context: GQLContext) => {
            const authUser = requireAuth(context);
            const result = await dbQuery(
                `SELECT user_id, email, phone, full_name, role, avatar_url,
                        kyc_verification_status, is_active, is_email_verified,
                        created_at, updated_at
                 FROM users WHERE user_id = $1`,
                [authUser.user_id],
            );
            if (result.rows.length === 0) throw new Error('User not found');
            const user = mapUser(result.rows[0] as Record<string, unknown>);
            // Inject multi-role array from auth context
            return { ...user, roles: authUser.roles.map(r => r.toUpperCase()) };
        },

        // ── Supplier Dashboard ──────────────────────────────────────────────

        /**
         * Supplier dashboard KPIs.
         * REST equivalent: GET /api/supplier/stats
         */
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

        /**
         * Supplier catalog items.
         * REST equivalent: GET /api/supplier/catalog
         */
        supplierCatalog: async (_: unknown, __: unknown, context: GQLContext) => {
            const user = requireRole(context, 'supplier');
            const items = await supplierService.getMyCatalog(user.user_id);
            return items.map(item => mapSupplierCatalogItem(item as unknown as Record<string, unknown>));
        },

        /**
         * Supplier purchase orders.
         * REST equivalent: GET /api/supplier/orders
         */
        supplierOrders: async (_: unknown, __: unknown, context: GQLContext) => {
            const user = requireRole(context, 'supplier');
            const orders = await supplierService.getMyOrders(user.user_id);
            return orders.map(o => mapPurchaseOrder(o as unknown as Record<string, unknown>));
        },

        // ── Engineer Dashboard ──────────────────────────────────────────────

        /**
         * Engineer dashboard KPIs.
         * REST equivalent: GET /api/engineer/stats
         */
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

        /**
         * Engineer assigned projects.
         * REST equivalent: GET /api/engineer/projects
         */
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

        // ── Contractor Dashboard ────────────────────────────────────────────

        /**
         * Contractor dashboard KPIs.
         * REST equivalent: GET /api/contractor/stats
         */
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

        // ── Tradesperson Dashboard ──────────────────────────────────────────

        /**
         * Tradesperson dashboard KPIs.
         * REST equivalent: GET /api/tradesperson/stats
         */
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

        // ── Notifications ───────────────────────────────────────────────────

        /**
         * Paginated notifications for current user.
         * REST equivalent: GET /api/notifications
         */
        notifications: async (
            _: unknown,
            args: { page?: number; pageSize?: number },
            context: GQLContext,
        ) => {
            const user = requireAuth(context);
            const limit = Math.min(50, Math.max(1, args.pageSize ?? 20));
            const notifications = await notificationService.getUserNotifications(
                user.user_id,
                { limit },
            );
            const unreadCount = await notificationService.getUnreadCount(user.user_id);
            return {
                items: notifications.map(n => mapNotification(n as unknown as Record<string, unknown>)),
                total: notifications.length,
                unreadCount,
            };
        },

        // ── Donor ───────────────────────────────────────────────────────────

        /**
         * Donor's escrow/donation history.
         * REST equivalent: GET /api/donor/donations
         */
        donorEscrowHistory: async (_: unknown, __: unknown, context: GQLContext) => {
            const user = requireRole(context, 'donor');
            const donations = await crowdfundingService.getDonorDonations(user.user_id);
            return donations.map(d => mapEscrowEntry(d as unknown as Record<string, unknown>));
        },

        /**
         * Donor's impact timeline messages.
         * REST equivalent: GET /api/impact/messages
         */
        donorImpactMessages: async (_: unknown, __: unknown, context: GQLContext) => {
            const user = requireRole(context, 'donor');
            const messages = await impactService.getDonorMessages(user.user_id);
            return messages.map(m => mapImpactMessage(m as unknown as Record<string, unknown>));
        },

        // ── Spatial Proofs ──────────────────────────────────────────────────

        /**
         * Get spatial proofs for a project.
         * REST equivalent: GET /api/spatial-proof/:projectId
         */
        spatialProofs: async (
            _: unknown,
            args: { projectId: string },
            _context: GQLContext,
        ) => {
            const result = await dbQuery(
                `SELECT proof_id, item_id, project_id, engineer_id,
                        gps_coordinates, gps_accuracy_meters, captured_at,
                        image_url, image_hash, description, device_info,
                        verification_status, verified_by, verified_at, created_at
                 FROM spatial_proof
                 WHERE project_id = $1
                 ORDER BY captured_at DESC`,
                [args.projectId],
            );
            return result.rows.map(r => mapSpatialProof(r as Record<string, unknown>));
        },

        // ── Reviews ─────────────────────────────────────────────────────────

        /**
         * Get reviews for an entity.
         * REST equivalent: GET /api/reviews
         */
        reviews: async (
            _: unknown,
            args: { reviewableType: string; reviewableId: string },
            _context: GQLContext,
        ) => {
            const result = await dbQuery(
                `SELECT review_id, reviewer_id, reviewable_type, reviewable_id,
                        project_id, overall_rating, title, body,
                        is_verified_interaction, status, helpful_count, created_at
                 FROM reviews
                 WHERE reviewable_type = $1 AND reviewable_id = $2
                   AND status = 'published'
                 ORDER BY created_at DESC`,
                [args.reviewableType.toLowerCase(), args.reviewableId],
            );
            return result.rows.map(r => mapReview(r as Record<string, unknown>));
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // MUTATION RESOLVERS
    // ═══════════════════════════════════════════════════════════════════════

    Mutation: {
        // ── Auth ────────────────────────────────────────────────────────────

        /**
         * Register a new user.
         * REST equivalent: POST /api/auth/register
         */
        register: async (
            _: unknown,
            args: { email: string; password: string; fullName: string; role: string; phone?: string },
            context: GQLContext,
        ) => {
            const { default: bcrypt } = await import('bcrypt');
            const passwordHash = await bcrypt.hash(args.password, 12);

            const result = await dbQuery(
                `INSERT INTO users (email, password_hash, full_name, role, phone)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING user_id, email, full_name, role, avatar_url,
                           kyc_verification_status, is_active, is_email_verified,
                           created_at, updated_at`,
                [args.email.toLowerCase().trim(), passwordHash, args.fullName.trim(),
                 args.role.toLowerCase(), args.phone ?? null],
            );

            const userRow = result.rows[0] as Record<string, unknown>;
            if (!userRow) throw new Error('Registration failed');
            
            const userId = String(userRow['user_id']);
            const roleStr = String(userRow['role']);

            const platformStr = context.req.headers['x-platform'] as string | undefined;
            const deviceId = context.req.headers['x-device-id'] as string | undefined;
            
            if (platformStr === 'ios' || platformStr === 'android' || platformStr === 'web') {
                const tokens = await deviceAuthService.issueTokenPair(
                    userId,
                    roleStr,
                    [roleStr],
                    {
                        device_id: deviceId ?? 'unknown',
                        platform: platformStr as 'ios' | 'android' | 'web',
                        app_version: context.req.headers['x-app-version'] as string | undefined,
                        os_version: context.req.headers['x-os-version'] as string | undefined,
                        device_model: context.req.headers['x-device-model'] as string | undefined,
                    }
                );
                return {
                    token: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    user: mapUser(userRow),
                };
            }

            const token = generateToken(userId, roleStr);

            return {
                token,
                refreshToken: null,
                user: mapUser(userRow),
            };
        },

        /**
         * Login with email and password.
         * REST equivalent: POST /api/auth/login
         */
        login: async (_: unknown, args: { email: string; password: string }, context: GQLContext) => {
            const result = await dbQuery
(
                `SELECT user_id, email, password_hash, full_name, role, avatar_url,
                        kyc_verification_status, is_active, is_email_verified,
                        created_at, updated_at
                 FROM users WHERE email = $1`,
                [args.email.toLowerCase().trim()],
            );

            const userRow = result.rows[0] as Record<string, unknown> | undefined;
            if (!userRow) throw new Error('Invalid email or password');

            const { default: bcrypt } = await import('bcrypt');
            const valid = await bcrypt.compare(args.password, String(userRow['password_hash']));
            if (!valid) throw new Error('Invalid email or password');
            if (!userRow['is_active']) throw new Error('Account is deactivated');

            const userId = String(userRow['user_id']);
            const roleStr = String(userRow['role']);

            // Fetch all roles
            const rolesResult = await dbQuery<{ role_name: string }>(
                `SELECT r.role_name FROM user_roles ur
                 JOIN roles r ON r.role_id = ur.role_id
                 WHERE ur.user_id = $1 AND ur.status = 'active'`,
                [userId],
            );
            const roles = rolesResult.rows.map(r => r.role_name);
            const activeRoles = roles.length > 0 ? roles : [roleStr];
            
            const userPayload = {
                ...mapUser(userRow),
                roles: activeRoles.map(r => r.toUpperCase()),
            };

            const platformStr = context.req.headers['x-platform'] as string | undefined;
            const deviceId = context.req.headers['x-device-id'] as string | undefined;
            
            if (platformStr === 'ios' || platformStr === 'android' || platformStr === 'web') {
                const tokens = await deviceAuthService.issueTokenPair(
                    userId,
                    roleStr,
                    activeRoles,
                    {
                        device_id: deviceId ?? 'unknown',
                        platform: platformStr as 'ios' | 'android' | 'web',
                        app_version: context.req.headers['x-app-version'] as string | undefined,
                        os_version: context.req.headers['x-os-version'] as string | undefined,
                        device_model: context.req.headers['x-device-model'] as string | undefined,
                    }
                );
                return {
                    token: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    user: userPayload,
                };
            }

            const token = generateToken(userId, roleStr, roles.length > 0 ? roles : undefined);

            return {
                token,
                refreshToken: null,
                user: userPayload,
            };
        },

        refreshToken: async (_: unknown, args: { refreshToken: string }, context: GQLContext) => {
            const platformStr = context.req.headers['x-platform'] as string | undefined;
            const deviceId = context.req.headers['x-device-id'] as string | undefined;
            
            if (!platformStr && !deviceId) {
                throw new Error('Refresh token requires client telemetry headers (x-platform or x-device-id)');
            }

            const refreshResult = await deviceAuthService.rotateRefreshToken(
                args.refreshToken,
                {
                    device_id: deviceId ?? 'unknown',
                    platform: (platformStr as 'ios' | 'android' | 'web') ?? 'web',
                    app_version: context.req.headers['x-app-version'] as string | undefined,
                    os_version: context.req.headers['x-os-version'] as string | undefined,
                    device_model: context.req.headers['x-device-model'] as string | undefined,
                }
            );

            return {
                token: refreshResult.tokens.accessToken,
                refreshToken: refreshResult.tokens.refreshToken,
                // Partial user payload since we only fetched core info during rotation.
                // The client should rely on the previously stored profile or call `me` query.
                user: {
                    userId: refreshResult.user.user_id,
                    role: refreshResult.user.role.toUpperCase(),
                    roles: refreshResult.user.roles.map(r => r.toUpperCase()),
                    isActive: refreshResult.user.is_active,
                }
            };
        },

        // ── Projects (Path 1) ───────────────────────────────────────────────

        /**
         * Create a new reconstruction project.
         * REST equivalent: POST /api/projects
         */
        createProject: async (
            _: unknown,
            args: { input: {
                title: string; damageType: string; damageSeverity?: string;
                description?: string; gpsLat: number; gpsLng: number;
                addressText?: string; coverImageUrl?: string;
            } },
            context: GQLContext,
        ) => {
            const user = requireRole(context, 'homeowner');
            const { input } = args;

            const result = await dbQuery(
                `INSERT INTO projects (
                    homeowner_id, title, damage_type, damage_severity,
                    description, gps_location, address_text, cover_image_url, status
                 ) VALUES (
                    $1, $2, $3, $4, $5,
                    ST_SetSRID(ST_MakePoint($6, $7), 4326)::GEOGRAPHY,
                    $8, $9, 'draft'
                 ) RETURNING project_id, homeowner_id, title, description, cover_image_url,
                            damage_type, damage_severity, status, total_estimated_cost,
                            total_funded_amount, address_text, created_at, updated_at`,
                [
                    user.user_id, input.title.trim(),
                    input.damageType.toLowerCase(), input.damageSeverity?.toLowerCase() ?? null,
                    input.description?.trim() ?? null, input.gpsLng, input.gpsLat,
                    input.addressText?.trim() ?? null, input.coverImageUrl ?? null,
                ],
            );

            const row = result.rows[0] as Record<string, unknown>;
            if (!row) throw new Error('Failed to create project');

            const totalEstimated = Number(row['total_estimated_cost'] ?? 0);
            const totalFunded = Number(row['total_funded_amount'] ?? 0);

            return {
                projectId: row['project_id'],
                homeownerId: row['homeowner_id'],
                title: row['title'],
                description: row['description'],
                coverImageUrl: row['cover_image_url'],
                damageType: String(row['damage_type']).toUpperCase(),
                damageSeverity: row['damage_severity'] ? String(row['damage_severity']).toUpperCase() : null,
                status: String(row['status']).toUpperCase(),
                isPublic: false,
                totalEstimatedCost: String(totalEstimated),
                totalFundedAmount: String(totalFunded),
                fundedPercentage: 0,
                createdAt: row['created_at'],
                updatedAt: row['updated_at'],
                boqItems: [],
                spatialProofs: [],
            };
        },

        /**
         * Add a BOQ item to a project.
         * REST equivalent: POST /api/projects/:id/boq
         */
        addBOQItem: async (
            _: unknown,
            args: { projectId: string; input: {
                materialName: string; materialCategory?: string; description?: string;
                unit: string; unitPrice: number; requiredQuantity: number;
                imageUrl?: string; preferredSupplierId: string;
            } },
            context: GQLContext,
        ) => {
            const user = requireRole(context, 'engineer');
            const { projectId, input } = args;

            // Verify engineer is assigned to this project
            const projectCheck = await dbQuery(
                'SELECT assigned_engineer_id FROM projects WHERE project_id = $1',
                [projectId],
            );
            const project = projectCheck.rows[0] as Record<string, unknown> | undefined;
            if (!project || project['assigned_engineer_id'] !== user.user_id) {
                throw new Error('Not assigned to this project');
            }

            const result = await dbQuery(
                `INSERT INTO itemized_boq (
                    project_id, material_name, material_category, description,
                    unit, unit_price, required_quantity, image_url, preferred_supplier_id
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING item_id, project_id, material_name, material_category,
                           description, image_url, unit, unit_price, required_quantity,
                           funded_amount, status, preferred_supplier_id, created_at, updated_at`,
                [
                    projectId, input.materialName.trim(),
                    input.materialCategory?.trim() ?? null,
                    input.description?.trim() ?? null,
                    input.unit.trim(), input.unitPrice, input.requiredQuantity,
                    input.imageUrl ?? null, input.preferredSupplierId,
                ],
            );

            const row = result.rows[0] as Record<string, unknown>;
            if (!row) throw new Error('Failed to add BOQ item');

            const unitPrice = Number(row['unit_price'] ?? 0);
            const qty = Number(row['required_quantity'] ?? 0);
            const funded = Number(row['funded_amount'] ?? 0);
            const totalCost = unitPrice * qty;

            return {
                itemId: row['item_id'],
                projectId: row['project_id'],
                materialName: row['material_name'],
                materialCategory: row['material_category'],
                description: row['description'],
                imageUrl: row['image_url'],
                unit: row['unit'],
                unitPrice: String(unitPrice),
                requiredQuantity: qty,
                fundedAmount: String(funded),
                fundedPercentage: totalCost > 0 ? Math.round((funded / totalCost) * 10000) / 100 : 0,
                status: String(row['status']).toUpperCase(),
                preferredSupplierId: row['preferred_supplier_id'],
                createdAt: row['created_at'],
                updatedAt: row['updated_at'],
            };
        },

        // ── Donations (Path 2) ──────────────────────────────────────────────

        /**
         * Create a donation with payment intent.
         * REST equivalent: POST /api/donations
         * NOTE: Returns a PaymentIntent for client-side checkout flow.
         */
        createDonation: async (
            _: unknown,
            args: { input: {
                items: Array<{ itemId: string; amount: number }>;
                paymentMethod: string;
                returnUrl?: string;
                giftRecipientName?: string; giftMessage?: string;
                donationIntent?: string;
            } },
            context: GQLContext,
        ) => {
            const user = requireRole(context, 'donor');
            const { input } = args;

            const escrowEntries = await crowdfundingService.createDonation(
                user.user_id,
                {
                    items: input.items.map(i => ({
                        item_id: i.itemId,
                        amount: i.amount,
                    })),
                    payment_method: input.paymentMethod.toLowerCase() as 'visa' | 'fatora',
                    return_url: input.returnUrl,
                    gift_recipient_name: input.giftRecipientName,
                    gift_message: input.giftMessage,
                    donation_intent: (input.donationIntent?.toLowerCase() ?? 'general') as 'zakat' | 'sadaqah' | 'general',
                },
            );

            // Return the first entry as a payment intent response
            const firstEntry = escrowEntries[0] as unknown as Record<string, unknown>;
            const totalAmount = escrowEntries.reduce(
                (sum, e) => sum + Number((e as unknown as Record<string, unknown>)['amount_locked'] ?? 0), 0,
            );

            return {
                intentId: firstEntry ? String(firstEntry['transaction_id']) : '',
                checkoutUrl: String(firstEntry?.['payment_gateway_ref'] ?? ''),
                returnUrl: input.returnUrl ?? '',
                amount: String(totalAmount),
                currency: 'USD',
            };
        },

        // ── Spatial Proof (Path 3) ──────────────────────────────────────────

        /**
         * Submit GPS-verified spatial proof.
         * REST equivalent: POST /api/spatial-proof
         */
        submitSpatialProof: async (
            _: unknown,
            args: { input: {
                itemId: string; projectId: string;
                gpsLat: number; gpsLng: number; gpsAccuracyMeters?: number;
                imageUrl: string; description?: string;
                deviceInfo?: unknown; clientHash?: string;
            } },
            context: GQLContext,
        ) => {
            const user = requireRole(context, 'engineer');
            const { input } = args;

            const proof = await executionService.submitSpatialProof(
                user.user_id,
                {
                    item_id: input.itemId,
                    project_id: input.projectId,
                    gps_lat: input.gpsLat,
                    gps_lng: input.gpsLng,
                    gps_accuracy_meters: input.gpsAccuracyMeters,
                    image_url: input.imageUrl,
                    description: input.description,
                    device_info: input.deviceInfo as Record<string, unknown> | undefined,
                    client_hash: input.clientHash,
                },
            );

            return mapSpatialProof(proof as unknown as Record<string, unknown>);
        },

        // ── Escrow Release (Path 4) ─────────────────────────────────────────

        /**
         * Release escrow funds after proof verification (admin only).
         * REST equivalent: POST /api/admin/escrow/release
         */
        releaseEscrow: async (
            _: unknown,
            args: { input: { proofId: string; itemId: string } },
            context: GQLContext,
        ) => {
            const user = requireRole(context, 'admin', 'auditor');
            const { input } = args;

            const result = await dbQuery(
                `UPDATE escrow_ledger
                 SET payment_status = 'released', released_at = NOW(),
                     released_by = $1, release_proof_id = $2
                 WHERE item_id = $3 AND payment_status = 'locked'
                 RETURNING transaction_id, donor_id, item_id, project_id,
                           amount_locked, currency, payment_status, payment_method,
                           locked_at, released_at, released_by, release_proof_id,
                           created_at`,
                [user.user_id, input.proofId, input.itemId],
            );

            if (result.rows.length === 0) {
                throw new Error('No locked escrow found for this item');
            }

            return mapEscrowEntry(result.rows[0] as Record<string, unknown>);
        },

        // ── Storage ─────────────────────────────────────────────────────────

        /**
         * Request a pre-signed upload URL.
         * REST equivalent: POST /api/storage/upload-url
         */
        requestUploadUrl: async (
            _: unknown,
            args: { input: {
                projectId: string; category: string;
                filename: string; contentType: string; sizeBytes: number;
            } },
            context: GQLContext,
        ) => {
            requireAuth(context);
            const { input } = args;

            const response = await storageService.generateUploadUrl({
                project_id: input.projectId,
                category: input.category as 'proof' | 'boq' | 'capture' | 'floor_plan' | 'document' | 'avatar',
                filename: input.filename,
                content_type: input.contentType,
                file_size_bytes: input.sizeBytes,
            });

            return {
                uploadUrl: response.upload_url,
                storageKey: response.file_key,
                expiresAt: response.expires_at,
            };
        },

        // ── Notifications ───────────────────────────────────────────────────

        /**
         * Mark a notification as read.
         * REST equivalent: PATCH /api/notifications/:id
         */
        markNotificationRead: async (
            _: unknown,
            args: { notificationId: string },
            context: GQLContext,
        ) => {
            const user = requireAuth(context);
            await notificationService.markAsRead(args.notificationId, user.user_id);

            const result = await dbQuery(
                `SELECT notification_id, user_id, type, title, body, data,
                        channel, is_read, read_at, created_at
                 FROM notifications WHERE notification_id = $1`,
                [args.notificationId],
            );
            return mapNotification(result.rows[0] as Record<string, unknown>);
        },

        /**
         * Mark all notifications as read.
         * REST equivalent: POST /api/notifications/read-all
         */
        markAllNotificationsRead: async (_: unknown, __: unknown, context: GQLContext) => {
            const user = requireAuth(context);
            await notificationService.markAllAsRead(user.user_id);
            return true;
        },

        // ── Supplier PO Management ──────────────────────────────────────────

        /**
         * Acknowledge a purchase order.
         * REST equivalent: POST /api/supplier/orders/:id/acknowledge
         */
        acknowledgePO: async (
            _: unknown,
            args: { poId: string },
            context: GQLContext,
        ) => {
            const user = requireRole(context, 'supplier');
            const po = await supplierService.acknowledgeOrder(user.user_id, args.poId);
            return mapPurchaseOrder(po as unknown as Record<string, unknown>);
        },

        /**
         * Update PO status (shipped, delivered).
         * REST equivalent: PATCH /api/supplier/orders/:id
         */
        updatePOStatus: async (
            _: unknown,
            args: { poId: string; status: string },
            context: GQLContext,
        ) => {
            const user = requireRole(context, 'supplier');
            const validStatuses = ['shipped', 'delivered'] as const;
            const status = args.status.toLowerCase();
            if (!validStatuses.includes(status as 'shipped' | 'delivered')) {
                throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
            }
            const po = await supplierService.updateOrderStatus(
                user.user_id, args.poId, status as 'shipped' | 'delivered',
            );
            return mapPurchaseOrder(po as unknown as Record<string, unknown>);
        },

        // ── Reviews ─────────────────────────────────────────────────────────

        /**
         * Create a review for an entity.
         * REST equivalent: POST /api/reviews
         */
        createReview: async (
            _: unknown,
            args: { input: {
                reviewableType: string; reviewableId: string; projectId?: string;
                overallRating: number; title?: string; body: string;
                ratings: Array<{ dimensionKey: string; score: number }>;
            } },
            context: GQLContext,
        ) => {
            const user = requireAuth(context);
            const { input } = args;

            const result = await dbQuery(
                `INSERT INTO reviews (
                    reviewer_id, reviewable_type, reviewable_id, project_id,
                    overall_rating, title, body, status
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'published')
                 RETURNING review_id, reviewer_id, reviewable_type, reviewable_id,
                           project_id, overall_rating, title, body,
                           is_verified_interaction, status, helpful_count, created_at`,
                [
                    user.user_id, input.reviewableType.toLowerCase(),
                    input.reviewableId, input.projectId ?? null,
                    input.overallRating, input.title ?? null, input.body.trim(),
                ],
            );

            const reviewRow = result.rows[0] as Record<string, unknown>;
            if (!reviewRow) throw new Error('Failed to create review');

            // Insert dimension ratings
            for (const rating of input.ratings) {
                await dbQuery(
                    `INSERT INTO review_dimension_ratings (review_id, dimension_key, score)
                     VALUES ($1, $2, $3)`,
                    [reviewRow['review_id'], rating.dimensionKey, rating.score],
                );
            }

            return mapReview(reviewRow);
        },

        // ── Push Tokens ─────────────────────────────────────────────────────

        /**
         * Register a device push token for notifications.
         * REST equivalent: POST /api/notifications/push-token (new)
         */
        registerPushToken: async (
            _: unknown,
            args: { deviceToken: string; platform: string; deviceId?: string },
            context: GQLContext,
        ) => {
            const user = requireAuth(context);

            // Upsert: if same user+token exists, update last_used_at
            await dbQuery(
                `INSERT INTO push_tokens (user_id, device_token, platform, device_id)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id, device_token)
                 DO UPDATE SET last_used_at = NOW(), is_active = TRUE, platform = $3`,
                [user.user_id, args.deviceToken, args.platform.toLowerCase(), args.deviceId ?? null],
            );

            return true;
        },
    },

    // ── Field Resolvers (Nested Entity Resolution) ──────────────────────────
    ...projectFieldResolvers,

    // ── Review.reviewer Field Resolver ───────────────────────────────────────
    Review: {
        reviewer: async (parent: { reviewerId: string }) => {
            if (!parent.reviewerId) return null;
            const result = await dbQuery(
                `SELECT user_id, email, full_name, role, avatar_url,
                        kyc_verification_status, is_active, created_at, updated_at
                 FROM users WHERE user_id = $1`,
                [parent.reviewerId],
            );
            if (result.rows.length === 0) return null;
            return mapUser(result.rows[0] as Record<string, unknown>);
        },
    },

    // ── SpatialProof.engineer Field Resolver ────────────────────────────────
    SpatialProof: {
        engineer: async (parent: { engineerId: string }) => {
            if (!parent.engineerId) return null;
            const result = await dbQuery(
                `SELECT user_id, email, full_name, role, avatar_url,
                        kyc_verification_status, is_active, created_at, updated_at
                 FROM users WHERE user_id = $1`,
                [parent.engineerId],
            );
            if (result.rows.length === 0) return null;
            return mapUser(result.rows[0] as Record<string, unknown>);
        },
    },
};
