// ============================================================================
// Nammerha GraphQL — Auth Resolvers
// ============================================================================
import { requireAuth, type GQLContext } from '../../context/auth.context';
import { query as dbQuery } from '../../../config/database';
import { mapUser } from '../_shared/row-mappers';

// V-001 FIX: extractDeviceTelemetry() and isMobilePlatform() removed —
// they were only used by the now-disabled register/login/refreshToken mutations.

export const authQueryResolvers = {
  me: async (_: unknown, __: unknown, context: GQLContext) => {
    const authUser = requireAuth(context);
    const result = await dbQuery(
      `SELECT user_id, email, phone, full_name, role, avatar_url,
                    kyc_verification_status, is_active, is_email_verified,
                    created_at, updated_at
             FROM users WHERE user_id = $1`,
      [authUser.user_id],
    );
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    const user = mapUser(result.rows[0] as Record<string, unknown>);
    return { ...user, roles: authUser.roles.map((r) => r.toUpperCase()) };
  },
};

export const authMutationResolvers = {
  register: async () => {
    // V-001 FIX: GraphQL auth mutations disabled — use REST API.
    // GraphQL register/login/refreshToken bypassed ALL REST security controls:
    // - No rate limiting (REST: 60/15min per IP)
    // - No account lockout (REST: SEC-002, 5 attempts)
    // - No email verification gate (REST: PLT-AUD-008)
    // - No anti-enumeration (REST: identical 200 responses)
    // - No Zod input validation (REST: registerSchema)
    // - No timing equalization (REST: CWE-208 dummy bcrypt)
    // - No TOCTOU defense (REST: ON CONFLICT DO NOTHING)
    // - Registration returned JWT immediately (REST withholds until verified)
    throw new Error(
      'AUTH_DEPRECATED: Registration via GraphQL is disabled for security. ' +
        'Use POST /api/auth/register with full security controls.',
    );
  },

  login: async () => {
    // V-001 FIX: See register() comment for full rationale.
    throw new Error(
      'AUTH_DEPRECATED: Login via GraphQL is disabled for security. ' +
        'Use POST /api/auth/login with full security controls.',
    );
  },

  refreshToken: async () => {
    // V-001 FIX: See register() comment for full rationale.
    throw new Error(
      'AUTH_DEPRECATED: Token refresh via GraphQL is disabled for security. ' +
        'Use POST /api/auth/refresh with full security controls.',
    );
  },
};
