// ============================================================================
// Nammerha Backend — Review Routes
// Polymorphic multi-dimensional review system with trust scoring.
// ============================================================================
import { Router, Request, Response } from 'express';
import { query, financialTransaction } from '../config/database';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { safeRouteError } from '../utils/safe-error';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';
import {
  createReviewFullSchema,
  updateReviewSchema,
  createResponseSchema,
  flagReviewSchema,
  reviewHelpfulSchema,
} from '../validation/schemas';
import type { ReviewableType, ReviewStatus, ApiResponse } from '../types';

const router = Router();

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_REVIEWABLE_TYPES: ReadonlySet<string> = new Set([
  'contractor_profiles',
  'supplier_profiles',
  'engineer_profiles',
  'tradesperson_profiles',
  'homeowner_profiles',
  'project',
]);

// CRIT-001: Static whitelist of profile tables — NEVER construct table names from user input.
// This is the ONLY source of truth for safe profile table access.
const PROFILE_TABLE_WHITELIST: ReadonlySet<string> = new Set([
  'contractor_profiles',
  'supplier_profiles',
  'engineer_profiles',
  'tradesperson_profiles',
  'homeowner_profiles',
]);

const VALID_SORT_OPTIONS: ReadonlySet<string> = new Set(['recent', 'helpful', 'highest', 'lowest']);

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_EDITS = 2;
const PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

// ─── Helpers ────────────────────────────────────────────────────────────────

function isValidReviewableType(t: string): t is ReviewableType {
  return VALID_REVIEWABLE_TYPES.has(t);
}

function sanitizePageSize(raw: unknown): number {
  const n = Number(raw) || PAGE_SIZE;
  return Math.min(Math.max(n, 1), MAX_PAGE_SIZE);
}

function sanitizePage(raw: unknown): number {
  const n = Number(raw) || 1;
  return Math.max(n, 1);
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ENDPOINTS (placed before parametric routes to avoid shadowing)
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/reviews/my-reviews — User's submitted reviews ─────────────────
// CAT-02 FIX: Moved BEFORE /:type/:id to prevent Express route shadowing.
// Previously at line ~841, 'my-reviews' was matched as :type param value.

router.get('/my-reviews', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.authUser) {
      res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
      return;
    }

    const page = sanitizePage(req.query.page);
    const limit = sanitizePageSize(req.query.limit);
    const offset = (page - 1) * limit;

    const result = await query<{
      review_id: string;
      reviewable_type: string;
      reviewable_id: string;
      project_id: string | null;
      overall_rating: number;
      title: string | null;
      body: string;
      status: ReviewStatus;
      is_verified_interaction: boolean;
      helpful_count: number;
      edit_count: number;
      created_at: Date;
      edited_at: Date | null;
    }>(
      `SELECT review_id, reviewable_type, reviewable_id, project_id,
                    overall_rating, title, body, status, is_verified_interaction,
                    helpful_count, edit_count, created_at, edited_at
             FROM reviews WHERE reviewer_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
      [req.authUser.user_id, limit, offset],
    );

    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM reviews WHERE reviewer_id = $1`,
      [req.authUser.user_id],
    );

    res.json({
      success: true,
      data: {
        reviews: result.rows,
        pagination: {
          page,
          limit,
          total: parseInt(countResult.rows[0]?.total ?? '0', 10),
        },
      },
    } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'Review.MyReviews');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (no auth required)
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/reviews/:type/:id — Paginated reviews for an entity ───────────

router.get('/:type/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.params.type as string;
    const id = req.params.id as string;

    if (!type || !id || !isValidReviewableType(type)) {
      res.status(400).json({
        success: false,
        error: `Invalid reviewable type. Allowed: ${[...VALID_REVIEWABLE_TYPES].join(', ')}`,
      } as ApiResponse);
      return;
    }

    const sortParam = typeof req.query.sort === 'string' ? req.query.sort : 'recent';
    const sort = VALID_SORT_OPTIONS.has(sortParam) ? sortParam : 'recent';
    const page = sanitizePage(req.query.page);
    const limit = sanitizePageSize(req.query.limit);
    const offset = (page - 1) * limit;

    const orderClause =
      sort === 'helpful'
        ? 'r.helpful_count DESC, r.created_at DESC'
        : sort === 'highest'
          ? 'r.overall_rating DESC, r.created_at DESC'
          : sort === 'lowest'
            ? 'r.overall_rating ASC, r.created_at DESC'
            : 'r.created_at DESC';

    // Fetch reviews with reviewer info
    const reviewsResult = await query<{
      review_id: string;
      reviewer_id: string;
      reviewable_type: string;
      reviewable_id: string;
      project_id: string | null;
      overall_rating: number;
      title: string | null;
      body: string;
      is_verified_interaction: boolean;
      status: ReviewStatus;
      edit_count: number;
      edited_at: Date | null;
      helpful_count: number;
      created_at: Date;
      reviewer_name: string;
      reviewer_avatar_url: string | null;
    }>(
      `SELECT r.review_id, r.reviewer_id, r.reviewable_type, r.reviewable_id,
                    r.project_id, r.overall_rating, r.title, r.body,
                    r.is_verified_interaction, r.status, r.edit_count, r.edited_at,
                    r.helpful_count, r.created_at,
                    u.full_name AS reviewer_name, u.avatar_url AS reviewer_avatar_url
             FROM reviews r
             JOIN users u ON u.user_id = r.reviewer_id
             WHERE r.reviewable_type = $1
               AND r.reviewable_id = $2
               AND r.status = 'published'
             ORDER BY ${orderClause}
             LIMIT $3 OFFSET $4`,
      [type, id, limit, offset],
    );

    // Count total
    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM reviews
             WHERE reviewable_type = $1 AND reviewable_id = $2 AND status = 'published'`,
      [type, id],
    );

    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // Fetch dimension ratings for all reviews in batch
    const reviewIds = reviewsResult.rows.map((r) => r.review_id);
    const ratingsMap: Record<
      string,
      Array<{ dimension_key: string; label_en: string; label_ar: string; score: number }>
    > = {};

    if (reviewIds.length > 0) {
      const ratingsResult = await query<{
        review_id: string;
        dimension_key: string;
        label_en: string;
        label_ar: string;
        score: number;
      }>(
        `SELECT rr.review_id, rd.dimension_key, rd.label_en, rd.label_ar, rr.score
                 FROM review_ratings rr
                 JOIN review_dimensions rd ON rd.dimension_id = rr.dimension_id
                 WHERE rr.review_id = ANY($1)
                 ORDER BY rd.sort_order`,
        [reviewIds],
      );

      for (const row of ratingsResult.rows) {
        const list = ratingsMap[row.review_id];
        if (!list) {
          ratingsMap[row.review_id] = [];
        }
        (ratingsMap[row.review_id] ?? []).push({
          dimension_key: row.dimension_key,
          label_en: row.label_en,
          label_ar: row.label_ar,
          score: row.score,
        });
      }
    }

    // Fetch responses in batch
    const responsesMap: Record<
      string,
      { response_id: string; body: string; created_at: Date; responder_name: string }
    > = {};

    if (reviewIds.length > 0) {
      const responsesResult = await query<{
        review_id: string;
        response_id: string;
        body: string;
        created_at: Date;
        responder_name: string;
      }>(
        `SELECT rr.review_id, rr.response_id, rr.body, rr.created_at,
                        u.full_name AS responder_name
                 FROM review_responses rr
                 JOIN users u ON u.user_id = rr.responder_id
                 WHERE rr.review_id = ANY($1)`,
        [reviewIds],
      );

      for (const row of responsesResult.rows) {
        responsesMap[row.review_id] = {
          response_id: row.response_id,
          body: row.body,
          created_at: row.created_at,
          responder_name: row.responder_name,
        };
      }
    }

    // Compose response
    const reviews = reviewsResult.rows.map((r) => ({
      ...r,
      ratings: ratingsMap[r.review_id] ?? [],
      response: responsesMap[r.review_id] ?? null,
    }));

    res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'Review.List');
  }
});

// ─── GET /api/reviews/aggregates/:type/:id — Trust score + breakdown ────────

router.get('/aggregates/:type/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.params.type as string;
    const id = req.params.id as string;

    if (!type || !id || !isValidReviewableType(type)) {
      res.status(400).json({ success: false, error: 'Invalid reviewable type' } as ApiResponse);
      return;
    }

    const aggResult = await query<{
      total_reviews: number;
      average_rating: string;
      verified_reviews: number;
      dimension_averages: Record<string, number>;
      rating_distribution: Record<string, number>;
      trust_score: string;
      last_review_at: Date | null;
    }>(
      `SELECT total_reviews, average_rating, verified_reviews,
                    dimension_averages, rating_distribution, trust_score, last_review_at
             FROM review_aggregates
             WHERE reviewable_type = $1 AND reviewable_id = $2`,
      [type, id],
    );

    const agg = aggResult.rows[0];
    if (!agg) {
      // No reviews yet — return zeros
      res.json({
        success: true,
        data: {
          total_reviews: 0,
          average_rating: 0,
          verified_reviews: 0,
          dimension_averages: {},
          rating_distribution: {},
          trust_score: 0,
          last_review_at: null,
          dimensions: [],
        },
      } as ApiResponse);
      return;
    }

    // Enrich with dimension metadata
    const dimsResult = await query<{
      dimension_key: string;
      label_en: string;
      label_ar: string;
      weight: string;
    }>(
      `SELECT dimension_key, label_en, label_ar, weight
             FROM review_dimensions WHERE reviewable_type = $1
             ORDER BY sort_order`,
      [type],
    );

    const dimensions = dimsResult.rows.map((d) => ({
      dimension_key: d.dimension_key,
      label_en: d.label_en,
      label_ar: d.label_ar,
      average: (agg.dimension_averages as Record<string, number>)[d.dimension_key] ?? 0,
      weight: (function () {
        const p = parseFloat(d.weight);
        return Number.isNaN(p) ? 0 : p;
      })(),
    }));

    res.json({
      success: true,
      data: {
        total_reviews: agg.total_reviews,
        average_rating: (function () {
          const p = parseFloat(String(agg.average_rating));
          return Number.isNaN(p) ? 0 : p;
        })(),
        verified_reviews: agg.verified_reviews,
        dimension_averages: agg.dimension_averages,
        rating_distribution: agg.rating_distribution,
        trust_score: (function () {
          const p = parseFloat(String(agg.trust_score));
          return Number.isNaN(p) ? 0 : p;
        })(),
        last_review_at: agg.last_review_at,
        dimensions,
      },
    } as ApiResponse);
  } catch (error) {
    safeRouteError(res, error, 'Review.Aggregates');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

// ─── POST /api/reviews — Submit a review ────────────────────────────────────

router.post(
  '/',
  authMiddleware,
  requireActive,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.authUser) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const dto = createReviewFullSchema.parse(req.body);

      // ── Prevent self-review
      if (dto.reviewable_type !== 'project') {
        // CRIT-001: Validate table name against whitelist before any SQL usage
        if (!PROFILE_TABLE_WHITELIST.has(dto.reviewable_type)) {
          res
            .status(400)
            .json({ success: false, error: 'Invalid profile type for review' } as ApiResponse);
          return;
        }
        // Self-review check: reviewable_id = profile user_id (PK of profile tables)
        if (dto.reviewable_id === req.authUser.user_id) {
          res.status(403).json({ success: false, error: 'Cannot review yourself' } as ApiResponse);
          return;
        }
      }

      // ── Check for verified interaction
      let isVerified = false;
      let verificationContext: Record<string, unknown> | null = null;

      if (dto.project_id && dto.reviewable_type !== 'project') {
        // Check if the reviewer has a real interaction with the target via a project
        // e.g., user funded the project, homeowner's project was worked on by contractor
        const interactionCheck = await query<{ found: boolean }>(
          `SELECT EXISTS(
                    SELECT 1 FROM escrow_ledger
                    WHERE project_id = $1 AND user_id = $2 AND payment_status IN ('released', 'locked')
                    UNION ALL
                    SELECT 1 FROM projects
                    WHERE project_id = $1 AND (homeowner_id = $2 OR assigned_engineer_id = $2 OR assigned_contractor_id = $2)
                ) AS found`,
          [dto.project_id, req.authUser.user_id],
        );
        if (interactionCheck.rows[0]?.found) {
          isVerified = true;
          verificationContext = {
            project_id: dto.project_id,
            verified_at: new Date().toISOString(),
          };
        }
      } else if (dto.reviewable_type === 'project' && dto.reviewable_id) {
        // User reviewing a project — check they funded it
        const fundCheck = await query<{ found: boolean }>(
          `SELECT EXISTS(
                    SELECT 1 FROM escrow_ledger
                    WHERE project_id = $1 AND user_id = $2 AND payment_status IN ('released', 'locked')
                ) AS found`,
          [dto.reviewable_id, req.authUser.user_id],
        );
        if (fundCheck.rows[0]?.found) {
          isVerified = true;
          verificationContext = {
            project_id: dto.reviewable_id,
            verified_at: new Date().toISOString(),
          };
        }
      }

      // ── Transaction: insert review + dimension ratings
      const result = await financialTransaction(async (client) => {
        // Insert review
        const reviewResult = await client.query<{ review_id: string }>(
          `INSERT INTO reviews (
                    reviewer_id, reviewable_type, reviewable_id, project_id,
                    overall_rating, title, body,
                    is_verified_interaction, verification_context
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING review_id`,
          [
            req.authUser?.user_id ?? '',
            dto.reviewable_type,
            dto.reviewable_id,
            dto.project_id ?? null,
            dto.overall_rating,
            dto.title ?? null,
            dto.body,
            isVerified,
            verificationContext ? JSON.stringify(verificationContext) : null,
          ],
        );

        const reviewRow = reviewResult.rows[0];
        if (!reviewRow) {
          throw new Error('Failed to insert review');
        }
        const reviewId = reviewRow.review_id;

        // Insert dimension ratings
        if (dto.ratings && dto.ratings.length > 0) {
          for (const rating of dto.ratings) {
            if (rating.score < 1 || rating.score > 5 || !Number.isInteger(rating.score)) {
              continue; // skip invalid dimension scores
            }

            await client.query(
              `INSERT INTO review_ratings (review_id, dimension_id, score)
                         SELECT $1, rd.dimension_id, $2
                         FROM review_dimensions rd
                         WHERE rd.reviewable_type = $3 AND rd.dimension_key = $4
                         ON CONFLICT (review_id, dimension_id) DO UPDATE SET score = $2`,
              [reviewId, rating.score, dto.reviewable_type, rating.dimension_key],
            );
          }
        }

        return reviewId;
      });

      logger.info('Review submitted', {
        review_id: result,
        reviewer_id: req.authUser.user_id,
        reviewable_type: dto.reviewable_type,
        reviewable_id: dto.reviewable_id,
        is_verified: isVerified,
      });

      res.status(201).json({
        success: true,
        data: { review_id: result },
        message: 'Review submitted successfully',
      } as ApiResponse);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.issues,
        } as ApiResponse);
        return;
      }
      // Unique constraint violation = duplicate review
      if (error instanceof Error && error.message.includes('unique constraint')) {
        res.status(409).json({
          success: false,
          error: 'You have already reviewed this entity',
        } as ApiResponse);
        return;
      }
      safeRouteError(res, error, 'Review.Create');
    }
  },
);

// ─── PUT /api/reviews/:reviewId — Edit review (48h window, max 2 edits) ────

router.put(
  '/:reviewId',
  authMiddleware,
  requireActive,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.authUser) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { reviewId } = req.params;
      const dto = updateReviewSchema.parse(req.body);

      // Fetch existing review
      const existing = await query<{
        review_id: string;
        reviewer_id: string;
        edit_count: number;
        created_at: Date;
        status: ReviewStatus;
      }>(
        `SELECT review_id, reviewer_id, edit_count, created_at, status
             FROM reviews WHERE review_id = $1`,
        [reviewId],
      );

      const review = existing.rows[0];
      if (!review) {
        res.status(404).json({ success: false, error: 'Review not found' } as ApiResponse);
        return;
      }

      // Ownership check
      if (review.reviewer_id !== req.authUser.user_id) {
        res
          .status(403)
          .json({ success: false, error: 'You can only edit your own reviews' } as ApiResponse);
        return;
      }

      // Edit window check (48h)
      const elapsed = Date.now() - new Date(review.created_at).getTime();
      if (elapsed > EDIT_WINDOW_MS) {
        res
          .status(403)
          .json({ success: false, error: 'Edit window has expired (48 hours)' } as ApiResponse);
        return;
      }

      // Edit count limit
      if (review.edit_count >= MAX_EDITS) {
        res
          .status(403)
          .json({ success: false, error: `Maximum ${MAX_EDITS} edits allowed` } as ApiResponse);
        return;
      }

      // Field-level validation handled by Zod schema (updateReviewSchema)

      await financialTransaction(async (client) => {
        // Update review fields
        await client.query(
          `UPDATE reviews SET
                    overall_rating = COALESCE($1, overall_rating),
                    title = COALESCE($2, title),
                    body = COALESCE($3, body),
                    edit_count = edit_count + 1,
                    edited_at = NOW()
                 WHERE review_id = $4`,
          [dto.overall_rating ?? null, dto.title ?? null, dto.body ?? null, reviewId],
        );

        // Update dimension ratings if provided
        if (dto.ratings && dto.ratings.length > 0) {
          // Fetch reviewable_type for dimension lookup
          const typeResult = await client.query<{ reviewable_type: string }>(
            `SELECT reviewable_type FROM reviews WHERE review_id = $1`,
            [reviewId],
          );
          const reviewableType = typeResult.rows[0]?.reviewable_type;

          for (const rating of dto.ratings) {
            if (rating.score < 1 || rating.score > 5 || !Number.isInteger(rating.score)) {
              continue;
            }

            await client.query(
              `INSERT INTO review_ratings (review_id, dimension_id, score)
                         SELECT $1, rd.dimension_id, $2
                         FROM review_dimensions rd
                         WHERE rd.reviewable_type = $3 AND rd.dimension_key = $4
                         ON CONFLICT (review_id, dimension_id) DO UPDATE SET score = $2`,
              [reviewId, rating.score, reviewableType, rating.dimension_key],
            );
          }
        }
      });

      logger.info('Review edited', { review_id: reviewId, editor: req.authUser.user_id });

      res.json({
        success: true,
        message: 'Review updated successfully',
      } as ApiResponse);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.issues,
        } as ApiResponse);
        return;
      }
      safeRouteError(res, error, 'Review.Update');
    }
  },
);

// ─── DELETE /api/reviews/:reviewId — Soft-delete own review ─────────────────

router.delete(
  '/:reviewId',
  authMiddleware,
  requireActive,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.authUser) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { reviewId } = req.params;

      const result = await query(
        `UPDATE reviews SET status = 'removed'
             WHERE review_id = $1 AND reviewer_id = $2 AND status != 'removed'
             RETURNING review_id`,
        [reviewId, req.authUser.user_id],
      );

      if (result.rowCount === 0) {
        res
          .status(404)
          .json({ success: false, error: 'Review not found or already removed' } as ApiResponse);
        return;
      }

      logger.info('Review soft-deleted', { review_id: reviewId, user_id: req.authUser.user_id });

      res.json({ success: true, message: 'Review removed' } as ApiResponse);
    } catch (error) {
      safeRouteError(res, error, 'Review.Delete');
    }
  },
);

// ─── POST /api/reviews/:reviewId/response — Professional response ──────────

router.post(
  '/:reviewId/response',
  authMiddleware,
  requireActive,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.authUser) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { reviewId } = req.params;
      const dto = createResponseSchema.parse(req.body);

      // Verify the user is the reviewed party
      const reviewResult = await query<{
        reviewable_type: string;
        reviewable_id: string;
      }>(
        `SELECT reviewable_type, reviewable_id FROM reviews
             WHERE review_id = $1 AND status = 'published'`,
        [reviewId],
      );

      const review = reviewResult.rows[0];
      if (!review) {
        res.status(404).json({ success: false, error: 'Review not found' } as ApiResponse);
        return;
      }

      // Check that responder owns the reviewed entity
      let isOwner = false;
      if (review.reviewable_type === 'project') {
        const projCheck = await query<{ homeowner_id: string }>(
          `SELECT homeowner_id FROM projects WHERE project_id = $1`,
          [review.reviewable_id],
        );
        isOwner = projCheck.rows[0]?.homeowner_id === req.authUser.user_id;
      } else {
        // Profile review — the reviewable_id IS the user_id (PK of profile tables)
        // CRIT-001: No dynamic SQL needed — compare UUIDs directly
        isOwner = review.reviewable_id === req.authUser.user_id;
      }

      if (!isOwner) {
        res
          .status(403)
          .json({ success: false, error: 'Only the reviewed party can respond' } as ApiResponse);
        return;
      }

      const result = await query<{ response_id: string }>(
        `INSERT INTO review_responses (review_id, responder_id, body)
             VALUES ($1, $2, $3) RETURNING response_id`,
        [reviewId, req.authUser.user_id, dto.body],
      );

      logger.info('Review response added', {
        review_id: reviewId,
        responder: req.authUser.user_id,
      });

      res.status(201).json({
        success: true,
        data: { response_id: result.rows[0]?.response_id ?? '' },
        message: 'Response published',
      } as ApiResponse);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.issues,
        } as ApiResponse);
        return;
      }
      if (error instanceof Error && error.message.includes('unique constraint')) {
        res.status(409).json({
          success: false,
          error: 'Response already exists for this review',
        } as ApiResponse);
        return;
      }
      safeRouteError(res, error, 'Review.Response');
    }
  },
);

// ─── POST /api/reviews/:reviewId/flag — Report a review ─────────────────────

router.post(
  '/:reviewId/flag',
  authMiddleware,
  requireActive,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.authUser) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { reviewId } = req.params;
      const dto = flagReviewSchema.parse(req.body);

      // Verify review exists
      const reviewCheck = await query<{ review_id: string }>(
        `SELECT review_id FROM reviews WHERE review_id = $1`,
        [reviewId],
      );
      if (!reviewCheck.rows[0]) {
        res.status(404).json({ success: false, error: 'Review not found' } as ApiResponse);
        return;
      }

      await query(
        `INSERT INTO review_flags (review_id, reporter_id, reason, description)
             VALUES ($1, $2, $3, $4)`,
        [reviewId, req.authUser.user_id, dto.reason, dto.description?.slice(0, 1000) ?? null],
      );

      // Auto-flag review if 3+ distinct reports
      const flagCount = await query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM review_flags WHERE review_id = $1 AND status = 'pending'`,
        [reviewId],
      );
      if (parseInt(flagCount.rows[0]?.cnt ?? '0', 10) >= 3) {
        await query(
          `UPDATE reviews SET status = 'flagged' WHERE review_id = $1 AND status = 'published'`,
          [reviewId],
        );
      }

      logger.info('Review flagged', {
        review_id: reviewId,
        reporter: req.authUser.user_id,
        reason: dto.reason,
      });

      res.status(201).json({ success: true, message: 'Report submitted' } as ApiResponse);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.issues,
        } as ApiResponse);
        return;
      }
      if (error instanceof Error && error.message.includes('unique constraint')) {
        res
          .status(409)
          .json({ success: false, error: 'You have already reported this review' } as ApiResponse);
        return;
      }
      safeRouteError(res, error, 'Review.Flag');
    }
  },
);

// ─── POST /api/reviews/:reviewId/helpful — Vote helpful/not helpful ─────────

router.post(
  '/:reviewId/helpful',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.authUser) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { reviewId } = req.params;
      const { is_helpful } = reviewHelpfulSchema.parse(req.body);

      await financialTransaction(async (client) => {
        // Upsert vote
        await client.query(
          `INSERT INTO review_helpful (review_id, voter_id, is_helpful)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (review_id, voter_id) DO UPDATE SET is_helpful = $3`,
          [reviewId, req.authUser?.user_id ?? '', is_helpful],
        );

        // Recalculate helpful_count
        await client.query(
          `UPDATE reviews SET helpful_count = (
                    SELECT COUNT(*) FROM review_helpful
                    WHERE review_id = $1 AND is_helpful = TRUE
                 ) WHERE review_id = $1`,
          [reviewId],
        );
      });

      res.json({ success: true, message: 'Vote recorded' } as ApiResponse);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.issues,
        } as ApiResponse);
        return;
      }
      safeRouteError(res, error, 'Review.Helpful');
    }
  },
);

export default router;
