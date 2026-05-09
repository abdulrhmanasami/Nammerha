// ============================================================================
// Nammerha Backend — Unit Tests: Spatial Proof Zod Schema (F-006)
// ============================================================================

import { describe, it, expect } from 'vitest';
import { parseSpatialProof, formatZodErrors } from '../spatial-proof.schema';
import { ZodError } from 'zod';

// ─── Valid Baseline Payload ─────────────────────────────────────────────────

const VALID_PAYLOAD = {
    item_id: '550e8400-e29b-41d4-a716-446655440000',
    project_id: '6ba7b810-9dad-41d4-a716-446655440000',
    gps_lat: 33.5138,
    gps_lng: 36.2765,
    image_url: 'https://storage.nammerha.com/proofs/abc123.jpg',
};

// ─── Happy Path ─────────────────────────────────────────────────────────────

describe('parseSpatialProof — Happy Path', () => {
    it('should accept valid minimal payload', () => {
        const result = parseSpatialProof(VALID_PAYLOAD);
        expect(result.item_id).toBe(VALID_PAYLOAD.item_id);
        expect(result.gps_lat).toBe(33.5138);
        expect(result.gps_lng).toBe(36.2765);
    });

    it('should accept valid full payload with all optional fields', () => {
        const result = parseSpatialProof({
            ...VALID_PAYLOAD,
            gps_accuracy_meters: 15.5,
            description: 'Cement bags delivered to site',
            device_info: { os: 'Android', version: '14' },
            client_hash: 'abc123def456',
        });
        expect(result.gps_accuracy_meters).toBe(15.5);
        expect(result.description).toBe('Cement bags delivered to site');
    });

    it('should accept boundary coordinates (poles and dateline)', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lat: 90, gps_lng: 180 })).not.toThrow();
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lat: -90, gps_lng: -180 })).not.toThrow();
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lat: 0, gps_lng: 0 })).not.toThrow();
    });
});

// ─── Required Field Validation ──────────────────────────────────────────────

describe('parseSpatialProof — Required Fields', () => {
    it('should reject missing item_id', () => {
        const { item_id: _item_id, ...payload } = VALID_PAYLOAD;
        expect(() => parseSpatialProof(payload)).toThrow(ZodError);
    });

    it('should reject missing project_id', () => {
        const { project_id: _project_id, ...payload } = VALID_PAYLOAD;
        expect(() => parseSpatialProof(payload)).toThrow(ZodError);
    });

    it('should reject missing gps_lat', () => {
        const { gps_lat: _gps_lat, ...payload } = VALID_PAYLOAD;
        expect(() => parseSpatialProof(payload)).toThrow(ZodError);
    });

    it('should reject missing gps_lng', () => {
        const { gps_lng: _gps_lng, ...payload } = VALID_PAYLOAD;
        expect(() => parseSpatialProof(payload)).toThrow(ZodError);
    });

    it('should reject missing image_url', () => {
        const { image_url: _image_url, ...payload } = VALID_PAYLOAD;
        expect(() => parseSpatialProof(payload)).toThrow(ZodError);
    });

    it('should reject empty body', () => {
        expect(() => parseSpatialProof({})).toThrow(ZodError);
    });

    it('should reject null body', () => {
        expect(() => parseSpatialProof(null)).toThrow(ZodError);
    });
});

// ─── UUID Validation ────────────────────────────────────────────────────────

describe('parseSpatialProof — UUID Validation', () => {
    it('should reject non-UUID item_id', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, item_id: 'not-a-uuid' })).toThrow(ZodError);
    });

    it('should reject XSS in item_id', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, item_id: '<script>alert(1)</script>' })).toThrow(ZodError);
    });

    it('should reject SQL injection in project_id', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, project_id: "'; DROP TABLE--" })).toThrow(ZodError);
    });
});

// ─── Coordinate Validation ──────────────────────────────────────────────────

describe('parseSpatialProof — Coordinate Ranges', () => {
    it('should reject gps_lat > 90', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lat: 91 })).toThrow(ZodError);
    });

    it('should reject gps_lat < -90', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lat: -91 })).toThrow(ZodError);
    });

    it('should reject gps_lng > 180', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lng: 181 })).toThrow(ZodError);
    });

    it('should reject gps_lng < -180', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lng: -181 })).toThrow(ZodError);
    });

    it('should reject gps_lat as string', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lat: '33.51' })).toThrow(ZodError);
    });

    it('should reject gps_lat = NaN', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lat: NaN })).toThrow(ZodError);
    });

    it('should reject gps_lng = Infinity', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lng: Infinity })).toThrow(ZodError);
    });

    it('should reject gps_lat = -Infinity', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_lat: -Infinity })).toThrow(ZodError);
    });
});

// ─── String Length Bounds ───────────────────────────────────────────────────

describe('parseSpatialProof — String Bounds', () => {
    it('should reject empty image_url', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, image_url: '' })).toThrow(ZodError);
    });

    it('should reject image_url exceeding 2048 chars', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, image_url: 'x'.repeat(2049) })).toThrow(ZodError);
    });

    it('should reject description exceeding 2000 chars', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, description: 'x'.repeat(2001) })).toThrow(ZodError);
    });

    it('should reject client_hash exceeding 128 chars', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, client_hash: 'x'.repeat(129) })).toThrow(ZodError);
    });
});

// ─── GPS Accuracy ───────────────────────────────────────────────────────────

describe('parseSpatialProof — GPS Accuracy', () => {
    it('should reject negative gps_accuracy_meters', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_accuracy_meters: -5 })).toThrow(ZodError);
    });

    it('should reject gps_accuracy_meters = 0', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_accuracy_meters: 0 })).toThrow(ZodError);
    });

    it('should reject gps_accuracy_meters > 10000', () => {
        expect(() => parseSpatialProof({ ...VALID_PAYLOAD, gps_accuracy_meters: 10001 })).toThrow(ZodError);
    });

    it('should accept gps_accuracy_meters = 150 (valid GPS)', () => {
        const result = parseSpatialProof({ ...VALID_PAYLOAD, gps_accuracy_meters: 150 });
        expect(result.gps_accuracy_meters).toBe(150);
    });
});

// ─── Error Formatting ───────────────────────────────────────────────────────

describe('formatZodErrors', () => {
    it('should format multiple field errors into semicolon-separated string', () => {
        try {
            parseSpatialProof({ gps_lat: 'bad', gps_lng: 999 });
        } catch (error) {
            expect(error).toBeInstanceOf(ZodError);
            const formatted = formatZodErrors(error as ZodError);
            expect(typeof formatted).toBe('string');
            expect(formatted.length).toBeGreaterThan(0);
            // Should contain field paths
            expect(formatted).toContain('item_id');
        }
    });
});
