// ============================================================================
// Nammerha — Portal Bootstrap (Shared initialization for all portal pages)
// P1-UX-003 FIX: Service Worker registration on all protected pages.
// ============================================================================
// Architecture: Every portal page (contractor, engineer, supplier, tradesperson,
// homeowner) needs SW registration for offline caching. Previously only
// main.ts (homepage) registered the SW — all other pages had no offline
// capability at all.
//
// This module provides a single `bootstrapPortal()` call that wires:
//   1. Service Worker registration
//   2. Network status listeners (online/offline events)
//
// Usage (add to each portal page's DOMContentLoaded):
//   import { bootstrapPortal } from '../utils/portal-bootstrap';
//   bootstrapPortal();
// ============================================================================

import { registerServiceWorker, initNetworkListeners } from '../offline/sw-register';
// W5-006: Keyboard shortcuts available on all portal pages (not just homepage)
import { initKeyboardShortcuts } from './keyboard-shortcuts';

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

    // W5-006: Desktop keyboard shortcuts for power users
    initKeyboardShortcuts();
}
