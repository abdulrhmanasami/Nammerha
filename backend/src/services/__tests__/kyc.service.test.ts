// ============================================================================
// Nammerha — KYC Service Unit Tests (IMP-001)
// ============================================================================
// KYC verification queue, stats, and admin review workflow.
// GAP-P3-009: Validates live DB queries replace hardcoded queue.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../config/database', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    default: { query: (...args: unknown[]) => mockQuery(...args), end: vi.fn() },
}));

import { getKycQueue, getKycStats, updateKycStatus } from '../kyc.service';

describe('KYC Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockReset();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    describe('getKycQueue', () => {
        it('should return pending/submitted entries by default', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ count: '3' }] })
                .mockResolvedValueOnce({
                    rows: [
                        { user_id: 'u1', kyc_verification_status: 'pending' },
                        { user_id: 'u2', kyc_verification_status: 'submitted' },
                    ],
                });

            const { entries, total } = await getKycQueue();

            expect(total).toBe(3);
            expect(entries).toHaveLength(2);
            const countSql = mockQuery.mock.calls[0]?.[0] as string;
            expect(countSql).toContain("IN ('pending', 'submitted')");
        });

        it('should filter by specific status when provided', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ count: '5' }] })
                .mockResolvedValueOnce({ rows: [] });

            await getKycQueue('verified' as never);

            const countSql = mockQuery.mock.calls[0]?.[0] as string;
            expect(countSql).toContain('kyc_verification_status = $1');
        });

        it('should enforce max limit of 100', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [] });

            await getKycQueue(undefined, 999);

            const params = mockQuery.mock.calls[1]?.[1] as unknown[];
            expect(params?.[0]).toBe(100); // clamped
        });
    });

    describe('getKycStats', () => {
        it('should aggregate counts excluding admin/auditor roles', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ pending: '12', verified: '45', rejected: '3', total: '60' }],
            });

            const stats = await getKycStats();

            expect(stats.pending).toBe(12);
            expect(stats.verified).toBe(45);
            expect(stats.rejected).toBe(3);
            expect(stats.total).toBe(60);
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain("role NOT IN ('admin', 'auditor')");
        });

        it('should handle null row gracefully', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{}] });

            const stats = await getKycStats();

            expect(stats.pending).toBe(0);
            expect(stats.total).toBe(0);
        });
    });

    describe('updateKycStatus', () => {
        it('should verify a pending user', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ user_id: 'u1', full_name: 'Ahmad', kyc_verification_status: 'verified' }],
            });

            const result = await updateKycStatus('u1', 'verified', 'admin-1');

            expect(result.kyc_verification_status).toBe('verified');
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('NOW()'); // kyc_verified_at = NOW()
        });

        it('should reject a user and set kyc_verified_at to NULL', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ user_id: 'u2', kyc_verification_status: 'rejected' }],
            });

            const result = await updateKycStatus('u2', 'rejected', 'admin-1', 'Documents unclear');

            expect(result.kyc_verification_status).toBe('rejected');
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('NULL'); // kyc_verified_at = NULL on rejection
        });

        it('should throw when user_id is empty', async () => {
            await expect(updateKycStatus('', 'verified', 'admin-1'))
                .rejects.toThrow('user_id is required');
        });

        it('should throw when decision is invalid', async () => {
            await expect(updateKycStatus('u1', 'hacked' as never, 'admin-1'))
                .rejects.toThrow('decision must be');
        });

        it('should throw when user not found or already processed', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await expect(updateKycStatus('nonexistent', 'verified', 'admin-1'))
                .rejects.toThrow('not found or KYC status already processed');
        });

        it('should only allow update from pending/submitted states', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await updateKycStatus('u1', 'verified', 'admin-1').catch(() => { /* expected */ });

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain("kyc_verification_status IN ('pending', 'submitted')");
        });
    });
});
