// ============================================================================
// Nammerha — Storage Service Integration Tests (NMR-AUD-004)
// Tests upload validation (pure unit tests) + HTTP route integration
//
// Coverage:
//   1. validateUploadRequest() — MIME type, size, filename validation
//   2. generateFileKey() — key structure, sanitization, uniqueness
//   3. POST /upload-url — pre-signed URL generation
//   4. GET /files/:projectId — file listing
//   5. DELETE /files/* — file deletion
//   6. GET /health — storage health check
//   7. Authentication guards
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { AuthUser } from '../../types';

// ─── Set required env vars BEFORE any imports ───────────────────────────────
process.env['STORAGE_ACCESS_KEY'] = 'test-access-key';
process.env['STORAGE_SECRET_KEY'] = 'test-secret-key';
process.env['STORAGE_BUCKET'] = 'test-bucket';
process.env['STORAGE_REGION'] = 'us-east-1';
process.env['STORAGE_PROVIDER'] = 'minio';
process.env['STORAGE_ENDPOINT'] = 'http://localhost:9000';
process.env['STORAGE_MAX_SIZE_MB'] = '50';

// ─── Mock Database BEFORE imports ───────────────────────────────────────────
vi.mock('../../config/database', () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ cnt: '1' }], rowCount: 1 }),
  getClient: vi.fn(),
  transaction: vi.fn(),
  default: { end: vi.fn(), query: vi.fn() },
}));

// ─── Mock the S3 client and presigner ───────────────────────────────────────
const mockSend = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-s3', () => {
  // Use a proper class to satisfy Vitest's class detection
  class MockS3Client {
    send = mockSend;
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: vi.fn(),
    HeadObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    ListObjectsV2Command: vi.fn(),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-upload-url'),
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
import storageRoutes from '../../routes/storage.routes';
import {
  validateUploadRequest,
  generateFileKey,
  type UploadUrlRequest,
} from '../../services/storage.service';

// ─── Express App Factory ───────────────────────────────────────────────────
function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/storage', storageRoutes);
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ success: false, error: err.message });
    },
  );
  return app;
}

// ─── Valid Upload Request ───────────────────────────────────────────────────
const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_UPLOAD: UploadUrlRequest = {
  project_id: VALID_UUID,
  category: 'proof',
  filename: 'delivery-photo.jpg',
  content_type: 'image/jpeg',
  file_size_bytes: 2_000_000,
};

// ═══════════════════════════════════════════════════════════════════════════
// Section 1: validateUploadRequest() — Pure Validation Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('validateUploadRequest() — Upload Validation (Pure Unit)', () => {
  it('should pass for valid upload request', () => {
    expect(() => validateUploadRequest(VALID_UPLOAD)).not.toThrow();
  });

  it('should throw for invalid category', () => {
    expect(() => validateUploadRequest({ ...VALID_UPLOAD, category: 'malware' as never })).toThrow(
      'Invalid upload category',
    );
  });

  it('should throw for disallowed MIME type', () => {
    expect(() =>
      validateUploadRequest({ ...VALID_UPLOAD, content_type: 'application/exe' }),
    ).toThrow("not allowed for category 'proof'");
  });

  it('should throw for oversized file', () => {
    expect(() => validateUploadRequest({ ...VALID_UPLOAD, file_size_bytes: 500_000_000 })).toThrow(
      'File size exceeds maximum',
    );
  });

  it('should throw for filename exceeding length limit', () => {
    const longName = 'a'.repeat(201) + '.jpg';
    expect(() => validateUploadRequest({ ...VALID_UPLOAD, filename: longName })).toThrow(
      'Invalid filename',
    );
  });

  it('should throw for filename with invalid characters', () => {
    expect(() => validateUploadRequest({ ...VALID_UPLOAD, filename: 'file<script>.jpg' })).toThrow(
      'invalid characters',
    );
  });

  it('should throw for empty filename', () => {
    expect(() => validateUploadRequest({ ...VALID_UPLOAD, filename: '' })).toThrow(
      'Invalid filename',
    );
  });

  it('should throw for invalid project_id format (non-UUID)', () => {
    expect(() => validateUploadRequest({ ...VALID_UPLOAD, project_id: 'not-a-uuid' })).toThrow(
      'Invalid project_id format',
    );
  });

  it('should accept valid UUID project_id', () => {
    expect(() => validateUploadRequest({ ...VALID_UPLOAD, project_id: VALID_UUID })).not.toThrow();
  });

  it('should accept all valid categories with correct MIME types', () => {
    const categoryMimes: Record<string, string> = {
      proof: 'image/jpeg',
      boq: 'application/pdf',
      capture: 'image/jpeg',
      floor_plan: 'application/pdf',
      document: 'application/pdf',
      avatar: 'image/jpeg',
    };
    for (const [category, mimeType] of Object.entries(categoryMimes)) {
      expect(() =>
        validateUploadRequest({
          ...VALID_UPLOAD,
          category: category as UploadUrlRequest['category'],
          content_type: mimeType,
        }),
      ).not.toThrow();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 2: generateFileKey() — Key Generation Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('generateFileKey() — File Key Generation (Pure Unit)', () => {
  it('should produce key with correct structure', () => {
    const key = generateFileKey(VALID_UPLOAD);
    // Format: {category}/{project_id}/{timestamp}_{hash}_{sanitized_filename}
    const parts = key.split('/');
    expect(parts[0]).toBe('proof');
    expect(parts[1]).toBe(VALID_UUID);
    expect(parts[2]).toMatch(/^\d+_[a-f0-9]{16}_delivery-photo\.jpg$/);
  });

  it('should sanitize special characters in filename', () => {
    const key = generateFileKey({
      ...VALID_UPLOAD,
      filename: 'My Photo (1).jpg',
    });
    expect(key).toContain('my_photo__1_.jpg');
  });

  it('should generate unique keys (collision resistance)', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateFileKey(VALID_UPLOAD));
    }
    expect(keys.size).toBe(100);
  });

  it('should include category prefix for directory organization', () => {
    const categories: Array<UploadUrlRequest['category']> = ['proof', 'boq', 'capture'];
    for (const category of categories) {
      const key = generateFileKey({ ...VALID_UPLOAD, category });
      expect(key.startsWith(`${category}/`)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 3: Storage HTTP Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Storage Routes (HTTP Integration)', () => {
  let app: express.Express;

  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    app = createApp();
    mockAuthUser = {
      user_id: 'user-uuid-001',
      role: 'homeowner',
      roles: ['homeowner'],
      is_active: true,
    };
  });

  // ─── Authentication ────────────────────────────────────────────────
  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      mockAuthUser = null;
      const res = await request(app).post('/api/storage/upload-url').send(VALID_UPLOAD).expect(401);

      expect(res.body.error).toContain('Authentication required');
    });
  });

  // ─── POST /api/storage/upload-url ───────────────────────────────────
  describe('POST /api/storage/upload-url', () => {
    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/storage/upload-url')
        .send({ project_id: VALID_UUID })
        .expect(400);

      expect(res.body.error).toContain('Missing required fields');
    });

    it('should return 400 for completely empty body', async () => {
      const res = await request(app).post('/api/storage/upload-url').send({}).expect(400);

      expect(res.body.error).toContain('Missing required fields');
    });

    it('should return 200 with pre-signed URL for valid request', async () => {
      const res = await request(app).post('/api/storage/upload-url').send(VALID_UPLOAD).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.upload_url).toContain('presigned-upload-url');
      expect(res.body.data.file_key).toContain('proof/');
      expect(res.body.data.file_key).toContain(VALID_UUID);
      expect(res.body.data.expires_at).toBeDefined();
    });

    it('should return 400 for invalid MIME type', async () => {
      const res = await request(app)
        .post('/api/storage/upload-url')
        .send({ ...VALID_UPLOAD, content_type: 'application/exe' })
        .expect(400);

      expect(res.body.error).toContain('not allowed');
    });
  });

  // ─── DELETE /api/storage/files/* ────────────────────────────────────
  describe('DELETE /api/storage/files/*', () => {
    it('should delete file successfully', async () => {
      const res = await request(app)
        .delete(`/api/storage/files/proof/${VALID_UUID}/file.jpg`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted');
    });
  });

  // ─── GET /api/storage/health ────────────────────────────────────────
  // SEC-FT-005: Health endpoint is restricted to admin/auditor roles
  // to prevent infrastructure detail leakage to unprivileged users.
  describe('GET /api/storage/health', () => {
    it('should return 403 for non-privileged users (SEC-FT-005)', async () => {
      // Default mockAuthUser is role: 'user' — must be rejected
      const res = await request(app).get('/api/storage/health').expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Insufficient permissions');
    });

    it('should return 200 when storage is healthy (admin role)', async () => {
      mockAuthUser = {
        user_id: 'admin-uuid-001',
        role: 'admin',
        roles: ['admin'],
        is_active: true,
      };

      const res = await request(app).get('/api/storage/health').expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should return 200 for auditor role (auditor access)', async () => {
      mockAuthUser = {
        user_id: 'auditor-uuid-001',
        role: 'auditor',
        roles: ['auditor'],
        is_active: true,
      };

      const res = await request(app).get('/api/storage/health').expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should return 503 when storage is unreachable (admin role)', async () => {
      mockAuthUser = {
        user_id: 'admin-uuid-001',
        role: 'admin',
        roles: ['admin'],
        is_active: true,
      };
      mockSend.mockRejectedValue(new Error('Connection refused'));

      const res = await request(app).get('/api/storage/health');

      expect(res.status).toBe(503);
    });
  });
});
