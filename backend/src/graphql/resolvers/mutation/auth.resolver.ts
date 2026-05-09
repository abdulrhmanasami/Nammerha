// ============================================================================
// Nammerha GraphQL — Auth Resolvers
// ============================================================================
import { requireAuth, type GQLContext } from '../../context/auth.context';
import { query as dbQuery } from '../../../config/database';
import { generateToken } from '../../../middleware/auth.middleware';
import * as deviceAuthService from '../../../services/device-auth.service';
import { mapUser } from '../_shared/row-mappers';

function extractDeviceTelemetry(context: GQLContext) {
    return {
        platform: context.req.headers['x-platform'] as string | undefined,
        deviceId: context.req.headers['x-device-id'] as string | undefined,
        appVersion: context.req.headers['x-app-version'] as string | undefined,
        osVersion: context.req.headers['x-os-version'] as string | undefined,
        deviceModel: context.req.headers['x-device-model'] as string | undefined,
    };
}

function isMobilePlatform(platform: string | undefined): platform is 'ios' | 'android' | 'web' {
    return platform === 'ios' || platform === 'android' || platform === 'web';
}

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
        if (result.rows.length === 0) {throw new Error('User not found');}
        const user = mapUser(result.rows[0] as Record<string, unknown>);
        return { ...user, roles: authUser.roles.map(r => r.toUpperCase()) };
    },
};

export const authMutationResolvers = {
    register: async (
        _: unknown,
        args: { email: string; password: string; fullName: string; role: string; phone?: string },
        context: GQLContext,
    ) => {
        const { default: bcrypt } = await import('bcrypt');
        const passwordHash = await bcrypt.hash(args.password, 12);

        const result = await dbQuery(
            `INSERT INTO users (email, password_hash, full_name, role, phone)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING user_id, email, full_name, role, avatar_url,
                       kyc_verification_status, is_active, is_email_verified,
                       created_at, updated_at`,
            [args.email.toLowerCase().trim(), passwordHash, args.fullName.trim(),
             args.role.toLowerCase(), args.phone ?? null],
        );

        const userRow = result.rows[0] as Record<string, unknown>;
        if (!userRow) {throw new Error('Registration failed');}

        const userId = String(userRow['user_id']);
        const roleStr = String(userRow['role']);
        const telemetry = extractDeviceTelemetry(context);

        if (isMobilePlatform(telemetry.platform)) {
            const tokens = await deviceAuthService.issueTokenPair(
                userId, roleStr, [roleStr],
                {
                    device_id: telemetry.deviceId ?? 'unknown',
                    platform: telemetry.platform,
                    app_version: telemetry.appVersion,
                    os_version: telemetry.osVersion,
                    device_model: telemetry.deviceModel,
                },
            );
            return {
                token: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                user: mapUser(userRow),
            };
        }

        return {
            token: generateToken(userId, roleStr),
            refreshToken: null,
            user: mapUser(userRow),
        };
    },

    login: async (_: unknown, args: { email: string; password: string }, context: GQLContext) => {
        const result = await dbQuery(
            `SELECT user_id, email, password_hash, full_name, role, avatar_url,
                    kyc_verification_status, is_active, is_email_verified,
                    created_at, updated_at
             FROM users WHERE email = $1`,
            [args.email.toLowerCase().trim()],
        );

        const userRow = result.rows[0] as Record<string, unknown> | undefined;
        if (!userRow) {throw new Error('Invalid email or password');}

        const { default: bcrypt } = await import('bcrypt');
        const valid = await bcrypt.compare(args.password, String(userRow['password_hash']));
        if (!valid) {throw new Error('Invalid email or password');}
        if (!userRow['is_active']) {throw new Error('Account is deactivated');}

        const userId = String(userRow['user_id']);
        const roleStr = String(userRow['role']);

        const rolesResult = await dbQuery<{ role_name: string }>(
            `SELECT r.role_name FROM user_roles ur
             JOIN roles r ON r.role_id = ur.role_id
             WHERE ur.user_id = $1 AND ur.status = 'active'`,
            [userId],
        );
        const roles = rolesResult.rows.map(r => r.role_name);
        const activeRoles = roles.length > 0 ? roles : [roleStr];

        const userPayload = {
            ...mapUser(userRow),
            roles: activeRoles.map(r => r.toUpperCase()),
        };

        const telemetry = extractDeviceTelemetry(context);

        if (isMobilePlatform(telemetry.platform)) {
            const tokens = await deviceAuthService.issueTokenPair(
                userId, roleStr, activeRoles,
                {
                    device_id: telemetry.deviceId ?? 'unknown',
                    platform: telemetry.platform,
                    app_version: telemetry.appVersion,
                    os_version: telemetry.osVersion,
                    device_model: telemetry.deviceModel,
                },
            );
            return {
                token: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                user: userPayload,
            };
        }

        const token = generateToken(userId, roleStr, roles.length > 0 ? roles : undefined);
        return { token, refreshToken: null, user: userPayload };
    },

    refreshToken: async (_: unknown, args: { refreshToken: string }, context: GQLContext) => {
        const telemetry = extractDeviceTelemetry(context);

        if (!telemetry.platform && !telemetry.deviceId) {
            throw new Error('Refresh token requires client telemetry headers (x-platform or x-device-id)');
        }

        const refreshResult = await deviceAuthService.rotateRefreshToken(
            args.refreshToken,
            {
                device_id: telemetry.deviceId ?? 'unknown',
                platform: (telemetry.platform as 'ios' | 'android' | 'web') ?? 'web',
                app_version: telemetry.appVersion,
                os_version: telemetry.osVersion,
                device_model: telemetry.deviceModel,
            },
        );

        return {
            token: refreshResult.tokens.accessToken,
            refreshToken: refreshResult.tokens.refreshToken,
            user: {
                userId: refreshResult.user.user_id,
                role: refreshResult.user.role.toUpperCase(),
                roles: refreshResult.user.roles.map(r => r.toUpperCase()),
                isActive: refreshResult.user.is_active,
            },
        };
    },
};
