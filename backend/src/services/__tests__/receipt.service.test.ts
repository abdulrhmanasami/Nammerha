// ============================================================================
// Nammerha — Receipt Service Unit Tests (IMP-001)
// ============================================================================
// Bilingual PDF donation receipt generator with 3-layer CPU protection.
// Covers: generateReceipt, ETag caching, LRU eviction, ownership checks
//
// NOTE: The receipt service has a module-level LRU cache (pdfCache Map) that
// persists across tests. Each test uses unique donor+escrow IDs to avoid
// cross-test cache pollution.
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

// Mock PDFKit — must be a class (arrow functions cannot be used with `new`)
vi.mock('pdfkit', () => {
    class MockPDFDocument {
        private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
        y = 100;

        on(event: string, handler: (...args: unknown[]) => void) {
            this.handlers[event] = this.handlers[event] || [];
            this.handlers[event]!.push(handler);
            return this;
        }
        fontSize() { return this; }
        text() { return this; }
        moveDown() { return this; }
        moveTo() { return this; }
        lineTo() { return this; }
        stroke() { return this; }
        fillColor() { return this; }
        end() {
            const dataHandlers = this.handlers['data'] || [];
            const endHandlers = this.handlers['end'] || [];
            for (const h of dataHandlers) {
                h(Buffer.from('mock-pdf-content'));
            }
            for (const h of endHandlers) {
                h();
            }
        }
    }
    return { default: MockPDFDocument };
});

import { generateReceipt } from '../receipt.service';

function makeReceiptData(escrowId: string) {
    return {
        escrow_id: escrowId,
        donor_name: 'Ahmad Hammoud',
        donor_email: 'ahmad@example.com',
        project_title: 'Aleppo School Rebuild',
        project_id: 'OCDS-SYR-00001',
        material_name: 'Cement',
        amount_locked: 50000,
        currency: 'USD',
        payment_method: 'visa',
        locked_at: new Date('2026-03-15T10:00:00Z'),
        payment_status: 'locked',
        gift_recipient_name: null,
        donation_intent: 'general',
    };
}

// Counter ensures unique IDs across tests (avoids LRU cache collisions)
let testCounter = 0;

describe('Receipt Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockReset();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        testCounter++;
    });

    describe('generateReceipt', () => {
        it('should generate receipt with buffer, filename, and ETag', async () => {
            const escrowId = `esc-gen-${testCounter}-dead-beef-cafe-123456789abc`;
            const donorId = `donor-gen-${testCounter}`;
            mockQuery.mockResolvedValueOnce({ rows: [makeReceiptData(escrowId)] });

            const result = await generateReceipt(donorId, escrowId);

            expect(result.buffer).toBeInstanceOf(Buffer);
            expect(result.buffer.length).toBeGreaterThan(0);
            expect(result.filename).toMatch(/^nammerha-receipt-[a-z0-9-]+\.pdf$/);
            expect(result.etag).toMatch(/^"receipt-[a-f0-9]{16}"$/);
        });

        it('should throw when escrow entry not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await expect(generateReceipt(`donor-nf-${testCounter}`, `esc-nf-${testCounter}`))
                .rejects.toThrow('not found or does not belong to you');
        });

        it('should throw when escrow belongs to different donor', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await expect(generateReceipt(`wrong-${testCounter}`, `esc-wrong-${testCounter}`))
                .rejects.toThrow('not found or does not belong to you');
        });

        it('should generate deterministic ETag for same data', async () => {
            const escrowId = `esc-etag-${testCounter}`;
            const data = makeReceiptData(escrowId);

            mockQuery.mockResolvedValueOnce({ rows: [data] });
            const result1 = await generateReceipt(`donor-etag1-${testCounter}`, escrowId);

            mockQuery.mockResolvedValueOnce({ rows: [data] });
            const result2 = await generateReceipt(`donor-etag2-${testCounter}`, escrowId);

            expect(result1.etag).toBe(result2.etag); // Same data → same ETag
        });

        it('should serve from LRU cache on second call (same donor+escrow)', async () => {
            const escrowId = `esc-lru-${testCounter}`;
            const donorId = `donor-lru-${testCounter}`;

            mockQuery.mockResolvedValueOnce({ rows: [makeReceiptData(escrowId)] });

            // First call: generates PDF (1 DB query)
            const first = await generateReceipt(donorId, escrowId);
            expect(mockQuery).toHaveBeenCalledTimes(1);

            // Second call: served from cache (no additional DB query)
            const cached = await generateReceipt(donorId, escrowId);
            expect(mockQuery).toHaveBeenCalledTimes(1); // still 1!

            expect(cached.buffer).toBeInstanceOf(Buffer);
            expect(cached.etag).toBe(first.etag);
        });

        it('should verify ownership via SQL WHERE clause', async () => {
            const escrowId = `esc-own-${testCounter}`;
            const donorId = `donor-own-${testCounter}`;
            mockQuery.mockResolvedValueOnce({ rows: [makeReceiptData(escrowId)] });

            await generateReceipt(donorId, escrowId);

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('el.donor_id = $2');
            const params = mockQuery.mock.calls[0]?.[1] as unknown[];
            expect(params?.[0]).toBe(escrowId);
            expect(params?.[1]).toBe(donorId);
        });

        it('should use explicit column list (no SELECT *)', async () => {
            const escrowId = `esc-col-${testCounter}`;
            const donorId = `donor-col-${testCounter}`;
            mockQuery.mockResolvedValueOnce({ rows: [makeReceiptData(escrowId)] });

            await generateReceipt(donorId, escrowId);

            const sql = mockQuery.mock.calls[0]?.[0] as string;
            expect(sql).toContain('el.transaction_id AS escrow_id');
            expect(sql).toContain('u.full_name AS donor_name');
            expect(sql).not.toContain('SELECT *');
        });
    });
});
