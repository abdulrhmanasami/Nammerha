// ============================================================================
// Nammerha Frontend — Error Reporter (PLT-AUDIT-007)
// ============================================================================
// Captures uncaught client-side errors and unhandled promise rejections,
// then reports them to the backend for structured server-side logging.
//
// Design:
//   - Captures: window.onerror, window.onunhandledrejection
//   - Batches errors with 2-second debounce to reduce HTTP calls
//   - Rate limited client-side (max 10 per minute) to prevent flood
//   - Graceful degradation: if reporting fails, errors are still logged
//     to console as a fallback (preserves developer workflow)
//   - Zero dependencies — pure browser APIs only
// ============================================================================

const ERROR_ENDPOINT = '/api/client-errors';
const MAX_ERRORS_PER_MINUTE = 10;
const BATCH_INTERVAL_MS = 2000;

// ─── State ──────────────────────────────────────────────────────────────────
let errorCount = 0;
let lastResetTime = Date.now();
const errorQueue: ErrorPayload[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

interface ErrorPayload {
    message: string;
    source?: string;
    lineno?: number;
    colno?: number;
    stack?: string;
    url: string;
    userAgent?: string;
    timestamp: string;
    type: 'error' | 'unhandledrejection' | 'manual';
    metadata?: Record<string, unknown>;
}

// ─── Client-side rate limiting ──────────────────────────────────────────────
function isRateLimited(): boolean {
    const now = Date.now();
    if (now - lastResetTime > 60_000) {
        errorCount = 0;
        lastResetTime = now;
    }
    if (errorCount >= MAX_ERRORS_PER_MINUTE) {
        return true;
    }
    errorCount++;
    return false;
}

// ─── Send error batch to backend ────────────────────────────────────────────
function flushErrors(): void {
    if (errorQueue.length === 0) {
        return;
    }

    const batch = errorQueue.splice(0, errorQueue.length);
    batchTimer = null;

    // Send each error individually (backend expects single error per request)
    for (const error of batch) {
        try {
            // Use sendBeacon for reliability during page unload
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(error)], {
                    type: 'application/json',
                });
                navigator.sendBeacon(ERROR_ENDPOINT, blob);
            } else {
                // Fallback to fetch (non-blocking)
                void fetch(ERROR_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(error),
                    keepalive: true,
                });
            }
        } catch {
            // Last resort: if reporting fails, the error was already
            // logged to console by the browser's default handler
        }
    }
}

// ─── Queue an error for batched sending ─────────────────────────────────────
function queueError(payload: ErrorPayload): void {
    if (isRateLimited()) {
        return;
    }

    errorQueue.push(payload);

    // Debounce: wait 2 seconds to batch multiple rapid errors
    if (!batchTimer) {
        batchTimer = setTimeout(flushErrors, BATCH_INTERVAL_MS);
    }
}

// ─── Global Error Handler (synchronous errors) ─────────────────────────────
function handleGlobalError(
    message: string | Event,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error
): void {
    const errorMessage = typeof message === 'string'
        ? message
        : (error?.message ?? 'Unknown error');

    queueError({
        message: errorMessage,
        source,
        lineno,
        colno,
        stack: error?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        type: 'error',
    });
}

// ─── Unhandled Promise Rejection Handler ────────────────────────────────────
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
    const reason = event.reason;
    const message = reason instanceof Error
        ? reason.message
        : String(reason ?? 'Unhandled promise rejection');
    const stack = reason instanceof Error
        ? reason.stack
        : undefined;

    queueError({
        message,
        stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        type: 'unhandledrejection',
    });
}

// ─── Manual Error Reporting API ─────────────────────────────────────────────
/**
 * Manually report an error to the backend.
 * Use this to capture caught errors that should still be tracked.
 *
 * @example
 * try { riskyOperation(); }
 * catch (err) { reportError(err, { context: 'payment_flow' }); }
 */
export function reportError(
    error: Error | string,
    metadata?: Record<string, unknown>
): void {
    const errorObj = typeof error === 'string' ? new Error(error) : error;

    queueError({
        message: errorObj.message,
        stack: errorObj.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        type: 'manual',
        metadata,
    });
}

// ─── Initialize ─────────────────────────────────────────────────────────────
/**
 * Installs global error handlers. Call this ONCE at app startup.
 * Safe to call multiple times (idempotent).
 */
export function initErrorReporter(): void {
    // Install global handlers
    window.onerror = handleGlobalError;
    window.onunhandledrejection = handleUnhandledRejection;

    // Flush any remaining errors when the page unloads
    window.addEventListener('beforeunload', flushErrors);
}
