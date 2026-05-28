import { addTrackedTimer } from './tracked-timers';

// ============================================================================
// Nammerha Frontend — Zero-Latency Prefetch Engine (P1-NAV-001 Enhanced)
// ============================================================================
// Implements Hover-Intent Prefetching for the Platinum Standard.
//
// P1-NAV-001 FIX: Enhanced with:
//   - 200ms dwell threshold (was 50ms — too eager, wasted bandwidth on scrolling)
//   - `as="document"` hint for higher browser priority
//   - focusin handler for keyboard navigation accessibility
//   - Explicit slow-2g exclusion
//   - @ts-expect-error replaced with proper type narrowing
//
// Standard: Google Chrome "Speculative Loading" best practices, Nielsen #7.
// ============================================================================

const prefetchCache = new Set<string>();

/**
 * Injects a <link rel="prefetch"> tag into the document head for the given URL.
 * Only prefetches once per URL.
 */
export function prefetchUrl(url: string): void {
    if (prefetchCache.has(url)) { return; }

    // Don't prefetch if the user is on a slow network or has data saver enabled.
    // navigator.connection is non-standard but supported in Chrome/Edge/Opera.
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
        const conn = (navigator as unknown as { connection: { saveData?: boolean; effectiveType?: string } }).connection;
        if (conn?.saveData) { return; }
        if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') { return; }
    }

    prefetchCache.add(url);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    // P1-NAV-001 FIX: `as="document"` gives the browser a higher priority hint
    // for HTML navigation prefetches vs generic resource prefetches.
    link.as = 'document';
    document.head.appendChild(link);
}

/**
 * Initializes the hover-intent observer on all <a> tags with an href.
 * If a user hovers over a link for more than 200ms (intent), the URL is prefetched.
 */
export function initPrefetchEngine(): void {
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;

    // Helper: extract and validate same-origin anchor from event target
    function getAnchor(target: EventTarget | null): HTMLAnchorElement | null {
        if (!target || !(target instanceof HTMLElement)) { return null; }
        const anchor = target.closest('a');
        if (!anchor || !anchor.href) { return null; }
        if (anchor.origin !== window.location.origin) { return null; }
        if (anchor.hasAttribute('download') || anchor.target === '_blank') { return null; }
        return anchor;
    }

    document.addEventListener('mouseover', (e: MouseEvent) => {
        const anchor = getAnchor(e.target);
        if (!anchor) { return; }

        // P1-NAV-001 FIX: 200ms dwell threshold (was 50ms).
        // 50ms triggered on casual scroll-past — wasted bandwidth.
        // 200ms confirms genuine hover intent without noticeable delay.
        hoverTimer = addTrackedTimer(setTimeout(() => {
            prefetchUrl(anchor.href);
        }, 200));
    });

    document.addEventListener('mouseout', (e: MouseEvent) => {
        const anchor = getAnchor(e.target);
        if (anchor && hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    });

    // Mobile: prefetch on touchstart (no hover available)
    document.addEventListener('touchstart', (e: TouchEvent) => {
        const anchor = getAnchor(e.target);
        if (anchor) {
            prefetchUrl(anchor.href);
        }
    }, { passive: true });

    // P1-NAV-001 FIX: Keyboard accessibility — prefetch on focus navigation.
    // Tab-navigating users also benefit from speculative loading.
    // Standard: WCAG 2.4.3 (Focus Order), Nielsen #7 (Flexibility).
    document.addEventListener('focusin', (e: FocusEvent) => {
        const anchor = getAnchor(e.target);
        if (anchor) {
            prefetchUrl(anchor.href);
        }
    }, { passive: true });
}
