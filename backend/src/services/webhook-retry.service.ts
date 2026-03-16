// ============================================================================
// Nammerha Backend — Webhook Retry Service (ENH-6)
// Dead-letter queue with exponential backoff for failed webhook processing.
// ============================================================================
// Only INTERNAL processing failures are queued. Signature validation failures
// are rejected permanently — they indicate a spoofed or corrupted payload.
//
// Retry schedule (exponential backoff):
//   Attempt 1: +1 minute     (60s)
//   Attempt 2: +4 minutes    (240s)
//   Attempt 3: +16 minutes   (960s)
//   Attempt 4: +64 minutes   (3840s)
//   Attempt 5: +256 minutes  (15360s ≈ 4.3 hours)
// ============================================================================
import pool from '../config/database';
import { logger } from '../utils/logger';

/** Backoff multiplier base (4^attempt minutes) */
const BACKOFF_BASE = 4;

// ─── Dead Letter Operations ─────────────────────────────────────────────────

/**
 * Queue a failed webhook payload for retry.
 * Called by payment.service.ts when webhook processing fails internally.
 */
export async function queueFailedWebhook(params: {
    gateway: string;
    payload: Record<string, unknown>;
    rawBody: string;
    signature: string | null;
    errorMessage: string;
    errorStack?: string;
}): Promise<string> {
    const nextRetryAt = new Date(Date.now() + 60_000); // first retry in 1 minute

    const result = await pool.query<{ dead_letter_id: string }>(
        `INSERT INTO webhook_dead_letter
            (gateway, payload, raw_body, signature, error_message, error_stack, next_retry_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING dead_letter_id`,
        [
            params.gateway,
            JSON.stringify(params.payload),
            params.rawBody,
            params.signature,
            params.errorMessage,
            params.errorStack ?? null,
            nextRetryAt,
        ],
    );

    const id = result.rows[0]?.dead_letter_id;
    if (!id) { throw new Error('Failed to queue webhook in dead letter'); }

    logger.warn('ENH-6: Webhook queued in dead letter', {
        dead_letter_id: id,
        gateway: params.gateway,
        error: params.errorMessage,
        next_retry_at: nextRetryAt.toISOString(),
    });

    return id;
}

/**
 * Get retryable entries (status=pending|retrying AND next_retry_at <= NOW).
 */
export async function getRetryableEntries(): Promise<Array<{
    dead_letter_id: string;
    gateway: string;
    payload: Record<string, unknown>;
    raw_body: string | null;
    signature: string | null;
    retry_count: number;
    max_retries: number;
}>> {
    const result = await pool.query(
        `SELECT dead_letter_id, gateway, payload, raw_body, signature,
                retry_count, max_retries
         FROM webhook_dead_letter
         WHERE status IN ('pending', 'retrying')
           AND next_retry_at <= NOW()
         ORDER BY next_retry_at ASC
         LIMIT 10`,
    );
    return result.rows;
}

/**
 * Mark a dead letter entry as resolved (successfully processed on retry).
 */
export async function markResolved(deadLetterId: string): Promise<void> {
    await pool.query(
        `UPDATE webhook_dead_letter
         SET status = 'resolved', resolved_at = NOW()
         WHERE dead_letter_id = $1`,
        [deadLetterId],
    );
    logger.info('ENH-6: Dead letter resolved', { dead_letter_id: deadLetterId });
}

/**
 * Increment retry count and calculate next retry time.
 * If max retries exceeded, mark as 'exhausted'.
 */
export async function incrementRetry(
    deadLetterId: string,
    newError: string,
): Promise<void> {
    const result = await pool.query<{ retry_count: number; max_retries: number }>(
        `UPDATE webhook_dead_letter
         SET retry_count = retry_count + 1,
             status = 'retrying',
             error_message = $2
         WHERE dead_letter_id = $1
         RETURNING retry_count, max_retries`,
        [deadLetterId, newError],
    );

    const row = result.rows[0];
    if (!row) { return; }

    if (row.retry_count >= row.max_retries) {
        // Exhausted — no more retries
        await pool.query(
            `UPDATE webhook_dead_letter
             SET status = 'exhausted'
             WHERE dead_letter_id = $1`,
            [deadLetterId],
        );
        logger.error('ENH-6: Dead letter exhausted — giving up', {
            dead_letter_id: deadLetterId,
            retries: row.retry_count,
        });
        return;
    }

    // Calculate next retry with exponential backoff: 4^attempt minutes
    const delayMinutes = Math.pow(BACKOFF_BASE, row.retry_count);
    const nextRetryAt = new Date(Date.now() + delayMinutes * 60_000);

    await pool.query(
        `UPDATE webhook_dead_letter
         SET next_retry_at = $2
         WHERE dead_letter_id = $1`,
        [deadLetterId, nextRetryAt],
    );

    logger.warn('ENH-6: Dead letter retry scheduled', {
        dead_letter_id: deadLetterId,
        retry_count: row.retry_count,
        next_retry_at: nextRetryAt.toISOString(),
        delay_minutes: delayMinutes,
    });
}
