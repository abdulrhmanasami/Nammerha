// ============================================================================
// Nammerha Backend — Stale Payment Cleanup Job (P1-PLT-001)
// ============================================================================
// Expires 'pending' payment records older than 1 hour.
//
// WHY THIS IS NEEDED:
//   payment.service.ts initiate() creates a payment record as 'pending' in
//   Step 1, then calls the external gateway in Step 2 (outside transaction).
//   If Step 2 fails network-side or Step 3 UPDATE fails, the record stays
//   'pending' forever — no mechanism retries or expires it.
//
// This job runs every 15 minutes and marks stale 'pending' records as 'failed'.
// Records that are only a few minutes old are left alone — they may still be
// processing through a slow gateway round-trip.
// ============================================================================

import pool from '../config/database';
import { logger } from '../utils/logger';

/** Maximum age for a 'pending' payment before automatic expiry */
const STALE_THRESHOLD_MINUTES = 60;

/** Interval between cleanup runs (15 minutes) */
export const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Expires payment_transactions stuck in 'pending' status beyond the threshold.
 *
 * Also cancels any orphaned escrow_ledger entries that reference these
 * stale payments — prevents 'pending' escrow entries from appearing in
 * donor wallets for payments that will never complete.
 */
export async function cleanupStalePayments(): Promise<{ expired: number; cancelledEscrow: number }> {
    try {
        // 1. Expire stale payment records
        const paymentResult = await pool.query<{ reference: string; donor_id: string; item_id: string }>(
            `UPDATE payment_transactions
             SET status = 'failed', updated_at = NOW()
             WHERE status = 'pending'
               AND created_at < NOW() - INTERVAL '${STALE_THRESHOLD_MINUTES} minutes'
             RETURNING reference, donor_id, item_id`,
        );

        const expiredCount = paymentResult.rowCount ?? 0;

        if (expiredCount === 0) {
            return { expired: 0, cancelledEscrow: 0 };
        }

        // 2. Cancel orphaned escrow entries referencing these stale payments
        const staleReferences = paymentResult.rows.map(r => r.reference);
        const escrowResult = await pool.query(
            `UPDATE escrow_ledger
             SET payment_status = 'cancelled', updated_at = NOW()
             WHERE payment_gateway_ref = ANY($1)
               AND payment_status = 'pending'`,
            [staleReferences],
        );

        const cancelledEscrow = escrowResult.rowCount ?? 0;

        logger.info('P1-PLT-001: Stale payment cleanup completed', {
            expired_payments: expiredCount,
            cancelled_escrow: cancelledEscrow,
            references: staleReferences,
        });

        return { expired: expiredCount, cancelledEscrow };
    } catch (err) {
        // Non-fatal: log and continue — the next run will retry
        logger.error('P1-PLT-001: Stale payment cleanup failed', {
            error: err instanceof Error ? err.message : String(err),
        });
        return { expired: 0, cancelledEscrow: 0 };
    }
}

/** Timer handle for cancellation during graceful shutdown */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic cleanup job.
 * Call this once after server startup.
 */
export function startStalePaymentCleanup(): void {
    // Run immediately on startup to clear anything that accumulated during downtime
    void cleanupStalePayments();

    // Then run on interval
    cleanupTimer = setInterval(() => {
        void cleanupStalePayments();
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent graceful shutdown
    cleanupTimer.unref();

    logger.info('P1-PLT-001: Stale payment cleanup job started', {
        interval_minutes: CLEANUP_INTERVAL_MS / 60_000,
        threshold_minutes: STALE_THRESHOLD_MINUTES,
    });
}

/**
 * Stop the periodic cleanup job.
 * Call this during graceful shutdown.
 */
export function stopStalePaymentCleanup(): void {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
        logger.info('P1-PLT-001: Stale payment cleanup job stopped');
    }
}
