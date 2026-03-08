// ============================================================================
// Nammerha Backend — Role Guard Middleware
// Restricts endpoints to specific user roles.
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../types';

/**
 * Creates a middleware that restricts access to specific roles.
 *
 * Usage:
 *   router.post('/admin/escrow/release', requireRole('admin', 'auditor'), handler);
 *
 * Must be used AFTER authMiddleware.
 */
export function requireRole(...allowedRoles: UserRole[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.authUser) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }

        if (!allowedRoles.includes(req.authUser.role)) {
            res.status(403).json({
                success: false,
                error: `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${req.authUser.role}`,
            });
            return;
        }

        next();
    };
}
