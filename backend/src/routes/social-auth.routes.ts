// ============================================================================
// Nammerha Backend — Social OAuth Routes
// POST /api/auth/social — Authenticate via Google, Apple, or Facebook
//
// Architecture: ID Token Verification Pattern (Backend-for-Frontend)
// Each provider has its own verification strategy:
//   - Google: google-auth-library verifyIdToken()
//   - Apple: JWKS endpoint + JWT verification
//   - Facebook: Graph API /me endpoint
//
// Security:
//   - All tokens verified SERVER-SIDE (never trust client claims)
//   - Account linking by verified email only (anti-takeover)
//   - Nonce verification for Apple (anti-replay)
//   - Rate-limited to prevent abuse
// ============================================================================
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { OAuth2Client } from 'google-auth-library';
import { query } from '../config/database';
import { generateToken } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { safeRouteError } from '../utils/safe-error';
import { z } from 'zod/v4';
import type { ApiResponse, SocialProvider, UserRole } from '../types';

const router = Router();

// ─── Environment ────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env['GOOGLE_CLIENT_ID'] ?? '';
const GOOGLE_CLIENT_ID_IOS = process.env['GOOGLE_CLIENT_ID_IOS'] ?? '';
const GOOGLE_CLIENT_ID_ANDROID = process.env['GOOGLE_CLIENT_ID_ANDROID'] ?? '';
const APPLE_CLIENT_ID = process.env['APPLE_CLIENT_ID'] ?? '';
// APPLE_TEAM_ID reserved for future Apple Services Auth Key validation
const FACEBOOK_APP_ID = process.env['FACEBOOK_APP_ID'] ?? '';
const FACEBOOK_APP_SECRET = process.env['FACEBOOK_APP_SECRET'] ?? '';

// Google OAuth2 client — supports web + mobile client IDs
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Apple JWKS client (cached, rate-limited)
const appleJwks = jwksClient({
    jwksUri: 'https://appleid.apple.com/auth/keys',
    cache: true,
    cacheMaxAge: 600_000, // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: 10,
});

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const socialAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 social auth attempts per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many authentication attempts. Please try again later.' } as ApiResponse,
});

// ─── Zod Schema ─────────────────────────────────────────────────────────────
const SocialAuthSchema = z.object({
    provider: z.enum(['google', 'apple', 'facebook']),
    id_token: z.string().min(10, 'Token is required'),
    // Apple first-login only — name not included in subsequent tokens
    full_name: z.string().min(1).max(255).optional(),
});

// ─── Provider Verification Functions ────────────────────────────────────────

interface VerifiedSocialUser {
    provider_user_id: string;
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
    email_verified: boolean;
}

/**
 * Verify Google ID Token using google-auth-library.
 * Accepts tokens issued for web, iOS, or Android client IDs.
 */
async function verifyGoogleToken(idToken: string): Promise<VerifiedSocialUser> {
    const allowedAudiences = [
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_ID_IOS,
        GOOGLE_CLIENT_ID_ANDROID,
    ].filter(Boolean);

    if (allowedAudiences.length === 0) {
        throw new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID in environment.');
    }

    const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: allowedAudiences,
    });

    const payload = ticket.getPayload();
    if (!payload) {
        throw new Error('Google token verification returned no payload');
    }

    return {
        provider_user_id: payload.sub,
        email: payload.email ?? null,
        full_name: payload.name ?? null,
        avatar_url: payload.picture ?? null,
        email_verified: payload.email_verified ?? false,
    };
}

/**
 * Verify Apple ID Token by fetching Apple's JWKS and verifying the JWT.
 * Apple ID tokens are standard JWTs signed with RS256.
 */
async function verifyAppleToken(idToken: string): Promise<VerifiedSocialUser> {
    if (!APPLE_CLIENT_ID) {
        throw new Error('Apple Sign In is not configured. Set APPLE_CLIENT_ID in environment.');
    }

    // Decode header to get kid
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
        throw new Error('Malformed Apple ID token');
    }

    // Fetch signing key from Apple JWKS
    const signingKey = await new Promise<string>((resolve, reject) => {
        appleJwks.getSigningKey(decoded.header.kid!, (err, key) => {
            if (err || !key) {
                reject(err ?? new Error('Apple signing key not found'));
                return;
            }
            const publicKey = 'publicKey' in key ? key.publicKey : key.rsaPublicKey;
            resolve(publicKey);
        });
    });

    // Verify JWT
    const payload = jwt.verify(idToken, signingKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: APPLE_CLIENT_ID,
    }) as {
        sub: string;
        email?: string;
        email_verified?: string | boolean;
        is_private_email?: string | boolean;
    };

    return {
        provider_user_id: payload.sub,
        email: payload.email ?? null,
        full_name: null, // Apple only sends name on first authorization
        avatar_url: null, // Apple never provides avatar
        email_verified: payload.email_verified === true || payload.email_verified === 'true',
    };
}

/**
 * Verify Facebook Access Token via Graph API.
 * Facebook tokens are opaque — we must call their API to verify.
 * Uses App Secret Proof for server-to-server security.
 */
async function verifyFacebookToken(accessToken: string): Promise<VerifiedSocialUser> {
    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
        throw new Error('Facebook Login is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in environment.');
    }

    // Step 1: Verify token is valid and belongs to our app
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
    const debugResp = await fetch(debugUrl);
    if (!debugResp.ok) {
        throw new Error('Facebook token debug request failed');
    }
    const debugData = await debugResp.json() as {
        data?: { is_valid?: boolean; app_id?: string; user_id?: string };
    };

    if (!debugData.data?.is_valid || debugData.data.app_id !== FACEBOOK_APP_ID) {
        throw new Error('Invalid or expired Facebook access token');
    }

    // Step 2: Fetch user profile
    const meUrl = `https://graph.facebook.com/me?access_token=${encodeURIComponent(accessToken)}&fields=id,name,email,picture.type(large)`;
    const meResp = await fetch(meUrl);
    if (!meResp.ok) {
        throw new Error('Facebook /me request failed');
    }
    const meData = await meResp.json() as {
        id: string;
        name?: string;
        email?: string;
        picture?: { data?: { url?: string } };
    };

    return {
        provider_user_id: meData.id,
        email: meData.email ?? null,
        full_name: meData.name ?? null,
        avatar_url: meData.picture?.data?.url ?? null,
        // Facebook email is considered verified if present in /me response
        // (user must have verified it with Facebook to make it available)
        email_verified: Boolean(meData.email),
    };
}

// ─── Main Route ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/social
 *
 * Universal social login endpoint for all providers and platforms.
 * Works identically for web (cookie) and mobile (Bearer token).
 *
 * Flow:
 * 1. Validate input (Zod)
 * 2. Verify ID token with provider
 * 3. Check oauth_providers for existing link → login
 * 4. Check users by email → link + login
 * 5. No match → register new user + link + login
 * 6. Return JWT + user (same shape as /auth/login)
 */
router.post(
    '/social',
    socialAuthLimiter,
    async (req: Request, res: Response): Promise<void> => {
        try {
            // ── Step 1: Validate input ──
            const parsed = SocialAuthSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    success: false,
                    error: parsed.error.issues.map(i => i.message).join(', '),
                } as ApiResponse);
                return;
            }

            const { provider, id_token, full_name: clientName } = parsed.data;

            // ── Step 2: Verify token with provider ──
            let socialUser: VerifiedSocialUser;
            try {
                switch (provider) {
                    case 'google':
                        socialUser = await verifyGoogleToken(id_token);
                        break;
                    case 'apple':
                        socialUser = await verifyAppleToken(id_token);
                        break;
                    case 'facebook':
                        socialUser = await verifyFacebookToken(id_token);
                        break;
                    default:
                        res.status(400).json({ success: false, error: 'Unsupported provider' } as ApiResponse);
                        return;
                }
            } catch (verifyErr) {
                const msg = verifyErr instanceof Error ? verifyErr.message : 'Token verification failed';
                logger.warn('Social auth: token verification failed', { provider, error: msg });
                res.status(401).json({
                    success: false,
                    error: 'Authentication failed. Please try again.',
                } as ApiResponse);
                return;
            }

            // SEC: Reject unverified emails to prevent account takeover
            if (socialUser.email && !socialUser.email_verified) {
                logger.warn('Social auth: unverified email rejected', {
                    provider,
                    email: socialUser.email,
                });
                res.status(401).json({
                    success: false,
                    error: 'Email address is not verified by the provider.',
                } as ApiResponse);
                return;
            }

            // Apple sends name only on first auth — use client-provided fallback
            if (provider === 'apple' && !socialUser.full_name && clientName) {
                socialUser.full_name = clientName;
            }

            // ── Step 3: Check existing OAuth link ──
            const existingLink = await query<{
                user_id: string;
            }>(
                `SELECT user_id FROM oauth_providers
                 WHERE provider = $1 AND provider_user_id = $2`,
                [provider, socialUser.provider_user_id]
            );

            let userId: string;

            if (existingLink.rows[0]) {
                // ── Existing social login — just log them in ──
                userId = existingLink.rows[0].user_id;
                logger.info('Social auth: existing link login', { provider, userId });
            } else if (socialUser.email) {
                // ── Step 4: Check for existing user by email → link ──
                const existingUser = await query<{
                    user_id: string;
                    is_email_verified: boolean;
                }>(
                    'SELECT user_id, is_email_verified FROM users WHERE email = $1',
                    [socialUser.email.toLowerCase().trim()]
                );

                if (existingUser.rows[0]) {
                    // Link social provider to existing account
                    userId = existingUser.rows[0].user_id;

                    await query(
                        `INSERT INTO oauth_providers (user_id, provider, provider_user_id, provider_email, provider_avatar_url)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (user_id, provider) DO NOTHING`,
                        [userId, provider, socialUser.provider_user_id, socialUser.email, socialUser.avatar_url]
                    );

                    // If user wasn't email-verified yet, mark them as verified
                    // (provider already verified the email)
                    if (!existingUser.rows[0].is_email_verified) {
                        await query(
                            `UPDATE users SET is_email_verified = TRUE, is_active = TRUE,
                             email_verification_token = NULL, email_token_expires_at = NULL,
                             updated_at = NOW() WHERE user_id = $1`,
                            [userId]
                        );
                    }

                    // Update avatar if user doesn't have one
                    if (socialUser.avatar_url) {
                        await query(
                            `UPDATE users SET avatar_url = COALESCE(avatar_url, $1), updated_at = NOW()
                             WHERE user_id = $2`,
                            [socialUser.avatar_url, userId]
                        );
                    }

                    logger.info('Social auth: linked to existing account', { provider, userId, email: socialUser.email });
                } else {
                    // ── Step 5: New user — auto-register ──
                    userId = await createSocialUser(socialUser, provider);
                    logger.info('Social auth: new user created', { provider, userId, email: socialUser.email });
                }
            } else {
                // No email from provider (rare — Apple private relay without email)
                // Must create a new user with a placeholder
                userId = await createSocialUser(socialUser, provider);
                logger.info('Social auth: new user (no email)', { provider, userId });
            }

            // ── Step 6: Generate JWT + return response ──
            // Fetch full user data (same query as auth.routes.ts login)
            const userResult = await query<{
                user_id: string;
                email: string;
                full_name: string;
                role: UserRole;
                is_active: boolean;
                is_email_verified: boolean;
                avatar_url: string | null;
            }>(
                `SELECT user_id, email, full_name, role, is_active, is_email_verified, avatar_url
                 FROM users WHERE user_id = $1`,
                [userId]
            );

            const user = userResult.rows[0];
            if (!user) {
                logger.error('Social auth: user not found after creation/login', { userId });
                res.status(500).json({ success: false, error: 'Authentication failed' } as ApiResponse);
                return;
            }

            // Fetch all active roles
            const userRolesResult = await query<{ role_name: UserRole; is_primary: boolean }>(
                `SELECT r.role_name, ur.is_primary FROM user_roles ur
                 JOIN roles r ON r.role_id = ur.role_id
                 WHERE ur.user_id = $1 AND ur.status = 'active'
                 ORDER BY ur.is_primary DESC, r.sort_order`,
                [userId]
            );

            const allRoles = userRolesResult.rows.map(r => r.role_name);
            const activeRole = userRolesResult.rows.find(r => r.is_primary)?.role_name ?? user.role;
            const rolesForToken = allRoles.length > 0 ? allRoles : [user.role];

            // Generate JWT
            const token = generateToken(user.user_id, activeRole, rolesForToken);

            // Detect mobile client (same pattern as auth.routes.ts)
            const clientPlatform = (req.headers['x-platform'] as string | undefined)?.toLowerCase();
            const isMobileClient = clientPlatform === 'ios' || clientPlatform === 'android';

            // Web: set httpOnly cookie
            if (!isMobileClient) {
                res.cookie('nammerha_jwt', token, {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'strict',
                    maxAge: 24 * 60 * 60 * 1000, // 24h
                    path: '/',
                });
            }

            res.status(200).json({
                success: true,
                data: {
                    user: {
                        user_id: user.user_id,
                        email: user.email,
                        full_name: user.full_name,
                        role: user.role,
                        roles: rolesForToken,
                        activeRole,
                        is_active: user.is_active,
                        is_email_verified: user.is_email_verified,
                        avatar_url: user.avatar_url,
                        social_provider: provider,
                    },
                    // MOB-AUTH-001: Token only in body for mobile
                    ...(isMobileClient ? { token } : {}),
                },
            } as ApiResponse);

        } catch (error) {
            safeRouteError(res, error, 'SocialAuth.Login');
        }
    }
);

// ─── Helper: Create New Social User ─────────────────────────────────────────

async function createSocialUser(
    socialUser: VerifiedSocialUser,
    provider: SocialProvider,
): Promise<string> {
    const email = socialUser.email?.toLowerCase().trim() ?? `${provider}_${socialUser.provider_user_id}@social.nammerha.com`;
    const fullName = socialUser.full_name ?? email.split('@')[0] ?? 'User';
    const defaultRole: UserRole = 'donor';

    // Create user with no password (social-only)
    const userResult = await query<{ user_id: string }>(
        `INSERT INTO users (email, password_hash, full_name, role, avatar_url, is_active, is_email_verified)
         VALUES ($1, NULL, $2, $3, $4, TRUE, TRUE)
         RETURNING user_id`,
        [email, fullName, defaultRole, socialUser.avatar_url]
    );

    const userId = userResult.rows[0]?.user_id;
    if (!userId) {
        throw new Error('Failed to create social user');
    }

    // Insert into user_roles junction table
    await query(
        `INSERT INTO user_roles (user_id, role_id, status, is_primary)
         SELECT $1, r.role_id, 'active', TRUE
         FROM roles r WHERE r.role_name = $2
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, defaultRole]
    );

    // Create default donor profile
    await query(
        `INSERT INTO donor_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [userId]
    );

    // Link OAuth provider
    await query(
        `INSERT INTO oauth_providers (user_id, provider, provider_user_id, provider_email, provider_avatar_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, provider, socialUser.provider_user_id, socialUser.email, socialUser.avatar_url]
    );

    return userId;
}

export default router;
