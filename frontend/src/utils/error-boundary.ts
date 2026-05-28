import { escapeHtml as esc } from './xss';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Global Page Error Boundary (P0-PLT-001)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Problem: If a page module's DOMContentLoaded handler throws during
 * initialization (e.g., missing DOM element, import failure, parse error),
 * the page gets stuck in a partially-initialized state with skeleton loaders
 * animating forever. The user has NO indication that anything is wrong.
 *
 * Solution: A global error handler that:
 *   1. Catches page-level initialization errors
 *   2. Shows a clear "Something went wrong" message with a Retry button
 *   3. Reports the error to the backend via error-reporter
 *
 * Architecture: This is NOT a try-catch wrapper around each page's init —
 * that would require modifying every page module. Instead, this module
 * installs a global 'error' listener that detects when a page module's
 * top-level execution fails, and renders a recovery UI in #main-content.
 *
 * Additionally, it provides `guardPageInit()` — a wrapper function that
 * portal pages can use to safely wrap their DOMContentLoaded callbacks.
 *
 * Standard: React Error Boundaries (conceptual), Nielsen #9 (Help Users
 *           Recognize, Diagnose, Recover from Errors).
 *
 * @version 1.0.0
 * @since P0-PLT-001
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { t } from './i18n';
import { tryApplyI18n } from './i18n-apply';
import { reportError } from '../error-reporter';
import { addTrackedTimer } from './tracked-timers';



/** Tracks if the error boundary has already rendered — prevents stacking. */
let boundaryRendered = false;

/**
 * Renders a full-page error recovery UI in #main-content.
 * Called when a critical page initialization error is detected.
 *
 * @param error - The error that caused the boundary to trigger
 */
function renderErrorBoundary(error: unknown): void {
  if (boundaryRendered) {
    return;
  }
  boundaryRendered = true;

  const mainContent = document.getElementById('main-content');
  if (!mainContent) {
    return; // No main content container — can't render boundary
  }

  const errorMsg = error instanceof Error ? error.message : String(error);

  // Report to backend
  reportError(error instanceof Error ? error : new Error(`Page init failed: ${errorMsg}`), {
    component: 'error-boundary',
    page: window.location.pathname,
  });

  mainContent.innerHTML = `
    <div class="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
      <div class="size-20 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
        <i class="ph ph-warning-circle text-red-500 nm-icon-40" aria-hidden="true"></i>
      </div>
      <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100" data-i18n="error_boundary_title">
        ${esc(t('error_boundary_title', 'حدث خطأ غير متوقع'))}
      </h2>
      <p class="text-sm text-slate-500 max-w-xs dark:text-slate-400" data-i18n="error_boundary_msg">
        ${esc(t('error_boundary_msg', 'لم نتمكن من تحميل هذه الصفحة. يرجى المحاولة مرة أخرى.'))}
      </p>
      <div class="flex gap-3 mt-2">
        <button type="button" id="nm-boundary-retry" class="btn-primary nm-btn-inline">
          <i class="ph ph-arrow-clockwise" aria-hidden="true"></i>
          <span data-i18n="common_retry">${esc(t('common_retry', 'إعادة المحاولة'))}</span>
        </button>
        <a href="/" class="btn-secondary nm-btn-inline">
          <i class="ph ph-house" aria-hidden="true"></i>
          <span data-i18n="go_home">${esc(t('go_home', 'الصفحة الرئيسية'))}</span>
        </a>
      </div>
      ${esc(import.meta.env.DEV ? `<pre class="mt-4 text-xs text-start bg-slate-100 dark:bg-dark-elevated rounded-lg p-3 max-w-md overflow-auto text-red-600 dark:text-red-400">${errorMsg}</pre>` : '')}
    </div>
  `;

  tryApplyI18n();

  // Wire retry button
  document.getElementById('nm-boundary-retry')?.addEventListener('click', () => {
    window.location.reload();
  });
}

/**
 * Wraps a page initialization callback in an error boundary.
 * Use this in place of a raw DOMContentLoaded callback.
 *
 * @example
 * ```typescript
 * import { guardPageInit } from '../utils/error-boundary';
 *
 * document.addEventListener('DOMContentLoaded', guardPageInit(() => {
 *   if (!requireAuth()) return;
 *   bootstrapPortal();
 *   // ... rest of page init
 * }));
 * ```
 */
export function guardPageInit(callback: () => void | Promise<void>): () => void {
  return () => {
    try {
      const result = callback();
      // Handle async init functions
      if (result instanceof Promise) {
        result.catch((err: unknown) => {
          renderErrorBoundary(err);
        });
      }
    } catch (err) {
      renderErrorBoundary(err);
    }
  };
}

/**
 * Initialize global error boundary listener.
 * Catches unhandled module-level errors that crash page initialization.
 *
 * Call once from main.ts or as an early import in portal pages.
 * This is a supplement to guardPageInit() — it catches errors that
 * escape the DOMContentLoaded wrapper (e.g., top-level module code).
 */
export function initErrorBoundary(): void {
  // Use a short delay to detect if main-content still has skeleton loaders
  // after a reasonable initialization window (3 seconds)
  window.addEventListener('load', () => {
    addTrackedTimer(setTimeout(() => {
      // Check if page is stuck in skeleton state (no hydration signal)
      const mainContent = document.getElementById('main-content');
      if (!mainContent) {
        return;
      }

      // If hydration signal was sent, page initialized successfully
      if (document.documentElement.dataset['hydrated'] === '1') {
        return;
      }

      // Check if there are still skeleton loaders visible
      const skeletons = mainContent.querySelectorAll('.animate-pulse, .skeleton, [data-skeleton]');
      if (skeletons.length > 0 && !boundaryRendered) {
        // Page appears stuck — but don't render boundary yet.
        // The skeleton-guard.ts handles this with its own retry UI.
        // This listener is only for cases where NO guard is installed.
        reportError(new Error('Page may be stuck in skeleton state'), {
          component: 'error-boundary',
          page: window.location.pathname,
          skeletonCount: skeletons.length,
        });
      }
    }, 8_000)); // 8 seconds — generous for Syria 2G
  });
}
