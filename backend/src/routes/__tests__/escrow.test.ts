// ============================================================================
// Nammerha — Escrow / Admin Routes Integration Tests (NMR-AUD-004)
// Tests fund release verification, discrepancy flagging, and RBAC
//
// Coverage:
//   1. GET /verifications/pending — list pending verifications
//   2. POST /escrow/release — release escrow funds (admin/auditor only)
//   3. POST /escrow/flag — flag discrepancy (admin/auditor only)
//   4. RBAC verification (admin ✓, auditor ✓, donor ✗, engineer ✗)
//   5. Input validation (missing fields → 400)
//   6. Error handling (not found → 404)
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { UserRole } from '../../types';

// ─── Mock Database BEFORE imports ───────────────────────────────────────────
const mockPoolQuery = vi.fn();
const mockTransaction = vi.fn();
vi.mock('../../config/database', () => ({
    query: (...args: unknown[]) => mockPoolQuery(...args),
    getClient: vi.fn(),
    transaction: (fn: (client: unknown) => Promise<unknown>) => mockTransaction(fn),
    default: { end: vi.fn(), query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

// ─── Mock notification (used by escrow service internally) ──────────────────
vi.mock('../../services/notification.service', () => ({
    createNotification: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock auth middleware ───────────────────────────────────────────────────
let mockAuthUser: { user_id: string; role: UserRole; is_active: boolean } | null = null;

vi.mock('../../middleware/auth.middleware', () => ({
    authMiddleware: (req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (mockAuthUser) {
            req.authUser = mockAuthUser;
            next();
        } else {
            res.status(401).json({ success: false, error: 'Authentication required' });
        }
    },
    requireActive: (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
        next();
    },
}));

// ─── Import AFTER mocks ────────────────────────────────────────────────────
import adminRoutes from '../../routes/admin.routes';

// ─── Express App Factory ───────────────────────────────────────────────────
function createApp(): express.Express {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ success: false, error: err.message });
    });
    return app;
}

// ═══════════════════════════════════════════════════════════════════════════
// Escrow / Admin HTTP Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Admin / Escrow Routes (HTTP Integration)', () => {
    let app: express.Express;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
        // Default: authenticated admin
        mockAuthUser = { user_id: 'admin-uuid-001', role: 'admin', is_active: true };
    });

    // ─── Authentication & Authorization ────────────────────────────────
    describe('RBAC Guards', () => {
        it('should reject unauthenticated requests', async () => {
            mockAuthUser = null;
            const res = await request(app)
                .get('/api/admin/verifications/pending')
                .expect(401);

            expect(res.body.error).toContain('Authentication required');
        });

        it('should reject donor role from all admin endpoints', async () => {
            mockAuthUser = { user_id: 'donor-001', role: 'donor', is_active: true };

            const res = await request(app)
                .get('/api/admin/verifications/pending')
                .expect(403);

            expect(res.body.error).toContain('Access denied');
            // Note: role guard doesn't include the user's role in the error message
        });

        it('should reject engineer role from releasing escrow', async () => {
            mockAuthUser = { user_id: 'eng-001', role: 'engineer', is_active: true };

            const res = await request(app)
                .post('/api/admin/escrow/release')
                .send({ proof_id: 'proof-001', item_id: 'item-001' })
                .expect(403);

            expect(res.body.error).toContain('Access denied');
        });

        it('should reject homeowner from flagging discrepancy', async () => {
            mockAuthUser = { user_id: 'ho-001', role: 'homeowner', is_active: true };

            const res = await request(app)
                .post('/api/admin/escrow/flag')
                .send({ proof_id: 'proof-001', reason: 'Suspicious' })
                .expect(403);

            expect(res.body.error).toContain('Access denied');
        });

        it('should allow auditor to view pending verifications', async () => {
            mockAuthUser = { user_id: 'auditor-001', role: 'auditor', is_active: true };
            // Mock: main query returns empty + COUNT query
            mockPoolQuery
                .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

            const res = await request(app)
                .get('/api/admin/verifications/pending')
                .expect(200);

            expect(res.body.success).toBe(true);
        });
    });

    // ─── GET /api/admin/verifications/pending ───────────────────────────
    describe('GET /api/admin/verifications/pending', () => {
        it('should return pending verification cases', async () => {
            // Mock: main query returns 2 rows + COUNT query
            mockPoolQuery
                .mockResolvedValueOnce({
                    rows: [
                        { proof_id: 'p1', project_id: 'proj-001', status: 'pending_verification' },
                        { proof_id: 'p2', project_id: 'proj-002', status: 'pending_verification' },
                    ],
                    rowCount: 2,
                })
                .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });

            const res = await request(app)
                .get('/api/admin/verifications/pending')
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(2);
            expect(res.body.message).toContain('2 verifications pending');
        });

        it('should return empty list when no pending verifications', async () => {
            // Mock: main query returns empty + COUNT query
            mockPoolQuery
                .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

            const res = await request(app)
                .get('/api/admin/verifications/pending')
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(0);
            expect(res.body.message).toContain('0 verifications');
        });
    });

    // ─── POST /api/admin/escrow/release ─────────────────────────────────
    describe('POST /api/admin/escrow/release', () => {
        it('should return 400 when required fields are missing', async () => {
            const res = await request(app)
                .post('/api/admin/escrow/release')
                .send({ proof_id: 'proof-001' }) // missing item_id
                .expect(400);

            expect(res.body.error).toContain('Missing required fields');
        });

        it('should return 400 with no body', async () => {
            const res = await request(app)
                .post('/api/admin/escrow/release')
                .send({})
                .expect(400);

            expect(res.body.error).toContain('Missing required fields');
        });

        it('should release escrow successfully', async () => {
            const mockClient = {
                query: vi.fn()
                    // 1. proof lookup (FOR UPDATE)
                    .mockResolvedValueOnce({
                        rows: [{
                            proof_id: 'proof-001',
                            item_id: 'item-001',
                            project_id: 'proj-001',
                            verification_status: 'submitted',
                            image_url: 'https://storage/proof.jpg',
                        }],
                        rowCount: 1,
                    })
                    // 2. mark proof as verified
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
                    // 3. release escrow entries
                    .mockResolvedValueOnce({
                        rows: [
                            { transaction_id: 'tx-1', donor_id: 'donor-001', amount_locked: 500000 },
                            { transaction_id: 'tx-2', donor_id: 'donor-002', amount_locked: 1000000 },
                        ],
                        rowCount: 2,
                    })
                    // 4. update BOQ item status
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
                    // 5. get project title
                    .mockResolvedValueOnce({ rows: [{ title: 'Aleppo School Reconstruction' }], rowCount: 1 })
                    // 6. get BOQ material name
                    .mockResolvedValueOnce({ rows: [{ material_name: 'Steel Rebar' }], rowCount: 1 }),
            };
            mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient));

            const res = await request(app)
                .post('/api/admin/escrow/release')
                .send({ proof_id: 'proof-001', item_id: 'item-001' })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.released_count).toBe(2);
            expect(res.body.data.total_released).toBe(1500000);
            expect(res.body.message).toContain('Released');
        });

        it('should return 404 when proof not found', async () => {
            const mockClient = {
                query: vi.fn()
                    // proof lookup returns empty
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
            };
            mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient));

            const res = await request(app)
                .post('/api/admin/escrow/release')
                .send({ proof_id: 'proof-nonexistent', item_id: 'item-001' })
                .expect(404);

            expect(res.body.error).toContain('not found');
        });

        it('should allow auditor to release escrow', async () => {
            mockAuthUser = { user_id: 'auditor-001', role: 'auditor', is_active: true };

            const mockClient = {
                query: vi.fn()
                    .mockResolvedValueOnce({
                        rows: [{
                            proof_id: 'proof-001',
                            item_id: 'item-001',
                            project_id: 'proj-001',
                            verification_status: 'submitted',
                            image_url: 'https://storage/proof.jpg',
                        }],
                        rowCount: 1,
                    })
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no escrow entries
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
                    .mockResolvedValueOnce({ rows: [{ title: 'Test Project' }], rowCount: 1 })
                    .mockResolvedValueOnce({ rows: [{ material_name: 'Cement' }], rowCount: 1 }),
            };
            mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient));

            const res = await request(app)
                .post('/api/admin/escrow/release')
                .send({ proof_id: 'proof-001', item_id: 'item-001' })
                .expect(200);

            expect(res.body.success).toBe(true);
        });
    });

    // ─── POST /api/admin/escrow/flag ────────────────────────────────────
    describe('POST /api/admin/escrow/flag', () => {
        it('should return 400 when required fields are missing', async () => {
            const res = await request(app)
                .post('/api/admin/escrow/flag')
                .send({ proof_id: 'proof-001' }) // missing reason
                .expect(400);

            expect(res.body.error).toContain('Missing required fields');
        });

        it('should flag discrepancy successfully', async () => {
            const mockClient = {
                query: vi.fn()
                    // 1. update proof and return
                    .mockResolvedValueOnce({
                        rows: [{
                            proof_id: 'proof-001',
                            project_id: 'proj-001',
                            item_id: 'item-001',
                            engineer_id: 'eng-001',
                            verification_status: 'rejected',
                        }],
                        rowCount: 1,
                    }),
            };
            mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient));

            const res = await request(app)
                .post('/api/admin/escrow/flag')
                .send({
                    proof_id: 'proof-001',
                    reason: 'Material quantity mismatch: claimed 50 bags, GPS evidence shows 30',
                })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Discrepancy flagged');
        });

        it('should return error when proof not found', async () => {
            const mockClient = {
                query: vi.fn()
                    // proof not found → empty result
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
            };
            mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient));

            const res = await request(app)
                .post('/api/admin/escrow/flag')
                .send({ proof_id: 'nonexistent', reason: 'Testing' })
                .expect(404);

            expect(res.body.success).toBe(false);
        });
    });
});
