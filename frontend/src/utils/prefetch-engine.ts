// ============================================================================
// Nammerha Frontend — Zero-Latency Prefetch Engine
// Implements Hover-Intent Prefetching for the Platinum Standard upgrade.
// ============================================================================

const prefetchCache = new Set<string>();

/**
 * Injects a <link rel="prefetch"> tag into the document head for the given URL.
 * Only prefetches once per URL.
 */
export function prefetchUrl(url: string): void {
    if (prefetchCache.has(url)) return;
    
    // Don't prefetch if the user is on a slow network or has data saver enabled
    // @ts-expect-error navigator.connection is non-standard but heavily supported
    if (navigator.connection?.saveData || navigator.connection?.effectiveType === '2g') {
        return;
    }

    prefetchCache.add(url);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
}

/**
 * Initializes the hover-intent observer on all <a> tags with an href.
 * If a user hovers over a link for more than 50ms (intent), the URL is prefetched.
 */
export function initPrefetchEngine(): void {
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;

    document.addEventListener('mouseover', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (!anchor || !anchor.href) return;

        // Skip absolute external URLs (cross-origin)
        if (anchor.origin !== window.location.origin) return;

        hoverTimer = setTimeout(() => {
            prefetchUrl(anchor.href);
        }, 50); // 50ms confirms hover intent
    });

    document.addEventListener('mouseout', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor && hoverTimer) {
            clearTimeout(hoverTimer);
        }
    });

    // Also prefetch on touchstart for mobile devices
    document.addEventListener('touchstart', (e: TouchEvent) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor && anchor.href && anchor.origin === window.location.origin) {
            prefetchUrl(anchor.href);
        }
    }, { passive: true });
}
