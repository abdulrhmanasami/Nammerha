// ============================================================================
// Nammerha Backend — Role Management Routes
// Handles multi-role operations: listing, switching, activating roles.
// ============================================================================
import { Router, Request, Response } from 'express';
import { query, transaction } from '../config/database';
import { authMiddleware, generateToken } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import type { UserRole } from '../types';

const router = Router();

// All role routes require authentication
router.use(authMiddleware);

// ─── CRIT-001 FIX: Static profile table whitelist ───────────────────────────
// NEVER construct table names from user input via string interpolation.
// This static map is the ONLY source of truth for profile table names.
const PROFILE_TABLE_MAP: Record<string, string> = {
    donor: 'donor_profiles',
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
                activeRole: req.authUser.activeRole,
            },
        });
    } catch (error) {
        logger.error('Failed to fetch user roles', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ success: false, error: 'Failed to fetch roles' });
    }
});

// ─── POST /api/roles/switch — Switch active role context ─────────────────────
// HIGH-001 FIX: All 3 updates run inside a single DB transaction.
// HIGH-003 FIX: Reissues JWT cookie with updated primary role after switch.

router.post('/switch', async (req: Request, res: Response) => {
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

        // Verify user has this role and it's active
        const hasRole = await query<{ role_name: UserRole }>(
            `SELECT r.role_name
             FROM user_roles ur
             JOIN roles r ON r.role_id = ur.role_id
             WHERE ur.user_id = $1 AND r.role_name = $2 AND ur.status = 'active'`,
            [req.authUser.user_id, role]
        );

        if (hasRole.rows.length === 0) {
            res.status(403).json({
                success: false,
                error: 'You do not have this role activated',
            });
            return;
        }

        // HIGH-001 FIX: Atomic transaction — all 3 updates succeed or all fail
        const userId = req.authUser.user_id;
        await transaction(async (client) => {
            // 1. Update primary role in users table (backward compat)
            await client.query(
                'UPDATE users SET role = $1, updated_at = NOW() WHERE user_id = $2',
                [role, userId]
            );
            // 2. Clear all is_primary flags
            await client.query(
                'UPDATE user_roles SET is_primary = FALSE WHERE user_id = $1',
                [userId]
            );
            // 3. Set new primary
            await client.query(
                `UPDATE user_roles SET is_primary = TRUE
                 WHERE user_id = $1 AND role_id = (SELECT role_id FROM roles WHERE role_name = $2)`,
                [userId, role]
            );
        });

        // BUG-3 FIX: Fresh DB query for roles — previous code used stale JWT roles
        // which missed any roles activated after the last login.
        const freshRolesResult = await query<{ role_name: string }>(
            `SELECT r.role_name FROM user_roles ur
             JOIN roles r ON r.role_id = ur.role_id
             WHERE ur.user_id = $1 AND ur.status = 'active'`,
            [userId]
        );
        const allRoles = freshRolesResult.rows.map(r => r.role_name);

        // HIGH-003 FIX: Reissue JWT with updated primary role + fresh roles
        const token = generateToken(userId, role, allRoles.length > 0 ? allRoles : [role]);

        // BUG-2 FIX (MOB-AUTH-001): Detect mobile clients and include token in JSON.
        // Mobile apps use Bearer tokens, not cookies. Without this, after a role switch
        // the mobile app continues sending the OLD JWT with the OLD role — breaking
        // all subsequent API calls that check the role.
        const clientPlatform = req.headers['x-platform'] as string | undefined;
        const isMobileClient = clientPlatform === 'ios' || clientPlatform === 'android';

        if (!isMobileClient) {
            res.cookie('nammerha_jwt', token, {
                httpOnly: true,
                secure: process.env['NODE_ENV'] === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/',
            });
        }

        logger.info('Role switched', { userId, newRole: role, isMobile: isMobileClient });

        res.json({
            success: true,
            message: 'Role switched successfully',
            data: {
                activeRole: role,
                roles: allRoles.length > 0 ? allRoles : [role],
                // MOB-AUTH-001: Token only for mobile clients
                ...(isMobileClient ? { token } : {}),
            },
        });
    } catch (error) {
        logger.error('Failed to switch role', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ success: false, error: 'Failed to switch role' });
    }
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

        // MED-002 FIX: Use upsert pattern to eliminate TOCTOU race condition.
        // INSERT ... ON CONFLICT handles the check-and-insert atomically.
        const initialStatus = roleData.requires_kyb ? 'pending_kyb'
            : (roleData.requires_kyc ? 'pending_kyc' : 'active');

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
            message: roleData.requires_kyb || roleData.requires_kyc
                ? 'Role activation pending verification'
                : 'Role activated successfully',
            data: {
                role,
                status: resultRow?.status ?? initialStatus,
                requires_kyc: roleData.requires_kyc,
                requires_kyb: roleData.requires_kyb,
            },
        });
    } catch (error) {
        logger.error('Failed to activate role', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ success: false, error: 'Failed to activate role' });
    }
});

export default router;
