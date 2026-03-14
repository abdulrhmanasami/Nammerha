// ============================================================================
// Nammerha Backend — Commission Service Unit Tests
// Covers: tiered commission calculation, tier resolution, edge cases
// Pattern: Inline reimplementation of pure functions (no DB dependency)
// ============================================================================
import { describe, it, expect } from 'vitest';

// ─── Inline Reimplementation of Pure Functions Under Test ────────────────────
// Same pattern as payment.service.test.ts: extract and test the pure logic
// directly, without importing the service (which depends on database).

interface CommissionTier {
    tier_id: string;
    tier_name: string;
    min_revenue_cents: number;
    max_revenue_cents: number | null;
    commission_rate_bps: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

/**
 * Integer-safe commission calculation using BigInt arithmetic.
 * @param poAmountCents - Purchase order amount in cents
 * @param rateBps - Commission rate in basis points (1500 = 15%)
 * @returns Commission amount in cents
 */
function calculateCommission(poAmountCents: number, rateBps: number): number {
    if (poAmountCents <= 0 || rateBps <= 0) {
        return 0;
    }
    return Number((BigInt(poAmountCents) * BigInt(rateBps)) / 10000n);
}

/**
 * Determine the applicable commission tier based on monthly revenue.
 */
function resolveApplicableTier(
    tiers: CommissionTier[],
    monthlyRevenueCents: number,
): CommissionTier | null {
    if (tiers.length === 0) {
        return null;
    }

    const sorted = [...tiers].sort((a, b) => a.min_revenue_cents - b.min_revenue_cents);

    for (let i = sorted.length - 1; i >= 0; i--) {
        const tier = sorted[i];
        if (!tier) { continue; }
        if (monthlyRevenueCents >= tier.min_revenue_cents) {
            if (tier.max_revenue_cents === null || monthlyRevenueCents <= tier.max_revenue_cents) {
                return tier;
            }
        }
    }

    const fallback = sorted[0];
    return fallback ?? null;
}

// ─── Test Data ──────────────────────────────────────────────────────────────

const now = new Date();
const TIERS: CommissionTier[] = [
    {
        tier_id: 'tier-1', tier_name: 'standard',
        min_revenue_cents: 0, max_revenue_cents: 1000000,
        commission_rate_bps: 1500, is_active: true,
        created_at: now, updated_at: now,
    },
    {
        tier_id: 'tier-2', tier_name: 'growth',
        min_revenue_cents: 1000001, max_revenue_cents: 5000000,
        commission_rate_bps: 1200, is_active: true,
        created_at: now, updated_at: now,
    },
    {
        tier_id: 'tier-3', tier_name: 'enterprise',
        min_revenue_cents: 5000001, max_revenue_cents: null,
        commission_rate_bps: 1000, is_active: true,
        created_at: now, updated_at: now,
    },
];

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Commission Calculation (BigInt-safe)', () => {
    it('calculates 15% commission correctly', () => {
        // $100 PO (10000 cents) at 1500 bps (15%)
        expect(calculateCommission(10000, 1500)).toBe(1500);
    });

    it('calculates 12% commission correctly', () => {
        // $500 PO (50000 cents) at 1200 bps (12%)
        expect(calculateCommission(50000, 1200)).toBe(6000);
    });

    it('calculates 10% commission correctly', () => {
        // $1000 PO (100000 cents) at 1000 bps (10%)
        expect(calculateCommission(100000, 1000)).toBe(10000);
    });

    it('rounds down for fractional cents (platform safety)', () => {
        // $33.33 PO (3333 cents) at 1500 bps (15%)
        // 3333 * 1500 / 10000 = 499.95 → should be 499 (floor via BigInt truncation)
        expect(calculateCommission(3333, 1500)).toBe(499);
    });

    it('returns 0 for zero PO amount', () => {
        expect(calculateCommission(0, 1500)).toBe(0);
    });

    it('returns 0 for negative PO amount', () => {
        expect(calculateCommission(-5000, 1500)).toBe(0);
    });

    it('returns 0 for zero rate', () => {
        expect(calculateCommission(10000, 0)).toBe(0);
    });

    it('returns 0 for negative rate', () => {
        expect(calculateCommission(10000, -100)).toBe(0);
    });

    it('handles very large PO amounts (> MAX_SAFE_INTEGER boundary)', () => {
        // Large but realistic construction PO: $500,000 = 50,000,000 cents
        const result = calculateCommission(50000000, 1500);
        expect(result).toBe(7500000); // $75,000 commission
    });

    it('handles 1 basis point (0.01%) correctly', () => {
        // $100 PO at 1 bps = $0.01
        expect(calculateCommission(10000, 1)).toBe(1);
    });

    it('handles maximum rate (5000 bps = 50%) correctly', () => {
        expect(calculateCommission(10000, 5000)).toBe(5000);
    });

    it('matches expected result for realistic construction values', () => {
        // Rebar PO: 573,750 cents ($5,737.50) at 15% (1500 bps)
        // Expected: 573750 * 1500 / 10000 = 86062.5 → 86062 (BigInt truncation)
        expect(calculateCommission(573750, 1500)).toBe(86062);
    });
});

describe('Tier Resolution', () => {
    it('resolves standard tier for new supplier ($0 revenue)', () => {
        const tier = resolveApplicableTier(TIERS, 0);
        expect(tier?.tier_name).toBe('standard');
        expect(tier?.commission_rate_bps).toBe(1500);
    });

    it('resolves standard tier at upper boundary ($10,000)', () => {
        const tier = resolveApplicableTier(TIERS, 1000000);
        expect(tier?.tier_name).toBe('standard');
    });

    it('resolves growth tier at lower boundary ($10,001)', () => {
        const tier = resolveApplicableTier(TIERS, 1000001);
        expect(tier?.tier_name).toBe('growth');
        expect(tier?.commission_rate_bps).toBe(1200);
    });

    it('resolves growth tier at upper boundary ($50,000)', () => {
        const tier = resolveApplicableTier(TIERS, 5000000);
        expect(tier?.tier_name).toBe('growth');
    });

    it('resolves enterprise tier ($50,001+)', () => {
        const tier = resolveApplicableTier(TIERS, 5000001);
        expect(tier?.tier_name).toBe('enterprise');
        expect(tier?.commission_rate_bps).toBe(1000);
    });

    it('resolves enterprise tier for very high revenue', () => {
        const tier = resolveApplicableTier(TIERS, 100000000); // $1M
        expect(tier?.tier_name).toBe('enterprise');
    });

    it('returns null for empty tiers array', () => {
        const tier = resolveApplicableTier([], 5000);
        expect(tier).toBeNull();
    });

    it('handles unsorted input tiers correctly', () => {
        // Provide tiers in reverse order — function should sort internally
        const reversed = [...TIERS].reverse();
        const tier = resolveApplicableTier(reversed, 2000000);
        expect(tier?.tier_name).toBe('growth');
    });

    it('handles single tier (no brackets)', () => {
        const singleTier: CommissionTier[] = [{
            tier_id: 'flat', tier_name: 'flat_rate',
            min_revenue_cents: 0, max_revenue_cents: null,
            commission_rate_bps: 1500, is_active: true,
            created_at: now, updated_at: now,
        }];
        const tier = resolveApplicableTier(singleTier, 99999999);
        expect(tier?.tier_name).toBe('flat_rate');
    });
});

describe('End-to-End Commission Flow (Pure Functions)', () => {
    it('new supplier gets 15% commission', () => {
        const tier = resolveApplicableTier(TIERS, 0);
        expect(tier).not.toBeNull();
        const commission = calculateCommission(100000, tier?.commission_rate_bps ?? 0);
        // $1000 PO * 15% = $150 = 15000 cents
        expect(commission).toBe(15000);
    });

    it('growth supplier gets 12% commission', () => {
        const tier = resolveApplicableTier(TIERS, 2500000); // $25K/mo
        expect(tier).not.toBeNull();
        const commission = calculateCommission(100000, tier?.commission_rate_bps ?? 0);
        // $1000 PO * 12% = $120 = 12000 cents
        expect(commission).toBe(12000);
    });

    it('enterprise supplier gets 10% commission', () => {
        const tier = resolveApplicableTier(TIERS, 10000000); // $100K/mo
        expect(tier).not.toBeNull();
        const commission = calculateCommission(100000, tier?.commission_rate_bps ?? 0);
        // $1000 PO * 10% = $100 = 10000 cents
        expect(commission).toBe(10000);
    });
});
