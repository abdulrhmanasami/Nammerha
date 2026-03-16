// ============================================================================
// Nammerha Backend — Webhook Retry Background Job (ENH-6)
// Processes retryable dead-letter entries every 60 seconds.
// ============================================================================
import { logger } from '../utils/logger';
import {
    getRetryableEntries,
    markResolved,
    incrementRetry,
} from '../services/webhook-retry.service';

/** Interval between retry runs (60 seconds) */
export const RETRY_INTERVAL_MS = 60 * 1000;

/**
 * Process all retryable webhook dead-letter entries.
 * For each entry, re-invoke the webhook handler logic.
 * On success → mark resolved. On failure → increment retry count.
 */
export async function processWebhookRetries(): Promise<{ processed: number; succeeded: number; failed: number }> {
    try {
        const entries = await getRetryableEntries();

        if (entries.length === 0) {
            return { processed: 0, succeeded: 0, failed: 0 };
        }

        let succeeded = 0;
        let failed = 0;

        for (const entry of entries) {
            try {
                // Dynamically import payment service to avoid circular dependency
                const { paymentService } = await import('../services/payment.service');

                // Re-process the webhook payload using the correct method signature
                const webhookData = entry.payload as {
                    reference: string;
                    gateway: 'visa' | 'fatora';
                    status: 'success' | 'failure';
                    gateway_tx_id: string;
                };
                await paymentService.handleWebhook({
                    reference: webhookData.reference,
                    gateway: entry.gateway as 'visa' | 'fatora',
                    status: webhookData.status ?? 'success',
                    gateway_tx_id: webhookData.gateway_tx_id ?? '',
                });

                // Success — mark as resolved
                await markResolved(entry.dead_letter_id);
                succeeded++;

                logger.info('ENH-6: Dead letter successfully reprocessed', {
                    dead_letter_id: entry.dead_letter_id,
                    gateway: entry.gateway,
                });
            } catch (retryErr) {
                // Failed again — increment retry count
                const errorMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
                await incrementRetry(entry.dead_letter_id, errorMsg);
                failed++;
            }
        }

        logger.info('ENH-6: Webhook retry cycle completed', {
            processed: entries.length,
            succeeded,
            failed,
        });

        return { processed: entries.length, succeeded, failed };
    } catch (err) {
        logger.error('ENH-6: Webhook retry job failed', {
            error: err instanceof Error ? err.message : String(err),
        });
        return { processed: 0, succeeded: 0, failed: 0 };
    }
}

/** Timer handle for cancellation during graceful shutdown */
let retryTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic webhook retry job.
 * Call this once after server startup.
 */
export function startWebhookRetryJob(): void {
    // Run immediately on startup
    void processWebhookRetries();

    // Then run on interval
    retryTimer = setInterval(() => {
        void processWebhookRetries();
    }, RETRY_INTERVAL_MS);

    // Don't prevent graceful shutdown
    retryTimer.unref();

    logger.info('ENH-6: Webhook retry job started', {
        interval_seconds: RETRY_INTERVAL_MS / 1000,
    });
}

/**
 * Stop the periodic webhook retry job.
 * Call this during graceful shutdown.
 */
export function stopWebhookRetryJob(): void {
    if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
        logger.info('ENH-6: Webhook retry job stopped');
    }
}
