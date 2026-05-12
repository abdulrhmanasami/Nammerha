// ============================================================================
// Nammerha Backend — Role Management Routes
// Handles multi-role operations: listing and activating roles.
// NOTE: /switch endpoint deprecated under Unified Citizen model (2026-05-10).
// ============================================================================
import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import type { UserRole } from '../types';

const router = Router();

// All role routes require authentication
router.use(authMiddleware);

// ─── CRIT-001 FIX: Static profile table whitelist ───────────────────────────
// NEVER construct table names from user input via string interpolation.
// This static map is the ONLY source of truth for profile table names.
const PROFILE_TABLE_MAP: Record<string, string> = {
    // FORENSIC-C2.5: 'donor' removed — donation system suspended indefinitely (2026-05-12).
    // donor_profiles table preserved in DB for backward compat, but no new activations.
    contractor: 'contractor_profiles',
    engineer: 'engineer_profiles',
    supplier: 'supplier_profiles',
    tradesperson: 'tradesperson_profiles',
    homeowner: 'homeowner_profiles',
};

// ─── GET /api/roles/available — List all available platform roles ────────────

router.get('/available', async (_req: Request, res: Response) => {
    try {
        const result = await query<{
            role_id: number;
            role_name: UserRole;
            display_name_en: string;
            display_name_ar: string;
            description_en: string | null;
            description_ar: string | null;
            requires_kyc: boolean;
            requires_kyb: boolean;
            is_self_assignable: boolean;
            icon_name: string | null;
        }>(
            `SELECT role_id, role_name, display_name_en, display_name_ar,
                    description_en, description_ar, requires_kyc, requires_kyb,
                    is_self_assignable, icon_name
             FROM roles
             WHERE is_self_assignable = TRUE
             ORDER BY sort_order`
        );

        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Failed to fetch available roles', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ success: false, error: 'Failed to fetch roles' });
    }
});

// ─── GET /api/roles/my-roles — List current user's active roles ─────────────

router.get('/my-roles', async (req: Request, res: Response) => {
    try {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }

        const result = await query<{
            role_name: UserRole;
            display_name_en: string;
            display_name_ar: string;
            icon_name: string | null;
            status: string;
            is_primary: boolean;
            activated_at: Date;
        }>(
            `SELECT r.role_name, r.display_name_en, r.display_name_ar,
                    r.icon_name, ur.status, ur.is_primary, ur.activated_at
             FROM user_roles ur
             JOIN roles r ON r.role_id = ur.role_id
             WHERE ur.user_id = $1
             ORDER BY ur.is_primary DESC, r.sort_order`,
            [req.authUser.user_id]
        );

        res.json({
            success: true,
            data: {
                roles: result.rows,
            },
        });
    } catch (error) {
        logger.error('Failed to fetch user roles', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ success: false, error: 'Failed to fetch roles' });
    }
});

// ─── POST /api/roles/switch — DEPRECATED (Unified Citizen) ───────────────────
// UNIFIED CITIZEN: Role switching is deprecated. All users have all roles.
// Returns 410 Gone to inform clients that this endpoint is no longer functional.

router.post('/switch', async (_req: Request, res: Response) => {
    logger.info('DEPRECATED: /switch endpoint called — Unified Citizen model active');
    res.status(410).json({
        success: false,
        error: 'Role switching is no longer needed. All users have access to all platform features.',
        deprecated: true,
        deprecatedSince: '2026-05-10',
    });
});

// ─── POST /api/roles/activate — Request activation of a new role ─────────────

router.post('/activate', async (req: Request, res: Response) => {
    try {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }

        const { role } = req.body as { role?: string };
        if (!role) {
            res.status(400).json({ success: false, error: 'Role is required' });
            return;
        }

        // Check role exists and is self-assignable
        const roleInfo = await query<{
            role_id: number;
            requires_kyc: boolean;
            requires_kyb: boolean;
            is_self_assignable: boolean;
        }>(
            'SELECT role_id, requires_kyc, requires_kyb, is_self_assignable FROM roles WHERE role_name = $1',
            [role]
        );

        if (roleInfo.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Role not found' });
            return;
        }

        // eslint guard: roleInfo.rows[0] is guaranteed by the length > 0 check above
        const roleData = roleInfo.rows[0] as NonNullable<typeof roleInfo.rows[0]>;

        if (!roleData.is_self_assignable) {
            res.status(403).json({ success: false, error: 'This role cannot be self-assigned' });
            return;
        }

        // UNIFIED CITIZEN: All roles activate immediately.
        // KYC/KYB verification is decoupled from role access — it will be
        // enforced at the feature level (e.g., escrow release) when needed.
        const initialStatus = 'active';

        const upsertResult = await query<{ status: string; was_existing: boolean }>(
            `INSERT INTO user_roles (user_id, role_id, status, is_primary)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, role_id) DO UPDATE SET
                status = CASE
                    WHEN user_roles.status = 'active' THEN user_roles.status  -- keep active
                    ELSE EXCLUDED.status                                       -- reactivate
                END,
                activated_at = CASE
                    WHEN user_roles.status = 'active' THEN user_roles.activated_at
                    ELSE NOW()
                END
             RETURNING status,
                       (xmax <> 0) AS was_existing`,
            [req.authUser.user_id, roleData.role_id, initialStatus,
             req.authUser.roles.length === 0]
        );

        const resultRow = upsertResult.rows[0];
        if (resultRow?.was_existing && resultRow.status === 'active') {
            res.status(409).json({ success: false, error: 'You already have this role' });
            return;
        }

        // CRIT-001 FIX: Use static lookup map — NEVER interpolate user input into SQL
        const profileTable = PROFILE_TABLE_MAP[role];
        if (profileTable) {
            await query(
                `INSERT INTO ${profileTable} (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
                [req.authUser.user_id]
            );
        }

        logger.info('Role activated', {
            userId: req.authUser.user_id,
            role,
            status: resultRow?.status ?? initialStatus,
        });

        res.json({
            success: true,
            message: 'Role activated successfully',
            data: {
                role,
                status: resultRow?.status ?? initialStatus,
                requires_kyc: false,
                requires_kyb: false,
            },
        });
    } catch (error) {
        logger.error('Failed to activate role', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ success: false, error: 'Failed to activate role' });
    }
});

export default router;
