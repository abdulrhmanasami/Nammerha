// ============================================================================
// Nammerha Backend — Subscription Service
// SaaS subscription management per profitability study §2.
// Handles plan lookup, user subscriptions, and feature access gating.
// All monetary values in cents (BIGINT convention).
// ============================================================================
import { query, financialTransaction } from '../config/database';
import { logger } from '../utils/logger';
import type { PoolClient } from 'pg';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SubscriptionPlan {
    plan_id: string;
    slug: string;
    display_name: string;
    description: string | null;
    price_cents: number;
    currency: string;
    billing_interval: string;
    features_summary: Record<string, unknown>;
    is_active: boolean;
    sort_order: number;
    created_at: Date;
}

export interface PlanFeature {
    feature_slug: string;
    enabled: boolean;
    limit_value: number;
    description: string | null;
}

export interface UserSubscription {
    subscription_id: string;
    user_id: string;
    plan_id: string;
    plan_slug: string;
    plan_name: string;
    status: string;
    current_period_start: Date;
    current_period_end: Date;
    cancel_at_period_end: boolean;
    cancelled_at: Date | null;
    created_at: Date;
}

export interface FeatureAccess {
    allowed: boolean;
    limit: number;    // -1 = unlimited, 0 = disabled, >0 = cap
    plan_slug: string;
    feature_slug: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FREE_PLAN_SLUG = 'free';

// ─── Plan Queries ───────────────────────────────────────────────────────────

/**
 * List all active subscription plans with their feature matrices.
 */
export async function getPlans(): Promise<(SubscriptionPlan & { features: PlanFeature[] })[]> {
    const plansResult = await query<SubscriptionPlan>(
        `SELECT plan_id, slug, display_name, description, price_cents, currency,
                billing_interval, features_summary, is_active, sort_order, created_at
         FROM subscription_plans
         WHERE is_active = TRUE
         ORDER BY sort_order ASC`,
    );

    const plans = plansResult.rows;

    // Fetch features for all plans in one query
    const planIds = plans.map(p => p.plan_id);
    if (planIds.length === 0) {
        return [];
    }

    const featuresResult = await query<PlanFeature & { plan_id: string }>(
        `SELECT plan_id, feature_slug, enabled, limit_value, description
         FROM plan_features
         WHERE plan_id = ANY($1)
         ORDER BY feature_slug`,
        [planIds],
    );

    // Group features by plan_id
    const featuresByPlan = new Map<string, PlanFeature[]>();
    for (const f of featuresResult.rows) {
        const list = featuresByPlan.get(f.plan_id) ?? [];
        list.push({
            feature_slug: f.feature_slug,
            enabled: f.enabled,
            limit_value: f.limit_value,
            description: f.description,
        });
        featuresByPlan.set(f.plan_id, list);
    }

    return plans.map(p => ({
        ...p,
        features: featuresByPlan.get(p.plan_id) ?? [],
    }));
}

/**
 * Get a single plan by slug.
 */
export async function getPlanBySlug(slug: string): Promise<SubscriptionPlan | null> {
    const result = await query<SubscriptionPlan>(
        `SELECT plan_id, slug, display_name, description, price_cents, currency,
                billing_interval, features_summary, is_active, sort_order, created_at
         FROM subscription_plans
         WHERE slug = $1 AND is_active = TRUE`,
        [slug],
    );
    return result.rows[0] ?? null;
}

// ─── User Subscription Queries ──────────────────────────────────────────────

/**
 * Get user's active subscription.
 * Returns null if user is on the implicit free tier (no subscription row).
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
    const result = await query<UserSubscription>(
        `SELECT us.subscription_id, us.user_id, us.plan_id,
                sp.slug AS plan_slug, sp.display_name AS plan_name,
                us.status, us.current_period_start, us.current_period_end,
                us.cancel_at_period_end, us.cancelled_at, us.created_at
         FROM user_subscriptions us
         JOIN subscription_plans sp ON sp.plan_id = us.plan_id
         WHERE us.user_id = $1 AND us.status IN ('active', 'trialing')
         LIMIT 1`,
        [userId],
    );
    return result.rows[0] ?? null;
}

/**
 * Resolve the user's effective plan slug.
 * No subscription row → free tier.
 */
export async function getUserPlanSlug(userId: string): Promise<string> {
    const sub = await getUserSubscription(userId);
    return sub?.plan_slug ?? FREE_PLAN_SLUG;
}

/**
 * Subscribe a user to a plan (or upgrade/downgrade).
 * Cancels any existing active subscription first.
 * Uses financialTransaction for atomicity — Domain Law §1.
 */
export async function subscribe(
    userId: string,
    planSlug: string,
): Promise<UserSubscription> {
    const plan = await getPlanBySlug(planSlug);
    if (!plan) {
        throw new Error(`Plan not found: ${planSlug}`);
    }

    return financialTransaction(async (client: PoolClient) => {
        // Cancel existing active subscription (if any)
        await client.query(
            `UPDATE user_subscriptions
             SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
             WHERE user_id = $1 AND status IN ('active', 'trialing')`,
            [userId],
        );

        // Create new subscription
        const billingDays = plan.billing_interval === 'yearly' ? 365 : 30;
        const result = await client.query<UserSubscription>(
            `INSERT INTO user_subscriptions
                (user_id, plan_id, status, current_period_start, current_period_end)
             VALUES ($1, $2, 'active', NOW(), NOW() + ($3 || ' days')::INTERVAL)
             RETURNING
                subscription_id, user_id, plan_id,
                $4::text AS plan_slug, $5::text AS plan_name,
                status, current_period_start, current_period_end,
                cancel_at_period_end, cancelled_at, created_at`,
            [userId, plan.plan_id, String(billingDays), plan.slug, plan.display_name],
        );

        if (!result.rows[0]) {
            throw new Error('Failed to create subscription');
        }

        logger.info('Subscription created', {
            userId,
            planSlug,
            planId: plan.plan_id,
            subscriptionId: result.rows[0].subscription_id,
        });

        // Audit trail (inside transaction — all or nothing)
        await client.query(
            `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
             VALUES ('subscription_created', 'user_subscriptions', $1, $2, $3)`,
            [
                result.rows[0].subscription_id,
                userId,
                JSON.stringify({ plan_slug: planSlug, price_cents: plan.price_cents }),
            ],
        );

        return result.rows[0];
    });
}

/**
 * Cancel a user's subscription.
 * Sets cancel_at_period_end = true; subscription remains active until period end.
 */
export async function cancelSubscription(userId: string): Promise<void> {
    const result = await query(
        `UPDATE user_subscriptions
         SET cancel_at_period_end = TRUE, cancelled_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND status IN ('active', 'trialing')
         RETURNING subscription_id`,
        [userId],
    );

    if (result.rows.length === 0) {
        throw new Error('No active subscription found');
    }

    logger.info('Subscription cancelled', { userId, subscriptionId: result.rows[0] });
}

// ─── Feature Access Gating ──────────────────────────────────────────────────

/**
 * Check if a user has access to a specific feature based on their subscription.
 * Users with no subscription row are on the implicit free tier.
 *
 * This is the core function used by the requireFeature() middleware.
 */
export async function checkFeatureAccess(
    userId: string,
    featureSlug: string,
): Promise<FeatureAccess> {
    // Resolve user's plan
    const planSlug = await getUserPlanSlug(userId);

    // Lookup feature access for this plan
    const result = await query<{ enabled: boolean; limit_value: number }>(
        `SELECT pf.enabled, pf.limit_value
         FROM plan_features pf
         JOIN subscription_plans sp ON sp.plan_id = pf.plan_id
         WHERE sp.slug = $1 AND pf.feature_slug = $2`,
        [planSlug, featureSlug],
    );

    const row = result.rows[0];
    if (!row) {
        // Feature not defined for this plan → denied
        return {
            allowed: false,
            limit: 0,
            plan_slug: planSlug,
            feature_slug: featureSlug,
        };
    }

    return {
        allowed: row.enabled,
        limit: row.limit_value,
        plan_slug: planSlug,
        feature_slug: featureSlug,
    };
}

/**
 * Pure function: Check if a numeric limit allows access.
 * -1 = unlimited (always allowed), 0 = disabled, >0 = check against usage.
 */
export function isWithinLimit(limitValue: number, currentUsage: number): boolean {
    if (limitValue === -1) {
        return true; // unlimited
    }
    if (limitValue <= 0) {
        return false; // disabled
    }
    return currentUsage < limitValue;
}

// ─── Admin Queries ──────────────────────────────────────────────────────────

/**
 * Admin: List all subscribers with their plan details.
 */
export async function listSubscribers(
    limit = 50,
    offset = 0,
): Promise<{ subscribers: UserSubscription[]; total: number }> {
    const clamped = Math.min(limit, 100);

    const [subsResult, countResult] = await Promise.all([
        query<UserSubscription>(
            `SELECT us.subscription_id, us.user_id, us.plan_id,
                    sp.slug AS plan_slug, sp.display_name AS plan_name,
                    us.status, us.current_period_start, us.current_period_end,
                    us.cancel_at_period_end, us.cancelled_at, us.created_at
             FROM user_subscriptions us
             JOIN subscription_plans sp ON sp.plan_id = us.plan_id
             ORDER BY us.created_at DESC
             LIMIT $1 OFFSET $2`,
            [clamped, offset],
        ),
        query<{ count: string }>(
            `SELECT COUNT(*) FROM user_subscriptions`,
        ),
    ]);

    return {
        subscribers: subsResult.rows,
        total: parseInt(countResult.rows[0]?.count ?? '0', 10),
    };
}

/**
 * Admin: Update plan pricing.
 */
export async function updatePlanPricing(
    planId: string,
    priceCents: number,
): Promise<SubscriptionPlan> {
    if (priceCents < 0) {
        throw new Error('Price must be >= 0');
    }

    const result = await query<SubscriptionPlan>(
        `UPDATE subscription_plans
         SET price_cents = $1, updated_at = NOW()
         WHERE plan_id = $2
         RETURNING plan_id, slug, display_name, description, price_cents, currency,
                   billing_interval, features_summary, is_active, sort_order, created_at`,
        [priceCents, planId],
    );

    if (!result.rows[0]) {
        throw new Error('Plan not found');
    }

    logger.info('Plan pricing updated', { planId, priceCents });
    return result.rows[0];
}
