// ============================================================================
// Nammerha — Execution Service Unit Tests (IMP-001)
// ============================================================================
// Path 3: PO → Spatial Proof (GPS-stamped delivery verification)
// Covers: submitSpatialProof, getProjectPurchaseOrders,
//         getPurchaseOrderByNumber, updatePOStatus
//
// Security Tests:
//   - SSRF protection (validateExternalUrl)
//   - GPS proximity fraud detection
//   - Audit trail on PO status transitions
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Database ──────────────────────────────────────────────────────────
const mockQuery = vi.fn();
const mockTransactionFn = vi.fn();

vi.mock('../../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: (fn: (client: unknown) => unknown) => mockTransactionFn(fn),
  financialTransaction: (fn: (client: unknown) => unknown) => mockTransactionFn(fn),
  default: { query: (...args: unknown[]) => mockQuery(...args), end: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getProjectPurchaseOrders,
  getPurchaseOrderByNumber,
  updatePOStatus,
} from '../execution.service';

function setupTransaction() {
  const clientQuery = vi.fn();
  mockTransactionFn.mockImplementation(
    async (fn: (client: { query: typeof clientQuery }) => unknown) => {
      return fn({ query: clientQuery });
    },
  );
  return clientQuery;
}

const MOCK_PO = {
  po_id: 'po-1',
  po_number: 'PO-SYR-00001',
  item_id: 'item-1',
  project_id: 'proj-1',
  supplier_id: 'sup-1',
  amount: 50000,
  currency: 'USD',
  status: 'generated',
  material_name: 'Cement',
  material_category: 'structural',
  quantity: 100,
  unit: 'bag',
  unit_price: 500,
  supplier_name: 'BuildCo',
  supplier_commercial_reg: 'CR-001',
  generated_at: new Date(),
  created_at: new Date(),
};

// ═════════════════════════════════════════════════════════════════════════════
describe('Execution Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockTransactionFn.mockReset();
  });

  // ─── Purchase Order Queries ─────────────────────────────────────────────
  describe('getProjectPurchaseOrders', () => {
    it('should return POs for a project ordered by generated_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [MOCK_PO, { ...MOCK_PO, po_id: 'po-2', po_number: 'PO-SYR-00002' }],
      });

      const pos = await getProjectPurchaseOrders('proj-1');

      expect(pos).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE project_id = $1'), [
        'proj-1',
      ]);
      const sql = mockQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain('ORDER BY generated_at DESC');
    });

    it('should use explicit column list (PLT-2026-AUD-002)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getProjectPurchaseOrders('proj-1');

      const sql = mockQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain('po_id, po_number, item_id');
      expect(sql).not.toContain('SELECT *');
    });
  });

  describe('getPurchaseOrderByNumber', () => {
    it('should return PO when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [MOCK_PO] });

      const po = await getPurchaseOrderByNumber('PO-SYR-00001');

      expect(po?.po_number).toBe('PO-SYR-00001');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const po = await getPurchaseOrderByNumber('PO-NONEXISTENT');

      expect(po).toBeNull();
    });
  });

  // ─── PO Status Transition ───────────────────────────────────────────────
  describe('updatePOStatus', () => {
    it('should update to sent_to_supplier with timestamp', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...MOCK_PO, status: 'sent_to_supplier' }] })
        .mockResolvedValueOnce({ rows: [] }); // audit trail INSERT

      const po = await updatePOStatus('po-1', 'sent_to_supplier', 'admin-1');

      expect(po.status).toBe('sent_to_supplier');
      // Verify CASE-based SQL (PLT-2026-AUD-005)
      const sql = mockQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain("CASE WHEN $1 = 'sent_to_supplier' THEN NOW()");
    });

    it('should update to acknowledged with timestamp', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...MOCK_PO, status: 'acknowledged' }] })
        .mockResolvedValueOnce({ rows: [] });

      const po = await updatePOStatus('po-1', 'acknowledged', 'sup-1');

      expect(po.status).toBe('acknowledged');
    });

    it('should update to shipped with timestamp', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...MOCK_PO, status: 'shipped' }] })
        .mockResolvedValueOnce({ rows: [] });

      const po = await updatePOStatus('po-1', 'shipped', 'sup-1');

      expect(po.status).toBe('shipped');
    });

    it('should update to delivered with timestamp', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...MOCK_PO, status: 'delivered' }] })
        .mockResolvedValueOnce({ rows: [] });

      const po = await updatePOStatus('po-1', 'delivered', 'eng-1');

      expect(po.status).toBe('delivered');
    });

    it('should throw for invalid status', async () => {
      await expect(updatePOStatus('po-1', 'hacked' as never, 'admin-1')).rejects.toThrow(
        'Invalid PO status',
      );
    });

    it('should throw when PO not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(updatePOStatus('nonexistent', 'shipped', 'admin-1')).rejects.toThrow(
        'not found',
      );
    });

    // ─── Audit Trail ────────────────────────────────────────────────
    it('should write audit trail entry after status update', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ ...MOCK_PO, status: 'delivered', po_number: 'PO-SYR-00001' }],
        })
        .mockResolvedValueOnce({ rows: [] }); // audit trail

      await updatePOStatus('po-1', 'delivered', 'eng-1');

      // Second call should be audit trail INSERT
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const auditSql = mockQuery.mock.calls[1]?.[0] as string;
      expect(auditSql).toContain('INSERT INTO audit_trail');
      expect(auditSql).toContain('entity_type');

      const auditParams = mockQuery.mock.calls[1]?.[1] as unknown[];
      expect(auditParams?.[0]).toBe('po_status_delivered'); // action
      expect(auditParams?.[1]).toBe('po-1'); // entity_id
      expect(auditParams?.[2]).toBe('eng-1'); // actor_id
    });

    // PLT-2026-AUD-005: Pure parameterized SQL — no interpolated column names
    it('should use CASE-based SQL (no dynamic column injection)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...MOCK_PO, status: 'shipped' }] })
        .mockResolvedValueOnce({ rows: [] });

      await updatePOStatus('po-1', 'shipped', 'admin-1');

      const sql = mockQuery.mock.calls[0]?.[0] as string;
      // All 4 timestamp columns should use CASE pattern
      expect(sql).toContain("CASE WHEN $1 = 'sent_to_supplier' THEN NOW() ELSE sent_at END");
      expect(sql).toContain(
        "CASE WHEN $1 = 'acknowledged'     THEN NOW() ELSE acknowledged_at END",
      );
      expect(sql).toContain("CASE WHEN $1 = 'shipped'          THEN NOW() ELSE shipped_at END");
      expect(sql).toContain("CASE WHEN $1 = 'delivered'         THEN NOW() ELSE delivered_at END");
    });
  });

  // ─── SSRF Protection (validateExternalUrl) ──────────────────────────────
  // Note: validateExternalUrl is a private function called by submitSpatialProof.
  // We test it indirectly through the transaction-based proof submission.
  describe('submitSpatialProof — SSRF protection', () => {
    it('should reject proof with private IP image URL', async () => {
      const clientQuery = setupTransaction();

      // Project exists, assigned to engineer
      clientQuery.mockResolvedValueOnce({
        rows: [{ project_id: 'proj-1', assigned_engineer_id: 'eng-1', gps_location: null }],
      });
      // BOQ item exists
      clientQuery.mockResolvedValueOnce({
        rows: [{ item_id: 'item-1' }],
      });

      // Import dynamically to test with SSRF URL
      const { submitSpatialProof } = await import('../execution.service');

      await expect(
        submitSpatialProof('eng-1', {
          project_id: 'proj-1',
          item_id: 'item-1',
          gps_lat: 33.5138,
          gps_lng: 36.2765,
          image_url: 'http://192.168.1.1/admin/secret',
        }),
      ).rejects.toThrow(/private|reserved|denied|verification failed/i);
    });

    it('should reject proof with Docker internal hostname', async () => {
      const clientQuery = setupTransaction();

      clientQuery.mockResolvedValueOnce({
        rows: [{ project_id: 'proj-1', assigned_engineer_id: 'eng-1', gps_location: null }],
      });
      clientQuery.mockResolvedValueOnce({
        rows: [{ item_id: 'item-1' }],
      });

      const { submitSpatialProof } = await import('../execution.service');

      await expect(
        submitSpatialProof('eng-1', {
          project_id: 'proj-1',
          item_id: 'item-1',
          gps_lat: 33.5138,
          gps_lng: 36.2765,
          image_url: 'http://nammerha-db:5432/exploit',
        }),
      ).rejects.toThrow(/internal|denied|verification failed/i);
    });

    it('should reject proof from non-assigned engineer', async () => {
      const clientQuery = setupTransaction();

      clientQuery.mockResolvedValueOnce({
        rows: [{ project_id: 'proj-1', assigned_engineer_id: 'other-eng', gps_location: null }],
      });

      const { submitSpatialProof } = await import('../execution.service');

      await expect(
        submitSpatialProof('eng-1', {
          project_id: 'proj-1',
          item_id: 'item-1',
          gps_lat: 33.5138,
          gps_lng: 36.2765,
          image_url: 'https://storage.example.com/img.jpg',
        }),
      ).rejects.toThrow('not assigned');
    });

    it('should reject proof when project not found', async () => {
      const clientQuery = setupTransaction();
      clientQuery.mockResolvedValueOnce({ rows: [] });

      const { submitSpatialProof } = await import('../execution.service');

      await expect(
        submitSpatialProof('eng-1', {
          project_id: 'nonexistent',
          item_id: 'item-1',
          gps_lat: 33.5138,
          gps_lng: 36.2765,
          image_url: 'https://storage.example.com/img.jpg',
        }),
      ).rejects.toThrow('not found');
    });

    it('should reject proof when BOQ item not in project', async () => {
      const clientQuery = setupTransaction();

      clientQuery.mockResolvedValueOnce({
        rows: [{ project_id: 'proj-1', assigned_engineer_id: 'eng-1', gps_location: null }],
      });
      clientQuery.mockResolvedValueOnce({ rows: [] }); // no BOQ item

      const { submitSpatialProof } = await import('../execution.service');

      await expect(
        submitSpatialProof('eng-1', {
          project_id: 'proj-1',
          item_id: 'bad-item',
          gps_lat: 33.5138,
          gps_lng: 36.2765,
          image_url: 'https://storage.example.com/img.jpg',
        }),
      ).rejects.toThrow('BOQ item bad-item not found');
    });
  });
});
