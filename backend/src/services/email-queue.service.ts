// ============================================================================
// Nammerha Backend — Email Queue Service (P1-REM-003)
// ============================================================================
// PostgreSQL-backed email queue with exponential backoff retry.
// Replaces fire-and-forget email pattern with persistent delivery guarantee.
//
// Architecture:
//   - Mirrors webhook-retry.service.ts (ENH-6) — zero new dependencies.
//   - email.service.ts remains the low-level transport (Resend API).
//   - This service enqueues emails; email-retry-job.ts processes them.
//
// Retry schedule (4^attempt minutes):
//   Attempt 0: Immediate (first try in next job cycle, ≤30s)
//   Attempt 1: +1 minute
//   Attempt 2: +4 minutes
//   Attempt 3: +16 minutes
//   Attempt 4: +64 minutes (~1h)
//   Attempt 5: +256 minutes (~4.3h)
//
// After max_retries exhausted → status='exhausted', audit_trail logged.
// ============================================================================
import pool from '../config/database';
import { logger } from '../utils/logger';
import type { EmailTemplate, EmailLocale } from './email.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnqueueEmailParams {
    recipient: string;
    template: EmailTemplate;
    subject: string;
    variables: Record<string, string>;
    locale: EmailLocale;
    sourceAction?: string;
    sourceUserId?: string;
}

export interface EmailQueueEntry {
    email_queue_id: string;
    recipient: string;
    template: EmailTemplate;
    subject: string;
    variables: Record<string, string>;
    locale: EmailLocale;
    retry_count: number;
    max_retries: number;
    source_action: string | null;
    source_user_id: string | null;
}

export interface EmailQueueStats {
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    exhausted: number;
    total: number;
    oldest_pending_minutes: number | null;
}

/** Backoff multiplier base (4^attempt minutes, matching webhook-retry) */
const BACKOFF_BASE = 4;

// ─── Queue Operations ───────────────────────────────────────────────────────

/**
 * Enqueue an email for delivery with automatic retry on failure.
 *
 * This function is **non-throwing** — errors are logged internally.
 * Callers do NOT need `.catch()`.
 *
 * @returns The queue entry ID, or null if enqueue failed.
 */
export async function enqueueEmail(params: EnqueueEmailParams): Promise<string | null> {
    try {
        const result = await pool.query<{ email_queue_id: string }>(
            `INSERT INTO email_queue
                (recipient, template, subject, variables, locale,
                 source_action, source_user_id, next_retry_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             RETURNING email_queue_id`,
            [
                params.recipient,
                params.template,
                params.subject,
                JSON.stringify(params.variables),
                params.locale,
                params.sourceAction ?? null,
                params.sourceUserId ?? null,
            ],
        );

        const id = result.rows[0]?.email_queue_id;
        if (!id) {
            logger.error('P1-REM-003: Email enqueue returned no ID', {
                recipient: params.recipient,
                template: params.template,
            });
            return null;
        }

        logger.info('P1-REM-003: Email enqueued for delivery', {
            email_queue_id: id,
            recipient: params.recipient,
            template: params.template,
            source_action: params.sourceAction,
        });

        return id;
    } catch (err) {
        // Non-throwing: log and return null. The email is lost but the
        // caller's HTTP response is not blocked.
        logger.error('P1-REM-003: Failed to enqueue email', {
            error: err instanceof Error ? err.message : String(err),
            recipient: params.recipient,
            template: params.template,
        });
        return null;
    }
}

/**
 * Get emails due for delivery or retry.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent concurrent workers
 * from processing the same email.
 */
export async function getRetryableEmails(limit: number = 10): Promise<EmailQueueEntry[]> {
    const result = await pool.query<EmailQueueEntry>(
        `SELECT email_queue_id, recipient, template, subject, variables,
                locale, retry_count, max_retries, source_action, source_user_id
         FROM email_queue
         WHERE status IN ('pending', 'failed')
           AND next_retry_at <= NOW()
         ORDER BY next_retry_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit],
    );
    return result.rows;
}

/**
 * Mark an email as successfully sent.
 */
export async function markSent(emailQueueId: string, resendId: string | null): Promise<void> {
    await pool.query(
        `UPDATE email_queue
         SET status = 'sent',
             sent_at = NOW(),
             updated_at = NOW(),
             resend_id = $2
         WHERE email_queue_id = $1`,
        [emailQueueId, resendId],
    );
    logger.info('P1-REM-003: Email sent successfully', { email_queue_id: emailQueueId, resend_id: resendId });
}

/**
 * Increment retry count and schedule next attempt with exponential backoff.
 * If max retries exceeded, mark as 'exhausted'.
 */
export async function incrementEmailRetry(
    emailQueueId: string,
    errorMessage: string,
): Promise<void> {
    const result = await pool.query<{ retry_count: number; max_retries: number; recipient: string; template: string }>(
        `UPDATE email_queue
         SET retry_count = retry_count + 1,
             status = 'failed',
             last_error = $2,
             updated_at = NOW()
         WHERE email_queue_id = $1
         RETURNING retry_count, max_retries, recipient, template`,
        [emailQueueId, errorMessage],
    );

    const row = result.rows[0];
    if (!row) { return; }

    if (row.retry_count >= row.max_retries) {
        // Exhausted — no more retries. Log to audit_trail for admin visibility.
        await pool.query(
            `UPDATE email_queue
             SET status = 'exhausted'
             WHERE email_queue_id = $1`,
            [emailQueueId],
        );

        // Audit trail for ops monitoring
        await pool.query(
            `INSERT INTO audit_trail (action, entity_type, entity_id, actor_id, new_values)
             VALUES ('email_exhausted', 'email_queue', $1, NULL, $2)`,
            [
                emailQueueId,
                JSON.stringify({
                    recipient: row.recipient,
                    template: row.template,
                    retries: row.retry_count,
                    last_error: errorMessage,
                    timestamp: new Date().toISOString(),
                }),
            ],
        );

        logger.error('P1-REM-003: Email delivery exhausted — giving up', {
            email_queue_id: emailQueueId,
            recipient: row.recipient,
            template: row.template,
            retries: row.retry_count,
        });
        return;
    }

    // Calculate next retry with exponential backoff: 4^attempt minutes
    const delayMinutes = Math.pow(BACKOFF_BASE, row.retry_count);
    const nextRetryAt = new Date(Date.now() + delayMinutes * 60_000);

    await pool.query(
        `UPDATE email_queue
         SET next_retry_at = $2
         WHERE email_queue_id = $1`,
        [emailQueueId, nextRetryAt],
    );

    logger.warn('P1-REM-003: Email retry scheduled', {
        email_queue_id: emailQueueId,
        retry_count: row.retry_count,
        next_retry_at: nextRetryAt.toISOString(),
        delay_minutes: delayMinutes,
    });
}

/**
 * Get queue statistics for health monitoring.
 */
export async function getQueueStats(): Promise<EmailQueueStats> {
    const result = await pool.query<{
        pending: string;
        processing: string;
        sent: string;
        failed: string;
        exhausted: string;
        total: string;
        oldest_pending_minutes: string | null;
    }>(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'pending')    AS pending,
            COUNT(*) FILTER (WHERE status = 'processing') AS processing,
            COUNT(*) FILTER (WHERE status = 'sent')       AS sent,
            COUNT(*) FILTER (WHERE status = 'failed')     AS failed,
            COUNT(*) FILTER (WHERE status = 'exhausted')  AS exhausted,
            COUNT(*)                                      AS total,
            EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status IN ('pending', 'failed')))) / 60
                AS oldest_pending_minutes
         FROM email_queue`,
    );

    const row = result.rows[0];
    return {
        pending: parseInt(row?.pending ?? '0', 10),
        processing: parseInt(row?.processing ?? '0', 10),
        sent: parseInt(row?.sent ?? '0', 10),
        failed: parseInt(row?.failed ?? '0', 10),
        exhausted: parseInt(row?.exhausted ?? '0', 10),
        total: parseInt(row?.total ?? '0', 10),
        oldest_pending_minutes: row?.oldest_pending_minutes
            ? Math.round(parseFloat(row.oldest_pending_minutes))
            : null,
    };
}

// ─── Convenience Wrappers (Drop-in Replacements) ────────────────────────────
// These mirror the signatures of sendVerificationEmail, sendPasswordResetEmail,
// sendSecurityAlertEmail from email.service.ts — but enqueue instead of send.
// ─────────────────────────────────────────────────────────────────────────────

/** Subject lines by template and locale (must match email.service.ts) */
const SUBJECT_LINES: Record<EmailTemplate, Record<EmailLocale, string>> = {
    'verification': {
        en: 'Verify Your Email — Nammerha',
        ar: 'تأكيد بريدك الإلكتروني — نمّرها',
    },
    'password-reset': {
        en: 'Password Reset — Nammerha',
        ar: 'إعادة تعيين كلمة المرور — نمّرها',
    },
    'security-alert': {
        en: '🔒 Security Alert — Nammerha',
        ar: '🔒 تنبيه أمني — نمّرها',
    },
};

interface EnqueueOptions {
    sourceAction?: string;
    sourceUserId?: string;
}

/**
 * Enqueue a verification email for delivery.
 * Drop-in replacement for `sendVerificationEmail()`.
 */
export function enqueueVerificationEmail(
    to: string,
    verificationUrl: string,
    locale: EmailLocale = 'en',
    opts: EnqueueOptions = {},
): void {
    // Fire-and-forget the enqueue itself (it's non-throwing internally)
    void enqueueEmail({
        recipient: to,
        template: 'verification',
        subject: SUBJECT_LINES['verification'][locale],
        variables: { verification_url: verificationUrl },
        locale,
        ...opts,
    });
}

/**
 * Enqueue a password reset email for delivery.
 * Drop-in replacement for `sendPasswordResetEmail()`.
 */
export function enqueuePasswordResetEmail(
    to: string,
    resetUrl: string,
    locale: EmailLocale = 'en',
    opts: EnqueueOptions = {},
): void {
    void enqueueEmail({
        recipient: to,
        template: 'password-reset',
        subject: SUBJECT_LINES['password-reset'][locale],
        variables: { reset_url: resetUrl },
        locale,
        ...opts,
    });
}

/**
 * Enqueue a security alert email for delivery.
 * Drop-in replacement for `sendSecurityAlertEmail()`.
 */
export function enqueueSecurityAlertEmail(
    to: string,
    alertTitle: string,
    alertBody: string,
    ipAddress: string,
    locale: EmailLocale = 'en',
    opts: EnqueueOptions = {},
): void {
    void enqueueEmail({
        recipient: to,
        template: 'security-alert',
        subject: `${SUBJECT_LINES['security-alert'][locale]} — ${alertTitle}`,
        variables: {
            alert_title: alertTitle,
            alert_body: alertBody,
            timestamp: new Date().toISOString(),
            ip_address: ipAddress,
        },
        locale,
        ...opts,
    });
}
