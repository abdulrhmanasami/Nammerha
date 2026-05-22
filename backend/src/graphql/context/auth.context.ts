// ============================================================================
// Nammerha GraphQL — Authentication Context
// ============================================================================
// Builds the GraphQL context from the Express request by reusing the
// authentication state already resolved by the Express auth middleware.
//
// ARCHITECTURE DECISION:
// The `verifyToken` function in auth.middleware.ts is intentionally private
// (not exported) for security encapsulation. Instead of duplicating JWT
// verification logic, we rely on the Express auth middleware running
// UPSTREAM of the GraphQL endpoint. If `req.authUser` is populated,
// we trust it. If not, the request is unauthenticated.
//
// This is safe because:
//   1. The GraphQL endpoint is mounted AFTER the global middleware stack
//   2. The auth middleware runs on every /api/* and /graphql path
//   3. Auth middleware populates req.authUser if valid JWT is present
//   4. Auth middleware does NOT return 401 — it only populates or skips
//      (the 401 is returned by route-level guards like requireRole)
//
// SECURITY: This context builder NEVER attempts its own JWT verification.
// ============================================================================

import type { Request } from 'express';
import type { AuthUser } from '../../types/index';
import { createUserLoader } from './dataloader/user.loader';
import { createProjectLoader } from './dataloader/project.loader';
import { createBOQLoader } from './dataloader/boq.loader';

export interface GQLDataLoaders {
  userLoader: ReturnType<typeof createUserLoader>;
  projectLoader: ReturnType<typeof createProjectLoader>;
  boqLoader: ReturnType<typeof createBOQLoader>;
}

/**
 * GraphQL context type available in all resolvers.
 */
export interface GQLContext {
  /** Authenticated user or null for public queries */
  user: AuthUser | null;
  /** Raw Express request for IP/user-agent access */
  req: Request;
  /** Per-request caching/batching loaders */
  loaders: GQLDataLoaders;
}

/**
 * Builds the GraphQL context from the Express request.
 *
 * The Express auth middleware has already run by this point.
 * If a valid JWT was present, `req.authUser` is populated.
 * If no JWT or an invalid JWT was provided, `req.authUser` is undefined.
 *
 * We simply read the resolved state — no duplicate verification.
 */
export async function buildContext({ req }: { req: Request }): Promise<GQLContext> {
  return {
    user: req.authUser ?? null,
    req,
    loaders: {
      userLoader: createUserLoader(),
      projectLoader: createProjectLoader(),
      boqLoader: createBOQLoader(),
    },
  };
}

/**
 * Guard function for resolvers that require authentication.
 * Throws a GraphQL-friendly error if the user is not authenticated.
 */
export function requireAuth(context: GQLContext): AuthUser {
  if (!context.user) {
    throw new Error('Authentication required. Please provide a valid Bearer token.');
  }
  return context.user;
}

/**
 * Guard function for resolvers that require a specific role.
 * Throws a GraphQL-friendly error if the user doesn't have the required role.
 */
export function requireRole(context: GQLContext, ...roles: string[]): AuthUser {
  const user = requireAuth(context);
  const lowerRoles = roles.map((r) => r.toLowerCase());

  // Check both primary role and multi-role array
  const hasRole = lowerRoles.includes(user.role) || user.roles.some((r) => lowerRoles.includes(r));

  if (!hasRole) {
    // P0-W10-003 FIX: Do NOT leak required role names in error messages.
    // PREVIOUS: `Required roles: ${roles.join(', ')}` — attackers could map RBAC structure.
    // REST role-guard.middleware.ts was fixed (HGH-004) but this GraphQL path was missed.
    throw new Error('Insufficient permissions.');
  }
  return user;
}
