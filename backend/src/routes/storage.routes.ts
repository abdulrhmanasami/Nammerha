// ============================================================================
// Nammerha Backend — Storage Routes (P2-005)
// Pre-signed URL upload flow + file management
// SEC-001 FIX: All project-scoped endpoints now verify ownership.
// ============================================================================
import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { query } from '../config/database';
import {
    generateUploadUrl,
    deleteFile,
    listProjectFiles,
    getFileMetadata,
    healthCheck,
} from '../services/storage.service';

const router = Router();

// All storage routes require authentication
router.use(authMiddleware);

// ─── SEC-001 FIX: Project-Ownership Verification ───────────────────────────
// Prevents IDOR: only the homeowner, assigned engineer, or admin/auditor
// can access files belonging to a project.
// ─────────────────────────────────────────────────────────────────────────────

const PRIVILEGED_ROLES = ['admin', 'auditor'];

/**
 * Verify the authenticated user has access to a given project's files.
 * Access is granted if the user is:
 *   1. The project's homeowner
 *   2. The project's assigned engineer
 *   3. An admin or auditor
 *
 * Returns true if access is granted, false otherwise.
 */
async function hasProjectAccess(userId: string, userRole: string, projectId: string): Promise<boolean> {
    if (PRIVILEGED_ROLES.includes(userRole)) {
        return true;
    }

    const result = await query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM projects
         WHERE project_id = $1
           AND (homeowner_id = $2 OR assigned_engineer = $2)`,
        [projectId, userId]
    );

    return parseInt(result.rows[0]?.cnt ?? '0', 10) > 0;
}

/**
 * Extract a UUID project_id from a storage file key.
 * File keys follow the pattern: {category}/{project_id}/{timestamp}_{hash}_{filename}
 * Returns the project_id or null if the key doesn't contain a valid UUID.
 */
function extractProjectIdFromKey(fileKey: string): string | null {
    const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const segments = fileKey.split('/');
    // The project_id is always the second segment
    if (segments.length >= 2) {
        const candidate = segments[1];
        if (candidate && UUID_REGEX.test(candidate)) {
            return candidate;
        }
    }
    return null;
}

/**
 * Middleware: verify the user owns the project identified by :projectId param.
 */
async function verifyProjectAccessParam(
    req: Request, res: Response, next: NextFunction
): Promise<void> {
    const projectId = req.params['projectId'] as string;
    if (!projectId) {
        res.status(400).json({ success: false, error: 'Missing projectId' });
        return;
    }

    const allowed = await hasProjectAccess(
        req.authUser!.user_id, req.authUser!.role, projectId
    );
    if (!allowed) {
        console.warn(`[Storage] IDOR blocked: user ${req.authUser!.user_id} attempted to access project ${projectId}`);
        res.status(403).json({
            success: false,
            error: 'Access denied: you do not have permission to access this project\'s files',
        });
        return;
    }
    next();
}

/**
 * Middleware: verify the user owns the project extracted from the file key (wildcard param).
 */
async function verifyProjectAccessFromKey(
    req: Request, res: Response, next: NextFunction
): Promise<void> {
    const fileKey = req.params[0];
    if (!fileKey) {
        res.status(400).json({ success: false, error: 'Missing file key' });
        return;
    }

    const projectId = extractProjectIdFromKey(fileKey);
    if (!projectId) {
        // If we can't determine the project from the key, deny by default
        res.status(403).json({
            success: false,
            error: 'Access denied: unable to determine project ownership from file key',
        });
        return;
    }

    const allowed = await hasProjectAccess(
        req.authUser!.user_id, req.authUser!.role, projectId
    );
    if (!allowed) {
        console.warn(`[Storage] IDOR blocked: user ${req.authUser!.user_id} attempted to access file ${fileKey}`);
        res.status(403).json({
            success: false,
            error: 'Access denied: you do not have permission to access this file',
        });
        return;
    }
    next();
}

// ─── POST /upload-url ───────────────────────────────────────────────────────
// Generate a pre-signed URL for direct client→storage upload.
// The client then sends the file directly to storage using this URL.
// SEC-001: Ownership is verified against the project_id in the request body.
router.post('/upload-url', async (req: Request, res: Response) => {
    try {
        const { project_id, category, filename, content_type, file_size_bytes } = req.body as {
            project_id: string;
            category: string;
            filename: string;
            content_type: string;
            file_size_bytes?: number;
        };

        if (!project_id || !category || !filename || !content_type) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: project_id, category, filename, content_type',
            });
            return;
        }

        // SEC-001: Verify the user has access to this project before generating upload URL
        const allowed = await hasProjectAccess(
            req.authUser!.user_id, req.authUser!.role, project_id
        );
        if (!allowed) {
            console.warn(`[Storage] IDOR blocked: user ${req.authUser!.user_id} attempted upload to project ${project_id}`);
            res.status(403).json({
                success: false,
                error: 'Access denied: you do not have permission to upload to this project',
            });
            return;
        }

        const result = await generateUploadUrl({
            project_id,
            category: category as 'proof' | 'boq' | 'capture' | 'floor_plan' | 'document' | 'avatar',
            filename,
            content_type,
            file_size_bytes,
        });

        res.status(200).json({ success: true, data: result });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Upload URL generation failed';
        res.status(400).json({ success: false, error: message });
    }
});

// ─── GET /files/:projectId ──────────────────────────────────────────────────
// List files for a project, optionally filtered by category.
// SEC-001: Guarded by verifyProjectAccessParam middleware.
router.get('/files/:projectId', verifyProjectAccessParam, async (req: Request, res: Response) => {
    try {
        const projectId = req.params['projectId'] as string;
        const category = typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
        const limitRaw = typeof req.query['limit'] === 'string' ? req.query['limit'] : '100';
        const limit = parseInt(limitRaw, 10);

        const files = await listProjectFiles(projectId, category, Math.min(limit, 500));
        res.status(200).json({ success: true, data: files });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to list files';
        res.status(500).json({ success: false, error: message });
    }
});

// ─── GET /metadata/:key(*) ──────────────────────────────────────────────────
// Get metadata for a specific file.
// SEC-001: Guarded by verifyProjectAccessFromKey middleware.
router.get('/metadata/*', verifyProjectAccessFromKey, async (req: Request, res: Response) => {
    try {
        const fileKey = req.params[0];

        const metadata = await getFileMetadata(fileKey!);
        if (!metadata) {
            res.status(404).json({ success: false, error: 'File not found' });
            return;
        }

        res.status(200).json({ success: true, data: metadata });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to get metadata';
        res.status(500).json({ success: false, error: message });
    }
});

// ─── DELETE /files/:key(*) ──────────────────────────────────────────────────
// Delete a file from storage.
// SEC-001: Guarded by verifyProjectAccessFromKey middleware.
router.delete('/files/*', verifyProjectAccessFromKey, async (req: Request, res: Response) => {
    try {
        const fileKey = req.params[0];

        await deleteFile(fileKey!);
        res.status(200).json({ success: true, message: 'File deleted' });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to delete file';
        res.status(500).json({ success: false, error: message });
    }
});

// ─── GET /health ────────────────────────────────────────────────────────────
// Check storage connectivity (admin only).
router.get('/health', async (_req: Request, res: Response) => {
    try {
        const status = await healthCheck();
        const httpStatus = status.ok ? 200 : 503;
        res.status(httpStatus).json({ success: status.ok, data: status });
    } catch {
        res.status(503).json({ success: false, error: 'Storage health check failed' });
    }
});

export default router;
