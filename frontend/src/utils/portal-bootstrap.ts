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
// P0-PLT-002 FIX: Session timeout warning before auto-expiry.
import { initSessionTimeoutWarning } from './session-timeout';
// P2-PLT-004 FIX: Connection quality indicator for Syria 2G networks.
import { initConnectionQuality } from './connection-quality';

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
  if (bootstrapped) {
    return;
  }
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

  // P0-PLT-002 FIX: Proactive session timeout warning before JWT expiry.
  // Shows a native <dialog> 2 minutes before estimated session expiry,
  // allowing users to extend their session or save unsaved work.
  // Standard: OWASP Session Management, WCAG 2.2.1 (Timing Adjustable).
  initSessionTimeoutWarning();

  // P2-PLT-004 FIX: Connection quality pill badge for Syria 2G networks.
  // Creates a target element in the header for the quality indicator.
  // Standard: Nielsen #1 (System Status Visibility), PWA Connectivity.
  const header = document.querySelector('header, [role="banner"]');
  if (header && !document.getElementById('nm-connection-quality')) {
    const pill = document.createElement('span');
    pill.id = 'nm-connection-quality';
    pill.className = 'nm-hidden'; // Hidden until quality is detected as degraded
    header.appendChild(pill);
  }
  initConnectionQuality();

  // PLT-UX-AUD P2-PTR-001 FIX: Intercept pull-to-refresh to avoid full-page reload.
  // On Syria 2G, location.reload() takes 5-15s. Native apps refresh data, not the page.
  // This calls preventDefault() on REFRESH_EVENT (so pull-refresh.ts does NOT reload),
  // then dispatches a simpler DATA_REFRESH_EVENT that page modules can listen to.
  document.addEventListener(REFRESH_EVENT, (e) => {
    e.preventDefault(); // Signal "I'm handling this" → prevent full-page reload
    document.dispatchEvent(new CustomEvent(DATA_REFRESH_EVENT));
  });

  // P3-UXA-001 FIX: Skip-to-content link for screen reader accessibility.
  // Injected programmatically so all portal pages get it without HTML changes.
  // Standard: WCAG 2.4.1 (Bypass Blocks).
  if (document.getElementById('main-content') && !document.getElementById('nm-skip-link')) {
    const skip = document.createElement('a');
    skip.id = 'nm-skip-link';
    skip.href = '#main-content';
    skip.className = 'nm-skip-link';
    skip.textContent = 'Skip to content';
    skip.setAttribute('data-i18n', 'skip_to_content');
    document.body.insertBefore(skip, document.body.firstChild);
  }

  // A4 FIX: First-time portal orientation toast.
  // PREVIOUS: New users selecting Supplier/Contractor/Tradesperson in the welcome
  // chooser landed on a sidebar-nav portal with NO bottom nav and ZERO guidance.
  // The spatial model changed abruptly from bottom-tab to sidebar — disorienting.
  // NOW: Shows a brief orientation toast on first visit to any sidebar-nav portal.
  // Uses localStorage guard — shows once per portal per device.
  // Standard: Nielsen #6 (Recognition over Recall), First-Run UX, Apple HIG (Onboarding).
  showPortalOrientationIfNeeded();
}

/**
 * A4 FIX: Shows a one-time orientation toast for sidebar-nav portals.
 * Detects the current portal from the URL pathname and shows a contextual
 * message explaining the sidebar navigation pattern.
 */
function showPortalOrientationIfNeeded(): void {
  // Only relevant for sidebar-nav portals (pages that suppress bottom nav)
  const SIDEBAR_PORTALS: Record<string, { nameKey: string; nameFallback: string }> = {
    '/supplier-dashboard.html': { nameKey: 'portal_supplier', nameFallback: 'Supplier Dashboard' },
    '/contractor-portal.html': { nameKey: 'portal_contractor', nameFallback: 'Contractor Portal' },
    '/tradesperson-portal.html': {
      nameKey: 'portal_tradesperson',
      nameFallback: 'Tradesperson Portal',
    },
  };

  const path = window.location.pathname;
  const portal = SIDEBAR_PORTALS[path];
  if (!portal) {
    return;
  } // Not a sidebar portal — skip

  const storageKey = `nm_portal_oriented_${path}`;
  try {
    if (localStorage.getItem(storageKey)) {
      return;
    } // Already shown
    localStorage.setItem(storageKey, '1');
  } catch {
    return;
  } // Storage unavailable — skip

  // Lazy-import showToast to avoid circular deps at module evaluation time
  import('../utils/toast')
    .then(({ showToast }) => {
      // Small delay for the page to render first
      setTimeout(() => {
        showToast(
          `Welcome to your ${portal.nameFallback}! Use the sidebar menu on the left to navigate.`,
          'info',
          { duration: 6000 }, // longer display for orientation
        );
      }, 1200);
    })
    .catch(() => {
      /* toast module failed — degrade silently */
    });
}
