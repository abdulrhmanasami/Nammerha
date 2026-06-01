import { requireAuth, type GQLContext } from '../../context/auth.context';
import { query as dbQuery } from '../../../config/database';
import * as notificationService from '../../../services/notification.service';
import * as escrowService from '../../../services/escrow.service';
import * as impactService from '../../../services/impact.service';
import {
  mapNotification,
  mapEscrowEntry,
  mapSpatialProof,
  mapImpactMessage,
  mapReview,
} from '../_shared/row-mappers';

export const miscQueryResolvers = {
  notifications: async (
    _: unknown,
    args: { page?: number; pageSize?: number },
    context: GQLContext,
  ) => {
    const user = requireAuth(context);
    const limit = Math.min(50, Math.max(1, args.pageSize ?? 20));
    const notifications = await notificationService.getUserNotifications(user.user_id, { limit });
    const unreadCount = await notificationService.getUnreadCount(user.user_id);
    return {
      items: notifications.map((n) => mapNotification(n as unknown as Record<string, unknown>)),
      total: notifications.length,
      unreadCount,
    };
  },

  userEscrowHistory: async (_: unknown, __: unknown, context: GQLContext) => {
    // UNIFIED CITIZEN: Any authenticated user can view escrow history.
    const user = requireAuth(context);
    const payments = await escrowService.getUserPayments(user.user_id);
    return payments.map((d) => mapEscrowEntry(d as unknown as Record<string, unknown>));
  },

  userPayments: async (
    _: unknown,
    args: { limit?: number; offset?: number },
    context: GQLContext,
  ) => {
    // UNIFIED CITIZEN: Any authenticated user can view payments.
    const user = requireAuth(context);
    const limit = Math.min(50, Math.max(1, args.limit ?? 20));
    const offset = Math.max(0, args.offset ?? 0);
    const payments = await escrowService.getUserPayments(user.user_id, limit, offset);
    return payments.map((d) => mapEscrowEntry(d as unknown as Record<string, unknown>));
  },

  userImpactMessages: async (_: unknown, __: unknown, context: GQLContext) => {
    // UNIFIED CITIZEN: Any authenticated user can view impact messages.
    const user = requireAuth(context);
    const messages = await impactService.getUserMessages(user.user_id);
    return messages.map((m) => mapImpactMessage(m as unknown as Record<string, unknown>));
  },

  spatialProofs: async (_: unknown, args: { projectId: string }, _context: GQLContext) => {
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
    return result.rows.map((r) => mapSpatialProof(r as Record<string, unknown>));
  },

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
    return result.rows.map((r) => mapReview(r as Record<string, unknown>));
  },
};
