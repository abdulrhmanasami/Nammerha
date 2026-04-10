// ============================================================================
// Nammerha Backend — Idempotency Middleware
// Ensures state-changing requests with an 'Idempotency-Key' header are executed
// exactly once to protect against degraded network retries (e.g. Syria).
// Backed by PostgreSQL for persistent consistency.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool from '../config/database';
import { logger } from '../utils/logger';

// Only process these HTTP methods for idempotency
const IDEMPOTENT_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

export async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    // 1. Skip safe methods or requests without the header
    if (!IDEMPOTENT_METHODS.includes(req.method)) {
        return next();
    }

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
        return next();
    }

    // Capture context
    const requestPath = req.path;
    const requestMethod = req.method;
    const userId = req.authUser?.user_id ?? null;
    
    // Calculate a hash of the request body to ensure the client is not reusing
    // the key intentionally for a different payload.
    // Ensure req.body is defined (express.json() should be parsed before this)
    const bodyStr = req.body ? JSON.stringify(req.body) : '';
    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');

    try {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 2. Try to lock or create the key in the database
            // We use FOR UPDATE to lock the row if it exists.
            const existingResult = await client.query<{
                idempotency_key: string;
                request_body_hash: string;
                response_status: number | null;
                response_body: unknown | null;
            }>(
                `SELECT idempotency_key, request_body_hash, response_status, response_body 
                 FROM idempotency_keys
                 WHERE idempotency_key = $1 FOR UPDATE`,
                [idempotencyKey]
            );

            const existingNode = existingResult.rows[0];

            if (existingNode) {
                // Key exists!
                
                // Security verification: The payload must match exactly.
                if (existingNode.request_body_hash !== bodyHash) {
                    await client.query('ROLLBACK');
                    logger.warn('Idempotency Key reused with different payload', {
                        idempotencyKey,
                        path: requestPath,
                    });
                    res.status(400).json({
                        success: false,
                        error: 'Idempotency Key reused with different payload',
                    });
                    return;
                }

                // If processing is not complete yet, respond with 409 Conflict.
                // The client should backoff and retry later.
                if (existingNode.response_status === null) {
                    await client.query('ROLLBACK');
                    res.status(409).json({
                        success: false,
                        error: 'Request is currently processing. Please try again in a few moments.',
                    });
                    return;
                }

                // If originally succeeded/failed, return the perfectly cached response!
                await client.query('ROLLBACK');
                res.status(existingNode.response_status).json(existingNode.response_body);
                return;
            }

            // 3. Key does not exist. Insert it and lock it for this request.
            // Expiry is set to 24 hours.
            await client.query(
                `INSERT INTO idempotency_keys (
                    idempotency_key, user_id, request_path, request_method, 
                    request_body_hash, locked_at, expires_at
                ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '24 hours')`,
                [idempotencyKey, userId, requestPath, requestMethod, bodyHash]
            );

            await client.query('COMMIT');
        } catch (dbErr) {
            await client.query('ROLLBACK');
            throw dbErr;
        } finally {
            client.release();
        }

    } catch (err) {
        logger.error('Idempotency middleware failed connecting/querying database', {
            error: err instanceof Error ? err.message : String(err),
            idempotencyKey
        });
        // On strict systems this could be a fatal error, but gracefully fallback to next()
        // so the business logic can process. However, to guarantee absolute 0 issues, 
        // a 500 error might be safer. Let's fail-fast secure.
        res.status(500).json({
            success: false,
            error: 'Unable to verify idempotency layer. Please try again.',
        });
        return;
    }

    // 4. Intercept the Response to save it when the request completes.
    // We override res.json so that we can capture the final output before sending.
    const originalJson = res.json.bind(res);

    res.json = (body: unknown): Response => {
        const finalStatus = res.statusCode;

        // Async save to db without delaying the user's response
        pool.query(
            `UPDATE idempotency_keys
             SET response_status = $1, response_body = $2, locked_at = NULL
             WHERE idempotency_key = $3`,
            [finalStatus, JSON.stringify(body), idempotencyKey]
        ).catch(err => {
            logger.error('Failed to save idempotency response', {
                error: err instanceof Error ? err.message : String(err),
                idempotencyKey
            });
        });

        // Call the original
        return originalJson(body);
    };

    next();
}
