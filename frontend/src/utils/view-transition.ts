// ============================================================================
// Nammerha — View Transitions API Wrapper (Progressive Enhancement)
// P0-UXA-004 FIX: Smooth cross-portal navigation using the View Transitions API.
// Falls back to standard navigation on unsupported browsers (zero risk).
// Spec: https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API
// ============================================================================

/**
 * Navigate to a URL with a smooth cross-fade transition.
 * Uses the View Transitions API when available (Chrome 111+, Safari 18+).
 * Falls back to standard `window.location.href` assignment on older browsers.
 *
 * @param href - The URL to navigate to (e.g., '/engineer-portal.html')
 */
export function navigateWithTransition(href: string): void {
    // Progressive enhancement: only use View Transitions API if available.
    // The `startViewTransition` method is on the Document interface.
    if ('startViewTransition' in document) {
        // The callback triggers the actual navigation.
        // The API captures a screenshot of the old page, navigates,
        // then cross-fades to the new page.
        (document as unknown as { startViewTransition: (cb: () => void) => void })
            .startViewTransition(() => {
                window.location.href = href;
            });
    } else {
        window.location.href = href;
    }
}
