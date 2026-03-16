/**
 * P1-003 FIX: Hash-Based Tab Router for Dashboard Portals
 * ════════════════════════════════════════════════════════
 * Enables deep-linking, bookmarking, and browser back/forward for
 * dashboard tab sections. URL reflects active tab (e.g. #projects).
 *
 * Usage per portal:
 *   const { getInitialTab, setActiveTab, onHashChange } = createHashRouter(ALL_TABS, 'dashboard');
 *   // In DOMContentLoaded: const initial = getInitialTab();
 *   // In switchTab():      setActiveTab(tab);
 *   // In DOMContentLoaded: onHashChange(switchTab);
 */

/**
 * Create a hash-based router scoped to a known set of tab names.
 * @param validTabs Array of valid tab identifiers (e.g. ['dashboard', 'projects', ...])
 * @param defaultTab Default tab when URL has no hash or an invalid hash
 */
export function createHashRouter<T extends string>(
    validTabs: readonly T[],
    defaultTab: T,
): {
    /** Read the current hash and return a valid tab name (or default). */
    getInitialTab: () => T;
    /** Push the new tab name to the URL hash (replaceState to avoid history spam on same-tab clicks). */
    setActiveTab: (tab: T) => void;
    /** Listen for popstate (browser back/forward) and call the handler with the resolved tab. */
    onHashChange: (handler: (tab: T) => void) => void;
} {
    function resolveHash(): T {
        const raw = window.location.hash.replace('#', '');
        return (validTabs as readonly string[]).includes(raw)
            ? (raw as T)
            : defaultTab;
    }

    return {
        getInitialTab: resolveHash,

        setActiveTab(tab: T): void {
            // Use replaceState if hash already matches (no extra history entry)
            const current = window.location.hash.replace('#', '');
            if (current === tab) { return; }
            // pushState adds a real history entry for back/forward navigation
            history.pushState(null, '', `#${tab}`);
        },

        onHashChange(handler: (tab: T) => void): void {
            window.addEventListener('popstate', () => {
                handler(resolveHash());
            });
        },
    };
}
