// ============================================================================
// Nammerha — Compliance Service Unit Tests (IMP-001)
// ============================================================================
// SDN Screening + Export Controls (Dual-Use Materials)
// Covers: screenUserAgainstSDN, reviewScreeningResult, importSDNList,
//         checkDualUse, getPendingScreenings, addControlledMaterial
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Database BEFORE importing service ─────────────────────────────────
const mockQuery = vi.fn();
const mockTransactionFn = vi.fn();

vi.mock('../../config/database', () => ({
  default: { query: (...args: unknown[]) => mockQuery(...args) },
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: (fn: (client: unknown) => unknown) => mockTransactionFn(fn),
  financialTransaction: (fn: (client: unknown) => unknown) => mockTransactionFn(fn),
  getClient: vi.fn(),
}));

// ─── Import service AFTER mocks ─────────────────────────────────────────────
import {
  screenUserAgainstSDN,
  getScreeningResults,
  reviewScreeningResult,
  importSDNList,
  getPendingScreenings,
  checkDualUse,
  addControlledMaterial,
  listControlledMaterials,
  getDualUseItems,
} from '../compliance.service';

// ─── Helper: Create mock transaction client ─────────────────────────────────
function setupTransaction() {
  const clientQuery = vi.fn();
  mockTransactionFn.mockImplementation(
    async (fn: (client: { query: typeof clientQuery }) => unknown) => {
      const client = { query: clientQuery };
      return fn(client);
    },
  );
  return clientQuery;
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('Compliance Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockTransactionFn.mockReset();
  });

  // ─── SDN Screening ──────────────────────────────────────────────────────
  describe('screenUserAgainstSDN', () => {
    it('should return "clear" when no SDN match above threshold', async () => {
      const clientQuery = setupTransaction();

      // Mock 1: Get user name
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user-1', full_name: 'Ahmad Hammoud', role: 'user' }],
          rowCount: 1,
        })
        // Mock 2: No SDN match
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Mock transaction: INSERT screening result
      clientQuery.mockResolvedValueOnce({
        rows: [
          {
            result_id: 'sr-1',
            screened_user_id: 'user-1',
            matched_sdn_id: null,
            match_score: 0,
            matched_name: null,
            screened_name: 'Ahmad Hammoud',
            status: 'clear',
            reviewed_by: null,
            reviewed_at: null,
            review_notes: null,
            auto_blocked: false,
            screened_at: new Date(),
          },
        ],
      });

      const result = await screenUserAgainstSDN('user-1');

      expect(result.status).toBe('clear');
      expect(result.auto_blocked).toBe(false);
      expect(result.matched_sdn_id).toBeNull();
    });

    it('should throw when user is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(screenUserAgainstSDN('nonexistent')).rejects.toThrow(
        'User nonexistent not found',
      );
    });

    it('should return "potential_match" for scores between 0.4 and 0.85', async () => {
      const clientQuery = setupTransaction();

      // Mock 1: User exists
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user-2', full_name: 'Mohammed Ali', role: 'supplier' }],
          rowCount: 1,
        })
        // Mock 2: SDN match with score 0.6
        .mockResolvedValueOnce({
          rows: [{ sdn_id: 'sdn-99', sdn_name: 'Muhammad Ali', match_score: '0.6' }],
          rowCount: 1,
        });

      // Transaction INSERT
      clientQuery.mockResolvedValueOnce({
        rows: [
          {
            result_id: 'sr-2',
            screened_user_id: 'user-2',
            matched_sdn_id: 'sdn-99',
            match_score: 0.6,
            matched_name: 'Muhammad Ali',
            screened_name: 'Mohammed Ali',
            status: 'potential_match',
            auto_blocked: false,
            screened_at: new Date(),
          },
        ],
      });

      const result = await screenUserAgainstSDN('user-2');

      expect(result.status).toBe('potential_match');
      expect(result.auto_blocked).toBe(false);
      expect(result.matched_sdn_id).toBe('sdn-99');
    });

    it('should auto-block and return "confirmed_match" for scores >= 0.85', async () => {
      const clientQuery = setupTransaction();

      // Mock 1: User exists
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user-3', full_name: 'Exact Match Name', role: 'homeowner' }],
          rowCount: 1,
        })
        // Mock 2: SDN match with score 0.92
        .mockResolvedValueOnce({
          rows: [{ sdn_id: 'sdn-1', sdn_name: 'Exact Match Name', match_score: '0.92' }],
          rowCount: 1,
        });

      // Transaction: UPDATE user (deactivate) + INSERT screening result
      clientQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE users SET is_active = false
        .mockResolvedValueOnce({
          rows: [
            {
              result_id: 'sr-3',
              screened_user_id: 'user-3',
              matched_sdn_id: 'sdn-1',
              match_score: 0.92,
              matched_name: 'Exact Match Name',
              screened_name: 'Exact Match Name',
              status: 'confirmed_match',
              auto_blocked: true,
              screened_at: new Date(),
            },
          ],
        });

      const result = await screenUserAgainstSDN('user-3');

      expect(result.status).toBe('confirmed_match');
      expect(result.auto_blocked).toBe(true);
      // Verify deactivation query was called
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET is_active = false'),
        ['user-3'],
      );
    });
  });

  // ─── Screening History ──────────────────────────────────────────────────
  describe('getScreeningResults', () => {
    it('should return screening history ordered by date DESC', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { result_id: 'sr-1', status: 'clear', screened_at: '2026-03-01' },
          { result_id: 'sr-2', status: 'potential_match', screened_at: '2026-02-01' },
        ],
        rowCount: 2,
      });

      const results = await getScreeningResults('user-1');

      expect(results).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ssr.screened_user_id = $1'),
        ['user-1'],
      );
    });
  });

  // ─── Admin Review ───────────────────────────────────────────────────────
  describe('reviewScreeningResult', () => {
    it('should clear false_positive and reactivate auto-blocked user', async () => {
      const clientQuery = vi.fn();
      mockTransactionFn.mockImplementation(
        async (fn: (client: { query: typeof clientQuery }) => unknown) => {
          return fn({ query: clientQuery });
        },
      );

      // UPDATE screening result
      clientQuery.mockResolvedValueOnce({
        rows: [
          {
            result_id: 'sr-4',
            screened_user_id: 'user-blocked',
            status: 'false_positive',
            auto_blocked: true,
          },
        ],
      });
      // UPDATE users SET is_active = true
      clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await reviewScreeningResult(
        'sr-4',
        'admin-1',
        'false_positive',
        'Name mismatch',
      );

      expect(result.status).toBe('false_positive');
      // Verify user was reactivated
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET is_active = true'),
        ['user-blocked'],
      );
    });

    it('should block user on confirmed_match', async () => {
      const clientQuery = vi.fn();
      mockTransactionFn.mockImplementation(
        async (fn: (client: { query: typeof clientQuery }) => unknown) => {
          return fn({ query: clientQuery });
        },
      );

      clientQuery.mockResolvedValueOnce({
        rows: [
          {
            result_id: 'sr-5',
            screened_user_id: 'user-suspect',
            status: 'confirmed_match',
            auto_blocked: false,
          },
        ],
      });
      clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await reviewScreeningResult('sr-5', 'admin-1', 'confirmed_match');

      expect(result.status).toBe('confirmed_match');
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET is_active = false'),
        expect.arrayContaining(['sr-5']),
      );
    });

    it('should throw when screening result not found', async () => {
      const clientQuery = vi.fn();
      mockTransactionFn.mockImplementation(
        async (fn: (client: { query: typeof clientQuery }) => unknown) => {
          return fn({ query: clientQuery });
        },
      );

      clientQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        reviewScreeningResult('nonexistent', 'admin-1', 'false_positive'),
      ).rejects.toThrow('Screening result not found');
    });
  });

  // ─── SDN Import ─────────────────────────────────────────────────────────
  describe('importSDNList', () => {
    it('should return 0 for empty entries', async () => {
      const result = await importSDNList({ entries: [] });
      expect(result.imported).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should batch-insert entries with ON CONFLICT DO NOTHING', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 2 });

      const result = await importSDNList({
        entries: [
          { sdn_name: 'Person A', sdn_type: 'individual', country: 'SY' },
          { sdn_name: 'Entity B', sdn_type: 'entity', aliases: ['Org B'] },
        ],
      });

      expect(result.imported).toBe(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT DO NOTHING'),
        expect.any(Array),
      );
    });

    it('should handle entries with missing optional fields', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await importSDNList({
        entries: [{ sdn_name: 'Minimal Entry' }],
      });

      expect(result.imported).toBe(1);
      // Verify defaults are applied
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'Minimal Entry',
          'individual',
          null,
          null,
          null,
          'OFAC_SDN',
          null,
          null,
        ]),
      );
    });
  });

  // ─── Pending Screenings ─────────────────────────────────────────────────
  describe('getPendingScreenings', () => {
    it('should enforce pagination limits (max 100)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      await getPendingScreenings(999, 0);

      // First call should have limit clamped to 100
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [100, 0]);
    });

    it('should enforce minimum limit of 1', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      await getPendingScreenings(-5, 0);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [1, 0]);
    });

    it('should return results with total count', async () => {
      // F-005 FIX: Now a SINGLE query with COUNT(*) OVER() — total_count is included in each row
      mockQuery.mockResolvedValueOnce({
        rows: [{ result_id: 'sr-1', status: 'potential_match', total_count: '42' }],
        rowCount: 1,
      });

      const { results, total } = await getPendingScreenings(10, 0);

      expect(results).toHaveLength(1);
      expect(total).toBe(42);
    });
  });

  // ─── Dual-Use Materials ─────────────────────────────────────────────────
  describe('checkDualUse', () => {
    it('should return is_dual_use: false when no match found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await checkDualUse('item-1', 'Regular Cement');

      expect(result.is_dual_use).toBe(false);
      expect(result.regulation).toBeNull();
      expect(result.match_score).toBe(0);
    });

    it('should flag dual-use material and update BOQ item', async () => {
      // Match found
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            material_id: 'cm-1',
            material_name: 'Ammonium Nitrate',
            regulation: 'EAR',
            match_score: '0.85',
          },
        ],
        rowCount: 1,
      });
      // UPDATE itemized_boq
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await checkDualUse('item-2', 'Ammonium Nitrate Fertilizer', 'chemicals');

      expect(result.is_dual_use).toBe(true);
      expect(result.regulation).toBe('EAR');
      expect(result.match_score).toBeGreaterThan(0.3);
      // Verify BOQ item was flagged in DB
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE itemized_boq'), [
        'EAR',
        'item-2',
      ]);
    });

    it('should NOT flag when match score is exactly 0.3 or below', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            material_id: 'cm-2',
            material_name: 'Sodium Chloride',
            regulation: 'EAR',
            match_score: '0.25',
          },
        ],
        rowCount: 1,
      });

      const result = await checkDualUse('item-3', 'Table Salt');

      expect(result.is_dual_use).toBe(false);
      expect(result.regulation).toBeNull();
    });
  });

  // ─── Add Controlled Material ────────────────────────────────────────────
  describe('addControlledMaterial', () => {
    it('should insert with defaults for optional fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            material_id: 'cm-new',
            material_name: 'Carbon Fiber',
            material_category: 'composites',
            hs_code: null,
            regulation: 'EAR',
            description: null,
            risk_level: 'medium',
            is_active: true,
            created_at: new Date(),
          },
        ],
      });

      const result = await addControlledMaterial('admin-1', {
        material_name: 'Carbon Fiber',
        material_category: 'composites',
      });

      expect(result.material_name).toBe('Carbon Fiber');
      expect(result.regulation).toBe('EAR');
      expect(result.risk_level).toBe('medium');
    });
  });

  // ─── List Controlled Materials ──────────────────────────────────────────
  describe('listControlledMaterials', () => {
    it('should return only active materials ordered by category', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { material_id: 'cm-1', material_name: 'Ammonium Nitrate' },
          { material_id: 'cm-2', material_name: 'Potassium Nitrate' },
        ],
      });

      const materials = await listControlledMaterials();

      expect(materials).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE is_active = true'));
    });
  });

  // ─── Dual-Use Items Report ──────────────────────────────────────────────
  describe('getDualUseItems', () => {
    it('should return flagged items with project title', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            item_id: 'item-1',
            material_name: 'Ammonium Nitrate',
            is_dual_use: true,
            project_title: 'Aleppo Reconstruction',
          },
        ],
      });

      const items = await getDualUseItems();

      expect(items).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE b.is_dual_use = true'));
    });
  });
});
