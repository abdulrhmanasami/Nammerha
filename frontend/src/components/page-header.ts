/**
 * page-header.ts — INC-NEW-01 FIX: Unified Page Header Component
 *
 * Single source of truth for all consumer page header behaviors.
 * Eliminates duplicated back-button wiring across wallet.ts, profile.ts,
 * and future pages. Any page containing a [data-back-btn] element
 * gets automatic history.back() with href fallback.
 *
 * Architecture:
 *   - HTML keeps full header markup (no FOUC, works without JS)
 *   - This module HYDRATES the existing HTML with behaviors
 *   - Progressive Enhancement: header works as plain links without JS
 *
 * Behaviors wired:
 *   1. Back button: history.back() if history exists, else href fallback
 *   2. RTL icon flip: handled by CSS (.page-header already has this)
 *
 * Standard: Nammerha Self-Injecting Component Pattern,
 *           Nielsen #4 (Consistency), Apple HIG (Navigation Bar).
 */

/**
 * Initialize page header behaviors.
 * Call once from each page's init() function.
 *
 * Wires:
 *   - [data-back-btn] → history.back() with href fallback
 *   - Future: search triggers, title truncation observer, etc.
 */
export function initPageHeader(): void {
    wireBackButton();
}

/**
 * Wire all [data-back-btn] elements on the page.
 *
 * GAP-2026-B02 FIX: Enhanced back navigation with portal-aware fallback.
 * Previous: Always fell back to index.html via href — disorienting for users
 * who arrived from a dashboard portal (e.g., contractor-dashboard → engineer-boq).
 * Now: Stores the referring portal URL in sessionStorage and uses it as fallback.
 *
 * Behavior:
 *   1. If browser has navigation history: history.back()
 *   2. If referrer was a portal page: navigate to that portal
 *   3. Otherwise: fall through to the <a href="…"> fallback naturally
 *
 * Standard: Nielsen #3 (User Control and Freedom), Apple HIG (Navigation).
 */

/** Portal page patterns — any URL matching these is considered a portal referrer */
const PORTAL_PATTERNS = [
    'homeowner-portal', 'donor-portal', 'contractor-dashboard',
    'supplier-dashboard', 'tradesperson-dashboard', 'engineer-dashboard',
    'admin-'
];

const PORTAL_REFERRER_KEY = 'nm-portal-referrer';

function wireBackButton(): void {
    // On page load, store referrer if it's a portal
    try {
        const ref = document.referrer;
        if (ref && PORTAL_PATTERNS.some(p => ref.includes(p))) {
            sessionStorage.setItem(PORTAL_REFERRER_KEY, ref);
        }
    } catch { /* sessionStorage unavailable — graceful degradation */ }

    const backBtns = document.querySelectorAll<HTMLAnchorElement>('[data-back-btn]');
    backBtns.forEach(btn => {
        btn.addEventListener('click', (e: Event) => {
            // Priority 1: Browser history
            if (history.length > 1) {
                e.preventDefault();
                history.back();
                return;
            }

            // Priority 2: Portal referrer from sessionStorage
            try {
                const portalRef = sessionStorage.getItem(PORTAL_REFERRER_KEY);
                if (portalRef) {
                    e.preventDefault();
                    window.location.href = portalRef;
                    return;
                }
            } catch { /* sessionStorage unavailable */ }

            // Priority 3: Fall through to <a href="…"> naturally (progressive enhancement)
        });
    });
}
