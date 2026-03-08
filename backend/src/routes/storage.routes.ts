// ============================================================================
// Nammerha Backend — Storage Routes (P2-005)
// Pre-signed URL upload flow + file management
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
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

// ─── POST /upload-url ───────────────────────────────────────────────────────
// Generate a pre-signed URL for direct client→storage upload.
// The client then sends the file directly to storage using this URL.
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
router.get('/files/:projectId', async (req: Request, res: Response) => {
    try {
        const projectId = req.params['projectId'] as string;
        const category = typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
        const limitRaw = typeof req.query['limit'] === 'string' ? req.query['limit'] : '100';
        const limit = parseInt(limitRaw, 10);

        if (!projectId) {
            res.status(400).json({ success: false, error: 'Missing projectId' });
            return;
        }

        const files = await listProjectFiles(projectId, category, Math.min(limit, 500));
        res.status(200).json({ success: true, data: files });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to list files';
        res.status(500).json({ success: false, error: message });
    }
});

// ─── GET /metadata/:key(*) ──────────────────────────────────────────────────
// Get metadata for a specific file.
router.get('/metadata/*', async (req: Request, res: Response) => {
    try {
        const fileKey = req.params[0];
        if (!fileKey) {
            res.status(400).json({ success: false, error: 'Missing file key' });
            return;
        }

        const metadata = await getFileMetadata(fileKey);
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
router.delete('/files/*', async (req: Request, res: Response) => {
    try {
        const fileKey = req.params[0];
        if (!fileKey) {
            res.status(400).json({ success: false, error: 'Missing file key' });
            return;
        }

        await deleteFile(fileKey);
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
