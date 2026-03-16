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

// F6-1 FIX: Import canonical AuthUser from types/index.ts instead of
// maintaining a stale local copy. The previous local interface was missing
// `roles` and `activeRole` fields, had a phantom `email` field that didn't
// exist on req.authUser, and used loose `string` instead of `UserRole`.
import type { AuthUser } from '../types';

// Re-export so existing `import { AuthUser } from '../utils/auth-guard'`
// statements continue to work without modification.
export type { AuthUser };

/**
 * Extract the authenticated user from the request, or throw 401.
 *
 * Usage:
 * ```ts
 * const user = getAuthUser(req);
 * // user.user_id, user.role, user.roles, user.activeRole are now safely typed
 * ```
 *
 * @throws {Error} If authUser is not present (should never happen after authMiddleware)
 */
export function getAuthUser(req: Request): AuthUser {
    const user = req.authUser;
    if (!user) {
        throw new Error('Authentication required');
    }
    return user;
}

