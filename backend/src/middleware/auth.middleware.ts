// ============================================================================
// Nammerha Backend — Authentication Middleware
// Dual-mode JWT verification:
//   1. Auth0 RS256 (production) — asymmetric via JWKS endpoint
//   2. Legacy HS256 (internal/dev) — symmetric via JWT_SECRET
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { query } from '../config/database';
import type { AuthUser, User } from '../types';

// ─── Environment ────────────────────────────────────────────────────────────

const AUTH0_DOMAIN = process.env['AUTH0_DOMAIN'] ?? '';
const AUTH0_AUDIENCE = process.env['AUTH0_AUDIENCE'] ?? '';
const JWT_SECRET = process.env['JWT_SECRET'] ?? '';

const AUTH0_ENABLED = Boolean(AUTH0_DOMAIN && AUTH0_AUDIENCE);

// ─── JWKS Client (cached, rate-limited) ─────────────────────────────────────

const jwks = AUTH0_ENABLED
    ? jwksClient({
        jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
        cache: true,
        cacheMaxAge: 600_000, // 10 minutes
        rateLimit: true,
        jwksRequestsPerMinute: 10,
    })
    : null;

/**
 * Retrieves the RS256 signing key from Auth0's JWKS endpoint.
 */
function getAuth0SigningKey(header: jwt.JwtHeader): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!jwks || !header.kid) {
            reject(new Error('JWKS client not configured or missing kid'));
            return;
        }
        jwks.getSigningKey(header.kid, (err, key) => {
            if (err) {
                reject(err);
                return;
            }
            if (!key) {
                reject(new Error('Signing key not found'));
                return;
            }
            const publicKey = 'publicKey' in key ? key.publicKey : key.rsaPublicKey;
            resolve(publicKey);
        });
    });
}

// ─── Token Verification ─────────────────────────────────────────────────────

interface JwtPayload {
    sub: string;
    role?: string;
    iat?: number;
    exp?: number;
    iss?: string;
    aud?: string | string[];
}

/**
 * Attempts to verify a JWT token using Auth0 RS256/JWKS first,
 * falling back to legacy HS256 if Auth0 is not configured or
 * the token was not issued by Auth0.
 */
async function verifyToken(token: string): Promise<JwtPayload> {
    // Decode header to determine algorithm without verification
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
        throw new jwt.JsonWebTokenError('Malformed token');
    }

    const { header } = decoded;

    // ── Strategy 1: Auth0 RS256 ──
    if (AUTH0_ENABLED && header.alg === 'RS256' && header.kid) {
        const signingKey = await getAuth0SigningKey(header);
        const payload = jwt.verify(token, signingKey, {
            algorithms: ['RS256'],
            issuer: `https://${AUTH0_DOMAIN}/`,
            audience: AUTH0_AUDIENCE,
        }) as JwtPayload;
        return payload;
    }

    // ── Strategy 2: Legacy HS256 ──
    if (JWT_SECRET) {
        const payload = jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256'],
        }) as JwtPayload;
        return payload;
    }

    throw new jwt.JsonWebTokenError('No valid verification strategy available');
}

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * Authentication middleware.
 * Validates JWT token from Authorization: Bearer <token> header.
 *
 * Supports:
 *   - Auth0 RS256 tokens (production) — verified via JWKS
 *   - Legacy HS256 tokens (internal) — verified via JWT_SECRET
 *   - Development fallback: X-User-Id header (only when NODE_ENV=development)
 *
 * Attaches `req.authUser` with { user_id, role, is_active }.
 */
export async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        let userId: string | undefined;

        // Production: JWT from Authorization header
        const authHeader = req.headers['authorization'];
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                const payload = await verifyToken(token);
                userId = payload.sub;
            } catch (err) {
                if (err instanceof jwt.TokenExpiredError) {
                    res.status(401).json({ success: false, error: 'Token expired' });
                    return;
                }
                if (err instanceof jwt.JsonWebTokenError) {
                    res.status(401).json({ success: false, error: 'Invalid token' });
                    return;
                }
                res.status(401).json({ success: false, error: 'Authentication failed' });
                return;
            }
        }

        // Development fallback: X-User-Id header
        if (!userId && process.env['NODE_ENV'] === 'development') {
            userId = req.headers['x-user-id'] as string | undefined;
        }

        if (!userId) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }

        // Fetch user from database
        const result = await query<Pick<User, 'user_id' | 'role' | 'is_active'>>(
            'SELECT user_id, role, is_active FROM users WHERE user_id = $1',
            [userId]
        );

        const user = result.rows[0];
        if (!user) {
            res.status(401).json({ success: false, error: 'User not found' });
            return;
        }

        // Attach to request
        const authUser: AuthUser = {
            user_id: user.user_id,
            role: user.role,
            is_active: user.is_active,
        };

        req.authUser = authUser;
        next();
    } catch (error) {
        console.error('[Auth] Middleware error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
}

// ─── Token Generation ───────────────────────────────────────────────────────

/**
 * Generates a JWT token for a user.
 * Used by auth routes (login/register) for legacy HS256 flow.
 *
 * NOTE: In production with Auth0, tokens are issued by Auth0 directly.
 * This function serves as a fallback for internal/dev token generation.
 */
export function generateToken(userId: string, role: string): string {
    if (!JWT_SECRET) {
        throw new Error('[AUTH FATAL] JWT_SECRET is required for token generation');
    }
    const expiresIn = process.env['JWT_EXPIRY'] ?? '24h';
    return jwt.sign(
        { sub: userId, role },
        JWT_SECRET,
        { expiresIn, algorithm: 'HS256' } as jwt.SignOptions
    );
}

// ─── Role Guards ────────────────────────────────────────────────────────────

/**
 * Requires the authenticated user to have an active account (KYC verified).
 * Must be used AFTER authMiddleware.
 */
export function requireActive(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (!req.authUser) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
    }

    if (!req.authUser.is_active) {
        res.status(403).json({
            success: false,
            error: 'Account not activated. KYC verification required.',
        });
        return;
    }

    next();
}
