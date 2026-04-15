// ============================================================================
// Nammerha Frontend — Status Colors Unit Tests (IMP-002)
// ============================================================================
// PLT-FE-003: Single source of truth for all status/trade/urgency badge colors.
// Validates color mapping completeness and fallback behavior.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
    statusColor,
    escrowColor,
    tradeColor,
    urgencyColor,
    bidColor,
    phaseColor,
    phaseIcon,
    availabilityColor,
    supplierStatusColor,
} from '../status-colors';

describe('Status Colors', () => {
    // ─── statusColor ────────────────────────────────────────────────────────
    describe('statusColor', () => {
        it('should return green for completed', () => {
            expect(statusColor('completed')).toContain('green');
        });

        it('should return amber for pending', () => {
            expect(statusColor('pending')).toContain('amber');
        });

        it('should return red for cancelled', () => {
            expect(statusColor('cancelled')).toContain('red');
        });

        it('should return purple for published', () => {
            expect(statusColor('published')).toContain('purple');
        });

        it('should map all known statuses (no missing)', () => {
            const statuses = [
                'draft', 'open', 'pending', 'pending_assessment', 'assessed',
                'published', 'matched', 'in_progress', 'completed', 'cancelled',
                'approved', 'accepted', 'rejected', 'declined', 'expired', 'withdrawn',
            ];
            for (const s of statuses) {
                const color = statusColor(s);
                expect(color).not.toBe('bg-slate-100 text-slate-600'); // not fallback
            }
        });

        it('should return fallback for unknown status', () => {
            expect(statusColor('nonexistent')).toBe('bg-slate-100 text-slate-600');
        });
    });

    // ─── escrowColor ────────────────────────────────────────────────────────
    describe('escrowColor', () => {
        it('should return green for released', () => {
            expect(escrowColor('released')).toContain('green');
        });

        it('should return emerald for locked', () => {
            expect(escrowColor('locked')).toContain('emerald');
        });

        it('should return amber for refunded', () => {
            expect(escrowColor('refunded')).toContain('amber');
        });

        it('should return fallback for unknown', () => {
            expect(escrowColor('unknown')).toContain('slate');
        });
    });

    // ─── tradeColor ─────────────────────────────────────────────────────────
    describe('tradeColor', () => {
        it('should map all 10 trade types (plastering uses slate intentionally)', () => {
            // Trades with unique colors (not slate fallback)
            const uniqueTrades = ['tiling', 'painting', 'plumbing', 'electrical', 'carpentry',
                'welding', 'masonry', 'hvac', 'general'];
            for (const t of uniqueTrades) {
                expect(tradeColor(t)).not.toBe('bg-slate-100 text-slate-600');
            }
            // plastering intentionally uses slate (same visual as fallback — design choice)
            expect(tradeColor('plastering')).toBe('bg-slate-100 text-slate-600');
        });

        it('should return fallback for unknown trade', () => {
            expect(tradeColor('hacking')).toBe('bg-slate-100 text-slate-600');
        });
    });

    // ─── urgencyColor ───────────────────────────────────────────────────────
    describe('urgencyColor', () => {
        it('should return red for emergency', () => {
            expect(urgencyColor('emergency')).toContain('red');
        });

        it('should return amber for urgent', () => {
            expect(urgencyColor('urgent')).toContain('amber');
        });

        it('should return slate for routine', () => {
            expect(urgencyColor('routine')).toContain('slate');
        });
    });

    // ─── bidColor ───────────────────────────────────────────────────────────
    describe('bidColor', () => {
        it('should map all bid statuses', () => {
            expect(bidColor('pending')).toContain('amber');
            expect(bidColor('accepted')).toContain('green');
            expect(bidColor('rejected')).toContain('red');
            expect(bidColor('withdrawn')).toContain('slate');
            expect(bidColor('expired')).toContain('slate');
        });
    });

    // ─── phaseColor + phaseIcon ─────────────────────────────────────────────
    describe('phaseColor', () => {
        it('should map all construction phases', () => {
            expect(phaseColor('pending_execution')).toContain('amber');
            expect(phaseColor('in_progress')).toContain('blue');
            expect(phaseColor('completed')).toContain('green');
            expect(phaseColor('verified')).toContain('emerald');
            expect(phaseColor('delivered')).toContain('emerald');
        });
    });

    describe('phaseIcon', () => {
        it('should return Phosphor icon classes', () => {
            expect(phaseIcon('pending_execution')).toContain('ph-hourglass');
            expect(phaseIcon('completed')).toContain('ph-check-circle');
            expect(phaseIcon('delivered')).toContain('ph-package');
        });

        it('should return default circle for unknown phase', () => {
            expect(phaseIcon('nonexistent')).toBe('ph-circle');
        });
    });

    // ─── availabilityColor ──────────────────────────────────────────────────
    describe('availabilityColor', () => {
        it('should return green for available', () => {
            expect(availabilityColor('available')).toContain('green');
        });

        it('should return amber for busy', () => {
            expect(availabilityColor('busy')).toContain('amber');
        });
    });

    // ─── supplierStatusColor ────────────────────────────────────────────────
    describe('supplierStatusColor', () => {
        it('should map all PO statuses for supplier dashboard', () => {
            const statuses = ['generated', 'sent_to_supplier', 'acknowledged', 'shipped', 'delivered', 'cancelled'];
            for (const s of statuses) {
                expect(supplierStatusColor(s)).not.toBe('bg-slate-100 text-slate-600');
            }
        });
    });
});
