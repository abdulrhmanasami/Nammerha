// ============================================================================
// Nammerha Backend — Email Retry Background Job (P1-REM-003)
// ============================================================================
// Processes retryable email queue entries every 30 seconds.
// Pattern: Mirrors webhook-retry-job.ts (ENH-6).
//
// Flow per cycle:
//   1. SELECT retryable emails (status IN ('pending','failed'), next_retry_at <= NOW())
//   2. For each: call sendEmail() from email.service.ts
//   3. On success → markSent()
//   4. On failure → incrementEmailRetry() (exponential backoff)
//
// Concurrency safety:
//   - getRetryableEmails() uses FOR UPDATE SKIP LOCKED — multiple workers
//     can run safely without double-sending.
//
// Graceful shutdown:
//   - stopEmailRetryJob() clears the interval timer
//   - In-flight sends complete naturally (non-blocking)
// ============================================================================
import { logger } from '../utils/logger';
import { sendEmail } from '../services/email.service';
import {
    getRetryableEmails,
    markSent,
    incrementEmailRetry,
    type EmailQueueEntry,
} from '../services/email-queue.service';
import type { EmailTemplate, EmailLocale } from '../services/email.service';

/** Interval between retry runs (30 seconds — faster than webhook retry's 60s
 *  because email verification is time-sensitive for user experience) */
export const EMAIL_RETRY_INTERVAL_MS = 30 * 1000;

/** Prevent re-entrant execution if a previous cycle is still running */
let isProcessing = false;

/**
 * Process all retryable email queue entries.
 * Called by the periodic timer and once on startup.
 */
export async function processEmailRetries(): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (isProcessing) {
        // Previous cycle still running — skip to prevent overlap
        return { processed: 0, succeeded: 0, failed: 0 };
    }

    isProcessing = true;

    try {
        const entries = await getRetryableEmails(10);

        if (entries.length === 0) {
            return { processed: 0, succeeded: 0, failed: 0 };
        }

        let succeeded = 0;
        let failed = 0;

        for (const entry of entries) {
            try {
                const result = await sendEmailFromQueueEntry(entry);

                if (result.success) {
                    await markSent(entry.email_queue_id, result.resendId ?? null);
                    succeeded++;
                } else {
                    // sendEmail returned { success: false } — not a thrown error
                    await incrementEmailRetry(
                        entry.email_queue_id,
                        result.error ?? 'Unknown send failure',
                    );
                    failed++;
                }
            } catch (err) {
                // Unexpected error (network timeout, etc.)
                const errorMsg = err instanceof Error ? err.message : String(err);
                await incrementEmailRetry(entry.email_queue_id, errorMsg);
                failed++;
            }
        }

        if (succeeded > 0 || failed > 0) {
            logger.info('P1-REM-003: Email retry cycle completed', {
                processed: entries.length,
                succeeded,
                failed,
            });
        }

        return { processed: entries.length, succeeded, failed };
    } catch (err) {
        logger.error('P1-REM-003: Email retry job cycle failed', {
            error: err instanceof Error ? err.message : String(err),
        });
        return { processed: 0, succeeded: 0, failed: 0 };
    } finally {
        isProcessing = false;
    }
}

/**
 * Send an email using the data stored in a queue entry.
 * Reconstructs the sendEmail() call from the persisted payload.
 */
async function sendEmailFromQueueEntry(
    entry: EmailQueueEntry,
): Promise<{ success: boolean; error?: string; resendId?: string }> {
    const result = await sendEmail({
        to: entry.recipient,
        subject: entry.subject,
        template: entry.template as EmailTemplate,
        variables: entry.variables,
        locale: (entry.locale as EmailLocale) ?? 'en',
    });

    // sendEmail returns { success, error? } — we need to extract the Resend ID
    // from the logger output. Since sendEmail doesn't expose it in the return type,
    // we treat success as sufficient confirmation.
    return {
        success: result.success,
        error: result.error,
        // Resend ID is logged inside sendEmail but not returned in the interface.
        // We store null — acceptable since we have the queue ID for tracing.
        resendId: undefined,
    };
}

// ─── Timer Management ───────────────────────────────────────────────────────

/** Timer handle for cancellation during graceful shutdown */
let retryTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic email retry job.
 * Call this once after server startup.
 */
export function startEmailRetryJob(): void {
    // Run immediately on startup to clear anything queued during downtime
    void processEmailRetries();

    // Then run on interval
    retryTimer = setInterval(() => {
        void processEmailRetries();
    }, EMAIL_RETRY_INTERVAL_MS);

    // Don't prevent graceful shutdown
    retryTimer.unref();

    logger.info('P1-REM-003: Email retry job started', {
        interval_seconds: EMAIL_RETRY_INTERVAL_MS / 1000,
    });
}

/**
 * Stop the periodic email retry job.
 * Call this during graceful shutdown.
 */
export function stopEmailRetryJob(): void {
    if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
        logger.info('P1-REM-003: Email retry job stopped');
    }
}
