// ============================================================================
// Nammerha — Donor Service Unit Tests (IMP-001)
// ============================================================================
// Covers: getMyStats, getMyDonations, getMyImpact, getMarketplace,
//         getProjectFunding, getMyProofGallery, getMyImpactTimeline
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Database ──────────────────────────────────────────────────────────
const mockQuery = vi.fn();

vi.mock('../../config/database', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    default: { query: (...args: unknown[]) => mockQuery(...args), end: vi.fn() },
}));

import {
    getMyStats,
    getMyDonations,
    getMyImpact,
    getMarketplace,
    getProjectFunding,
    getMyProofGallery,
    getMyImpactTimeline,
} from '../donor.service';

// ═════════════════════════════════════════════════════════════════════════════
describe('Donor Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockReset();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    // ─── Dashboard KPIs ─────────────────────────────────────────────────────
    describe('getMyStats', () => {
        it('should return zero-state for donor with no donations', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    total_donated: '0',
                    items_funded: '0',
                    projects_supported: '0',
                    escrow_locked: '0',
                    escrow_released: '0',
                    projects_completed: '0',
                }],
            });

            const stats = await getMyStats('donor-empty');

            expect(stats.total_donated).toBe(0);
            expect(stats.projects_supported).toBe(0);
            expect(stats.impact_score).toBe(0);
        });

        it('should compute impact_score as (completed / supported) × 100', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    total_donated: '500000',
                    items_funded: '15',
                    projects_supported: '4',
                    escrow_locked: '150000',
                    escrow_released: '350000',
                    projects_completed: '3',
                }],
            });

            const stats = await getMyStats('donor-active');

            expect(stats.total_donated).toBe(500000);
            expect(stats.impact_score).toBe(75); // 3/4 * 100
            expect(stats.escrow_locked).toBe(150000);
            expect(stats.escrow_released).toBe(350000);
        });

        it('should handle null row gracefully', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{}] });

            const stats = await getMyStats('donor-null');

            expect(stats.total_donated).toBe(0);
            expect(stats.impact_score).toBe(0);
        });
    });

    // ─── Donation History ───────────────────────────────────────────────────
    describe('getMyDonations', () => {
        it('should return donations ordered by locked_at DESC', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { escrow_id: 'e1', amount_locked: 5000, status: 'locked' },
                    { escrow_id: 'e2', amount_locked: 3000, status: 'released' },
                ],
            });

            const donations = await getMyDonations('donor-1');

            expect(donations).toHaveLength(2);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY el.locked_at DESC'),
                ['donor-1', 50] // default limit
            );
        });

        it('should pass custom limit', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getMyDonations('donor-1', 10);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String),
                ['donor-1', 10]
            );
        });
    });

    // ─── Impact (My Funded Projects) ────────────────────────────────────────
    describe('getMyImpact', () => {
        it('should return funded projects with contribution breakdown', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    project_id: 'p1',
                    title: 'Aleppo School',
                    my_total_donated: 25000,
                    funded_percentage: 62.5,
                    items_i_funded: 3,
                }],
            });

            const impact = await getMyImpact('donor-1');

            expect(impact).toHaveLength(1);
            expect(impact[0]?.my_total_donated).toBe(25000);
        });

        it('should return empty for donor with no funded projects', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const impact = await getMyImpact('donor-new');

            expect(impact).toHaveLength(0);
        });
    });

    // ─── Marketplace Browse ─────────────────────────────────────────────────
    describe('getMarketplace', () => {
        it('should return only published projects', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { project_id: 'p1', status: 'published', funded_percentage: 45.2 },
                ],
            });

            const projects = await getMarketplace();

            expect(projects).toHaveLength(1);
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain("p.status = 'published'");
        });
    });

    // ─── Project-Level Funding ──────────────────────────────────────────────
    describe('getProjectFunding', () => {
        it('should return BOQ items with my contribution and total funded', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    item_id: 'i1',
                    material_name: 'Cement',
                    my_contribution: 5000,
                    total_funded: 15000,
                    funding_percentage: 75,
                    supplier_name: 'BuildCo',
                }],
            });

            const funding = await getProjectFunding('donor-1', 'project-1');

            expect(funding).toHaveLength(1);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('WHERE b.project_id = $2'),
                ['donor-1', 'project-1']
            );
        });
    });

    // ─── Proof Gallery ──────────────────────────────────────────────────────
    describe('getMyProofGallery', () => {
        it('should return GPS-verified proof photos', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    proof_id: 'pf-1',
                    project_title: 'Damascus Clinic',
                    photo_url: 'https://storage.nammerha.com/proof/img.jpg',
                    gps_lat: 33.5138,
                    gps_lng: 36.2765,
                }],
            });

            const proofs = await getMyProofGallery('donor-1');

            expect(proofs).toHaveLength(1);
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('dl.photo_url IS NOT NULL');
        });

        it('should limit to 50 results', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getMyProofGallery('donor-1');

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('LIMIT 50');
        });
    });

    // ─── Impact Timeline (ENH-1) ────────────────────────────────────────────
    describe('getMyImpactTimeline', () => {
        it('should return chronological events across all 5 types', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { event_type: 'donated', event_date: '2026-01-01', amount: 5000 },
                    { event_type: 'delivered', event_date: '2026-01-15', amount: 5000 },
                    { event_type: 'verified', event_date: '2026-01-20', amount: 5000 },
                    { event_type: 'released', event_date: '2026-02-01', amount: 5000 },
                ],
            });

            const timeline = await getMyImpactTimeline('donor-1');

            expect(timeline).toHaveLength(4);
        });

        it('should pass default limit of 100', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getMyImpactTimeline('donor-1');

            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String),
                ['donor-1', 100]
            );
        });

        it('should pass custom limit', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getMyImpactTimeline('donor-1', 25);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String),
                ['donor-1', 25]
            );
        });

        it('should include gift metadata in UNION query', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getMyImpactTimeline('donor-1');

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('gift_recipient_name');
            expect(sql).toContain('donation_intent');
        });
    });
});
