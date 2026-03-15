// ============================================================================
// Impact Service — Unit Tests
// Validates the impact message generation and donor notification system.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Dependencies ─────────────────────────────────────────────────────
const mockQuery = vi.fn();
vi.mock('../../config/database', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('../../utils/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

// Import AFTER mocks are set up
import {
    generateImpactMessage,
    notifyAllProjectDonors,
    getDonorMessages,
    getUnreadCount,
    markAsRead,
    markAllRead,
} from '../impact.service';

// ─── Test Data ──────────────────────────────────────────────────────────────
const MOCK_DONOR_ID = 'donor-001';
const MOCK_PROJECT_ID = 'OCDS-SYR-00001';

const MOCK_IMPACT_MESSAGE = {
    message_id: 'msg-001',
    donor_id: MOCK_DONOR_ID,
    project_id: MOCK_PROJECT_ID,
    event_type: 'donation_received',
    title_en: 'Thank You for Your Donation! 💰',
    title_ar: 'شكراً لتبرعك! 💰',
    body_en: 'Your generous contribution...',
    body_ar: 'تم تسجيل تبرعك...',
    metadata: '{}',
    read_at: null,
    created_at: new Date(),
};

describe('Impact Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── generateImpactMessage ──────────────────────────────────────────
    describe('generateImpactMessage()', () => {
        it('should insert a bilingual impact message into the database', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [MOCK_IMPACT_MESSAGE] });

            const result = await generateImpactMessage(
                'donation_received',
                MOCK_DONOR_ID,
                MOCK_PROJECT_ID,
                { project_title: 'Test Project', amount: 50000 },
            );

            expect(result).toBeDefined();
            expect(mockQuery).toHaveBeenCalledTimes(1);

            // Verify the SQL includes RETURNING and inserts into impact_messages
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('INSERT INTO impact_messages');
            expect(sql).toContain('RETURNING');
        });

        it('should format amount from cents to dollars in template', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [MOCK_IMPACT_MESSAGE] });

            await generateImpactMessage(
                'donation_received',
                MOCK_DONOR_ID,
                MOCK_PROJECT_ID,
                { project_title: 'مشروع تجريبي', amount: 150000 },
            );

            // Verify the interpolated values are passed to the query
            const params = mockQuery.mock.calls[0]?.[1] as unknown[];
            // title_en (index 3) should contain the formatted amount
            const titleEn = params?.[3] as string;
            expect(titleEn).toContain('Thank You');

            // body_en (index 5) should contain $1,500 (150000 cents = $1,500)
            const bodyEn = params?.[5] as string;
            expect(bodyEn).toContain('1,500');
        });
    });

    // ─── notifyAllProjectDonors ─────────────────────────────────────────
    // P0-FIX REGRESSION TEST: This test ensures the escrow_ledger query
    // uses 'payment_status' (the actual column name), not 'status'.
    describe('notifyAllProjectDonors()', () => {
        it('should query escrow_ledger using payment_status column (P0 bug fix)', async () => {
            // First call: find donors
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { donor_id: 'donor-001', total_donated: '50000' },
                    { donor_id: 'donor-002', total_donated: '30000' },
                ],
            });
            // Subsequent calls: generateImpactMessage for each donor
            mockQuery.mockResolvedValue({ rows: [MOCK_IMPACT_MESSAGE] });

            await notifyAllProjectDonors(
                'construction_started',
                MOCK_PROJECT_ID,
                { project_title: 'Test Project' },
            );

            // CRITICAL ASSERTION: The SQL must use 'payment_status', NOT 'status'
            const donorQuerySql = mockQuery.mock.calls[0]?.[0] as string;
            expect(donorQuerySql).toContain('payment_status');
            expect(donorQuerySql).not.toContain('AND status IN');
        });

        it('should generate messages for all unique donors', async () => {
            mockQuery
                .mockResolvedValueOnce({
                    rows: [
                        { donor_id: 'donor-A', total_donated: '10000' },
                        { donor_id: 'donor-B', total_donated: '20000' },
                        { donor_id: 'donor-C', total_donated: '30000' },
                    ],
                })
                .mockResolvedValue({ rows: [MOCK_IMPACT_MESSAGE] });

            const count = await notifyAllProjectDonors(
                'milestone_completed',
                MOCK_PROJECT_ID,
                { project_title: 'مشروع', milestone: 'أساسات', progress: '25' },
            );

            // 3 donors = 3 messages
            expect(count).toBe(3);
            // 1 donor query + 3 insert calls
            expect(mockQuery).toHaveBeenCalledTimes(4);
        });

        it('should return 0 when no donors found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const count = await notifyAllProjectDonors(
                'project_completed',
                MOCK_PROJECT_ID,
                { project_title: 'Test' },
            );

            expect(count).toBe(0);
            expect(mockQuery).toHaveBeenCalledTimes(1);
        });

        it('should continue processing remaining donors if one fails', async () => {
            mockQuery
                .mockResolvedValueOnce({
                    rows: [
                        { donor_id: 'donor-A', total_donated: '10000' },
                        { donor_id: 'donor-B', total_donated: '20000' },
                    ],
                })
                // First donor insert fails
                .mockRejectedValueOnce(new Error('DB connection lost'))
                // Second donor insert succeeds
                .mockResolvedValueOnce({ rows: [MOCK_IMPACT_MESSAGE] });

            const count = await notifyAllProjectDonors(
                'construction_started',
                MOCK_PROJECT_ID,
                { project_title: 'Test' },
            );

            // Only 1 succeeded
            expect(count).toBe(1);
        });
    });

    // ─── getDonorMessages ───────────────────────────────────────────────
    describe('getDonorMessages()', () => {
        it('should return paginated messages for a donor', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [MOCK_IMPACT_MESSAGE, { ...MOCK_IMPACT_MESSAGE, message_id: 'msg-002' }],
            });

            const messages = await getDonorMessages(MOCK_DONOR_ID, { limit: 10, offset: 0 });

            expect(messages).toHaveLength(2);
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('ORDER BY created_at DESC');
            expect(sql).toContain('LIMIT');
        });

        it('should add unread filter when unreadOnly is true', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getDonorMessages(MOCK_DONOR_ID, { unreadOnly: true });

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('AND read_at IS NULL');
        });
    });

    // ─── getUnreadCount ─────────────────────────────────────────────────
    describe('getUnreadCount()', () => {
        it('should return the unread message count', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }] });

            const count = await getUnreadCount(MOCK_DONOR_ID);

            expect(count).toBe(7);
        });

        it('should return 0 when no unread messages', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

            const count = await getUnreadCount(MOCK_DONOR_ID);

            expect(count).toBe(0);
        });
    });

    // ─── markAsRead / markAllRead ────────────────────────────────────────
    describe('markAsRead()', () => {
        it('should return true when a message is marked as read', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 1 });

            const result = await markAsRead('msg-001', MOCK_DONOR_ID);

            expect(result).toBe(true);
        });

        it('should return false when message not found or already read', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 0 });

            const result = await markAsRead('msg-nonexistent', MOCK_DONOR_ID);

            expect(result).toBe(false);
        });
    });

    describe('markAllRead()', () => {
        it('should return count of messages marked as read', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 5 });

            const count = await markAllRead(MOCK_DONOR_ID);

            expect(count).toBe(5);
        });
    });
});
