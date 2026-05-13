// ============================================================================
// Nammerha — Tab State & Scroll Position Manager
// P2-UXA-004 + P3-UXA-003 FIX: Tab switching destroys scroll position and
// last active tab is not preserved across sessions.
//
// This utility provides:
// 1. Save/restore scroll position per tab (sessionStorage)
// 2. Persist last active tab across page reloads (sessionStorage)
//
// Architecture: Uses sessionStorage (not localStorage) so state is scoped
// to the browser tab — opening a new tab starts fresh (correct behavior).
//
// Standard: Apple HIG (State Preservation), Nielsen #7 (Flexibility).
// ============================================================================

const SCROLL_PREFIX = 'nmr_scroll_';
const TAB_PREFIX = 'nmr_tab_';

/**
 * Get a portal-specific storage key.
 * Uses the portal ID from document.body.dataset.portal.
 */
function getPortalId(): string {
    return document.body.dataset['portal'] ?? 'unknown';
}

/**
 * Save the current scroll position for a tab.
 * Call this BEFORE switching away from a tab.
 *
 * @param tabId - The tab being left (e.g., 'dashboard', 'projects')
 */
export function saveScrollPosition(tabId: string): void {
    const portalId = getPortalId();
    const scrollY = document.scrollingElement?.scrollTop ?? window.scrollY;
    try {
        sessionStorage.setItem(`${SCROLL_PREFIX}${portalId}_${tabId}`, String(Math.round(scrollY)));
    } catch {
        // Safari private mode — silently fail
    }
}

/**
 * Restore the saved scroll position for a tab.
 * Call this AFTER switching to a tab and rendering its content.
 *
 * @param tabId - The tab being shown (e.g., 'dashboard', 'projects')
 */
export function restoreScrollPosition(tabId: string): void {
    const portalId = getPortalId();
    try {
        const saved = sessionStorage.getItem(`${SCROLL_PREFIX}${portalId}_${tabId}`);
        if (saved) {
            const y = parseInt(saved, 10);
            if (!isNaN(y) && y > 0) {
                // Use requestAnimationFrame to ensure DOM is rendered
                requestAnimationFrame(() => {
                    window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
                });
            }
        }
    } catch {
        // Safari private mode — silently fail
    }
}

/**
 * Save the last active tab for this portal.
 * Call this on every tab switch.
 *
 * @param tabId - The tab that was just activated
 */
export function saveLastTab(tabId: string): void {
    const portalId = getPortalId();
    try {
        sessionStorage.setItem(`${TAB_PREFIX}${portalId}`, tabId);
    } catch {
        // Safari private mode — silently fail
    }
}

/**
 * Get the last active tab for this portal.
 * Returns null if no tab was previously saved.
 */
export function getLastTab(): string | null {
    const portalId = getPortalId();
    try {
        return sessionStorage.getItem(`${TAB_PREFIX}${portalId}`);
    } catch {
        return null;
    }
}
