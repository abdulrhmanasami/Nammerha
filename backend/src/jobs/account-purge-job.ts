// ============================================================================
// Nammerha Backend — Account Purge Background Job (GDPR-047)
// ============================================================================
// Processes expired account deletion requests every 24 hours.
// Pattern: Mirrors email-retry-job.ts (P1-REM-003).
//
// Flow per cycle:
//   1. Find users where deletion_scheduled_at <= NOW() AND deleted_at IS NOT NULL
//   2. For each: execute permanent deletion (anonymize + hard-delete)
//   3. Log results to audit_trail
//
// Concurrency safety:
//   - Serializable transaction per user prevents race conditions
//   - isProcessing flag prevents re-entrant execution
//
// Graceful shutdown:
//   - stopAccountPurgeJob() clears the interval timer
//   - In-flight deletions complete naturally
// ============================================================================

import { logger } from '../utils/logger';
import { processExpiredDeletions } from '../services/account-deletion.service';

/** Interval between purge runs (24 hours) */
export const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Prevent re-entrant execution if a previous cycle is still running */
let isProcessing = false;

/**
 * Process all expired account deletion requests.
 * Called by the periodic timer and once on startup.
 */
export async function processAccountPurge(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
}> {
    if (isProcessing) {
        return { processed: 0, succeeded: 0, failed: 0 };
    }

    isProcessing = true;

    try {
        const results = await processExpiredDeletions();

        if (results.length === 0) {
            return { processed: 0, succeeded: 0, failed: 0 };
        }

        const succeeded = results.filter((r) => r.errors.length === 0).length;
        const failed = results.filter((r) => r.errors.length > 0).length;

        logger.info('GDPR-047: Account purge cycle completed', {
            processed: results.length,
            succeeded,
            failed,
        });

        return { processed: results.length, succeeded, failed };
    } catch (err) {
        logger.error('GDPR-047: Account purge job cycle failed', {
            error: err instanceof Error ? err.message : String(err),
        });
        return { processed: 0, succeeded: 0, failed: 0 };
    } finally {
        isProcessing = false;
    }
}

// ─── Timer Management ───────────────────────────────────────────────────────

/** Timer handle for cancellation during graceful shutdown */
let purgeTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic account purge job.
 * Call this once after server startup.
 */
export function startAccountPurgeJob(): void {
    // Run immediately on startup to process anything that expired during downtime
    void processAccountPurge();

    // Then run every 24 hours
    purgeTimer = setInterval(() => {
        void processAccountPurge();
    }, PURGE_INTERVAL_MS);

    // Don't prevent graceful shutdown
    purgeTimer.unref();

    logger.info('GDPR-047: Account purge job started', {
        interval_hours: PURGE_INTERVAL_MS / (60 * 60 * 1000),
    });
}

/**
 * Stop the periodic account purge job.
 * Call this during graceful shutdown.
 */
export function stopAccountPurgeJob(): void {
    if (purgeTimer) {
        clearInterval(purgeTimer);
        purgeTimer = null;
        logger.info('GDPR-047: Account purge job stopped');
    }
}
