// ============================================================================
// Nammerha Backend — Storage Service (P2-005)
// S3-Compatible Object Storage Abstraction
// ============================================================================
// Provider-agnostic: works with AWS S3, CloudFlare R2, MinIO, DigitalOcean Spaces.
// Architecture: Pre-signed URLs for direct client→storage uploads (no server proxy).
// ============================================================================
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StorageConfig {
    provider: 'r2' | 's3' | 'minio';
    bucket: string;
    region: string;
    endpoint?: string;        // Required for R2 and MinIO
    accessKeyId: string;
    secretAccessKey: string;
    publicUrl?: string;       // CDN URL prefix for public assets
    uploadMaxSizeMb: number;
    presignExpirySeconds: number;
}

export interface UploadUrlRequest {
    project_id: string;
    category: 'proof' | 'boq' | 'capture' | 'floor_plan' | 'document' | 'avatar';
    filename: string;
    content_type: string;
    file_size_bytes?: number;
}

export interface UploadUrlResponse {
    upload_url: string;       // Pre-signed PUT URL
    file_key: string;         // Permanent object key
    public_url: string;       // Public CDN/access URL
    expires_at: string;       // ISO timestamp
}

export interface FileMetadata {
    key: string;
    size: number;
    content_type: string;
    last_modified: Date;
    etag: string;
}

// ─── Allowed MIME Types ─────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
    proof: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    boq: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    capture: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'model/gltf-binary'],
    floor_plan: ['image/jpeg', 'image/png', 'image/svg+xml', 'application/pdf'],
    document: ['application/pdf', 'image/jpeg', 'image/png'],
    avatar: ['image/jpeg', 'image/png', 'image/webp'],
};

const MAX_FILENAME_LENGTH = 200;

// ─── Configuration ──────────────────────────────────────────────────────────

function getStorageConfig(): StorageConfig {
    const provider = (process.env['STORAGE_PROVIDER'] ?? 'minio') as StorageConfig['provider'];

    return {
        provider,
        bucket: process.env['STORAGE_BUCKET'] ?? 'nammerha-uploads',
        region: process.env['STORAGE_REGION'] ?? 'auto',
        endpoint: process.env['STORAGE_ENDPOINT'],
        accessKeyId: process.env['STORAGE_ACCESS_KEY'] ?? '',
        secretAccessKey: process.env['STORAGE_SECRET_KEY'] ?? '',
        publicUrl: process.env['STORAGE_PUBLIC_URL'],
        uploadMaxSizeMb: parseInt(process.env['STORAGE_MAX_SIZE_MB'] ?? '50', 10),
        presignExpirySeconds: parseInt(process.env['STORAGE_PRESIGN_EXPIRY'] ?? '3600', 10),
    };
}

// ─── S3 Client Singleton ────────────────────────────────────────────────────

let _client: S3Client | null = null;

function getClient(): S3Client {
    if (_client) { return _client; }

    const config = getStorageConfig();

    if (!config.accessKeyId || !config.secretAccessKey) {
        throw new Error('[Storage] STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY are required');
    }

    _client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
        // R2 requires path-style addressing
        forcePathStyle: config.provider === 'minio' || config.provider === 'r2',
    });

    return _client;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateUploadRequest(dto: UploadUrlRequest): void {
    // Category validation
    if (!ALLOWED_MIME_TYPES[dto.category]) {
        throw new Error(`Invalid upload category: ${dto.category}`);
    }

    // MIME type validation
    const allowedTypes = ALLOWED_MIME_TYPES[dto.category];
    if (!allowedTypes || !allowedTypes.includes(dto.content_type)) {
        throw new Error(
            `File type '${dto.content_type}' not allowed for category '${dto.category}'. ` +
            `Allowed: ${(allowedTypes ?? []).join(', ')}`
        );
    }

    // Size validation
    const config = getStorageConfig();
    const maxBytes = config.uploadMaxSizeMb * 1024 * 1024;
    if (dto.file_size_bytes && dto.file_size_bytes > maxBytes) {
        throw new Error(`File size exceeds maximum (${config.uploadMaxSizeMb}MB)`);
    }

    // Filename sanitization
    if (!dto.filename || dto.filename.length > MAX_FILENAME_LENGTH) {
        throw new Error(`Invalid filename (max ${MAX_FILENAME_LENGTH} characters)`);
    }
    if (/[<>:"/\\|?*\x00-\x1f]/.test(dto.filename)) {
        throw new Error('Filename contains invalid characters');
    }

    // Project ID validation (UUID format)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dto.project_id)) {
        throw new Error('Invalid project_id format');
    }
}

// ─── Key Generation ─────────────────────────────────────────────────────────

/**
 * Generate a unique, deterministic object key.
 * Structure: {category}/{project_id}/{timestamp}_{hash}_{sanitized_filename}
 * This ensures:
 *   - Files are organized by category and project
 *   - No collisions (timestamp + hash)
 *   - Original filename preserved for human readability
 */
export function generateFileKey(dto: UploadUrlRequest): string {
    const timestamp = Date.now();
    const hash = crypto.randomBytes(8).toString('hex');
    const sanitizedName = dto.filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .toLowerCase();

    return `${dto.category}/${dto.project_id}/${timestamp}_${hash}_${sanitizedName}`;
}

// ─── Core Operations ────────────────────────────────────────────────────────

/**
 * Generate a pre-signed URL for direct client→storage upload.
 * The client sends a PUT request directly to storage — no server proxy needed.
 */
export async function generateUploadUrl(
    dto: UploadUrlRequest
): Promise<UploadUrlResponse> {
    validateUploadRequest(dto);

    const config = getStorageConfig();
    const client = getClient();
    const fileKey = generateFileKey(dto);

    const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: fileKey,
        ContentType: dto.content_type,
        ...(dto.file_size_bytes ? { ContentLength: dto.file_size_bytes } : {}),
        Metadata: {
            'x-nammerha-project': dto.project_id,
            'x-nammerha-category': dto.category,
            'x-nammerha-original-name': dto.filename,
        },
    });

    const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: config.presignExpirySeconds,
    });

    const publicUrl = config.publicUrl
        ? `${config.publicUrl}/${fileKey}`
        : `${config.endpoint ?? `https://${config.bucket}.s3.${config.region}.amazonaws.com`}/${fileKey}`;

    const expiresAt = new Date(Date.now() + config.presignExpirySeconds * 1000);

    return {
        upload_url: uploadUrl,
        file_key: fileKey,
        public_url: publicUrl,
        expires_at: expiresAt.toISOString(),
    };
}

/**
 * Get file metadata (HEAD request — no data transfer).
 */
export async function getFileMetadata(fileKey: string): Promise<FileMetadata | null> {
    const config = getStorageConfig();
    const client = getClient();

    try {
        const result = await client.send(new HeadObjectCommand({
            Bucket: config.bucket,
            Key: fileKey,
        }));

        return {
            key: fileKey,
            size: result.ContentLength ?? 0,
            content_type: result.ContentType ?? 'application/octet-stream',
            last_modified: result.LastModified ?? new Date(),
            etag: result.ETag ?? '',
        };
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
            return null;
        }
        throw error;
    }
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(fileKey: string): Promise<void> {
    const config = getStorageConfig();
    const client = getClient();

    await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: fileKey,
    }));
}

/**
 * List files by project and optional category.
 */
export async function listProjectFiles(
    projectId: string,
    category?: string,
    limit = 100
): Promise<FileMetadata[]> {
    const config = getStorageConfig();
    const client = getClient();

    const prefix = category
        ? `${category}/${projectId}/`
        : undefined;

    // When no specific category, query all categories for the project
    const categories = category ? [category] : Object.keys(ALLOWED_MIME_TYPES);
    const files: FileMetadata[] = [];

    for (const cat of categories) {
        const catPrefix = prefix ?? `${cat}/${projectId}/`;
        const result = await client.send(new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: catPrefix,
            MaxKeys: limit,
        }));

        if (result.Contents) {
            for (const obj of result.Contents) {
                if (obj.Key) {
                    files.push({
                        key: obj.Key,
                        size: obj.Size ?? 0,
                        content_type: '', // LIST doesn't return content-type
                        last_modified: obj.LastModified ?? new Date(),
                        etag: obj.ETag ?? '',
                    });
                }
            }
        }
    }

    return files.slice(0, limit);
}

/**
 * Check if storage service is configured and reachable.
 */
export async function healthCheck(): Promise<{ ok: boolean; provider: string; bucket: string }> {
    const config = getStorageConfig();

    if (!config.accessKeyId || !config.secretAccessKey) {
        return { ok: false, provider: config.provider, bucket: config.bucket };
    }

    try {
        const client = getClient();
        await client.send(new ListObjectsV2Command({
            Bucket: config.bucket,
            MaxKeys: 1,
        }));
        return { ok: true, provider: config.provider, bucket: config.bucket };
    } catch {
        return { ok: false, provider: config.provider, bucket: config.bucket };
    }
}
