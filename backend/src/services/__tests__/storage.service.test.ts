// ============================================================================
// Nammerha — Storage Service Unit Tests (IMP-001)
// ============================================================================
// S3-Compatible Object Storage (Pre-signed URL Architecture)
// Covers: validateUploadRequest, generateFileKey, generateUploadUrl
//
// Security Tests:
//   - SVG XSS prevention (image/svg+xml blocked)
//   - File size enforcement (FINOPS-002)
//   - Path traversal prevention (filename sanitization)
//   - NUL byte injection prevention
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock AWS SDK ───────────────────────────────────────────────────────────
vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
    PutObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    HeadObjectCommand: vi.fn(),
    ListObjectsV2Command: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: vi.fn().mockResolvedValue('https://mock-presigned-url.com/test'),
}));

vi.mock('../../utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Set env BEFORE importing service ───────────────────────────────────────
process.env['STORAGE_PROVIDER'] = 'minio';
process.env['STORAGE_BUCKET'] = 'test-bucket';
process.env['STORAGE_ACCESS_KEY'] = 'test-access-key';
process.env['STORAGE_SECRET_KEY'] = 'test-secret-key';
process.env['STORAGE_ENDPOINT'] = 'http://localhost:9000';
process.env['STORAGE_MAX_SIZE_MB'] = '50';
process.env['STORAGE_PRESIGN_EXPIRY'] = '3600';

import { validateUploadRequest, generateFileKey } from '../storage.service';
import type { UploadUrlRequest } from '../storage.service';

const VALID_REQUEST: UploadUrlRequest = {
    project_id: '12345678-1234-1234-1234-123456789abc',
    category: 'proof',
    filename: 'delivery-photo.jpg',
    content_type: 'image/jpeg',
    file_size_bytes: 1024 * 1024, // 1MB
};

// ═════════════════════════════════════════════════════════════════════════════
describe('Storage Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── Validation ─────────────────────────────────────────────────────────
    describe('validateUploadRequest', () => {
        it('should accept valid proof upload request', () => {
            expect(() => validateUploadRequest(VALID_REQUEST)).not.toThrow();
        });

        it('should accept all valid categories', () => {
            const categories = ['proof', 'boq', 'capture', 'floor_plan', 'document', 'avatar'] as const;
            for (const category of categories) {
                const validMimes: Record<string, string> = {
                    proof: 'image/jpeg',
                    boq: 'application/pdf',
                    capture: 'video/mp4',
                    floor_plan: 'image/png',
                    document: 'application/pdf',
                    avatar: 'image/webp',
                };
                expect(() => validateUploadRequest({
                    ...VALID_REQUEST,
                    category,
                    content_type: validMimes[category] ?? 'image/jpeg',
                })).not.toThrow();
            }
        });

        // ─── Security: SVG XSS Prevention ───────────────────────────────
        it('should REJECT image/svg+xml for all categories (XSS vector)', () => {
            const categories = ['proof', 'boq', 'capture', 'floor_plan', 'document', 'avatar'] as const;
            for (const category of categories) {
                expect(() => validateUploadRequest({
                    ...VALID_REQUEST,
                    category,
                    content_type: 'image/svg+xml',
                })).toThrow('not allowed');
            }
        });

        it('should reject invalid category', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                category: 'malware' as never,
            })).toThrow('Invalid upload category');
        });

        it('should reject wrong MIME type for category', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                category: 'avatar',
                content_type: 'application/pdf',
            })).toThrow('not allowed');
        });

        // ─── FINOPS-002: File Size Enforcement ──────────────────────────
        it('should reject missing file_size_bytes', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                file_size_bytes: undefined,
            })).toThrow('file_size_bytes is required');
        });

        it('should reject zero file_size_bytes', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                file_size_bytes: 0,
            })).toThrow('must be positive');
        });

        it('should reject negative file_size_bytes', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                file_size_bytes: -100,
            })).toThrow('must be positive');
        });

        it('should reject non-integer file_size_bytes', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                file_size_bytes: 1024.5,
            })).toThrow('must be an integer');
        });

        it('should reject file exceeding max size (50MB)', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                file_size_bytes: 51 * 1024 * 1024, // 51MB
            })).toThrow('exceeds maximum');
        });

        it('should accept file at exactly max size', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                file_size_bytes: 50 * 1024 * 1024, // exactly 50MB
            })).not.toThrow();
        });

        // ─── Filename Sanitization ──────────────────────────────────────
        it('should reject filename with path traversal (../)', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                filename: '../../../etc/passwd',
            })).toThrow('invalid characters');
        });

        it('should reject filename with NUL byte', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                filename: 'photo\x00.jpg',
            })).toThrow('invalid characters');
        });

        it('should reject empty filename', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                filename: '',
            })).toThrow('Invalid filename');
        });

        it('should reject filename exceeding 200 chars', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                filename: 'a'.repeat(201) + '.jpg',
            })).toThrow('max 200');
        });

        it('should reject filenames with special shell characters', () => {
            const badChars = ['<', '>', ':', '"', '|', '?', '*'];
            for (const char of badChars) {
                expect(() => validateUploadRequest({
                    ...VALID_REQUEST,
                    filename: `photo${char}test.jpg`,
                })).toThrow('invalid characters');
            }
        });

        // ─── Project ID Validation ──────────────────────────────────────
        it('should reject non-UUID project_id', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                project_id: 'not-a-uuid',
            })).toThrow('Invalid project_id format');
        });

        it('should reject SQL injection in project_id', () => {
            expect(() => validateUploadRequest({
                ...VALID_REQUEST,
                project_id: "'; DROP TABLE projects;--",
            })).toThrow('Invalid project_id format');
        });
    });

    // ─── Key Generation ─────────────────────────────────────────────────────
    describe('generateFileKey', () => {
        it('should generate key with format: category/project_id/timestamp_hash_filename', () => {
            const key = generateFileKey(VALID_REQUEST);

            expect(key).toMatch(/^proof\/12345678-1234-1234-1234-123456789abc\/\d+_[a-f0-9]{16}_delivery-photo\.jpg$/);
        });

        it('should sanitize filename (lowercase, replace special chars)', () => {
            const key = generateFileKey({
                ...VALID_REQUEST,
                filename: 'My Photo (2).jpg',
            });

            expect(key).toContain('my_photo__2_.jpg');
            expect(key).not.toContain(' ');
            expect(key).not.toContain('(');
        });

        it('should produce unique keys for same input (random hash)', () => {
            const key1 = generateFileKey(VALID_REQUEST);
            const key2 = generateFileKey(VALID_REQUEST);

            // Keys should differ because of crypto.randomBytes + timestamp
            expect(key1).not.toBe(key2);
        });

        it('should organize files by category and project', () => {
            const proofKey = generateFileKey({ ...VALID_REQUEST, category: 'proof' });
            const boqKey = generateFileKey({ ...VALID_REQUEST, category: 'boq' });

            expect(proofKey).toMatch(/^proof\//);
            expect(boqKey).toMatch(/^boq\//);
        });
    });
});
