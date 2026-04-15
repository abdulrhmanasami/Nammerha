// ============================================================================
// Nammerha Backend — Cache Middleware
// ============================================================================
import { Request, Response, NextFunction } from 'express';
import { memoryCache } from '../utils/native-cache';
import { logger } from '../utils/logger';

export function cacheResponse(ttlSeconds: number) {
    return (req: Request, res: Response, next: NextFunction): void => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        const key = `__express__${req.originalUrl || req.url}`;
        const cachedBody = memoryCache.get(key);

        if (cachedBody) {
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('Content-Type', 'application/json');
            res.send(cachedBody);
            return;
        } else {
            res.setHeader('X-Cache', 'MISS');
            
            // Intercept res.json and res.send
            const originalJson = res.json.bind(res);
            res.json = (body: any) => {
                memoryCache.set(key, body, ttlSeconds);
                return originalJson(body);
            };

            const originalSend = res.send.bind(res);
            res.send = (body: any) => {
                // If it's sent as a string (after JSON.stringify somewhere else), cache it as string.
                if (typeof body === 'string' && res.statusCode >= 200 && res.statusCode < 300) {
                    memoryCache.set(key, body, ttlSeconds);
                }
                return originalSend(body);
            };

            next();
        }
    };
}
