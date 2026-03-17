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
 * Behavior:
 *   - If browser has navigation history: history.back()
 *   - Otherwise: fall through to the <a href="…"> fallback naturally
 *
 * This replaces the identical blocks that were copy-pasted in:
 *   - wallet.ts (lines 169-178)
 *   - profile.ts (lines 551-560)
 */
function wireBackButton(): void {
    const backBtns = document.querySelectorAll<HTMLAnchorElement>('[data-back-btn]');
    backBtns.forEach(btn => {
        btn.addEventListener('click', (e: Event) => {
            // Only intercept if browser has history to go back to.
            // If no history, let the <a href="index.html"> fallback work naturally.
            if (history.length > 1) {
                e.preventDefault();
                history.back();
            }
            // else: falls through to <a href="…"> naturally (progressive enhancement)
        });
    });
}
