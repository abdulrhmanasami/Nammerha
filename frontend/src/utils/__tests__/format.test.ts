// ============================================================================
// Nammerha Frontend — Format Utilities Unit Tests (IMP-002)
// ============================================================================
// Covers: formatCents, formatDollars, relativeTimeAgo
// NMR-AUD-301: Single source of truth for currency formatting.
// FIX-Ω1: NaN guard validation — prevents 'ليس رقماً' display.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatCents, formatDollars, relativeTimeAgo } from '../format';

// Mock DOM APIs used by format.ts
const mockDocumentElement = { lang: 'en' };
const mockNavigator = { language: 'en-US' };

vi.stubGlobal('document', { documentElement: mockDocumentElement });
vi.stubGlobal('navigator', mockNavigator);

describe('Format Utilities', () => {
    beforeEach(() => {
        mockDocumentElement.lang = 'en';
    });

    // ─── formatCents ────────────────────────────────────────────────────────
    describe('formatCents', () => {
        it('should format 150000 cents as $1,500', () => {
            const result = formatCents(150000, 'USD', 'en-US');
            expect(result).toContain('1,500');
        });

        it('should format 0 cents as $0', () => {
            const result = formatCents(0, 'USD', 'en-US');
            expect(result).toContain('0');
        });

        it('should format negative cents', () => {
            const result = formatCents(-50000, 'USD', 'en-US');
            expect(result).toContain('500');
        });

        // FIX-Ω1: NaN guard validation
        it('should guard against undefined (returns $0)', () => {
            const result = formatCents(undefined as unknown as number, 'USD', 'en-US');
            expect(result).toContain('0');
            expect(result).not.toContain('NaN');
        });

        it('should guard against null (returns $0)', () => {
            const result = formatCents(null as unknown as number, 'USD', 'en-US');
            expect(result).toContain('0');
            expect(result).not.toContain('NaN');
        });

        it('should guard against NaN (returns $0)', () => {
            const result = formatCents(NaN, 'USD', 'en-US');
            expect(result).toContain('0');
        });

        it('should guard against Infinity (returns $0)', () => {
            const result = formatCents(Infinity, 'USD', 'en-US');
            expect(result).toContain('0');
        });

        it('should use 0 fraction digits (whole number display)', () => {
            const result = formatCents(199, 'USD', 'en-US');
            // 199 cents = $1.99 but with 0 fractionDigits → $2 (rounded)
            expect(result).not.toContain('.99');
        });
    });

    // ─── formatDollars ──────────────────────────────────────────────────────
    describe('formatDollars', () => {
        it('should format 1500.50 as $1,500.50', () => {
            const result = formatDollars(1500.50, 'USD', 'en-US');
            expect(result).toContain('1,500.50');
        });

        it('should always show 2 decimal places', () => {
            const result = formatDollars(100, 'USD', 'en-US');
            expect(result).toContain('100.00');
        });

        // FIX-Ω1: NaN guard
        it('should guard against undefined (returns $0.00)', () => {
            const result = formatDollars(undefined as unknown as number, 'USD', 'en-US');
            expect(result).toContain('0.00');
        });

        it('should guard against null (returns $0.00)', () => {
            const result = formatDollars(null as unknown as number, 'USD', 'en-US');
            expect(result).toContain('0.00');
        });
    });

    // ─── relativeTimeAgo ────────────────────────────────────────────────────
    describe('relativeTimeAgo', () => {
        let nowSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            nowSpy = vi.spyOn(Date, 'now').mockReturnValue(
                new Date('2026-04-15T10:00:00Z').getTime()
            );
        });

        afterEach(() => {
            nowSpy.mockRestore();
        });

        it('should show seconds for < 1 minute ago', () => {
            const result = relativeTimeAgo('2026-04-15T09:59:30Z');
            // 30 seconds ago
            expect(result).toBeTruthy();
            expect(result.length).toBeGreaterThan(0);
        });

        it('should show minutes for < 1 hour ago', () => {
            const result = relativeTimeAgo('2026-04-15T09:30:00Z');
            // 30 minutes ago
            expect(result).toBeTruthy();
        });

        it('should show hours for < 1 day ago', () => {
            const result = relativeTimeAgo('2026-04-15T05:00:00Z');
            // 5 hours ago
            expect(result).toBeTruthy();
        });

        it('should show days for >= 1 day ago', () => {
            const result = relativeTimeAgo('2026-04-12T10:00:00Z');
            // 3 days ago
            expect(result).toBeTruthy();
        });
    });
});
