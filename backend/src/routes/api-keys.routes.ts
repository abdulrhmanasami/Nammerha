// ============================================================================
// Nammerha Backend — API Keys Routes (Feature 5)
// ============================================================================
// CRUD endpoints for API key management.
// All endpoints require JWT authentication.
//
// POST   /api/keys       — Create a new API key
// GET    /api/keys       — List my keys (masked)
// DELETE /api/keys/:id   — Revoke an API key
// GET    /api/keys/usage — My usage history (for graphs)
// ============================================================================
import { Router, Request, Response } from 'express';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import { createApiKey, listApiKeys, revokeApiKey } from '../services/api-keys.service';
import { checkQuota } from '../services/quota.service';
import { getUsageHistory } from '../services/quota.service';
import type { ApiResponse } from '../types';
import { safeRouteError } from '../utils/safe-error';
import { ZodError } from 'zod';
import { createApiKeySchema } from '../validation/schemas';

const router = Router();

// All routes require authentication + active account
// DT-MW-001 FIX: Added requireActive — prevents inactive/unverified users from creating API keys
router.use(authMiddleware);
router.use(requireActive);

/** Extract a single client IP string from Express Request. */
function getClientIp(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// ─── POST / — Create API Key ────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }
        const userId = req.authUser.user_id;
        const { key_name, scopes, expires_in_days } = createApiKeySchema.parse(req.body);

        const clientIp = getClientIp(req);

        const result = await createApiKey(
            userId,
            key_name,
            scopes,
            expires_in_days,
            clientIp
        );

        res.status(201).json({
            success: true,
            data: result,
            message: 'API key created. Store the raw_key securely — it will not be shown again.',
        } as ApiResponse);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues } as ApiResponse);
            return;
        }
        safeRouteError(res, error, 'ApiKeys.Create');
    }
});

// ─── GET / — List My Keys ───────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }
        const userId = req.authUser.user_id;
        const keys = await listApiKeys(userId);

        res.json({
            success: true,
            data: keys,
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'ApiKeys.List');
    }
});

// ─── DELETE /:id — Revoke Key ───────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }
        const userId = req.authUser.user_id;
        const keyId = String(req.params['id'] ?? '');
        const clientIp = getClientIp(req);

        if (!keyId) {
            res.status(400).json({
                success: false,
                error: 'Key ID is required',
            } as ApiResponse);
            return;
        }

        await revokeApiKey(userId, keyId, clientIp);

        res.json({
            success: true,
            message: 'API key revoked successfully',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'ApiKeys.Revoke');
    }
});

// ─── GET /usage — My Usage History ──────────────────────────────────────────
router.get('/usage', async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }
        const userId = req.authUser.user_id;
        const role = req.authUser.role;
        const parsedDays = parseInt(req.query['days'] as string, 10);
        const days = Number.isNaN(parsedDays) ? 30 : parsedDays;

        const [history, quota] = await Promise.all([
            getUsageHistory(userId, days),
            checkQuota(userId, role),
        ]);

        res.json({
            success: true,
            data: {
                history,
                quota,
            },
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'ApiKeys.Usage');
    }
});

export default router;
