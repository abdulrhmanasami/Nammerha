// ============================================================================
// Nammerha Backend — Authentication Middleware
// Validates JWT token using jsonwebtoken and attaches AuthUser to request.
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import type { AuthUser, User } from '../types';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'CHANGE_ME_IN_PRODUCTION';

interface JwtPayload {
    sub: string;
    role?: string;
    iat?: number;
    exp?: number;
}

/**
 * Authentication middleware.
 * Validates JWT token from Authorization: Bearer <token> header
 * using jsonwebtoken.verify() with HS256 signature check.
 *
 * Development fallback: X-User-Id header (only when NODE_ENV=development).
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
                const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
                userId = decoded.sub;
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

/**
 * Generates a JWT token for a user.
 * Used by auth routes (login/register).
 */
export function generateToken(userId: string, role: string): string {
    const expiresIn = process.env['JWT_EXPIRY'] ?? '24h';
    return jwt.sign(
        { sub: userId, role },
        JWT_SECRET,
        { expiresIn, algorithm: 'HS256' } as jwt.SignOptions
    );
}

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
