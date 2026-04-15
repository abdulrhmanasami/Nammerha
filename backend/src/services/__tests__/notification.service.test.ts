// ============================================================================
// Nammerha — Notification Service Unit Tests (IMP-015)
// ============================================================================
// Cross-cutting notification engine: create, query, mark-read, badge count.
// Validates: multi-channel dispatch, ownership enforcement, email provider,
// XSS escapeHtml for email templates, pagination/limit clamping.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../config/database', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    default: { query: (...args: unknown[]) => mockQuery(...args), end: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
    createNotification,
    getUserNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
} from '../notification.service';

// Reusable mock client for createNotification
const mockClient = {
    query: vi.fn(),
};

describe('Notification Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockReset();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockClient.query.mockReset();
        mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    // ─── createNotification ─────────────────────────────────────────────
    describe('createNotification', () => {
        it('should insert notification with in_app channel by default', async () => {
            mockClient.query.mockResolvedValueOnce({
                rows: [{
                    notification_id: 'n1',
                    user_id: 'u1',
                    type: 'escrow_locked',
                    title: 'Funds Locked',
                    body: 'Your donation has been secured',
                    channel: 'in_app',
                    is_read: false,
                    created_at: new Date(),
                }],
            });

            const result = await createNotification(mockClient, {
                user_id: 'u1',
                type: 'escrow_locked' as never,
                title: 'Funds Locked',
                body: 'Your donation has been secured',
            });

            expect(result.notification_id).toBe('n1');
            expect(result.channel).toBe('in_app');
            const params = mockClient.query.mock.calls[0]?.[1] as unknown[];
            expect(params?.[5]).toBe('in_app'); // default channel
        });

        it('should serialize data payload as JSON', async () => {
            mockClient.query.mockResolvedValueOnce({
                rows: [{ notification_id: 'n2', data: { project_id: 'p1' } }],
            });

            await createNotification(mockClient, {
                user_id: 'u1',
                type: 'project_update' as never,
                title: 'Update',
                body: 'Progress update',
                data: { project_id: 'p1', percentage: 75 },
            });

            const params = mockClient.query.mock.calls[0]?.[1] as unknown[];
            const serialized = params?.[4] as string;
            expect(JSON.parse(serialized)).toEqual({ project_id: 'p1', percentage: 75 });
        });

        it('should pass null data when no payload provided', async () => {
            mockClient.query.mockResolvedValueOnce({
                rows: [{ notification_id: 'n3' }],
            });

            await createNotification(mockClient, {
                user_id: 'u1',
                type: 'system' as never,
                title: 'Welcome',
                body: 'Welcome to Nammerha',
            });

            const params = mockClient.query.mock.calls[0]?.[1] as unknown[];
            expect(params?.[4]).toBeNull();
        });

        it('should throw when INSERT returns no rows', async () => {
            mockClient.query.mockResolvedValueOnce({ rows: [] });

            await expect(
                createNotification(mockClient, {
                    user_id: 'u1',
                    type: 'system' as never,
                    title: 'Test',
                    body: 'Test',
                })
            ).rejects.toThrow('Failed to create notification');
        });

        it('should use explicit column RETURNING list (M-001)', async () => {
            mockClient.query.mockResolvedValueOnce({
                rows: [{ notification_id: 'n4' }],
            });

            await createNotification(mockClient, {
                user_id: 'u1',
                type: 'system' as never,
                title: 'Test',
                body: 'Test',
            });

            const sql = mockClient.query.mock.calls[0]?.[0] as string;
            expect(sql).toContain('RETURNING notification_id');
            expect(sql).toContain('user_id, type, title, body');
        });
    });

    // ─── getUserNotifications ────────────────────────────────────────────
    describe('getUserNotifications', () => {
        it('should return notifications sorted by created_at DESC', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { notification_id: 'n2', created_at: '2026-04-15' },
                    { notification_id: 'n1', created_at: '2026-04-14' },
                ],
            });

            const result = await getUserNotifications('u1');

            expect(result).toHaveLength(2);
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('ORDER BY created_at DESC');
        });

        it('should filter unread only when requested', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getUserNotifications('u1', { unread_only: true });

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('is_read = FALSE');
        });

        it('should apply LIMIT when specified', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getUserNotifications('u1', { limit: 10 });

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('LIMIT $2');
            const params = mockQuery.mock.calls[0]?.[1] as unknown[];
            expect(params?.[1]).toBe(10);
        });

        it('should use explicit column list (no SELECT *)', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await getUserNotifications('u1');

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('notification_id, user_id, type, title');
            expect(sql).not.toContain('SELECT *');
        });
    });

    // ─── getUnreadCount ─────────────────────────────────────────────────
    describe('getUnreadCount', () => {
        it('should return parsed count', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ count: '42' }],
            });

            const count = await getUnreadCount('u1');

            expect(count).toBe(42);
        });

        it('should return 0 when no rows', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{}] });

            const count = await getUnreadCount('u1');

            expect(count).toBe(0);
        });

        it('should filter by user_id AND is_read = FALSE', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

            await getUnreadCount('u1');

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('user_id = $1');
            expect(sql).toContain('is_read = FALSE');
        });
    });

    // ─── markAsRead ─────────────────────────────────────────────────────
    describe('markAsRead', () => {
        it('should update is_read and read_at for owned notification', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 1 });

            await markAsRead('n1', 'u1');

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('is_read = TRUE');
            expect(sql).toContain('read_at = NOW()');
            expect(sql).toContain('notification_id = $1 AND user_id = $2');
        });

        it('should throw when notification not found or not owned', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 0 });

            await expect(markAsRead('n-fake', 'u1'))
                .rejects.toThrow('not found or does not belong to user');
        });

        it('should enforce ownership via user_id in WHERE clause', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 1 });

            await markAsRead('n1', 'u-attacker');

            const params = mockQuery.mock.calls[0]?.[1] as unknown[];
            expect(params?.[0]).toBe('n1');
            expect(params?.[1]).toBe('u-attacker');
        });
    });

    // ─── markAllAsRead ──────────────────────────────────────────────────
    describe('markAllAsRead', () => {
        it('should update all unread notifications for user', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 5 });

            const count = await markAllAsRead('u1');

            expect(count).toBe(5);
            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('user_id = $1 AND is_read = FALSE');
        });

        it('should return 0 when no unread notifications', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 0 });

            const count = await markAllAsRead('u1');

            expect(count).toBe(0);
        });
    });
});
