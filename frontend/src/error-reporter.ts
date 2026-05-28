import { addTrackedTimer } from './utils/tracked-timers';

// ============================================================================
// Nammerha Frontend — Error Reporter (PLT-AUDIT-007 + PLT-2026-AUD-002)
// ============================================================================
// Captures uncaught client-side errors and unhandled promise rejections,
// then reports them to the backend for structured server-side logging.
//
// PLT-2026-AUD-002: Extended with severity-tiered reporting. ALL frontend
// error/warning paths now flow through this module — zero raw console.*
// calls in application code. This provides:
//   - Full production observability (every error/warning reaches backend)
//   - Consistent metadata (page URL, timestamp, user agent, component)
//   - Client-side rate limiting (prevents flood during cascading failures)
//   - Dev-time console output preserved via browser's default handler
//
// Design:
//   - Captures: window.onerror, window.onunhandledrejection
//   - Batches reports with 2-second debounce to reduce HTTP calls
//   - Rate limited client-side (max 20 per minute) to prevent flood
//   - Graceful degradation: if reporting fails, errors are still logged
//     to console as a fallback (preserves developer workflow)
//   - Zero dependencies — pure browser APIs only
// ============================================================================

const ERROR_ENDPOINT = '/api/client-errors';
const MAX_REPORTS_PER_MINUTE = 20; // PLT-2026-AUD-002: Increased from 10 for warning volume
const BATCH_INTERVAL_MS = 2000;

// ─── State ──────────────────────────────────────────────────────────────────
let reportCount = 0;
let lastResetTime = Date.now();
const reportQueue: ErrorPayload[] = [];
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
    type: 'error' | 'unhandledrejection' | 'manual' | 'warning';
    /** PLT-2026-AUD-002: Severity tier for APM alerting rules */
    severity: 'error' | 'warning';
    metadata?: Record<string, unknown>;
}

// ─── Client-side rate limiting ──────────────────────────────────────────────
function isRateLimited(): boolean {
    const now = Date.now();
    if (now - lastResetTime > 60_000) {
        reportCount = 0;
        lastResetTime = now;
    }
    if (reportCount >= MAX_REPORTS_PER_MINUTE) {
        return true;
    }
    reportCount++;
    return false;
}

// ─── Send report batch to backend ───────────────────────────────────────────
function flushReports(): void {
    if (reportQueue.length === 0) {
        return;
    }

    const batch = reportQueue.splice(0, reportQueue.length);
    batchTimer = null;

    // Send each report individually (backend expects single error per request)
    for (const report of batch) {
        try {
            // Use sendBeacon for reliability during page unload
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(report)], {
                    type: 'application/json',
                });
                navigator.sendBeacon(ERROR_ENDPOINT, blob);
            } else {
                // Fallback to fetch (non-blocking)
                void fetch(ERROR_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(report),
                    keepalive: true,
                });
            }
        } catch {
            // Last resort: if reporting fails, the error was already
            // logged to console by the browser's default handler
        }
    }
}

// ─── Queue a report for batched sending ─────────────────────────────────────
function queueReport(payload: ErrorPayload): void {
    if (isRateLimited()) {
        return;
    }

    reportQueue.push(payload);

    // Debounce: wait 2 seconds to batch multiple rapid reports
    if (!batchTimer) {
        batchTimer = addTrackedTimer(setTimeout(flushReports, BATCH_INTERVAL_MS));
    }
}

// ─── Global Error Handler (synchronous errors) ─────────────────────────────
// PLT-AUD5-003 FIX: Refactored from window.onerror (5-param signature) to
// addEventListener('error') which receives ErrorEvent. This prevents
// overwriting other error handlers (analytics, monitoring, third-party).
function handleErrorEvent(event: ErrorEvent): void {
    queueReport({
        message: event.message || 'Unknown error',
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        type: 'error',
        severity: 'error',
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

    queueReport({
        message,
        stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        type: 'unhandledrejection',
        severity: 'error',
    });
}

// ─── Manual Error Reporting API ─────────────────────────────────────────────
/**
 * Report a caught error to the backend.
 * Use this for error-path catch blocks where the operation failed.
 *
 * @example
 * try { riskyOperation(); }
 * catch (err) { reportError(err, { component: 'payment_flow' }); }
 */
export function reportError(
    error: Error | string,
    metadata?: Record<string, unknown>
): void {
    const errorObj = typeof error === 'string' ? new Error(error) : error;

    queueReport({
        message: errorObj.message,
        stack: errorObj.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        type: 'manual',
        severity: 'error',
        metadata,
    });
}

// ─── Warning Reporting API (PLT-2026-AUD-002) ──────────────────────────────
/**
 * Report a non-fatal warning to the backend.
 * Use this for graceful-degradation paths where the operation completed
 * with a fallback but something unexpected occurred.
 *
 * Examples: failed map init → showing static fallback, localStorage
 * parse failure → clearing cache, API timeout → showing cached data.
 *
 * @example
 * try { loadMapTiles(); }
 * catch (err) { reportWarning('Map tile load failed, using fallback', { component: 'map' }); }
 */
export function reportWarning(
    message: string,
    metadata?: Record<string, unknown>
): void {
    queueReport({
        message,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        type: 'warning',
        severity: 'warning',
        metadata,
    });
}

// ─── Initialize ─────────────────────────────────────────────────────────────
/**
 * Installs global error handlers. Call this ONCE at app startup.
 * Safe to call multiple times (idempotent).
 */
export function initErrorReporter(): void {
    // PLT-AUD6-001 FIX: Clear stale nav.js lightweight error catchers.
    // nav.js installs window.onerror / window.onunhandledrejection as a
    // fallback for pages that don't load this module (auth, wallet, etc.).
    // Its guard (L14: `if (window.onerror) return`) was written when this
    // module also used window.onerror, but PLT-AUD5-003 refactored to
    // addEventListener — the guard no longer detects us, so both fire,
    // causing DUPLICATE error reports on index.html.
    // Fix: Clear the assignment-based handlers now that addEventListener
    // provides superior error capture. nav.js remains active on all
    // other pages where this module never loads.
    // Standard: Error Handler Deduplication, Single Source of Truth.
    window.onerror = null;
    window.onunhandledrejection = null;

    // PLT-AUD5-003 FIX: Use addEventListener instead of assignment.
    // Previous: window.onerror = handler — silently overwrites any existing
    // error handlers from analytics, monitoring, or third-party scripts.
    // Now: addEventListener coexists safely with other handlers.
    window.addEventListener('error', handleErrorEvent);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Flush any remaining reports when the page unloads
    window.addEventListener('beforeunload', flushReports);

    // P0-UX FIX: Bfcache Zombie Form Prevention
    // When returning via browser back button (Bfcache), elements may be frozen in
    // a "processing" state. This ensures forms and UI locks are cleared on pageshow.
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            document.querySelectorAll('.is-loading, [aria-disabled="true"]').forEach(el => {
                el.classList.remove('is-loading');
                el.removeAttribute('aria-disabled');
                el.removeAttribute('disabled');
            });
            const activeLock = document.getElementById('nm-ui-lock');
            if (activeLock) {activeLock.remove();}
            const originalOverflow = document.body.style.overflow;
            if (originalOverflow === 'hidden') {document.body.style.overflow = '';}
        }
    });
}
