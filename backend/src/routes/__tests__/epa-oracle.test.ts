// ============================================================================
// Nammerha — EPA Oracle Integration Tests (NMR-AUD-004)
// Tests FIDIC 13.8 formula (pure unit tests) + HTTP route integration
//
// Coverage:
//   1. calculateFIDIC() pure math: valid inputs, constraint violations, edge cases
//   2. POST /prices — Oracle CRUD with role guards
//   3. POST /epa/calculate — FIDIC calculation via route
//   4. POST /epa/approve — EPA approval workflow
//   5. GET /epa/history, /epa/alerts — read endpoints
//   6. RBAC verification (admin/auditor ✓, donor ✗)
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { AuthUser } from '../../types';

// ─── Mock Database BEFORE importing anything that uses it ───────────────────
const mockQuery = vi.fn();
vi.mock('../../config/database', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    getClient: vi.fn(),
    transaction: vi.fn(),
    default: { end: vi.fn(), query: (...args: unknown[]) => mockQuery(...args) },
}));

// ─── Mock auth middleware ───────────────────────────────────────────────────
let mockAuthUser: AuthUser | null = null;

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
import oracleRoutes from '../../routes/epa-oracle.routes';
import { calculateFIDIC, type FIDICParams } from '../../services/epa-oracle.service';

// ─── Express App Factory ───────────────────────────────────────────────────
function createApp(): express.Express {
    const app = express();
    app.use(express.json());
    app.use('/api/oracle', oracleRoutes);
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ success: false, error: err.message });
    });
    return app;
}

// ─── FIDIC Helper: Valid baseline params ────────────────────────────────────
const VALID_FIDIC_PARAMS: FIDICParams = {
    a: 0.10, b: 0.30, c: 0.20, d: 0.40, // sum = 1.0
    Ln: 110, Lo: 100,  // labor +10%
    En: 105, Eo: 100,  // equipment +5%
    Mn: 120, Mo: 100,  // materials +20%
};

// ═══════════════════════════════════════════════════════════════════════════
// Section 1: calculateFIDIC() — Pure Function Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateFIDIC() — FIDIC 13.8 Formula (Pure Unit)', () => {
    it('should compute correct Pn for known inputs', () => {
        // Pn = 0.10 + 0.30*(110/100) + 0.20*(105/100) + 0.40*(120/100)
        //    = 0.10 + 0.30*1.10     + 0.20*1.05       + 0.40*1.20
        //    = 0.10 + 0.33          + 0.21             + 0.48
        //    = 1.12
        const Pn = calculateFIDIC(VALID_FIDIC_PARAMS);
        expect(Pn).toBe(1.12);
    });

    it('should return 1.0 when current indices equal base indices (no change)', () => {
        const noChange: FIDICParams = {
            a: 0.10, b: 0.30, c: 0.20, d: 0.40,
            Ln: 100, Lo: 100, En: 100, Eo: 100, Mn: 100, Mo: 100,
        };
        expect(calculateFIDIC(noChange)).toBe(1.0);
    });

    it('should handle large escalation scenario (all indices doubled) — rejects via safety bounds', () => {
        const largeEscalation: FIDICParams = {
            a: 0.10, b: 0.30, c: 0.20, d: 0.40,
            Ln: 200, Lo: 100, En: 200, Eo: 100, Mn: 200, Mo: 100,
        };
        // Pn = 0.10 + 0.30*2 + 0.20*2 + 0.40*2 = 1.90
        // F-004 FIX: Pn=1.90 exceeds FIDIC_PN_CEILING (1.50) → throws safety violation
        expect(() => calculateFIDIC(largeEscalation)).toThrow('FIDIC safety violation');
        expect(() => calculateFIDIC(largeEscalation)).toThrow('outside safe bounds');
    });

    it('should handle deflation (indices decreased)', () => {
        const deflation: FIDICParams = {
            a: 0.10, b: 0.30, c: 0.20, d: 0.40,
            Ln: 80, Lo: 100, En: 90, Eo: 100, Mn: 70, Mo: 100,
        };
        // Pn = 0.10 + 0.30*0.80 + 0.20*0.90 + 0.40*0.70
        //    = 0.10 + 0.24 + 0.18 + 0.28 = 0.80
        expect(calculateFIDIC(deflation)).toBe(0.8);
    });

    it('should throw when coefficient sum ≠ 1.0 (exceeds tolerance)', () => {
        const badCoeffs: FIDICParams = {
            a: 0.30, b: 0.30, c: 0.30, d: 0.30, // sum = 1.20
            Ln: 100, Lo: 100, En: 100, Eo: 100, Mn: 100, Mo: 100,
        };
        expect(() => calculateFIDIC(badCoeffs)).toThrow('FIDIC constraint violation');
        expect(() => calculateFIDIC(badCoeffs)).toThrow('must equal 1.0');
    });

    it('should throw when base indices are zero (division by zero)', () => {
        const zeroDivisor: FIDICParams = {
            a: 0.10, b: 0.30, c: 0.20, d: 0.40,
            Ln: 100, Lo: 0, En: 100, Eo: 100, Mn: 100, Mo: 100,
        };
        expect(() => calculateFIDIC(zeroDivisor)).toThrow('base indices');
        expect(() => calculateFIDIC(zeroDivisor)).toThrow('must be > 0');
    });

    it('should throw for negative current indices', () => {
        const negativeIndex: FIDICParams = {
            a: 0.10, b: 0.30, c: 0.20, d: 0.40,
            Ln: -10, Lo: 100, En: 100, Eo: 100, Mn: 100, Mo: 100,
        };
        expect(() => calculateFIDIC(negativeIndex)).toThrow('current indices');
        expect(() => calculateFIDIC(negativeIndex)).toThrow('must be ≥ 0');
    });

    it('should throw for negative coefficients', () => {
        const negativeCoeff: FIDICParams = {
            a: -0.10, b: 0.40, c: 0.30, d: 0.40,
            Ln: 100, Lo: 100, En: 100, Eo: 100, Mn: 100, Mo: 100,
        };
        expect(() => calculateFIDIC(negativeCoeff)).toThrow('coefficients must be ≥ 0');
    });

    it('should accept coefficient sum within ±0.01 tolerance', () => {
        const withinTolerance: FIDICParams = {
            a: 0.10, b: 0.30, c: 0.20, d: 0.405, // sum = 1.005 (within ±0.01)
            Ln: 100, Lo: 100, En: 100, Eo: 100, Mn: 100, Mo: 100,
        };
        expect(() => calculateFIDIC(withinTolerance)).not.toThrow();
    });

    it('should round to 6 decimal places', () => {
        const fractional: FIDICParams = {
            a: 0.10, b: 0.30, c: 0.20, d: 0.40,
            Ln: 101, Lo: 100, En: 99, Eo: 100, Mn: 103, Mo: 100,
        };
        const result = calculateFIDIC(fractional);
        // Verify precision: max 6 decimal places
        const decimalPart = result.toString().split('.')[1] ?? '';
        expect(decimalPart.length).toBeLessThanOrEqual(6);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 2: EPA Oracle HTTP Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('EPA Oracle Routes (HTTP Integration)', () => {
    let app: express.Express;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createApp();
        // Default: authenticated admin
        mockAuthUser = { user_id: 'admin-uuid-001', role: 'admin', roles: ['admin'], activeRole: 'admin', is_active: true };
    });

    // ─── Authentication & Authorization ────────────────────────────────
    describe('RBAC Guards', () => {
        it('should reject unauthenticated requests', async () => {
            mockAuthUser = null;
            const res = await request(app)
                .get('/api/oracle/prices')
                .expect(401);

            expect(res.body.error).toContain('Authentication required');
        });

        it('should reject donor role from accessing oracle prices', async () => {
            mockAuthUser = { user_id: 'donor-001', role: 'donor', roles: ['donor'], activeRole: 'donor', is_active: true };
            const res = await request(app)
                .get('/api/oracle/prices')
                .expect(403);

            expect(res.body.error).toContain('Access denied');
            // Note: role guard doesn't include the user's role in the error message
        });

        it('should allow engineer to read oracle prices', async () => {
            mockAuthUser = { user_id: 'eng-001', role: 'engineer', roles: ['engineer'], activeRole: 'engineer', is_active: true };
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const res = await request(app)
                .get('/api/oracle/prices')
                .expect(200);

            expect(res.body.success).toBe(true);
        });

        it('should reject non-admin from creating oracle entries', async () => {
            mockAuthUser = { user_id: 'eng-001', role: 'engineer', roles: ['engineer'], activeRole: 'engineer', is_active: true };
            const res = await request(app)
                .post('/api/oracle/prices')
                .send({
                    material_code: 'STL-001',
                    material_name: 'Steel Rebar',
                    unit: 'ton',
                    base_price: 85000,
                    current_price: 87040,
                })
                .expect(403);

            expect(res.body.error).toContain('Access denied');
        });

        it('should reject donor from EPA alerts', async () => {
            mockAuthUser = { user_id: 'donor-001', role: 'donor', roles: ['donor'], activeRole: 'donor', is_active: true };
            await request(app).get('/api/oracle/epa/alerts').expect(403);
        });
    });

    // ─── GET /api/oracle/prices ─────────────────────────────────────────
    describe('GET /api/oracle/prices', () => {
        it('should return oracle entries list', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { entry_id: 'e1', material_code: 'STL-001', material_name: 'Steel', base_price: 85000, current_price: 87040, price_change_pct: 2.4 },
                    { entry_id: 'e2', material_code: 'CEM-001', material_name: 'Cement', base_price: 5000, current_price: 5055, price_change_pct: 1.1 },
                ],
                rowCount: 2,
            });

            const res = await request(app)
                .get('/api/oracle/prices')
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(2);
            expect(res.body.message).toContain('2 oracle entries');
        });

        it('should filter by material_code query parameter', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ entry_id: 'e1', material_code: 'STL-001', material_name: 'Steel' }],
                rowCount: 1,
            });

            await request(app)
                .get('/api/oracle/prices?material_code=STL-001')
                .expect(200);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('WHERE material_code = $1'),
                ['STL-001']
            );
        });
    });

    // ─── POST /api/oracle/prices ────────────────────────────────────────
    describe('POST /api/oracle/prices', () => {
        it('should return 400 when required fields are missing', async () => {
            const res = await request(app)
                .post('/api/oracle/prices')
                .send({ material_code: 'STL-001' }) // missing others
                .expect(400);

            expect(res.body.error).toContain('Required');
        });

        it('should return 400 for negative prices', async () => {
            const res = await request(app)
                .post('/api/oracle/prices')
                .send({
                    material_code: 'STL-001',
                    material_name: 'Steel',
                    unit: 'ton',
                    base_price: -100,
                    current_price: 5000,
                })
                .expect(400);

            expect(res.body.error).toContain('positive numbers');
        });

        it('should create oracle entry with valid data', async () => {
            const entry = {
                entry_id: 'new-entry-id',
                material_code: 'STL-001',
                material_name: 'Steel Rebar',
                unit: 'ton',
                base_price: 85000,
                current_price: 87040,
                price_change_pct: 2.4,
                source: 'manual_admin_entry',
                recorded_by: 'admin-uuid-001',
            };
            mockQuery.mockResolvedValueOnce({ rows: [entry], rowCount: 1 });

            const res = await request(app)
                .post('/api/oracle/prices')
                .send({
                    material_code: 'STL-001',
                    material_name: 'Steel Rebar',
                    unit: 'ton',
                    base_price: 85000,
                    current_price: 87040,
                })
                .expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data.material_code).toBe('STL-001');
            expect(res.body.message).toContain('Steel Rebar');
        });
    });

    // ─── POST /api/oracle/epa/calculate ─────────────────────────────────
    describe('POST /api/oracle/epa/calculate', () => {
        it('should return 400 when required fields are missing', async () => {
            const res = await request(app)
                .post('/api/oracle/epa/calculate')
                .send({}) // no fields
                .expect(400);

            expect(res.body.error).toContain('Required');
            expect(res.body.error).toContain('fidic_params');
        });

        it('should calculate and store EPA adjustment', async () => {
            const adjustment = {
                adjustment_id: 'adj-001',
                project_id: 'proj-001',
                adjustment_multiplier: 1.12,
                original_amount: 12500000,
                adjusted_amount: 14000000,
                adjustment_delta: 1500000,
                status: 'pending_approval',
            };
            mockQuery.mockResolvedValueOnce({ rows: [adjustment], rowCount: 1 });

            const res = await request(app)
                .post('/api/oracle/epa/calculate')
                .send({
                    project_id: 'proj-001',
                    fidic_params: VALID_FIDIC_PARAMS,
                    original_amount: 12500000,
                })
                .expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data.adjustment_id).toBe('adj-001');
            expect(res.body.message).toContain('FIDIC');
        });

        it('should return 422 when FIDIC params violate constraints', async () => {
            const res = await request(app)
                .post('/api/oracle/epa/calculate')
                .send({
                    project_id: 'proj-001',
                    fidic_params: { ...VALID_FIDIC_PARAMS, Lo: 0 }, // division by zero
                    original_amount: 12500000,
                })
                .expect(422);

            expect(res.body.error).toContain('FIDIC constraint');
        });
    });

    // ─── POST /api/oracle/epa/approve/:adjustmentId ─────────────────────
    describe('POST /api/oracle/epa/approve/:adjustmentId', () => {
        it('should return 400 for invalid decision', async () => {
            const res = await request(app)
                .post('/api/oracle/epa/approve/adj-001')
                .send({ decision: 'maybe' })
                .expect(400);

            expect(res.body.error).toContain('decision');
        });

        it('should approve EPA adjustment', async () => {
            const approvedAdj = {
                adjustment_id: 'adj-001',
                status: 'approved',
                approved_by: 'admin-uuid-001',
            };
            mockQuery.mockResolvedValueOnce({ rows: [approvedAdj], rowCount: 1 });

            const res = await request(app)
                .post('/api/oracle/epa/approve/adj-001')
                .send({ decision: 'approved' })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('approved');
        });

        it('should return 404 when adjustment not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const res = await request(app)
                .post('/api/oracle/epa/approve/adj-nonexistent')
                .send({ decision: 'rejected' })
                .expect(404);

            expect(res.body.error).toContain('not found');
        });
    });

    // ─── GET /api/oracle/epa/history/:projectId ─────────────────────────
    describe('GET /api/oracle/epa/history/:projectId', () => {
        it('should return EPA history for a project', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { adjustment_id: 'a1', project_id: 'proj-001', status: 'approved' },
                    { adjustment_id: 'a2', project_id: 'proj-001', status: 'pending_approval' },
                ],
                rowCount: 2,
            });

            const res = await request(app)
                .get('/api/oracle/epa/history/proj-001')
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(2);
        });
    });

    // ─── GET /api/oracle/epa/alerts ─────────────────────────────────────
    describe('GET /api/oracle/epa/alerts', () => {
        it('should return threshold alerts', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { project_id: 'proj-001', material_name: 'Steel', price_change_pct: 8.5 },
                ],
                rowCount: 1,
            });

            const res = await request(app)
                .get('/api/oracle/epa/alerts')
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.message).toContain('>5% price drift');
        });
    });
});
