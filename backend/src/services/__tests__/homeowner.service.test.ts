// ============================================================================
// Nammerha — Homeowner Service Unit Tests (IMP-001)
// ============================================================================
// Dual-mode: Reconstruction + Quick Repair (Thumbtack)
// Covers: getMyProjects, getMyStats, getProjectBids, createServiceRequest,
//         getMyServiceRequests, getMyApprovals, getMyEscrowSummary,
//         cancelServiceRequest
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Database ──────────────────────────────────────────────────────────
const mockQuery = vi.fn();
const mockTransactionFn = vi.fn();

vi.mock('../../config/database', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: (fn: (client: unknown) => unknown) => mockTransactionFn(fn),
    default: { query: (...args: unknown[]) => mockQuery(...args), end: vi.fn() },
}));

import {
    getMyProjects,
    getMyStats,
    getProjectBids,
    createServiceRequest,
    getMyServiceRequests,
    getMyApprovals,
    getMyEscrowSummary,
    cancelServiceRequest,
} from '../homeowner.service';

function setupTransaction() {
    const clientQuery = vi.fn();
    mockTransactionFn.mockImplementation(async (fn: (client: { query: typeof clientQuery }) => unknown) => {
        return fn({ query: clientQuery });
    });
    return clientQuery;
}

// ═════════════════════════════════════════════════════════════════════════════
describe('Homeowner Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockReset();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockTransactionFn.mockReset();
    });

    // ─── My Projects ────────────────────────────────────────────────────────
    describe('getMyProjects', () => {
        it('should return projects with engineer/contractor names and bid counts', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    project_id: 'p1',
                    title: 'Damascus House',
                    engineer_name: 'Eng. Ahmad',
                    contractor_name: null,
                    bid_count: 3,
                    total_boq_cost: 150000,
                }],
            });

            const projects = await getMyProjects('homeowner-1');

            expect(projects).toHaveLength(1);
            expect(projects[0]?.bid_count).toBe(3);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('WHERE p.homeowner_id = $1'),
                ['homeowner-1']
            );
        });
    });

    // ─── Dashboard KPIs ─────────────────────────────────────────────────────
    describe('getMyStats', () => {
        it('should return aggregated stats from a single consolidated query', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    active: '2',
                    completed: '1',
                    total_bids: '5',
                    pending_approvals: '1',
                    active_service_requests: '0',
                    total_invested: '250000',
                }],
            });

            const stats = await getMyStats('homeowner-1');

            expect(stats.active_projects).toBe(2);
            expect(stats.completed_projects).toBe(1);
            expect(stats.total_bids_received).toBe(5);
            expect(stats.pending_approvals).toBe(1);
            expect(stats.total_invested).toBe(250000);
        });

        it('should handle null/missing fields gracefully', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{}] });

            const stats = await getMyStats('homeowner-empty');

            expect(stats.active_projects).toBe(0);
            expect(stats.total_invested).toBe(0);
        });

        // P2-NEW-002 FIX validation: verify it's a single query, not 4
        it('should execute exactly one DB query (not 4 sequential queries)', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ active: '0', completed: '0', total_bids: '0', pending_approvals: '0', active_service_requests: '0', total_invested: '0' }],
            });

            await getMyStats('homeowner-perf');

            expect(mockQuery).toHaveBeenCalledTimes(1);
        });
    });

    // ─── Bid Comparison ─────────────────────────────────────────────────────
    describe('getProjectBids', () => {
        it('should throw when homeowner does not own the project', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ cnt: '0' }],
            });

            await expect(getProjectBids('not-owner', 'project-1'))
                .rejects.toThrow('not the owner');
        });

        it('should return bids with bidder scores for project owner', async () => {
            // Ownership check
            mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '1' }] });
            // Bids query
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { bid_id: 'b1', bidder_name: 'Eng. Hassan', proposed_cost: 80000, bidder_score: 92 },
                    { bid_id: 'b2', bidder_name: 'Cont. Ahmed', proposed_cost: 75000, bidder_score: 78 },
                ],
            });

            const bids = await getProjectBids('homeowner-1', 'project-1');

            expect(bids).toHaveLength(2);
        });
    });

    // ─── Create Service Request (Thumbtack) ─────────────────────────────────
    describe('createServiceRequest', () => {
        it('should create request with GPS coordinates using PostGIS', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ request_id: 'sr-1' }],
            });

            const result = await createServiceRequest('homeowner-1', {
                trade_needed: 'plumber' as never,
                title: 'Leaky faucet',
                urgency: 'high' as never,
                gps_lat: 33.5138,
                gps_lng: 36.2765,
            });

            expect(result.request_id).toBe('sr-1');
            expect(result.status).toBe('open');
            // Verify PostGIS parameterized query (CRT-NEW-001 FIX)
            const params = mockQuery.mock.calls[0]?.[1] as unknown[];
            expect(params?.[8]).toBe(true); // hasGps
        });

        it('should create request without GPS (hasGps = false)', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ request_id: 'sr-2' }],
            });

            const result = await createServiceRequest('homeowner-1', {
                trade_needed: 'electrician' as never,
                title: 'Power outage',
            });

            expect(result.request_id).toBe('sr-2');
            const params = mockQuery.mock.calls[0]?.[1] as unknown[];
            expect(params?.[8]).toBe(false); // hasGps
        });

        it('should throw when INSERT returns no rows', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await expect(createServiceRequest('homeowner-1', {
                trade_needed: 'carpenter' as never,
                title: 'Broken door',
            })).rejects.toThrow('Failed to create service request');
        });
    });

    // ─── My Service Requests ────────────────────────────────────────────────
    describe('getMyServiceRequests', () => {
        it('should return requests with matched tradesperson info', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    request_id: 'sr-1',
                    trade_needed: 'plumber',
                    status: 'matched',
                    tradesperson_name: 'Ali Hassan',
                }],
            });

            const requests = await getMyServiceRequests('homeowner-1');

            expect(requests).toHaveLength(1);
            expect(requests[0]?.tradesperson_name).toBe('Ali Hassan');
        });
    });

    // ─── Pending Approvals ──────────────────────────────────────────────────
    describe('getMyApprovals', () => {
        it('should return all approvals without filter', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ approval_id: 'a1', status: 'pending' }],
            });

            const approvals = await getMyApprovals('homeowner-1');

            expect(approvals).toHaveLength(1);
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).not.toContain('pa.status = $2');
        });

        it('should apply status filter when provided', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getMyApprovals('homeowner-1', 'pending');

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('pa.status = $2');
            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String),
                ['homeowner-1', 'pending']
            );
        });
    });

    // ─── Escrow Summary ─────────────────────────────────────────────────────
    describe('getMyEscrowSummary', () => {
        it('should compute held_in_escrow as deposited - released', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    deposited: '100000',
                    released: '60000',
                    project_count: '3',
                }],
            });

            const summary = await getMyEscrowSummary('homeowner-1');

            expect(summary.total_deposited).toBe(100000);
            expect(summary.total_released).toBe(60000);
            expect(summary.held_in_escrow).toBe(40000); // 100000 - 60000
            expect(summary.projects_with_escrow).toBe(3);
        });

        it('should handle zero-state', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{}] });

            const summary = await getMyEscrowSummary('homeowner-new');

            expect(summary.total_deposited).toBe(0);
            expect(summary.held_in_escrow).toBe(0);
        });
    });

    // ─── Cancel Service Request ─────────────────────────────────────────────
    describe('cancelServiceRequest', () => {
        it('should cancel an open request', async () => {
            const clientQuery = setupTransaction();

            clientQuery.mockResolvedValueOnce({
                rows: [{ status: 'open', homeowner_id: 'homeowner-1' }],
            });
            clientQuery.mockResolvedValueOnce({ rows: [] });

            const result = await cancelServiceRequest('homeowner-1', 'sr-1');

            expect(result.status).toBe('cancelled');
            expect(clientQuery).toHaveBeenCalledWith(
                expect.stringContaining("SET status = 'cancelled'"),
                ['sr-1']
            );
        });

        it('should cancel a matched request', async () => {
            const clientQuery = setupTransaction();

            clientQuery.mockResolvedValueOnce({
                rows: [{ status: 'matched', homeowner_id: 'homeowner-1' }],
            });
            clientQuery.mockResolvedValueOnce({ rows: [] });

            const result = await cancelServiceRequest('homeowner-1', 'sr-2');

            expect(result.status).toBe('cancelled');
        });

        it('should throw when request not found', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({ rows: [] });

            await expect(cancelServiceRequest('homeowner-1', 'nonexistent'))
                .rejects.toThrow('Service request not found');
        });

        it('should throw when homeowner does not own the request', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ status: 'open', homeowner_id: 'other-owner' }],
            });

            await expect(cancelServiceRequest('homeowner-1', 'sr-3'))
                .rejects.toThrow('not the owner');
        });

        it('should prevent cancelling in_progress requests (TOCTOU protection)', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ status: 'in_progress', homeowner_id: 'homeowner-1' }],
            });

            await expect(cancelServiceRequest('homeowner-1', 'sr-4'))
                .rejects.toThrow('Can only cancel open or matched');
        });

        it('should use FOR UPDATE row lock for TOCTOU prevention', async () => {
            const clientQuery = setupTransaction();
            clientQuery.mockResolvedValueOnce({
                rows: [{ status: 'open', homeowner_id: 'homeowner-1' }],
            });
            clientQuery.mockResolvedValueOnce({ rows: [] });

            await cancelServiceRequest('homeowner-1', 'sr-5');

            const sql = clientQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('FOR UPDATE');
        });
    });
});
