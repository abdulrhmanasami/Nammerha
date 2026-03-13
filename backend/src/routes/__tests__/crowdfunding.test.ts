// ============================================================================
// Nammerha — Crowdfunding Service Unit Tests (FA-NMR-2026-005)
// Tests the core financial flow: marketplace browse → BOQ funding → escrow lock
//
// Coverage:
//   1. getMarketplaceProjects — filter + sort combinations
//   2. getProjectBOQ — returns funding status for items
//   3. createDonation — 3-phase escrow lock (validate → gateway → finalize)
//   4. createDonation — BigInt arithmetic safety
//   5. createDonation — over-funding prevention
//   6. getDonorEscrowSummary — summary aggregation
//   7. getDonorDonations — paginated history with joins
//   8. getVerifiedSuppliers — list with filters
// ============================================================================
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ─── Mock Database BEFORE imports ───────────────────────────────────────────
const mockQuery = vi.fn();
const mockTransaction = vi.fn();
vi.mock('../../config/database', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: (fn: (client: unknown) => Promise<unknown>) => mockTransaction(fn),
    default: { end: vi.fn(), query: (...args: unknown[]) => mockQuery(...args) },
}));

// ─── Mock payment service ───────────────────────────────────────────────────
const mockPaymentInitiate = vi.fn();
vi.mock('../../services/payment.service', () => ({
    paymentService: {
        initiate: (...args: unknown[]) => mockPaymentInitiate(...args),
    },
}));

// ─── Mock logger ────────────────────────────────────────────────────────────
vi.mock('../../utils/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// ─── Import AFTER mocks ────────────────────────────────────────────────────
import {
    getMarketplaceProjects,
    getProjectBOQ,
    createDonation,
    getDonorEscrowSummary,
    getDonorDonations,
    getVerifiedSuppliers,
} from '../../services/crowdfunding.service';

// ═══════════════════════════════════════════════════════════════════════════
// Crowdfunding Service Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Crowdfunding Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── getMarketplaceProjects ─────────────────────────────────────────
    describe('getMarketplaceProjects()', () => {
        it('should return all projects sorted by published_at DESC by default', async () => {
            const mockData = [
                { project_id: 'p1', title: 'Aleppo School', funded_percentage: 40, published_at: '2026-03-01' },
                { project_id: 'p2', title: 'Homs Hospital', funded_percentage: 70, published_at: '2026-02-15' },
            ];
            mockQuery.mockResolvedValueOnce({ rows: mockData, rowCount: 2 });

            const result = await getMarketplaceProjects();

            expect(result).toHaveLength(2);
            expect((result[0] as (typeof result)[0]).project_id).toBe('p1');
            // Verify default sort
            // PLT-AUDIT-001: params now include default LIMIT 25 and OFFSET 0
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY published_at DESC'),
                [25, 0]
            );
        });

        it('should filter by damage_type when provided', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            await getMarketplaceProjects({ damage_type: 'structural' });

            // PLT-AUDIT-001: params = [damage_type, limit, offset]
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('damage_type = $1'),
                ['structural', 25, 0]
            );
        });

        it('should sort by funded_percentage ASC when specified', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            await getMarketplaceProjects({ sort_by: 'funded_percentage' });

            // PLT-AUDIT-001: params = [limit, offset]
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY funded_percentage ASC'),
                [25, 0]
            );
        });

        it('should apply both filter and sort simultaneously', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            await getMarketplaceProjects({ damage_type: 'electrical', sort_by: 'funded_percentage' });

            const calls = (mockQuery as Mock).mock.calls;
            const sql = (calls[0] as unknown[])[0] as string;
            expect(sql).toContain('damage_type = $1');
            expect(sql).toContain('ORDER BY funded_percentage ASC');
            // PLT-AUDIT-001: params = [damage_type, limit, offset]
            expect((calls[0] as unknown[])[1]).toEqual(['electrical', 25, 0]);
        });
    });

    // ─── getProjectBOQ ──────────────────────────────────────────────────
    describe('getProjectBOQ()', () => {
        it('should return BOQ items for the given project', async () => {
            const mockBOQ = [
                { item_id: 'i1', material_name: 'Cement', funded_amount: 5000, unit_price: 2500 },
                { item_id: 'i2', material_name: 'Steel Rebar', funded_amount: 0, unit_price: 8000 },
            ];
            mockQuery.mockResolvedValueOnce({ rows: mockBOQ, rowCount: 2 });

            const result = await getProjectBOQ('proj-001');

            expect(result).toHaveLength(2);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('WHERE project_id = $1'),
                ['proj-001']
            );
        });

        it('should return empty array when project has no BOQ items', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const result = await getProjectBOQ('proj-nonexistent');

            expect(result).toHaveLength(0);
        });
    });

    // ─── createDonation (3-phase escrow lock) ───────────────────────────
    describe('createDonation()', () => {
        it('should execute 3-phase donation flow successfully', async () => {
            // Phase 1: transaction mock — validate & create pending escrow
            const mockClient1 = {
                query: vi.fn()
                    // 1. BOQ item lookup (FOR UPDATE)
                    .mockResolvedValueOnce({
                        rows: [{
                            item_id: 'item-001',
                            project_id: 'proj-001',
                            unit_price: 250000,       // $2,500.00 in cents
                            required_quantity: 10,
                            funded_amount: 0,
                            status: 'verified',
                        }],
                        rowCount: 1,
                    })
                    // 2. Create pending escrow entry
                    .mockResolvedValueOnce({
                        rows: [{ transaction_id: 'escrow-001' }],
                        rowCount: 1,
                    }),
            };

            // Phase 3: transaction mock — finalize escrow
            const mockClient3 = {
                query: vi.fn()
                    // 1. Update escrow with gateway ref
                    .mockResolvedValueOnce({
                        rows: [{
                            transaction_id: 'escrow-001',
                            amount_locked: 500000,
                            payment_status: 'locked',
                        }],
                        rowCount: 1,
                    })
                    // 2. Check funding level
                    .mockResolvedValueOnce({
                        rows: [{ funded_amount: 500000 }],
                        rowCount: 1,
                    })
                    // 3. Update BOQ status to partially_funded
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
            };

            // Phase 1 transaction
            mockTransaction.mockImplementationOnce(
                async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient1)
            );
            // Phase 2: gateway call
            mockPaymentInitiate.mockResolvedValueOnce({ reference: 'VIS-20260312-ABC123' });
            // Phase 3 transaction
            mockTransaction.mockImplementationOnce(
                async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient3)
            );

            const result = await createDonation('donor-001', {
                items: [{ item_id: 'item-001', amount: 500000 }],
                payment_method: 'visa',
                return_url: 'https://nammerha.com/callback',
            });

            expect(result).toHaveLength(1);
            expect((result[0] as (typeof result)[0]).payment_status).toBe('locked');
            expect(mockPaymentInitiate).toHaveBeenCalledTimes(1);
            expect(mockTransaction).toHaveBeenCalledTimes(2); // Phase 1 + Phase 3
        });

        it('should throw when BOQ item does not exist', async () => {
            const mockClient = {
                query: vi.fn()
                    .mockResolvedValueOnce({ rows: [], rowCount: 0 }), // BOQ not found
            };
            mockTransaction.mockImplementationOnce(
                async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient)
            );

            await expect(
                createDonation('donor-001', {
                    items: [{ item_id: 'nonexistent', amount: 100000 }],
                    payment_method: 'visa',
                    return_url: 'https://nammerha.com/callback',
                })
            ).rejects.toThrow('not found');
        });

        it('should throw when item is already fully funded', async () => {
            const mockClient = {
                query: vi.fn()
                    .mockResolvedValueOnce({
                        rows: [{
                            item_id: 'item-001',
                            project_id: 'proj-001',
                            unit_price: 100000,
                            required_quantity: 1,
                            funded_amount: 100000, // fully funded
                            status: 'fully_funded',
                        }],
                        rowCount: 1,
                    }),
            };
            mockTransaction.mockImplementationOnce(
                async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient)
            );

            await expect(
                createDonation('donor-001', {
                    items: [{ item_id: 'item-001', amount: 50000 }],
                    payment_method: 'visa',
                    return_url: 'https://nammerha.com/callback',
                })
            ).rejects.toThrow('already fully funded');
        });

        it('should cap donation at remaining need to prevent over-funding', async () => {
            // Item needs $1000 total, already funded $800 → remaining = $200
            // Donor tries to donate $500 → should be capped at $200
            const mockClient1 = {
                query: vi.fn()
                    .mockResolvedValueOnce({
                        rows: [{
                            item_id: 'item-001',
                            project_id: 'proj-001',
                            unit_price: 100000, // $1000.00 in cents
                            required_quantity: 1,
                            funded_amount: 80000, // $800 already funded
                            status: 'partially_funded',
                        }],
                        rowCount: 1,
                    })
                    .mockResolvedValueOnce({
                        rows: [{ transaction_id: 'escrow-002' }],
                        rowCount: 1,
                    }),
            };

            const mockClient3 = {
                query: vi.fn()
                    .mockResolvedValueOnce({
                        rows: [{ transaction_id: 'escrow-002', amount_locked: 20000, payment_status: 'locked' }],
                        rowCount: 1,
                    })
                    .mockResolvedValueOnce({
                        rows: [{ funded_amount: 100000 }], // now fully funded
                        rowCount: 1,
                    })
                    // fully_funded update
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
                    // autoGeneratePO queries: BOQ item details
                    .mockResolvedValueOnce({
                        rows: [{
                            material_name: 'Cement',
                            material_category: 'masonry',
                            unit: 'bag',
                            unit_price: 100000,
                            required_quantity: 1,
                            preferred_supplier_id: null,
                        }],
                        rowCount: 1,
                    })
                    // autoGeneratePO: random supplier lookup (legacy fallback)
                    .mockResolvedValueOnce({
                        rows: [{ user_id: 'sup-001', full_name: 'Test Supplier Co.', commercial_register_number: 'CR-123' }],
                        rowCount: 1,
                    })
                    // autoGeneratePO: INSERT PO
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
            };

            mockTransaction
                .mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient1))
                .mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient3));
            mockPaymentInitiate.mockResolvedValueOnce({ reference: 'FAT-20260312-XYZ' });

            const result = await createDonation('donor-001', {
                items: [{ item_id: 'item-001', amount: 50000 }], // tries $500
                payment_method: 'fatora',
                return_url: 'https://nammerha.com/callback',
            });

            // Escrow should have been created with capped amount
            expect(result).toHaveLength(1);
            // Verify the escrow INSERT was called with capped amount (20000 = $200)
            const escrowInsertCall = mockClient1.query.mock.calls[1] as unknown[];
            expect(escrowInsertCall[1]).toContain(20000); // 4th arg in VALUES
        });

        // ─── P1-NEW-001 FIX TESTS: Partial Gateway Failure ─────────────
        it('should cancel orphaned escrow entries when gateway fails mid-batch (P1-NEW-001)', async () => {
            // 2-item basket: item 1 succeeds, item 2 gateway fails
            const mockClient1 = {
                query: vi.fn()
                    // Item 1: BOQ lookup
                    .mockResolvedValueOnce({
                        rows: [{
                            item_id: 'item-001', project_id: 'proj-001',
                            unit_price: 100000, required_quantity: 1,
                            funded_amount: 0, status: 'verified',
                        }],
                        rowCount: 1,
                    })
                    // Item 1: Create escrow entry
                    .mockResolvedValueOnce({
                        rows: [{ transaction_id: 'escrow-001' }], rowCount: 1,
                    })
                    // Item 2: BOQ lookup
                    .mockResolvedValueOnce({
                        rows: [{
                            item_id: 'item-002', project_id: 'proj-001',
                            unit_price: 200000, required_quantity: 1,
                            funded_amount: 0, status: 'verified',
                        }],
                        rowCount: 1,
                    })
                    // Item 2: Create escrow entry
                    .mockResolvedValueOnce({
                        rows: [{ transaction_id: 'escrow-002' }], rowCount: 1,
                    }),
            };

            const mockClient3 = {
                query: vi.fn()
                    // Only item 1 gets to Phase 3 (item 2 failed)
                    .mockResolvedValueOnce({
                        rows: [{ transaction_id: 'escrow-001', amount_locked: 100000, payment_status: 'locked' }],
                        rowCount: 1,
                    })
                    .mockResolvedValueOnce({
                        rows: [{ funded_amount: 100000 }], rowCount: 1,
                    })
                    // fully_funded update + auto PO
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
                    .mockResolvedValueOnce({
                        rows: [{ material_name: 'Cement', material_category: 'masonry', unit: 'bag', unit_price: 100000, required_quantity: 1, preferred_supplier_id: null }],
                        rowCount: 1,
                    })
                    .mockResolvedValueOnce({
                        rows: [{ user_id: 'sup-001', full_name: 'Supplier', commercial_register_number: 'CR-1' }], rowCount: 1,
                    })
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
            };

            mockTransaction
                .mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient1))
                .mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient3));

            // Item 1: gateway succeeds
            mockPaymentInitiate.mockResolvedValueOnce({ reference: 'VIS-001' });
            // Item 2: gateway FAILS
            mockPaymentInitiate.mockRejectedValueOnce(new Error('Gateway timeout'));

            // Also mock the orphan cancellation query (called directly on pool)
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

            const result = await createDonation('donor-001', {
                items: [
                    { item_id: 'item-001', amount: 100000 },
                    { item_id: 'item-002', amount: 200000 },
                ],
                payment_method: 'visa',
                return_url: 'https://nammerha.com/callback',
            });

            // Only 1 escrow entry should be returned (item 1)
            expect(result).toHaveLength(1);
            expect((result[0] as (typeof result)[0]).payment_status).toBe('locked');

            // Verify cancelled escrow UPDATE was called for failed items
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("SET payment_status = 'cancelled'"),
                expect.arrayContaining([expect.arrayContaining(['escrow-002'])])
            );
        });

        it('should throw when ALL gateway calls fail (P1-NEW-001)', async () => {
            const mockClient1 = {
                query: vi.fn()
                    .mockResolvedValueOnce({
                        rows: [{
                            item_id: 'item-001', project_id: 'proj-001',
                            unit_price: 100000, required_quantity: 1,
                            funded_amount: 0, status: 'verified',
                        }],
                        rowCount: 1,
                    })
                    .mockResolvedValueOnce({
                        rows: [{ transaction_id: 'escrow-001' }], rowCount: 1,
                    }),
            };

            mockTransaction.mockImplementationOnce(
                async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient1)
            );
            // Gateway fails
            mockPaymentInitiate.mockRejectedValueOnce(new Error('Service unavailable'));
            // Orphan cancellation
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

            await expect(
                createDonation('donor-001', {
                    items: [{ item_id: 'item-001', amount: 100000 }],
                    payment_method: 'fatora',
                    return_url: 'https://nammerha.com/callback',
                })
            ).rejects.toThrow('Payment gateway failed for all items');
        });

        it('should process multi-item donation successfully', async () => {
            // 3-item basket, all gateway calls succeed
            const mockClient1 = {
                query: vi.fn(),
            };
            // Mock 3 BOQ lookups + 3 escrow creates
            for (let i = 0; i < 3; i++) {
                mockClient1.query
                    .mockResolvedValueOnce({
                        rows: [{
                            item_id: `item-${i}`, project_id: 'proj-001',
                            unit_price: 50000, required_quantity: 2,
                            funded_amount: 0, status: 'verified',
                        }],
                        rowCount: 1,
                    })
                    .mockResolvedValueOnce({
                        rows: [{ transaction_id: `escrow-${i}` }], rowCount: 1,
                    });
            }

            const mockClient3 = {
                query: vi.fn(),
            };
            // Phase 3: 3 escrow updates + 3 funding checks + 3 status updates
            for (let i = 0; i < 3; i++) {
                mockClient3.query
                    .mockResolvedValueOnce({
                        rows: [{ transaction_id: `escrow-${i}`, amount_locked: 50000, payment_status: 'locked' }],
                        rowCount: 1,
                    })
                    .mockResolvedValueOnce({
                        rows: [{ funded_amount: 50000 }], rowCount: 1,
                    })
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // partially_funded update
            }

            mockTransaction
                .mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient1))
                .mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) => fn(mockClient3));

            // All 3 gateway calls succeed
            for (let i = 0; i < 3; i++) {
                mockPaymentInitiate.mockResolvedValueOnce({ reference: `REF-${i}` });
            }

            const result = await createDonation('donor-001', {
                items: [
                    { item_id: 'item-0', amount: 50000 },
                    { item_id: 'item-1', amount: 50000 },
                    { item_id: 'item-2', amount: 50000 },
                ],
                payment_method: 'visa',
                return_url: 'https://nammerha.com/callback',
            });

            expect(result).toHaveLength(3);
            expect(mockPaymentInitiate).toHaveBeenCalledTimes(3);
            expect(mockTransaction).toHaveBeenCalledTimes(2); // Phase 1 + Phase 3
        });
    });

    // ─── getDonorEscrowSummary ──────────────────────────────────────────
    describe('getDonorEscrowSummary()', () => {
        it('should return summary from the view', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ donor_id: 'donor-001', total_locked: 1500000, total_released: 500000 }],
                rowCount: 1,
            });

            const result = await getDonorEscrowSummary('donor-001');

            expect(result).toBeTruthy();
            expect((result as Record<string, unknown>).total_locked).toBe(1500000);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('vw_donor_escrow_summary'),
                ['donor-001']
            );
        });

        it('should return null when donor has no donations', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const result = await getDonorEscrowSummary('donor-nonexistent');

            expect(result).toBeNull();
        });
    });

    // ─── getDonorDonations ──────────────────────────────────────────────
    describe('getDonorDonations()', () => {
        it('should return paginated donation history', async () => {
            const mockDonations = [
                { transaction_id: 'tx-1', amount_locked: 500000, material_name: 'Cement', project_title: 'Aleppo School' },
            ];
            mockQuery.mockResolvedValueOnce({ rows: mockDonations, rowCount: 1 });

            const result = await getDonorDonations('donor-001', 10, 0);

            expect(result).toHaveLength(1);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT $2 OFFSET $3'),
                ['donor-001', 10, 0]
            );
        });

        it('should use default pagination (limit=50, offset=0)', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            await getDonorDonations('donor-001');

            expect(mockQuery).toHaveBeenCalledWith(
                expect.anything(),
                ['donor-001', 50, 0]
            );
        });
    });

    // ─── getVerifiedSuppliers ───────────────────────────────────────────
    describe('getVerifiedSuppliers()', () => {
        it('should return only active, verified suppliers', async () => {
            const mockSuppliers = [
                { user_id: 's1', full_name: 'Damascus Materials Co.', commercial_register_number: 'CR-001' },
                { user_id: 's2', full_name: 'Homs Building Supply', commercial_register_number: null },
            ];
            mockQuery.mockResolvedValueOnce({ rows: mockSuppliers, rowCount: 2 });

            const result = await getVerifiedSuppliers();

            expect(result).toHaveLength(2);
            const calls = (mockQuery as Mock).mock.calls;
            const sql = (calls[0] as unknown[])[0] as string;
            expect(sql).toContain("role = 'supplier'");
            expect(sql).toContain('is_active = TRUE');
            expect(sql).toContain("kyc_verification_status = 'verified'");
        });
    });
});
