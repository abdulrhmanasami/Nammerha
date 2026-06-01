// ============================================================================
// Nammerha — Escrow Service Unit Tests (PLT-AUDIT-006)
// Tests the complete escrow verification and fund release flow:
//   1. getPendingVerifications — paginated retrieval with enriched data
//   2. releaseEscrow — atomic fund release + BOQ status + user notifications
//   3. flagDiscrepancy — proof rejection + engineer notification
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Database BEFORE imports ───────────────────────────────────────────
const mockQuery = vi.fn();
const mockTransaction = vi.fn();
vi.mock('../../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: (fn: (client: unknown) => Promise<unknown>) => mockTransaction(fn),
  default: { end: vi.fn(), query: (...args: unknown[]) => mockQuery(...args) },
}));

// ─── Mock notification service ──────────────────────────────────────────────
const mockCreateNotification = vi.fn();
vi.mock('../../services/notification.service', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

// ─── Mock Redis Lock Manager (F-009) ────────────────────────────────────────
vi.mock('../../config/redis.client', () => ({
  redisLockManager: {
    acquireLock: vi.fn().mockResolvedValue('mock-lock-token-uuid'),
    releaseLock: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Mock Escrow Fee Service ────────────────────────────────────────────────
vi.mock('../../services/escrow-fee.service', () => ({
  calculateEscrowFee: vi.fn().mockReturnValue(0),
  getActiveFeeConfig: vi.fn().mockResolvedValue(null),
  recordEscrowFeeInTransaction: vi.fn().mockResolvedValue(undefined),
}));

// ─── Import AFTER mocks ────────────────────────────────────────────────────
import {
  getPendingVerifications,
  releaseEscrow,
  flagDiscrepancy,
} from '../../services/escrow.service';

// ═══════════════════════════════════════════════════════════════════════════
// Escrow Service Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Escrow Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getPendingVerifications ─────────────────────────────────────────
  describe('getPendingVerifications()', () => {
    it('should return enriched verification cases with default pagination', async () => {
      const mockRows = [
        {
          proof_id: 'proof-001',
          proof_item_id: 'item-001',
          proof_project_id: 'proj-001',
          proof_engineer_id: 'eng-001',
          proof_gps_coordinates: 'POINT(36.2 33.5)',
          proof_gps_accuracy_meters: 5.2,
          proof_captured_at: new Date('2026-03-10'),
          proof_image_url: 'https://s3.nammerha.com/proof-001.jpg',
          proof_image_hash: 'sha256:abc',
          proof_description: 'Cement delivery verified',
          proof_device_info: { model: 'iPhone 15' },
          proof_created_at: new Date('2026-03-10'),
          project_title: 'Aleppo School Reconstruction',
          project_gps_location: 'POINT(37.16 36.20)',
          project_address_text: 'Aleppo, Syria',
          boq_material_name: 'Portland Cement',
          boq_material_category: 'masonry',
          boq_unit_price: 250000,
          boq_required_quantity: 10,
          engineer_name: 'Eng. Ahmad',
          po_data: { po_id: 'po-001', po_number: 'NM-PO-001' },
          escrow_data: [
            {
              transaction_id: 'tx-001',
              user_id: 'user-001',
              amount_locked: 500000,
              payment_status: 'locked',
            },
          ],
          // PLT-AUD-FIX: Include total_count from COUNT(*) OVER() window function
          total_count: '1',
        },
      ];

      // Single query with COUNT(*) OVER() window function — no separate count query
      mockQuery.mockResolvedValueOnce({ rows: mockRows, rowCount: 1 });

      const result = await getPendingVerifications();

      expect(result.cases).toHaveLength(1);
      expect(result.total).toBe(1);

      const verificationCase = result.cases[0];
      expect(verificationCase).toBeDefined();
      if (verificationCase) {
        expect(verificationCase.proof.proof_id).toBe('proof-001');
        expect(verificationCase.proof.verification_status).toBe('submitted');
        expect(verificationCase.project.title).toBe('Aleppo School Reconstruction');
        expect(verificationCase.boq_item.material_name).toBe('Portland Cement');
        expect(verificationCase.boq_item.unit_price).toBe(250000);
        expect(verificationCase.purchase_order).toBeTruthy();
        expect(verificationCase.escrow_entries).toHaveLength(1);
        expect(verificationCase.engineer_name).toBe('Eng. Ahmad');
      }

      // Verify default pagination params: LIMIT 25 OFFSET 0
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [25, 0],
      );
    });

    it('should apply custom pagination parameters', async () => {
      // Single query with COUNT(*) OVER() — empty result set means total = 0
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getPendingVerifications(10, 20);

      expect(result.cases).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [10, 20],
      );
    });

    it('should handle null po_data gracefully (no PO exists)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            proof_id: 'proof-002',
            proof_item_id: 'item-002',
            proof_project_id: 'proj-002',
            proof_engineer_id: 'eng-002',
            proof_gps_coordinates: 'POINT(36.2 33.5)',
            proof_gps_accuracy_meters: null,
            proof_captured_at: new Date(),
            proof_image_url: 'https://s3.nammerha.com/proof-002.jpg',
            proof_image_hash: null,
            proof_description: null,
            proof_device_info: null,
            proof_created_at: new Date(),
            project_title: 'Homs Hospital',
            project_gps_location: null,
            project_address_text: null,
            boq_material_name: 'Steel Rebar',
            boq_material_category: null,
            boq_unit_price: 800000,
            boq_required_quantity: 5,
            engineer_name: 'Eng. Sara',
            po_data: null, // No purchase order
            escrow_data: null, // No escrow entries
            // PLT-AUD-FIX: Include total_count from COUNT(*) OVER() window function
            total_count: '1',
          },
        ],
        rowCount: 1,
      });
      // Single query — no separate count query needed

      const result = await getPendingVerifications();

      const verificationCase = result.cases[0];
      expect(verificationCase).toBeDefined();
      if (verificationCase) {
        expect(verificationCase.purchase_order).toBeNull();
        expect(verificationCase.escrow_entries).toEqual([]);
      }
    });
  });

  // ─── releaseEscrow ──────────────────────────────────────────────────
  describe('releaseEscrow()', () => {
    it('should atomically release escrow, update BOQ, and notify users', async () => {
      const mockClient = {
        query: vi
          .fn()
          // 0. SET TRANSACTION ISOLATION LEVEL SERIALIZABLE
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          // 1. Fetch proof (FOR UPDATE)
          .mockResolvedValueOnce({
            rows: [
              {
                proof_id: 'proof-001',
                item_id: 'item-001',
                project_id: 'proj-001',
                engineer_id: 'eng-001',
                verification_status: 'submitted',
                image_url: 'https://s3.nammerha.com/proof.jpg',
              },
            ],
            rowCount: 1,
          })
          // 2. Update proof to verified
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          // 3. Release escrow entries RETURNING
          .mockResolvedValueOnce({
            rows: [
              { transaction_id: 'tx-001', user_id: 'user-001', amount_locked: 300000 },
              { transaction_id: 'tx-002', user_id: 'user-002', amount_locked: 200000 },
            ],
            rowCount: 2,
          })
          // 4. Update BOQ status to 'delivered'
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          // 5. Get project title
          .mockResolvedValueOnce({
            rows: [{ title: 'Aleppo School' }],
            rowCount: 1,
          })
          // 6. Get material name
          .mockResolvedValueOnce({
            rows: [{ material_name: 'Cement' }],
            rowCount: 1,
          }),
      };

      // Mock notification creation (called for each unique user)
      mockCreateNotification
        .mockResolvedValueOnce({ notification_id: 'notif-001' })
        .mockResolvedValueOnce({ notification_id: 'notif-002' });

      mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) =>
        fn(mockClient),
      );

      const result = await releaseEscrow('auditor-001', {
        proof_id: 'proof-001',
        item_id: 'item-001',
      });

      expect(result.released_count).toBe(2);
      expect(result.total_released).toBe(500000); // 300000 + 200000

      // Verify proof was marked as verified (call index 2 due to SERIALIZABLE set)
      const proofUpdateCall = mockClient.query.mock.calls[2] as unknown[];
      expect(proofUpdateCall[0] as string).toContain("verification_status = 'verified'");
      expect(proofUpdateCall[1]).toContain('auditor-001');

      // Verify BOQ was updated to delivered (call index 4)
      const boqUpdateCall = mockClient.query.mock.calls[4] as unknown[];
      expect(boqUpdateCall[0] as string).toContain("status = 'delivered'");

      // Verify notifications sent to both users
      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
      expect(mockCreateNotification).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          user_id: 'user-001',
          type: 'delivery_confirmed',
        }),
      );
      expect(mockCreateNotification).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          user_id: 'user-002',
          type: 'delivery_confirmed',
        }),
      );
    });

    it('should throw when spatial proof does not exist', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SET ISOLATION LEVEL
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
      };

      mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) =>
        fn(mockClient),
      );

      await expect(
        releaseEscrow('auditor-001', { proof_id: 'nonexistent', item_id: 'item-001' }),
      ).rejects.toThrow('not found');
    });

    it('should throw when proof is already processed (idempotency guard)', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SET ISOLATION LEVEL
          .mockResolvedValueOnce({
            rows: [
              {
                proof_id: 'proof-001',
                item_id: 'item-001',
                verification_status: 'verified', // Already processed
              },
            ],
            rowCount: 1,
          }),
      };

      mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) =>
        fn(mockClient),
      );

      await expect(
        releaseEscrow('auditor-001', { proof_id: 'proof-001', item_id: 'item-001' }),
      ).rejects.toThrow('already processed');
    });

    it('should throw when proof item_id mismatches the requested item_id', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SET ISOLATION LEVEL
          .mockResolvedValueOnce({
            rows: [
              {
                proof_id: 'proof-001',
                item_id: 'item-DIFFERENT',
                verification_status: 'submitted',
              },
            ],
            rowCount: 1,
          }),
      };

      mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) =>
        fn(mockClient),
      );

      await expect(
        releaseEscrow('auditor-001', { proof_id: 'proof-001', item_id: 'item-001' }),
      ).rejects.toThrow('does not match');
    });

    it('should deduplicate notifications for same user with multiple escrow entries', async () => {
      const mockClient = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SET ISOLATION LEVEL
          .mockResolvedValueOnce({
            rows: [
              {
                proof_id: 'proof-001',
                item_id: 'item-001',
                project_id: 'proj-001',
                engineer_id: 'eng-001',
                verification_status: 'submitted',
                image_url: 'url',
              },
            ],
            rowCount: 1,
          })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          // Same user has 3 escrow entries for this item
          .mockResolvedValueOnce({
            rows: [
              { transaction_id: 'tx-001', user_id: 'user-001', amount_locked: 100000 },
              { transaction_id: 'tx-002', user_id: 'user-001', amount_locked: 200000 },
              { transaction_id: 'tx-003', user_id: 'user-001', amount_locked: 300000 },
            ],
            rowCount: 3,
          })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ title: 'Test Project' }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ material_name: 'Steel' }], rowCount: 1 }),
      };

      mockCreateNotification.mockResolvedValue({ notification_id: 'notif-001' });
      mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) =>
        fn(mockClient),
      );

      const result = await releaseEscrow('auditor-001', {
        proof_id: 'proof-001',
        item_id: 'item-001',
      });

      expect(result.released_count).toBe(3);
      expect(result.total_released).toBe(600000);
      // Only 1 notification despite 3 escrow entries (same user)
      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    });
  });

  // ─── flagDiscrepancy ────────────────────────────────────────────────
  describe('flagDiscrepancy()', () => {
    it('should reject proof and notify engineer', async () => {
      const rejectedProof = {
        proof_id: 'proof-001',
        item_id: 'item-001',
        project_id: 'proj-001',
        engineer_id: 'eng-001',
        verification_status: 'rejected',
        image_url: 'url',
      };

      const mockClient = {
        query: vi.fn().mockResolvedValueOnce({
          rows: [rejectedProof],
          rowCount: 1,
        }),
      };

      mockCreateNotification.mockResolvedValue({ notification_id: 'notif-001' });
      mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) =>
        fn(mockClient),
      );

      const result = await flagDiscrepancy('auditor-001', {
        proof_id: 'proof-001',
        reason: 'GPS coordinates do not match project location',
      });

      expect(result.proof_id).toBe('proof-001');

      // Verify UPDATE query includes rejection reason and auditor ID
      const updateCall = mockClient.query.mock.calls[0] as unknown[];
      expect(updateCall[0] as string).toContain("verification_status = 'rejected'");
      expect(updateCall[1]).toContain('auditor-001');
      expect(updateCall[1]).toContain('GPS coordinates do not match project location');

      // Verify engineer was notified
      expect(mockCreateNotification).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          user_id: 'eng-001',
          type: 'discrepancy_flagged',
          data: expect.objectContaining({
            rejection_reason: 'GPS coordinates do not match project location',
          }),
        }),
      );
    });

    it('should throw when proof is not found or already processed', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 }),
      };

      mockTransaction.mockImplementationOnce(async (fn: (client: unknown) => Promise<unknown>) =>
        fn(mockClient),
      );

      await expect(
        flagDiscrepancy('auditor-001', {
          proof_id: 'nonexistent',
          reason: 'Test reason',
        }),
      ).rejects.toThrow('not found or already processed');
    });
  });
});
