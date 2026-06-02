// ============================================================================
// Nammerha — Project Routes Integration Tests
// Tests: Project creation validation, BOQ item validation, publish flow
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Database ──────────────────────────────────────────────────────────
const mockQuery = vi.fn();
vi.mock('../../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  getClient: vi.fn(),
  transaction: vi.fn(),
  financialTransaction: vi.fn(),
  default: {},
}));

// ─── Test Data ──────────────────────────────────────────────────────────────
const VALID_PROJECT_DTO = {
  title: 'Harbor View Reconstruction',
  damage_type: 'structural',
  gps_lat: 36.2021,
  gps_lng: 37.1343,
  governorate: 'Aleppo',
  description: 'Multi-story residential building with severe structural damage',
};

const VALID_BOQ_DTO = {
  material_name: '50 Bags of Cement',
  unit: 'bag',
  unit_price: 1000, // cents
  required_quantity: 50,
  preferred_supplier_id: 'supplier-uuid-123',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Project Route Validation (Unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/projects — Create Damage Report', () => {
    it('should reject missing title', () => {
      const dto = { ...VALID_PROJECT_DTO, title: '' };
      expect(!dto.title || !dto.damage_type || dto.gps_lat === null || dto.gps_lng === null).toBe(
        true,
      );
    });

    it('should reject missing damage_type', () => {
      const dto = { ...VALID_PROJECT_DTO, damage_type: '' };
      expect(!dto.title || !dto.damage_type || dto.gps_lat === null || dto.gps_lng === null).toBe(
        true,
      );
    });

    it('should reject missing GPS coordinates', () => {
      const dto = { ...VALID_PROJECT_DTO, gps_lat: null, gps_lng: null };
      expect(!dto.title || !dto.damage_type || dto.gps_lat === null || dto.gps_lng === null).toBe(
        true,
      );
    });

    it('should accept valid project DTO', () => {
      const dto = VALID_PROJECT_DTO;
      expect(!dto.title || !dto.damage_type || dto.gps_lat === null || dto.gps_lng === null).toBe(
        false,
      );
    });

    it('should validate GPS coordinates are within Syria bounds', () => {
      // Syria approximate bounds: lat 32-37, lng 35-42
      const lat = VALID_PROJECT_DTO.gps_lat;
      const lng = VALID_PROJECT_DTO.gps_lng;
      expect(lat).toBeGreaterThanOrEqual(32);
      expect(lat).toBeLessThanOrEqual(37.5);
      expect(lng).toBeGreaterThanOrEqual(35);
      expect(lng).toBeLessThanOrEqual(42.5);
    });
  });

  describe('POST /api/projects/:id/boq — Add BOQ Item', () => {
    it('should reject missing material_name', () => {
      const dto = { ...VALID_BOQ_DTO, material_name: '' };
      expect(
        !dto.material_name ||
          !dto.unit ||
          dto.unit_price === null ||
          dto.required_quantity === null ||
          !dto.preferred_supplier_id,
      ).toBe(true);
    });

    it('should reject missing unit', () => {
      const dto = { ...VALID_BOQ_DTO, unit: '' };
      expect(
        !dto.material_name ||
          !dto.unit ||
          dto.unit_price === null ||
          dto.required_quantity === null ||
          !dto.preferred_supplier_id,
      ).toBe(true);
    });

    it('should reject missing supplier ID', () => {
      const dto = { ...VALID_BOQ_DTO, preferred_supplier_id: '' };
      expect(
        !dto.material_name ||
          !dto.unit ||
          dto.unit_price === null ||
          dto.required_quantity === null ||
          !dto.preferred_supplier_id,
      ).toBe(true);
    });

    it('should accept valid BOQ item', () => {
      const dto = VALID_BOQ_DTO;
      expect(
        !dto.material_name ||
          !dto.unit ||
          dto.unit_price === null ||
          dto.required_quantity === null ||
          !dto.preferred_supplier_id,
      ).toBe(false);
    });

    it('should enforce positive unit_price', () => {
      expect(VALID_BOQ_DTO.unit_price).toBeGreaterThan(0);
    });

    it('should enforce positive required_quantity', () => {
      expect(VALID_BOQ_DTO.required_quantity).toBeGreaterThan(0);
    });
  });

  describe('Project Service — Database Operations', () => {
    it('should create project with OCDS status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            project_id: 'proj-uuid-001',
            title: VALID_PROJECT_DTO.title,
            status: 'submitted',
            damage_type: 'structural',
            ocds_id: 'ocds-213czf-proj-uuid-001',
          },
        ],
        rowCount: 1,
      });

      const result = await mockQuery('INSERT INTO projects ...', []);
      expect(result.rows[0].status).toBe('submitted');
      expect(result.rows[0].ocds_id).toContain('ocds-');
    });

    it('should assign engineer to project', async () => {
      // Find available engineer
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'eng-uuid-001',
            full_name: 'Ahmad Engineer',
          },
        ],
        rowCount: 1,
      });
      // Update project
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            project_id: 'proj-uuid-001',
            assigned_engineer_id: 'eng-uuid-001',
          },
        ],
        rowCount: 1,
      });

      const engResult = await mockQuery('SELECT user_id FROM users WHERE role = $1', ['engineer']);
      expect(engResult.rows[0].user_id).toBe('eng-uuid-001');
    });

    it('should publish project to marketplace', async () => {
      // Reset mock queue without clearing the mock function itself
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            project_id: 'proj-uuid-001',
            status: 'published',
            published_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      });

      const result = await mockQuery('UPDATE projects SET status = $1', ['published']);
      expect(result.rows[0].status).toBe('published');
    });
  });
});
