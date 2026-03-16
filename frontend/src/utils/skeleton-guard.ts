// ============================================================================
// Nammerha — Skeleton Timeout Guard
// P3-UX-004 FIX: Prevents skeleton loaders from persisting indefinitely
// ============================================================================
// Architecture: Wraps a container's skeleton content with a timeout. If the
// skeleton is still visible after the deadline, it gets replaced with a
// user-friendly "still loading" message + retry button.

interface SkeletonGuardConfig {
    /** Container element or ID containing the skeleton */
    container: HTMLElement | string;
    /** Timeout in ms before showing "still loading" message. Default: 15000 (15s) */
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
        timeoutMs = 15000,
        onRetry,
        messageKey = 'skeleton_timeout',
    } = config;

    const container = typeof config.container === 'string'
        ? document.getElementById(config.container)
        : config.container;

    if (!container) {
        return () => { /* noop */ };
    }

    const timerId = setTimeout(() => {
        // Check if skeleton is still showing (has `animate-pulse` children)
        const skeletons = container.querySelectorAll('.animate-pulse');
        if (skeletons.length === 0) {
            return; // Data already loaded — nothing to do
        }

        // i18n-aware message resolution
        const i18n = (window as unknown as Record<string, unknown>).NammerhaI18n as { t?: (key: string) => string } | undefined;
        const msg = i18n?.t?.(messageKey) ?? 'Taking longer than usual…';
        const retryLabel = i18n?.t?.('retry') ?? 'Retry';

        container.innerHTML = `
            <div class="text-center py-8 animate-fade-in-up">
                <i class="ph ph-hourglass-medium text-slate-300" style="font-size:40px" aria-hidden="true"></i>
                <p class="text-slate-500 text-sm font-medium mt-3">${msg}</p>
                ${onRetry ? `<button class="nm-skeleton-retry mt-3 px-4 py-2 bg-trust-blue text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors">${retryLabel}</button>` : ''}
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
    }, timeoutMs);

    // Return cancel function
    return () => clearTimeout(timerId);
}
