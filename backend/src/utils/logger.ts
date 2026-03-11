// ============================================================================
// Nammerha — Structured Logger (PLT-AUD-013 FIX)
// ============================================================================
// Replaces raw console.warn/console.error calls with a structured logging
// utility that outputs JSON lines in production (for log aggregation tools
// like Datadog, Loki, CloudWatch) and formatted messages in development.
//
// WHY: console.warn pollutes log aggregation with false-positive "warning"
// severity. Production log consumers (ELK, Grafana Loki) parse severity
// from structured fields, NOT from which console method was called.
//
// MIGRATION: Existing console.warn calls in server.ts are migrated first.
// Other files should be migrated incrementally using this logger.
// ============================================================================

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    service: string;
    message: string;
    context?: Record<string, unknown>;
}

const SERVICE_NAME = 'nammerha-backend';
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

/**
 * Formats a log entry for output.
 *
 * - Production: JSON line (one object per line) for structured log ingestion.
 * - Development: Human-readable format with timestamp, level, and context.
 */
function formatEntry(entry: LogEntry): string {
    if (IS_PRODUCTION) {
        return JSON.stringify(entry);
    }

    const levelTag = `[${entry.level.toUpperCase()}]`;
    const contextStr = entry.context
        ? ` ${JSON.stringify(entry.context)}`
        : '';
    return `${entry.timestamp} ${levelTag} [${entry.service}] ${entry.message}${contextStr}`;
}

function createEntry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
    return {
        timestamp: new Date().toISOString(),
        level,
        service: SERVICE_NAME,
        message,
        ...(context ? { context } : {}),
    };
}

/**
 * Structured logger for the Nammerha platform.
 *
 * Usage:
 *   logger.info('Server started', { port: 3001, env: 'production' });
 *   logger.warn('Deprecated feature used', { feature: 'legacy-auth' });
 *   logger.error('Database query failed', { query: 'SELECT...', error: err.message });
 */
export const logger = {
    /**
     * Informational messages: startup banners, lifecycle events, successful
     * operations that are worth recording for operational visibility.
     */
    info(message: string, context?: Record<string, unknown>): void {
        const entry = createEntry('info', message, context);
        // eslint-disable-next-line no-console
        console.log(formatEntry(entry));
    },

    /**
     * Warning messages: degraded functionality, fallback paths taken,
     * configurations that may cause issues but don't prevent operation.
     */
    warn(message: string, context?: Record<string, unknown>): void {
        const entry = createEntry('warn', message, context);
        // eslint-disable-next-line no-console
        console.warn(formatEntry(entry));
    },

    /**
     * Error messages: failures, exceptions, security violations, and
     * any condition that requires immediate operator attention.
     */
    error(message: string, context?: Record<string, unknown>): void {
        const entry = createEntry('error', message, context);
        // eslint-disable-next-line no-console
        console.error(formatEntry(entry));
    },

    /**
     * Debug messages: verbose output for troubleshooting. Suppressed in
     * production unless LOG_LEVEL=debug is explicitly set.
     */
    debug(message: string, context?: Record<string, unknown>): void {
        if (IS_PRODUCTION && process.env['LOG_LEVEL'] !== 'debug') { return; }
        const entry = createEntry('debug', message, context);
        // eslint-disable-next-line no-console
        console.debug(formatEntry(entry));
    },
} as const;

export default logger;
