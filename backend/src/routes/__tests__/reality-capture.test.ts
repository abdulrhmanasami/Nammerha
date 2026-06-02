// ============================================================================
// Nammerha — Reality Capture Service Unit Tests (FA-NMR-2026-005)
// Tests GPS proximity validation, capture submission, annotations, and floor plans
//
// Coverage:
//   1. submitCapture — engineer assignment verification
//   2. submitCapture — GPS proximity validation (Haversine < 500m)
//   3. submitCapture — GPS proximity rejection + audit trail logging
//   4. getProjectCaptures — filter by phase/type + pagination
//   5. getHiddenWorks — pre-concrete phase captures
//   6. verifyCapture — admin verification status update
//   7. addAnnotation — snagging annotation creation
//   8. getCaptureAnnotations — annotation retrieval
//   9. uploadFloorPlan — version numbering
//   10. getFloorPlans — active plans retrieval
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Database BEFORE imports ───────────────────────────────────────────
const mockPoolQuery = vi.fn();
vi.mock('../../config/database', () => {
  const queryFn = (...args: unknown[]) => mockPoolQuery(...args);
  return {
    query: queryFn,
    financialTransaction: vi.fn().mockImplementation(async (cb) => cb({ query: queryFn })),
    default: { query: queryFn, end: vi.fn() },
  };
});

// ─── Mock Logger ────────────────────────────────────────────────────────────
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Mock EXIF & Fetch ──────────────────────────────────────────────────────
vi.mock('exifr', () => ({
  default: {
    gps: vi.fn(),
  },
}));

global.fetch = vi.fn() as unknown as typeof fetch;

// ─── Import AFTER mocks ────────────────────────────────────────────────────
import {
  submitCapture,
  getProjectCaptures,
  getHiddenWorks,
  verifyCapture,
  addAnnotation,
  getCaptureAnnotations,
  uploadFloorPlan,
  getFloorPlans,
} from '../../services/reality-capture.service';

import exifr from 'exifr';

// ═══════════════════════════════════════════════════════════════════════════
// Reality Capture Service Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Reality Capture Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockReset();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response);
    vi.mocked(exifr.gps).mockResolvedValue({ latitude: 33.5138, longitude: 36.2765 }); // Damascus
  });

  // ─── submitCapture ──────────────────────────────────────────────────
  describe('submitCapture()', () => {
    it('should throw when project does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        submitCapture('eng-001', 'proj-nonexistent', {
          construction_phase: 'foundation',
          file_url: 'https://storage.nammerha.com/cap1.jpg',
        }),
      ).rejects.toThrow('not found');
    });

    it('should throw when engineer is not assigned to project', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ assigned_engineer_id: 'eng-other' }],
        rowCount: 1,
      });

      await expect(
        submitCapture('eng-001', 'proj-001', {
          construction_phase: 'foundation',
          file_url: 'https://storage.nammerha.com/cap1.jpg',
        }),
      ).rejects.toThrow('Only the assigned engineer');
    });

    it('should reject capture without GPS EXIF metadata', async () => {
      // 1. Project lookup → assigned engineer matches
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ assigned_engineer_id: 'eng-001' }],
        rowCount: 1,
      });

      // Mock EXIF to return NO GPS data
      vi.mocked(exifr.gps).mockResolvedValueOnce(undefined as unknown as { latitude: number; longitude: number });

      await expect(
        submitCapture('eng-001', 'proj-001', {
          construction_phase: 'foundation',
          file_url: 'https://storage/cap1.jpg',
        }),
      ).rejects.toThrow('Missing EXIF GPS metadata');
    });

    it('should reject capture when GPS is too far from project site', async () => {
      // 1. Project lookup → assigned
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ assigned_engineer_id: 'eng-001' }],
        rowCount: 1,
      });
      // 2. GPS proximity check → project location (Damascus: 33.5138, 36.2765)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ project_lat: 33.5138, project_lng: 36.2765 }],
        rowCount: 1,
      });

      // Mock EXIF to return Aleppo coordinates
      vi.mocked(exifr.gps).mockResolvedValueOnce({ latitude: 36.1956, longitude: 37.132 });

      // 3. Audit trail insert for GPS violation
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Engineer claims to be in Aleppo (36.1956, 37.1320) — ~300km away
      await expect(
        submitCapture('eng-001', 'proj-001', {
          construction_phase: 'structural',
          file_url: 'https://storage.nammerha.com/cap2.jpg',
          gps_lat: 36.1956,
          gps_lng: 37.132,
        }),
      ).rejects.toThrow('GPS location mismatch');
    });

    it('should accept capture when GPS is within 500m of project site', async () => {
      // 1. Project lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ assigned_engineer_id: 'eng-001' }],
        rowCount: 1,
      });
      // 2. GPS proximity check → project at (33.5138, 36.2765)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ project_lat: 33.5138, project_lng: 36.2765 }],
        rowCount: 1,
      });
      // 3. INSERT RETURNING (GPS validation passed)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            capture_id: 'cap-002',
            project_id: 'proj-001',
            engineer_id: 'eng-001',
            gps_coordinates: 'POINT(36.2770 33.5140)',
          },
        ],
        rowCount: 1,
      });

      // GPS very near the project (50m away)
      const result = await submitCapture('eng-001', 'proj-001', {
        construction_phase: 'structural',
        file_url: 'https://storage/cap2.jpg',
        gps_lat: 33.514, // ~50m offset
        gps_lng: 36.277,
      });

      expect(result.capture_id).toBe('cap-002');
    });
  });

  // ─── getProjectCaptures ─────────────────────────────────────────────
  describe('getProjectCaptures()', () => {
    it('should return captures with default pagination', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ capture_id: 'c1' }, { capture_id: 'c2' }],
        rowCount: 2,
      });

      const result = await getProjectCaptures('proj-001');

      expect(result).toHaveLength(2);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE rc.project_id = $1'),
        expect.arrayContaining(['proj-001']),
      );
    });

    it('should filter by construction_phase when provided', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await getProjectCaptures('proj-001', 'foundation');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('construction_phase = $2'),
        expect.arrayContaining(['proj-001', 'foundation']),
      );
    });

    it('should cap limit at 100', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await getProjectCaptures('proj-001', undefined, undefined, 999, 0);

      // Math.min(999, 100) = 100
      const firstCall = mockPoolQuery.mock.calls[0] as [string, unknown[]];
      const params = firstCall[1];
      expect(params).toContain(100);
    });
  });

  // ─── getHiddenWorks ─────────────────────────────────────────────────
  describe('getHiddenWorks()', () => {
    it('should query pre-concrete phase captures', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ capture_id: 'hw-1', construction_phase: 'plumbing_pre_concrete' }],
        rowCount: 1,
      });

      const result = await getHiddenWorks('proj-001');

      expect(result).toHaveLength(1);
      expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining('ANY($2)'), [
        'proj-001',
        expect.arrayContaining([
          'plumbing_pre_concrete',
          'electrical_pre_concrete',
          'foundation',
          'structural',
        ]),
      ]);
    });
  });

  // ─── verifyCapture ──────────────────────────────────────────────────
  describe('verifyCapture()', () => {
    it('should update verification status', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ capture_id: 'cap-001', is_verified: true, verified_by: 'admin-001' }],
        rowCount: 1,
      });

      const result = await verifyCapture('cap-001', 'admin-001');

      expect(result.is_verified).toBe(true);
      expect(result.verified_by).toBe('admin-001');
    });

    it('should throw when capture not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(verifyCapture('nonexistent', 'admin-001')).rejects.toThrow('Capture not found');
    });
  });

  // ─── addAnnotation ──────────────────────────────────────────────────
  describe('addAnnotation()', () => {
    it('should create annotation on existing capture', async () => {
      // 1. Capture exists check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ capture_id: 'cap-001' }],
        rowCount: 1,
      });
      // 2. INSERT annotation
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            annotation_id: 'ann-001',
            capture_id: 'cap-001',
            note: 'Crack in east wall',
            severity: 'warning',
          },
        ],
        rowCount: 1,
      });

      const result = await addAnnotation('cap-001', 'eng-001', {
        note: 'Crack in east wall',
        severity: 'warning',
        pos_x: 0.45,
        pos_y: 0.72,
      });

      expect(result.note).toBe('Crack in east wall');
      expect(result.severity).toBe('warning');
    });

    it('should throw when capture does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(addAnnotation('nonexistent', 'eng-001', { note: 'Test' })).rejects.toThrow(
        'Capture not found',
      );
    });
  });

  // ─── getCaptureAnnotations ──────────────────────────────────────────
  describe('getCaptureAnnotations()', () => {
    it('should return annotations for a capture', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { annotation_id: 'a1', note: 'Issue 1' },
          { annotation_id: 'a2', note: 'Issue 2' },
        ],
        rowCount: 2,
      });

      const result = await getCaptureAnnotations('cap-001');

      expect(result).toHaveLength(2);
    });
  });

  // ─── uploadFloorPlan ────────────────────────────────────────────────
  describe('uploadFloorPlan()', () => {
    it('should create floor plan with auto-incrementing version', async () => {
      // 1. Get next version
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ next_version: 3 }],
        rowCount: 1,
      });
      // 2. INSERT RETURNING
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            plan_id: 'fp-001',
            project_id: 'proj-001',
            version: 3,
            title: 'Ground Floor v3',
          },
        ],
        rowCount: 1,
      });

      const result = await uploadFloorPlan('eng-001', 'proj-001', {
        title: 'Ground Floor v3',
        file_url: 'https://storage/fp3.pdf',
      });

      expect(result.version).toBe(3);
    });
  });

  // ─── getFloorPlans ──────────────────────────────────────────────────
  describe('getFloorPlans()', () => {
    it('should return only active floor plans', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ plan_id: 'fp-001', is_active: true }],
        rowCount: 1,
      });

      const result = await getFloorPlans('proj-001');

      expect(result).toHaveLength(1);
      expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining('is_active = true'), [
        'proj-001',
      ]);
    });
  });
});
