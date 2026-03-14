// ============================================================================
// Nammerha Backend — Privacy Routes
// ============================================================================
// REST API for per-profile privacy settings management.
//
// Endpoints:
//   GET  /api/privacy                — Get my privacy settings
//   PUT  /api/privacy                — Update my privacy settings
//   GET  /api/privacy/defaults/:role — Get default settings for a role
//   GET  /api/privacy/fields/:role   — Get configurable fields for a role
// ============================================================================
import { Router, Request, Response } from 'express';
import { getAuthUser } from '../utils/auth-guard';
import { authMiddleware, requireActive } from '../middleware/auth.middleware';
import * as privacyService from '../services/privacy.service';
import { safeRouteError } from '../utils/safe-error';
import type { ApiResponse, PrivacySettingsMap } from '../types';

const router = Router();

// All privacy routes require authentication + active account
router.use(authMiddleware);
router.use(requireActive);

// ─── GET /api/privacy — My Privacy Settings ─────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
    try {
        const settings = await privacyService.getPrivacySettings(getAuthUser(req).user_id);
        res.json({
            success: true,
            data: settings,
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Privacy.GetSettings');
    }
});

// ─── PUT /api/privacy — Update My Privacy Settings ──────────────────────────
router.put('/', async (req: Request, res: Response) => {
    try {
        const body = req.body as { settings?: PrivacySettingsMap };

        if (!body.settings || typeof body.settings !== 'object') {
            res.status(400).json({
                success: false,
                error: 'Missing required field: settings (object)',
                error_ar: 'حقل مطلوب مفقود: الإعدادات (كائن)',
            } as ApiResponse);
            return;
        }

        const updated = await privacyService.updatePrivacySettings(
            getAuthUser(req).user_id,
            body.settings,
        );

        res.json({
            success: true,
            data: updated,
            message: 'Privacy settings updated successfully',
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Privacy.UpdateSettings');
    }
});

// ─── GET /api/privacy/defaults/:role — Default Settings for a Role ──────────
router.get('/defaults/:role', (req: Request, res: Response) => {
    try {
        const role = String(req.params['role']);
        const defaults = privacyService.getDefaultSettingsForRole(role);

        if (!defaults) {
            res.status(404).json({
                success: false,
                error: `No default privacy settings for role: ${role}`,
            } as ApiResponse);
            return;
        }

        res.json({
            success: true,
            data: defaults,
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Privacy.GetDefaults');
    }
});

// ─── GET /api/privacy/fields/:role — Configurable Fields for a Role ─────────
router.get('/fields/:role', (req: Request, res: Response) => {
    try {
        const role = String(req.params['role']);
        const fields = privacyService.getConfigurableFields(role);

        if (fields.length === 0) {
            res.status(404).json({
                success: false,
                error: `No configurable fields for role: ${role}`,
            } as ApiResponse);
            return;
        }

        res.json({
            success: true,
            data: {
                role,
                fields,
                visibility_options: ['public', 'project_members', 'private'],
            },
        } as ApiResponse);
    } catch (error) {
        safeRouteError(res, error, 'Privacy.GetFields');
    }
});

export default router;
