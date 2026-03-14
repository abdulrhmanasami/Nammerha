// ============================================================================
// Nammerha Backend — Role Management Routes
// Handles multi-role operations: listing, switching, activating roles.
// ============================================================================
import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import type { UserRole } from '../types';

const router = Router();

// All role routes require authentication
router.use(authMiddleware);

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

        // Update primary role in users table for backward compatibility
        await query(
            'UPDATE users SET role = $1, updated_at = NOW() WHERE user_id = $2',
            [role, req.authUser.user_id]
        );

        // Update is_primary in user_roles
        await query(
            'UPDATE user_roles SET is_primary = FALSE WHERE user_id = $1',
            [req.authUser.user_id]
        );
        await query(
            `UPDATE user_roles SET is_primary = TRUE
             WHERE user_id = $1 AND role_id = (SELECT role_id FROM roles WHERE role_name = $2)`,
            [req.authUser.user_id, role]
        );

        logger.info('Role switched', { userId: req.authUser.user_id, newRole: role });

        res.json({
            success: true,
            message: 'Role switched successfully',
            data: { activeRole: role },
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

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by rows.length check above
        const roleData = roleInfo.rows[0]!;

        if (!roleData.is_self_assignable) {
            res.status(403).json({ success: false, error: 'This role cannot be self-assigned' });
            return;
        }

        // Check if user already has this role
        const existing = await query(
            `SELECT id, status FROM user_roles
             WHERE user_id = $1 AND role_id = $2`,
            [req.authUser.user_id, roleData.role_id]
        );

        if (existing.rows.length > 0) {
            const status = (existing.rows[0] as { status: string }).status;
            if (status === 'active') {
                res.status(409).json({ success: false, error: 'You already have this role' });
                return;
            }
            // Reactivate suspended/revoked role
            await query(
                `UPDATE user_roles SET status = $1, activated_at = NOW()
                 WHERE user_id = $2 AND role_id = $3`,
                [roleData.requires_kyb ? 'pending_kyb' : (roleData.requires_kyc ? 'pending_kyc' : 'active'),
                 req.authUser.user_id, roleData.role_id]
            );
        } else {
            // Create new role assignment
            const initialStatus = roleData.requires_kyb ? 'pending_kyb'
                : (roleData.requires_kyc ? 'pending_kyc' : 'active');

            await query(
                `INSERT INTO user_roles (user_id, role_id, status, is_primary)
                 VALUES ($1, $2, $3, $4)`,
                [req.authUser.user_id, roleData.role_id, initialStatus,
                 req.authUser.roles.length === 0]  // first role becomes primary
            );
        }

        // Create role-specific profile if it doesn't exist
        const profileTable = `${role}_profiles`;
        const profileTables = ['donor_profiles', 'contractor_profiles', 'engineer_profiles',
                              'supplier_profiles', 'tradesperson_profiles', 'homeowner_profiles'];

        if (profileTables.includes(profileTable)) {
            await query(
                `INSERT INTO ${profileTable} (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
                [req.authUser.user_id]
            );
        }

        logger.info('Role activated', {
            userId: req.authUser.user_id,
            role,
            status: roleData.requires_kyb ? 'pending_kyb' : (roleData.requires_kyc ? 'pending_kyc' : 'active'),
        });

        res.json({
            success: true,
            message: roleData.requires_kyb || roleData.requires_kyc
                ? 'Role activation pending verification'
                : 'Role activated successfully',
            data: {
                role,
                status: roleData.requires_kyb ? 'pending_kyb' : (roleData.requires_kyc ? 'pending_kyc' : 'active'),
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
