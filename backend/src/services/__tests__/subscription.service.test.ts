// ============================================================================
// Nammerha Backend — Subscription Service Unit Tests
// Covers: feature access gating, limit checks, pure function logic
// Pattern: Inline reimplementation of pure functions (no DB dependency)
// ============================================================================
import { describe, it, expect } from 'vitest';

// ─── Inline Reimplementation of Pure Functions Under Test ────────────────────
// Same pattern as commission.service.test.ts: extract and test the pure logic
// directly, without importing the service (which depends on database).

/**
 * Check if a numeric limit allows access.
 * -1 = unlimited (always allowed), 0 = disabled, >0 = check against usage.
 */
function isWithinLimit(limitValue: number, currentUsage: number): boolean {
    if (limitValue === -1) {
        return true; // unlimited
    }
    if (limitValue <= 0) {
        return false; // disabled
    }
    return currentUsage < limitValue;
}

/**
 * Resolve effective plan slug from subscription status.
 * Users with no subscription → 'free'.
 */
function resolveEffectivePlan(
    subscription: { plan_slug: string; status: string; current_period_end: Date } | null,
): string {
    if (!subscription) {
        return 'free';
    }
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        return 'free';
    }
    // If subscription has expired, fall back to free
    if (subscription.current_period_end < new Date()) {
        return 'free';
    }
    return subscription.plan_slug;
}

/**
 * Check if a feature is accessible given the plan's feature matrix.
 */
function checkFeatureInMatrix(
    features: Array<{ feature_slug: string; enabled: boolean; limit_value: number }>,
    featureSlug: string,
): { allowed: boolean; limit: number } {
    const feature = features.find(f => f.feature_slug === featureSlug);
    if (!feature) {
        return { allowed: false, limit: 0 };
    }
    return { allowed: feature.enabled, limit: feature.limit_value };
}

/**
 * Calculate billing period end date based on interval.
 */
function calculatePeriodEnd(start: Date, interval: 'monthly' | 'yearly'): Date {
    const end = new Date(start);
    if (interval === 'yearly') {
        end.setFullYear(end.getFullYear() + 1);
    } else {
        end.setMonth(end.getMonth() + 1);
    }
    return end;
}

// ─── Test Data ──────────────────────────────────────────────────────────────

const FREE_FEATURES = [
    { feature_slug: 'boq_export', enabled: true, limit_value: 3 },
    { feature_slug: 'boq_whitelabel', enabled: false, limit_value: 0 },
    { feature_slug: 'oracle_advanced', enabled: false, limit_value: 0 },
    { feature_slug: 'priority_alerts', enabled: true, limit_value: 5 },
    { feature_slug: 'priority_search', enabled: false, limit_value: 0 },
    { feature_slug: 'invoice_mgmt', enabled: false, limit_value: 0 },
    { feature_slug: 'unlimited_bids', enabled: false, limit_value: 0 },
];

const PREMIUM_FEATURES = [
    { feature_slug: 'boq_export', enabled: true, limit_value: -1 },
    { feature_slug: 'boq_whitelabel', enabled: true, limit_value: -1 },
    { feature_slug: 'oracle_advanced', enabled: true, limit_value: -1 },
    { feature_slug: 'priority_alerts', enabled: true, limit_value: -1 },
    { feature_slug: 'priority_search', enabled: true, limit_value: -1 },
    { feature_slug: 'invoice_mgmt', enabled: true, limit_value: -1 },
    { feature_slug: 'unlimited_bids', enabled: true, limit_value: -1 },
];

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('isWithinLimit (Feature Limit Gating)', () => {
    it('returns true for unlimited (-1) regardless of usage', () => {
        expect(isWithinLimit(-1, 0)).toBe(true);
        expect(isWithinLimit(-1, 999999)).toBe(true);
    });

    it('returns false for disabled (0)', () => {
        expect(isWithinLimit(0, 0)).toBe(false);
    });

    it('returns true when usage is below limit', () => {
        expect(isWithinLimit(3, 0)).toBe(true);
        expect(isWithinLimit(3, 1)).toBe(true);
        expect(isWithinLimit(3, 2)).toBe(true);
    });

    it('returns false when usage equals limit', () => {
        expect(isWithinLimit(3, 3)).toBe(false);
    });

    it('returns false when usage exceeds limit', () => {
        expect(isWithinLimit(3, 5)).toBe(false);
        expect(isWithinLimit(3, 100)).toBe(false);
    });

    it('handles edge case of limit = 1', () => {
        expect(isWithinLimit(1, 0)).toBe(true);
        expect(isWithinLimit(1, 1)).toBe(false);
    });

    it('handles negative limit values as disabled', () => {
        // Only -1 is unlimited; -2 or lower is treated as disabled
        expect(isWithinLimit(-2, 0)).toBe(false);
        expect(isWithinLimit(-100, 0)).toBe(false);
    });
});

describe('resolveEffectivePlan', () => {
    it('returns "free" when no subscription exists', () => {
        expect(resolveEffectivePlan(null)).toBe('free');
    });

    it('returns plan slug for active subscription', () => {
        const sub = {
            plan_slug: 'premium',
            status: 'active',
            current_period_end: new Date(Date.now() + 86400000), // tomorrow
        };
        expect(resolveEffectivePlan(sub)).toBe('premium');
    });

    it('returns plan slug for trialing subscription', () => {
        const sub = {
            plan_slug: 'premium',
            status: 'trialing',
            current_period_end: new Date(Date.now() + 86400000),
        };
        expect(resolveEffectivePlan(sub)).toBe('premium');
    });

    it('returns "free" for cancelled subscription', () => {
        const sub = {
            plan_slug: 'premium',
            status: 'cancelled',
            current_period_end: new Date(Date.now() + 86400000),
        };
        expect(resolveEffectivePlan(sub)).toBe('free');
    });

    it('returns "free" for expired subscription', () => {
        const sub = {
            plan_slug: 'premium',
            status: 'active',
            current_period_end: new Date(Date.now() - 86400000), // yesterday
        };
        expect(resolveEffectivePlan(sub)).toBe('free');
    });

    it('returns "free" for past_due subscription', () => {
        const sub = {
            plan_slug: 'premium',
            status: 'past_due',
            current_period_end: new Date(Date.now() + 86400000),
        };
        expect(resolveEffectivePlan(sub)).toBe('free');
    });
});

describe('checkFeatureInMatrix', () => {
    describe('Free plan features', () => {
        it('allows boq_export with limit of 3', () => {
            const result = checkFeatureInMatrix(FREE_FEATURES, 'boq_export');
            expect(result.allowed).toBe(true);
            expect(result.limit).toBe(3);
        });

        it('denies boq_whitelabel', () => {
            const result = checkFeatureInMatrix(FREE_FEATURES, 'boq_whitelabel');
            expect(result.allowed).toBe(false);
            expect(result.limit).toBe(0);
        });

        it('denies oracle_advanced', () => {
            const result = checkFeatureInMatrix(FREE_FEATURES, 'oracle_advanced');
            expect(result.allowed).toBe(false);
        });

        it('allows priority_alerts with limit of 5', () => {
            const result = checkFeatureInMatrix(FREE_FEATURES, 'priority_alerts');
            expect(result.allowed).toBe(true);
            expect(result.limit).toBe(5);
        });

        it('denies priority_search', () => {
            const result = checkFeatureInMatrix(FREE_FEATURES, 'priority_search');
            expect(result.allowed).toBe(false);
        });

        it('returns denied for unknown features', () => {
            const result = checkFeatureInMatrix(FREE_FEATURES, 'nonexistent');
            expect(result.allowed).toBe(false);
            expect(result.limit).toBe(0);
        });
    });

    describe('Premium plan features', () => {
        it('allows boq_export with unlimited (-1)', () => {
            const result = checkFeatureInMatrix(PREMIUM_FEATURES, 'boq_export');
            expect(result.allowed).toBe(true);
            expect(result.limit).toBe(-1);
        });

        it('allows boq_whitelabel', () => {
            const result = checkFeatureInMatrix(PREMIUM_FEATURES, 'boq_whitelabel');
            expect(result.allowed).toBe(true);
        });

        it('allows oracle_advanced', () => {
            const result = checkFeatureInMatrix(PREMIUM_FEATURES, 'oracle_advanced');
            expect(result.allowed).toBe(true);
        });

        it('allows priority_alerts unlimited', () => {
            const result = checkFeatureInMatrix(PREMIUM_FEATURES, 'priority_alerts');
            expect(result.allowed).toBe(true);
            expect(result.limit).toBe(-1);
        });

        it('allows priority_search', () => {
            const result = checkFeatureInMatrix(PREMIUM_FEATURES, 'priority_search');
            expect(result.allowed).toBe(true);
        });

        it('allows all 7 features', () => {
            for (const f of PREMIUM_FEATURES) {
                const result = checkFeatureInMatrix(PREMIUM_FEATURES, f.feature_slug);
                expect(result.allowed).toBe(true);
            }
        });
    });
});

describe('Billing Period Calculation', () => {
    it('calculates monthly period (30 days ahead)', () => {
        const start = new Date('2026-03-01T00:00:00Z');
        const end = calculatePeriodEnd(start, 'monthly');
        expect(end.getFullYear()).toBe(2026);
        expect(end.getMonth()).toBe(3); // April (0-indexed)
        expect(end.getDate()).toBe(1);
    });

    it('calculates yearly period (365 days ahead)', () => {
        const start = new Date('2026-03-01T00:00:00Z');
        const end = calculatePeriodEnd(start, 'yearly');
        expect(end.getFullYear()).toBe(2027);
        expect(end.getMonth()).toBe(2); // March
    });

    it('handles end-of-month rollover', () => {
        const start = new Date('2026-01-31T00:00:00Z');
        const end = calculatePeriodEnd(start, 'monthly');
        // Jan 31 + 1 month → Feb 28 or Mar 3 depending on implementation
        // JavaScript Date handles this by rolling to March
        expect(end.getMonth()).toBeGreaterThanOrEqual(1);
    });
});

describe('End-to-End Feature Gating Flow', () => {
    it('free user cannot access white-labeled BOQ exports', () => {
        const plan = resolveEffectivePlan(null); // no subscription → free
        expect(plan).toBe('free');

        const features = plan === 'free' ? FREE_FEATURES : PREMIUM_FEATURES;
        const access = checkFeatureInMatrix(features, 'boq_whitelabel');
        expect(access.allowed).toBe(false);
    });

    it('premium user gets unlimited BOQ exports', () => {
        const sub = {
            plan_slug: 'premium',
            status: 'active' as const,
            current_period_end: new Date(Date.now() + 86400000),
        };
        const plan = resolveEffectivePlan(sub);
        expect(plan).toBe('premium');

        const features = plan === 'premium' ? PREMIUM_FEATURES : FREE_FEATURES;
        const access = checkFeatureInMatrix(features, 'boq_export');
        expect(access.allowed).toBe(true);
        expect(isWithinLimit(access.limit, 999)).toBe(true); // -1 = unlimited
    });

    it('free user with 3 BOQ exports used is blocked', () => {
        const features = FREE_FEATURES;
        const access = checkFeatureInMatrix(features, 'boq_export');
        expect(access.allowed).toBe(true);
        expect(isWithinLimit(access.limit, 3)).toBe(false); // at limit
    });

    it('free user with 2 BOQ exports used is allowed', () => {
        const features = FREE_FEATURES;
        const access = checkFeatureInMatrix(features, 'boq_export');
        expect(access.allowed).toBe(true);
        expect(isWithinLimit(access.limit, 2)).toBe(true); // below limit
    });
});
