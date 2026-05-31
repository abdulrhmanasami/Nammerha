import { escapeHtml as esc } from './xss';
/**
 * P2-U1 FIX: Shared Error Retry Utility
 * ══════════════════════════════════════════════════════════════════════════
 * Provides professional error-with-retry UI for all dashboard portals.
 * Critical for Syrian 2G/3G users who experience frequent transient failures.
 *
 * Two entry points:
 *   - renderErrorWithRetry(): For <div> container error states
 *   - renderTableErrorWithRetry(): For <tbody>/<table> error states (colspan)
 *
 * P1-UXA-007 FIX (v2): Contextual error recovery with:
 *   - Network/Auth/Server error differentiation
 *   - Exponential backoff on repeated retries
 *   - Retry count tracking per container
 *
 * Features:
 *   - i18n-aware (uses data-i18n attributes)
 *   - Accessible (aria-live, role="alert")
 *   - Dark-mode safe (uses html[data-theme="dark"] CSS overrides in main.css)
 *   - Retry button with loading state
 * ══════════════════════════════════════════════════════════════════════════
 */

import { t } from './i18n';
import { addTrackedTimer } from './tracked-timers';

// ─── Retry Tracking ─────────────────────────────────────────────────────────
// Track retry counts per container element to implement exponential backoff.
const retryCountMap = new WeakMap<HTMLElement, number>();

/**
 * Classify an error into a user-friendly category.
 * Returns an icon class, i18n key, and fallback text.
 */
interface ErrorClassification {
  icon: string;
  i18nKey: string;
  fallback: string;
  canRetry: boolean;
}

function classifyError(err?: unknown): ErrorClassification {
  // Extract HTTP status from multiple possible sources:
  // 1. err.status (Response-like objects)
  // 2. err.message matching "Request failed: {status}" (API client pattern)
  let status: number | undefined;

  if (err && typeof err === 'object' && 'status' in err) {
    status = (err as { status: number }).status;
  }

  if (!status && err instanceof Error) {
    // P1-UXA-007: Match API client pattern: "Request failed: 401" or server error "body.error"
    const statusMatch = err.message.match(/Request failed:\s*(\d{3})/);
    if (statusMatch) {
      status = parseInt(statusMatch[1]!, 10);
    }
  }

  // Classify by HTTP status code
  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return {
        icon: 'ph-lock-key',
        i18nKey: 'error_auth',
        fallback: 'Session expired. Please log in again.',
        canRetry: false,
      };
    }
    if (status === 404) {
      return {
        icon: 'ph-magnifying-glass',
        i18nKey: 'error_not_found',
        fallback: 'The requested data was not found.',
        canRetry: false,
      };
    }
    if (status >= 500) {
      return {
        icon: 'ph-cloud-x',
        i18nKey: 'error_server',
        fallback: 'Server error. Our team has been notified.',
        canRetry: true,
      };
    }
  }

  // Check for network errors (TypeError: Failed to fetch)
  if (err instanceof TypeError && err.message.includes('fetch')) {
    return {
      icon: 'ph-wifi-x',
      i18nKey: 'error_network',
      fallback: 'Network error. Check your connection and try again.',
      canRetry: true,
    };
  }

  // P1-UXA-007: Detect timeout from API client message pattern
  if (
    err instanceof Error &&
    (err.message.includes('timed out') || err.message.includes('timeout'))
  ) {
    return {
      icon: 'ph-hourglass-medium',
      i18nKey: 'error_timeout',
      fallback: 'Request timed out. Check your connection and try again.',
      canRetry: true,
    };
  }

  // P1-UXA-007: Detect generic network errors from API client
  if (err instanceof Error && err.message.toLowerCase().includes('network')) {
    return {
      icon: 'ph-wifi-x',
      i18nKey: 'error_network',
      fallback: 'Network error. Check your connection and try again.',
      canRetry: true,
    };
  }

  // Default: generic error
  return {
    icon: 'ph-warning-circle',
    i18nKey: 'failed_to_load',
    fallback: 'Failed to load',
    canRetry: true,
  };
}

/**
 * Renders an error state with a retry button inside a container element.
 * P1-UXA-007 FIX: Now supports contextual error messages and exponential backoff.
 *
 * @param container - The parent element to render the error into
 * @param retryFn - The async function to call when the retry button is clicked
 * @param i18nKey - Optional override i18n key for the error message
 * @param fallbackText - Optional override fallback English text
 * @param originalError - Optional original error for classification
 */
export function renderErrorWithRetry(
  container: HTMLElement,
  retryFn: () => Promise<void>,
  i18nKey?: string,
  fallbackText?: string,
  originalError?: unknown,
): void {
  // P1-UXA-007: Classify the error for contextual messaging
  const classification = classifyError(originalError);
  const displayI18nKey = i18nKey ?? classification.i18nKey;
  const displayFallback = fallbackText ?? classification.fallback;
  const iconClass = classification.icon;

  // Track retry attempts for exponential backoff
  const retryCount = retryCountMap.get(container) ?? 0;
  const showRetry = classification.canRetry;

  // P1-UXA-007: Retry hint for repeated failures
  const retryHint =
    retryCount >= 2
      ? `<p class="mt-1 text-xs text-slate-400" data-i18n="error_retry_hint">${esc(t('error_retry_hint', 'لا تزال تواجه مشكلة؟ جرّب تحديث الصفحة.'))}</p>`
      : '';

  container.innerHTML = `
        <div class="p-8 text-center" role="alert" aria-live="polite">
            <i class="ph ${esc(iconClass)} text-red-400 text-3xl dark:text-red-300" aria-hidden="true"></i>
            <p class="mt-2 text-sm text-red-400 dark:text-red-300" data-i18n="${esc(displayI18nKey)}">${esc(displayFallback)}</p>
            ${retryHint}
            ${
              showRetry
                ? `
            <button type="button" class="retry-btn mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-trust-blue text-white hover:bg-trust-blue/90 transition-colors touch-safe dark:bg-trust-blue/90 dark:hover:bg-trust-blue" data-i18n="retry">
                ${esc(t('retry', 'إعادة المحاولة'))}
            </button>`
                : ''
            }
        </div>
    `;

  if (!showRetry) {
    return;
  }

  const btn = container.querySelector('.retry-btn') as HTMLButtonElement | null;
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin" aria-hidden="true"></i>';

      // P1-UXA-007: Exponential backoff (0ms, 500ms, 1000ms, 2000ms, ...)
      const backoffMs = retryCount > 0 ? Math.min(500 * Math.pow(2, retryCount - 1), 5000) : 0;
      if (backoffMs > 0) {
        await new Promise((r) => addTrackedTimer(setTimeout(r, backoffMs)));
      }

      // PLATINUM FIX: Memory Leak Guard (Phantom Execution Prevention)
      // If the user navigates away or closes the modal during the backoff delay, abort.
      if (!document.body.contains(container)) {
        return;
      }

      try {
        // Reset retry count on success
        retryCountMap.delete(container);
        await retryFn();
      } catch (retryError: unknown) {
        // Increment retry count for next attempt
        retryCountMap.set(container, retryCount + 1);
        renderErrorWithRetry(container, retryFn, i18nKey, fallbackText, retryError);
      }
    });
  }
}
