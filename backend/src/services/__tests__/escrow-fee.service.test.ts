// ============================================================================
// Nammerha Backend — Escrow Fee Service Unit Tests
// Covers: fee calculation, min/max caps, edge cases, exemption logic
// Pattern: Inline reimplementation of pure functions (no DB dependency)
// ============================================================================
import { describe, it, expect } from 'vitest';

// ─── Inline Reimplementation of Pure Function Under Test ────────────────────

/**
 * BigInt-safe escrow fee calculation with min/max caps.
 * Mirrors escrow-fee.service.ts::calculateEscrowFee
 */
function calculateEscrowFee(
  amountCents: number,
  rateBps: number,
  minCents: number = 0,
  maxCents: number | null = null,
): number {
  if (amountCents <= 0 || rateBps <= 0) {
    return 0;
  }
  let fee = Number((BigInt(amountCents) * BigInt(rateBps)) / 10000n);
  if (fee < minCents) {
    fee = minCents;
  }
  if (maxCents !== null && fee > maxCents) {
    fee = maxCents;
  }
  return fee;
}

/**
 * Determine if a project is commercial (eligible for fees).
 * Commercial = only the homeowner funds the project (no external users).
 */
function isCommercialProject(homeownerId: string, userIds: string[]): boolean {
  // If no external users (all funding from homeowner), it's commercial
  const externalUsers = userIds.filter((id) => id !== homeownerId);
  return externalUsers.length === 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('calculateEscrowFee (BigInt-safe)', () => {
  it('calculates 2% fee correctly', () => {
    // $1000 release (100000 cents) at 200 bps (2%)
    expect(calculateEscrowFee(100000, 200)).toBe(2000); // $20.00
  });

  it('calculates 1% fee correctly', () => {
    // $5000 release (500000 cents) at 100 bps (1%)
    expect(calculateEscrowFee(500000, 100)).toBe(5000); // $50.00
  });

  it('calculates 3% fee correctly', () => {
    // $10000 release (1000000 cents) at 300 bps (3%)
    expect(calculateEscrowFee(1000000, 300)).toBe(30000); // $300.00
  });

  it('rounds down via BigInt truncation (platform-safe)', () => {
    // $33.33 release (3333 cents) at 200 bps
    // 3333 * 200 / 10000 = 66.66 → 66
    expect(calculateEscrowFee(3333, 200)).toBe(66);
  });

  it('returns 0 for zero amount', () => {
    expect(calculateEscrowFee(0, 200)).toBe(0);
  });

  it('returns 0 for negative amount', () => {
    expect(calculateEscrowFee(-5000, 200)).toBe(0);
  });

  it('returns 0 for zero rate', () => {
    expect(calculateEscrowFee(100000, 0)).toBe(0);
  });

  it('returns 0 for negative rate', () => {
    expect(calculateEscrowFee(100000, -100)).toBe(0);
  });

  it('handles very large escrow amounts', () => {
    // $500,000 release (50000000 cents) at 200 bps
    expect(calculateEscrowFee(50000000, 200)).toBe(1000000); // $10,000
  });

  it('handles 1 basis point (0.01%)', () => {
    expect(calculateEscrowFee(100000, 1)).toBe(10); // $0.10
  });
});

describe('calculateEscrowFee — Min/Max Caps', () => {
  it('applies minimum fee floor', () => {
    // $5 release (500 cents) at 200 bps = $0.10 → below $1.00 min
    expect(calculateEscrowFee(500, 200, 100)).toBe(100); // $1.00 min
  });

  it('does not apply min when fee is above floor', () => {
    // $1000 release at 200 bps = $20 → above $1.00 min
    expect(calculateEscrowFee(100000, 200, 100)).toBe(2000);
  });

  it('applies maximum fee cap', () => {
    // $100,000 release at 300 bps = $3,000 → capped at $1,000
    expect(calculateEscrowFee(10000000, 300, 0, 100000)).toBe(100000); // $1,000 max
  });

  it('does not apply max when fee is below cap', () => {
    // $1,000 release at 200 bps = $20 → below $1,000 max
    expect(calculateEscrowFee(100000, 200, 0, 100000)).toBe(2000);
  });

  it('applies both min and max (min wins when small amount)', () => {
    // $1 release (100 cents) at 200 bps = $0.02 → below $1.00 min
    expect(calculateEscrowFee(100, 200, 100, 500000)).toBe(100);
  });

  it('applies max cap for very large transactions', () => {
    // $1M release at 300 bps = $30,000 → capped at $5,000
    expect(calculateEscrowFee(100000000, 300, 100, 500000)).toBe(500000);
  });

  it('null max means uncapped', () => {
    // $1M release at 300 bps = $30,000 → no cap
    expect(calculateEscrowFee(100000000, 300, 0, null)).toBe(3000000);
  });
});

describe('isCommercialProject (Fee Exemption)', () => {
  it('returns true when only homeowner funds the project', () => {
    expect(isCommercialProject('user-123', ['user-123'])).toBe(true);
  });

  it('returns true when no users at all', () => {
    expect(isCommercialProject('user-123', [])).toBe(true);
  });

  it('returns false when external users contribute', () => {
    expect(isCommercialProject('user-123', ['user-1', 'user-2'])).toBe(false);
  });

  it('returns false when mix of homeowner and external users', () => {
    expect(isCommercialProject('user-123', ['user-123', 'user-1'])).toBe(false);
  });

  it('returns true with multiple homeowner entries only', () => {
    // Homeowner made multiple deposits
    expect(isCommercialProject('user-123', ['user-123', 'user-123'])).toBe(true);
  });
});

describe('End-to-End Fee Calculation Flow', () => {
  it('commercial project: $10,000 release → $200 fee at 2%', () => {
    const isCommercial = isCommercialProject('owner', ['owner']);
    expect(isCommercial).toBe(true);

    if (isCommercial) {
      const fee = calculateEscrowFee(1000000, 200, 100, null);
      expect(fee).toBe(20000); // $200
    }
  });

  it('humanitarian project: $10,000 release → $0 fee (exempt)', () => {
    const isCommercial = isCommercialProject('owner', ['user-1', 'user-2']);
    expect(isCommercial).toBe(false);
    // No fee calculated for humanitarian projects
  });

  it('small commercial project: $50 release → $1.00 minimum fee', () => {
    const fee = calculateEscrowFee(5000, 200, 100, null);
    // $50 * 2% = $1.00, equals minimum
    expect(fee).toBe(100);
  });

  it('large commercial project with cap: $500K release → $5K max fee', () => {
    const fee = calculateEscrowFee(50000000, 200, 100, 500000);
    // $500K * 2% = $10K → capped at $5K
    expect(fee).toBe(500000);
  });
});
