// ============================================================================
// Nammerha Backend — Type-Safe Auth Guard Utility (PLAT-FIX-03a)
// ============================================================================
// Eliminates all 106 `req.authUser!` non-null assertions across the codebase.
// After authMiddleware runs, req.authUser is guaranteed to be present for
// authenticated routes. This utility provides a type-safe extraction that:
//   1. Narrows the type from `AuthUser | undefined` to `AuthUser`
//   2. Throws a clean 401 if the invariant is violated
//   3. Avoids the `!` operator entirely
// ============================================================================
import { Request } from 'express';

/**
 * Represents the authenticated user attached by authMiddleware.
 * This type mirrors the shape set in auth.middleware.ts.
 */
export interface AuthUser {
    user_id: string;
    role: string;
    email?: string;
    is_active?: boolean;
}

/**
 * Extract the authenticated user from the request, or throw 401.
 *
 * Usage:
 * ```ts
 * const user = getAuthUser(req);
 * // user.user_id and user.role are now safely typed
 * ```
 *
 * @throws {Error} If authUser is not present (should never happen after authMiddleware)
 */
export function getAuthUser(req: Request): AuthUser {
    const user = req.authUser;
    if (!user) {
        throw new Error('Authentication required');
    }
    return user as AuthUser;
}
