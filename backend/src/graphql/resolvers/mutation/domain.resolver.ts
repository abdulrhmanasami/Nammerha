import { requireAuth, requireRole, type GQLContext } from '../../context/auth.context';
import { query as dbQuery, getClient } from '../../../config/database';
import * as crowdfundingService from '../../../services/crowdfunding.service';
import * as executionService from '../../../services/execution.service';
import * as escrowService from '../../../services/escrow.service';
import * as storageService from '../../../services/storage.service';
import * as notificationService from '../../../services/notification.service';
import * as supplierService from '../../../services/supplier.service';
import { logger } from '../../../utils/logger';
import {
    mapEscrowEntry, mapSpatialProof, mapNotification,
    mapPurchaseOrder, mapReview,
} from '../_shared/row-mappers';

export const projectMutationResolvers = {
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
};

export const donationMutationResolvers = {
    createDonation: async (
        _: unknown,
        args: { input: {
            items: Array<{ itemId: string; amount: number }>;
            paymentMethod: string; returnUrl?: string;
            giftRecipientName?: string; giftMessage?: string;
            donationIntent?: string;
        } },
        context: GQLContext,
    ) => {
        const user = requireRole(context, 'donor');
        const { input } = args;

        // H-1 FIX: Fail-fast on unsupported payment methods.
        // Only 'visa' and 'fatora' are implemented gateways.
        const VALID_METHODS = new Set(['visa', 'fatora']);
        const normalizedMethod = input.paymentMethod.toLowerCase();
        if (!VALID_METHODS.has(normalizedMethod)) {
            throw new Error(`Unsupported payment method: ${input.paymentMethod}. Accepted: VISA, FATORA.`);
        }

        // H-2 FIX: Idempotency enforcement — mirror REST layer's pg_advisory_xact_lock pattern.
        // Extract Idempotency-Key from HTTP headers via the GraphQL context.
        const idempotencyKey = context.req.headers['idempotency-key'] as string | undefined;
        if (!idempotencyKey) {
            throw new Error('Missing required Idempotency-Key header. Each donation request must include a unique idempotency key.');
        }

        // Acquire advisory lock to serialize concurrent requests with the same key
        const client = await getClient();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [idempotencyKey]);

            // Check for existing completed request (5-minute replay window)
            const existing = await client.query<{ new_values: string }>(
                `SELECT new_values FROM audit_trail
                 WHERE action = 'donation_created'
                   AND entity_type = 'idempotency'
                   AND entity_id = $1
                   AND created_at > NOW() - INTERVAL '5 minutes'
                 LIMIT 1`,
                [idempotencyKey],
            );

            if (existing.rows[0]) {
                await client.query('COMMIT');
                const cachedData = JSON.parse(existing.rows[0].new_values);
                return {
                    intentId: cachedData.escrow_entries?.[0]?.transaction_id ?? '',
                    checkoutUrl: cachedData.escrow_entries?.[0]?.payment_gateway_ref ?? '',
                    clientSecret: null,
                    returnUrl: input.returnUrl ?? '',
                    amount: String(cachedData.total_locked ?? 0),
                    currency: 'USD',
                };
            }

            // First request: process the donation
            const escrowEntries = await crowdfundingService.createDonation(
                user.user_id,
                {
                    items: input.items.map(i => ({ item_id: i.itemId, amount: i.amount })),
                    payment_method: normalizedMethod as 'visa' | 'fatora',
                    return_url: input.returnUrl,
                    gift_recipient_name: input.giftRecipientName,
                    gift_message: input.giftMessage,
                    donation_intent: (input.donationIntent?.toLowerCase() ?? 'general') as 'zakat' | 'sadaqah' | 'general',
                },
            );

            const firstEntry = escrowEntries[0] as unknown as Record<string, unknown>;
            const totalAmount = escrowEntries.reduce(
                (sum, e) => sum + Number((e as unknown as Record<string, unknown>)['amount_locked'] ?? 0), 0,
            );

            // Store idempotency record
            const responseData = {
                escrow_entries: escrowEntries,
                total_locked: totalAmount,
                items_funded: escrowEntries.length,
            };
            await client.query(
                `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
                 VALUES ('donation_created', 'idempotency', $1, $2, $3)`,
                [idempotencyKey, user.user_id, JSON.stringify(responseData)],
            );
            await client.query('COMMIT');

            const intentId = firstEntry ? String(firstEntry['transaction_id']) : '';
            const checkoutUrl = String(firstEntry?.['payment_gateway_ref'] ?? '');

            return {
                intentId,
                checkoutUrl,
                clientSecret: null,
                returnUrl: input.returnUrl ?? '',
                amount: String(totalAmount),
                currency: 'USD',
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },
};

export const spatialProofMutationResolvers = {
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
};

export const escrowMutationResolvers = {
    // M-5 FIX: Replaced hollow inline SQL with full escrowService.releaseEscrow().
    // The service layer includes Redis distributed locks, Serializable isolation,
    // escrow fee calculation, BOQ status update, and donor notifications.
    releaseEscrow: async (
        _: unknown,
        args: { input: { proofId: string; itemId: string } },
        context: GQLContext,
    ) => {
        const user = requireRole(context, 'admin', 'auditor');
        const { input } = args;

        const result = await escrowService.releaseEscrow(user.user_id, {
            proof_id: input.proofId,
            item_id: input.itemId,
        });

        logger.info('GraphQL releaseEscrow completed', {
            auditor_id: user.user_id,
            item_id: input.itemId,
            released_count: result.released_count,
            total_released: result.total_released,
            fee_charged: result.fee_charged,
        });

        // Return the first released escrow entry for the response
        const entries = await dbQuery(
            `SELECT transaction_id, donor_id, item_id, project_id,
                    amount_locked, currency, payment_status, payment_method,
                    payment_gateway_ref, locked_at, released_at, released_by,
                    release_proof_id, refunded_at, blockchain_tx_hash,
                    created_at, updated_at
             FROM escrow_ledger
             WHERE item_id = $1 AND release_proof_id = $2
             ORDER BY released_at DESC
             LIMIT 1`,
            [input.itemId, input.proofId],
        );

        if (entries.rows.length === 0) {
            throw new Error('Escrow release succeeded but no entries found (internal error)');
        }

        return mapEscrowEntry(entries.rows[0] as Record<string, unknown>);
    },
};

export const storageMutationResolvers = {
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
            publicUrl: response.public_url,
            storageKey: response.file_key,
            expiresAt: response.expires_at,
        };
    },
};

export const notificationMutationResolvers = {
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

    markAllNotificationsRead: async (_: unknown, __: unknown, context: GQLContext) => {
        const user = requireAuth(context);
        await notificationService.markAllAsRead(user.user_id);
        return true;
    },

    registerPushToken: async (
        _: unknown,
        args: { deviceToken: string; platform: string; deviceId?: string },
        context: GQLContext,
    ) => {
        const user = requireAuth(context);
        await dbQuery(
            `INSERT INTO push_tokens (user_id, device_token, platform, device_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, device_token)
             DO UPDATE SET last_used_at = NOW(), is_active = TRUE, platform = $3`,
            [user.user_id, args.deviceToken, args.platform.toLowerCase(), args.deviceId ?? null],
        );
        return true;
    },
};

export const supplierMutationResolvers = {
    acknowledgePO: async (
        _: unknown,
        args: { poId: string },
        context: GQLContext,
    ) => {
        const user = requireRole(context, 'supplier');
        const po = await supplierService.acknowledgeOrder(user.user_id, args.poId);
        return mapPurchaseOrder(po as unknown as Record<string, unknown>);
    },

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
};

export const reviewMutationResolvers = {
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

        for (const rating of input.ratings) {
            await dbQuery(
                `INSERT INTO review_dimension_ratings (review_id, dimension_key, score)
                 VALUES ($1, $2, $3)`,
                [reviewRow['review_id'], rating.dimensionKey, rating.score],
            );
        }

        return mapReview(reviewRow);
    },
};
