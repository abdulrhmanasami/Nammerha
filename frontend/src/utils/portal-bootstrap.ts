// ============================================================================
// Nammerha — Portal Bootstrap (Shared initialization for all portal pages)
// P1-UX-003 FIX: Service Worker registration on all protected pages.
// PLT-UX-AUD P1-BOOTSTRAP-006 FIX: Unified infrastructure for all portals.
// ============================================================================
// Architecture: Every portal page (contractor, engineer, supplier, tradesperson,
// homeowner) needs SW registration for offline caching. Previously only
// main.ts (homepage) registered the SW — all other pages had no offline
// capability at all.
//
// This module provides a single `bootstrapPortal()` call that wires:
//   1. Service Worker registration
//   2. Network status listeners (online/offline events)
//   3. Offline indicator banner (PLT-UX-AUD P1-OFFLINE-003)
//   4. Global search overlay (PLT-UX-AUD P1-BOOTSTRAP-006)
//   5. Keyboard shortcuts
//   6. Pull-to-refresh → data refresh (PLT-UX-AUD P2-PTR-001)
//
// Usage (add to each portal page's DOMContentLoaded):
//   import { bootstrapPortal, DATA_REFRESH_EVENT } from '../utils/portal-bootstrap';
//   bootstrapPortal();
//   document.addEventListener(DATA_REFRESH_EVENT, () => { reloadMyData(); });
// ============================================================================

import { registerServiceWorker, initNetworkListeners } from '../offline/sw-register';
// W5-006: Keyboard shortcuts available on all portal pages (not just homepage)
import { initKeyboardShortcuts } from './keyboard-shortcuts';
// PLT-UX-AUD P1-OFFLINE-003 FIX: Offline banner on ALL portals (was only on wallet.ts).
// Users on dashboards editing projects going offline had ZERO feedback — data loss risk.
import { initOfflineIndicator } from './offline-indicator';
// PLT-UX-AUD P1-BOOTSTRAP-006 FIX: Search overlay on ALL portals.
import { initSearch } from './search-overlay';
// PLT-UX-AUD P2-PTR-001 FIX: Intercept pull-to-refresh → emit data refresh.
import { REFRESH_EVENT } from './pull-refresh';

/**
 * PLT-UX-AUD P2-PTR-001 FIX: Simpler event for page modules to listen to.
 * Pull-to-refresh dispatches REFRESH_EVENT (complex, cancelable).
 * bootstrapPortal() intercepts it and re-dispatches this simpler event.
 * Pages just listen to DATA_REFRESH_EVENT and reload their data.
 */
export const DATA_REFRESH_EVENT = 'nammerha:data-refresh';

let bootstrapped = false;

/**
 * Initialize shared portal infrastructure.
 * Safe to call multiple times — idempotent.
 */
export function bootstrapPortal(): void {
    if (bootstrapped) { return; }
    bootstrapped = true;

    // P1-UX-003: Register SW on every portal page
    registerServiceWorker();

    // Wire online/offline event dispatchers
    initNetworkListeners();

    // PLT-UX-AUD P1-OFFLINE-003: Slide-down banner when device goes offline
    initOfflineIndicator();

    // PLT-UX-AUD P1-BOOTSTRAP-006: Cmd/Ctrl+K search from any portal
    initSearch();

    // W5-006: Desktop keyboard shortcuts for power users
    initKeyboardShortcuts();

    // PLT-UX-AUD P2-PTR-001 FIX: Intercept pull-to-refresh to avoid full-page reload.
    // On Syria 2G, location.reload() takes 5-15s. Native apps refresh data, not the page.
    // This calls preventDefault() on REFRESH_EVENT (so pull-refresh.ts does NOT reload),
    // then dispatches a simpler DATA_REFRESH_EVENT that page modules can listen to.
    document.addEventListener(REFRESH_EVENT, (e) => {
        e.preventDefault(); // Signal "I'm handling this" → prevent full-page reload
        document.dispatchEvent(new CustomEvent(DATA_REFRESH_EVENT));
    });
}
