import { escapeHtml as esc } from './xss';
// ============================================================================
// Nammerha — Skeleton Timeout Guard
// P3-UX-004 FIX: Prevents skeleton loaders from persisting indefinitely
// ============================================================================
// Architecture: Wraps a container's skeleton content with a timeout. If the
// skeleton is still visible after the deadline, it gets replaced with a
// user-friendly "still loading" message + retry button.

import { tryTranslate } from './i18n-apply';
import { addTrackedTimer } from './tracked-timers';



interface SkeletonGuardConfig {
    /** Container element or ID containing the skeleton */
    container: HTMLElement | string;
    /** Timeout in ms before showing "still loading" message. Default: 35000 (35s)
     *  PLT-UX-AUD P2-SKEL-002 FIX: Aligned with API client timeout (30s) + 5s buffer.
     *  Previous 15s default caused premature "Taking longer than usual…" while API was still in-flight. */
    timeoutMs?: number;
    /** Callback to retry the load */
    onRetry?: () => void;
    /** i18n key for the "still loading" message */
    messageKey?: string;
}

/**
 * Guard a skeleton loader with a timeout fallback.
 * Returns a cancel function to clear the timer when data loads successfully.
 */
export function guardSkeleton(config: SkeletonGuardConfig): () => void {
    const {
        timeoutMs = 35000,
        onRetry,
        messageKey = 'skeleton_timeout',
    } = config;

    const container = typeof config.container === 'string'
        ? document.getElementById(config.container)
        : config.container;

    if (!container) {
        return () => { /* noop */ };
    }

    // P2-003 FIX: Progressive feedback — 5s reassurance before 15s timeout
    const earlyHintMs = Math.min(5000, timeoutMs - 1000); // Show hint at 5s (or earlier if timeoutMs < 6s)
    const earlyTimerId = addTrackedTimer(setTimeout(() => {
        const skeletons = container.querySelectorAll('.animate-pulse');
        if (skeletons.length === 0) { return; }
        // Inject subtle "still loading" text below the skeleton — DON'T replace it
        const hint = document.createElement('p');
        hint.className = 'nm-skeleton-hint text-center text-xs text-slate-400 mt-2 animate-fade-in-up dark:text-slate-500';
        hint.textContent = tryTranslate('skeleton_still_loading', 'Still loading…');
        // Only add if not already present
        if (!container.querySelector('.nm-skeleton-hint')) {
            container.appendChild(hint);
        }
    }, earlyHintMs));

    const timerId = addTrackedTimer(setTimeout(() => {
        // Check if skeleton is still showing (has `animate-pulse` children)
        const skeletons = container.querySelectorAll('.animate-pulse');
        if (skeletons.length === 0) {
            return; // Data already loaded — nothing to do
        }

        // PLT-AUD5-002 FIX: Replaced unsafe (window as unknown as Record<string, unknown>)
        // double-cast with shared type-safe utility.
        const msg = tryTranslate(messageKey, 'Taking longer than usual…');
        const retryLabel = tryTranslate('retry', 'Retry');

        container.innerHTML = `
            <div class="text-center py-8 animate-fade-in-up">
                <i class="ph ph-hourglass-medium text-slate-300 nm-icon-40" aria-hidden="true"></i>
                <p class="text-slate-500 text-sm font-medium mt-3 dark:text-slate-400">${esc(msg)}</p>
                ${onRetry ? `<button type="button" class="nm-skeleton-retry mt-3 px-4 py-2 bg-trust-blue text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors">${retryLabel}</button>` : ''}
            </div>
        `;

        if (onRetry) {
            container.querySelector('.nm-skeleton-retry')?.addEventListener('click', () => {
                // Re-show basic skeleton
                container.innerHTML = `
                    <div class="p-4 flex items-center gap-4 animate-pulse">
                        <div class="size-10 bg-slate-200 rounded-lg"></div>
                        <div class="flex-1 space-y-2">
                            <div class="h-3 bg-slate-200 rounded w-3/4"></div>
                            <div class="h-2 bg-slate-100 rounded w-1/2"></div>
                        </div>
                    </div>
                `;
                onRetry();
            });
        }
    }, timeoutMs));

    // Return cancel function — clears both timers
    return () => {
        clearTimeout(earlyTimerId);
        clearTimeout(timerId);
    };
}
