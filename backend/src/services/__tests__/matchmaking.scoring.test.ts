// ============================================================================
// Nammerha — Matchmaking Scoring Algorithm Unit Tests (PLT-AUDIT-006)
// Tests the PURE scoring functions and safeParseFloat guard:
//   1. calculateScoringFactors — all 4 factors + composite score
//   2. Boundary conditions: zero projects, 50+ projects, edge cases
//   3. License status combos: none, license-only, guild-only, both
//   4. Response speed boundaries: 24h (max), 168h (zero), null (default)
// ============================================================================
import { describe, it, expect } from 'vitest';

// Import the PURE scoring function (no mocks needed — this is stateless math)
import {
    calculateScoringFactors,
    type EngineerMetrics,
} from '../../services/matchmaking.service';

// ═══════════════════════════════════════════════════════════════════════════
// Matchmaking Scoring Algorithm Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Matchmaking Scoring Algorithm', () => {

    // ─── Factor 1: Completed Projects (logarithmic scale) ───────────────
    describe('Project Factor (W1=0.35)', () => {
        it('should score 0 for zero completed projects', () => {
            const result = calculateScoringFactors(makeMetrics({ completed_projects_count: 0 }));
            expect(result.projectsFactor).toBe(0);
        });

        it('should score moderately for 5 completed projects', () => {
            const result = calculateScoringFactors(makeMetrics({ completed_projects_count: 5 }));
            // log2(6) / log2(51) ≈ 0.456 → 45.6
            expect(result.projectsFactor).toBeGreaterThan(40);
            expect(result.projectsFactor).toBeLessThan(50);
        });

        it('should score near-cap for 50+ projects (logarithmic saturation)', () => {
            const result = calculateScoringFactors(makeMetrics({ completed_projects_count: 50 }));
            // log2(51) / log2(51) = 1.0 → 100
            expect(result.projectsFactor).toBeCloseTo(100, 0);
        });

        it('should cap at 100 even for extreme values (1000 projects)', () => {
            const result = calculateScoringFactors(makeMetrics({ completed_projects_count: 1000 }));
            expect(result.projectsFactor).toBeLessThanOrEqual(100);
        });

        it('should increase monotonically as projects increase', () => {
            const scores = [0, 1, 5, 10, 25, 50].map(n =>
                calculateScoringFactors(makeMetrics({ completed_projects_count: n })).projectsFactor
            );
            for (let i = 1; i < scores.length; i++) {
                expect(scores[i]).toBeGreaterThan(scores[i - 1] as number);
            }
        });
    });

    // ─── Factor 2: Response Speed (inverse — faster = higher) ───────────
    describe('Response Speed Factor (W2=0.20)', () => {
        it('should default to 50 when avg_response_hours is null', () => {
            const result = calculateScoringFactors(makeMetrics({ avg_response_hours: null }));
            expect(result.responseFactor).toBe(50);
        });

        it('should score 100 for 24h or faster response', () => {
            const result = calculateScoringFactors(makeMetrics({ avg_response_hours: 24 }));
            expect(result.responseFactor).toBeCloseTo(100, 0);
        });

        it('should score ~50 for 96h response (midpoint)', () => {
            const result = calculateScoringFactors(makeMetrics({ avg_response_hours: 96 }));
            expect(result.responseFactor).toBeCloseTo(50, 0);
        });

        it('should score 0 for 168h (1 week) or slower response', () => {
            const result = calculateScoringFactors(makeMetrics({ avg_response_hours: 168 }));
            expect(result.responseFactor).toBe(0);
        });

        it('should clamp at 0 for extremely slow responses (500h)', () => {
            const result = calculateScoringFactors(makeMetrics({ avg_response_hours: 500 }));
            expect(result.responseFactor).toBe(0);
        });

        it('should clamp at 100 for extremely fast responses (1h)', () => {
            const result = calculateScoringFactors(makeMetrics({ avg_response_hours: 1 }));
            expect(result.responseFactor).toBe(100);
        });
    });

    // ─── Factor 3: Bid Win Rate (direct mapping) ────────────────────────
    describe('Bid Win Rate Factor (W3=0.30)', () => {
        it('should default to 50 when bid_win_rate is null (new engineer)', () => {
            const result = calculateScoringFactors(makeMetrics({ bid_win_rate: null }));
            expect(result.winFactor).toBe(50);
        });

        it('should pass through the rate directly (0% → 0)', () => {
            const result = calculateScoringFactors(makeMetrics({ bid_win_rate: 0 }));
            expect(result.winFactor).toBe(0);
        });

        it('should pass through the rate directly (100% → 100)', () => {
            const result = calculateScoringFactors(makeMetrics({ bid_win_rate: 100 }));
            expect(result.winFactor).toBe(100);
        });

        it('should handle fractional win rates (33.33%)', () => {
            const result = calculateScoringFactors(makeMetrics({ bid_win_rate: 33.33 }));
            expect(result.winFactor).toBeCloseTo(33.33, 2);
        });
    });

    // ─── Factor 4: License Status (binary categories) ───────────────────
    describe('License Status Factor (W4=0.15)', () => {
        it('should score 20 when no license and no guild', () => {
            const result = calculateScoringFactors(makeMetrics({
                engineering_license_number: null,
                guild_membership_id: null,
            }));
            expect(result.licenseFactor).toBe(20);
        });

        it('should score 60 for license only (no guild)', () => {
            const result = calculateScoringFactors(makeMetrics({
                engineering_license_number: 'LIC-001',
                guild_membership_id: null,
            }));
            expect(result.licenseFactor).toBe(60);
        });

        it('should score 60 for guild only (no license)', () => {
            const result = calculateScoringFactors(makeMetrics({
                engineering_license_number: null,
                guild_membership_id: 'GUILD-001',
            }));
            expect(result.licenseFactor).toBe(60);
        });

        it('should score 100 for both license and guild', () => {
            const result = calculateScoringFactors(makeMetrics({
                engineering_license_number: 'LIC-001',
                guild_membership_id: 'GUILD-001',
            }));
            expect(result.licenseFactor).toBe(100);
        });
    });

    // ─── Composite Score — Weighted Sum ──────────────────────────────────
    describe('Composite Score (weighted sum)', () => {
        it('should calculate correct composite for a new engineer (all defaults)', () => {
            const result = calculateScoringFactors(makeMetrics({
                completed_projects_count: 0,
                avg_response_hours: null,
                bid_win_rate: null,
                engineering_license_number: null,
                guild_membership_id: null,
            }));

            // 0.35*0 + 0.20*50 + 0.30*50 + 0.15*20 = 0 + 10 + 15 + 3 = 28
            expect(result.compositeScore).toBeCloseTo(28, 0);
        });

        it('should calculate correct composite for a top-tier engineer', () => {
            const result = calculateScoringFactors(makeMetrics({
                completed_projects_count: 50,  // → ~100
                avg_response_hours: 12,        // → 100 (< 24h)
                bid_win_rate: 85,              // → 85
                engineering_license_number: 'LIC-001',
                guild_membership_id: 'GUILD-001', // → 100
            }));

            // 0.35*~100 + 0.20*100 + 0.30*85 + 0.15*100
            // ≈ 35 + 20 + 25.5 + 15 = 95.5
            expect(result.compositeScore).toBeGreaterThan(90);
            expect(result.compositeScore).toBeLessThanOrEqual(100);
        });

        it('should never exceed 100', () => {
            const result = calculateScoringFactors(makeMetrics({
                completed_projects_count: 10000,
                avg_response_hours: 0,
                bid_win_rate: 100,
                engineering_license_number: 'LIC',
                guild_membership_id: 'GUILD',
            }));

            expect(result.compositeScore).toBeLessThanOrEqual(100);
        });

        it('should round to 2 decimal places', () => {
            const result = calculateScoringFactors(makeMetrics({
                completed_projects_count: 3,
            }));

            const decimalParts = result.compositeScore.toString().split('.');
            if (decimalParts[1]) {
                expect(decimalParts[1].length).toBeLessThanOrEqual(2);
            }
        });
    });
});

// ─── Helper: construct EngineerMetrics with sensible defaults ────────────────

function makeMetrics(overrides: Partial<EngineerMetrics> = {}): EngineerMetrics {
    return {
        completed_projects_count: 0,
        avg_response_hours: null,
        bid_win_rate: null,
        engineering_license_number: null,
        guild_membership_id: null,
        ...overrides,
    };
}
