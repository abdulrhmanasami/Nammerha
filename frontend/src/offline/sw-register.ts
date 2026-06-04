// ============================================================================
// Nammerha — Service Worker Registration
// ============================================================================
// Registers the SW, handles updates, provides online/offline utilities.
// Must be imported from main.ts AFTER DOMContentLoaded.
// ============================================================================

import { reportWarning } from '../error-reporter';
import { addTrackedTimer } from '../utils/tracked-timers';

/**
 * Registers the Service Worker and sets up update detection.
 * Call once from the main entry point.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    reportWarning('[SW] Service Workers not supported in this browser', {
      component: 'sw_register',
    });
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // ─── Update Detection ───────────────────────────────────────────
    // Check if there's already a waiting SW from a previous page load
    if (registration.waiting) {
      dispatchOfflineEvent('sw-update-waiting', { worker: registration.waiting });
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) {
        return;
      }

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version waiting — notify user to click update
          dispatchOfflineEvent('sw-update-waiting', { worker: newWorker });
        }
      });
    });

    // Listen for the controlling service worker changing
    // This fires after the new worker calls skipWaiting() and becomes the controller
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // W9-001 FIX: Store interval ID and clear on page unload to prevent
    // ghost intervals from accumulating during SPA-like navigation.
    const swUpdateCheckId = addTrackedTimer(
      setInterval(
        () => {
          registration.update().catch(() => {
            /* Intentional silent catch: update() fails when network is unavailable.
                   This is expected offline behavior — retry happens on next interval tick. */
          });
        },
        60 * 60 * 1000,
      ),
    );
    window.addEventListener('pagehide', () => clearInterval(swUpdateCheckId));

    // MED-002 FIX: Demoted from console.log to dev-only debug.
    // eslint-disable-next-line no-console
    if (import.meta.env.DEV) {
      console.debug('[SW] Registered, scope:', registration.scope);
    }
  } catch (error) {
    // P2-FIX-2: Replaced console.error with centralized error reporter.
    reportWarning('[SW] Registration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Listen for messages from the Service Worker (sync status, queue events).
 */
export function listenToServiceWorker(
  callback: (message: { type: string; url?: string; method?: string }) => void,
): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && typeof event.data.type === 'string') {
      callback(event.data as { type: string; url?: string; method?: string });
    }
  });
}

/**
 * Returns current network status.
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Dispatches a custom event on document for UI components to react.
 */
function dispatchOfflineEvent(type: string, detail?: Record<string, unknown>): void {
  document.dispatchEvent(new CustomEvent(`nammerha:${type}`, { detail }));
}

/**
 * Sets up online/offline event listeners that dispatch custom events.
 */
export function initNetworkListeners(): void {
  window.addEventListener('online', () => {
    dispatchOfflineEvent('online');
  });

  window.addEventListener('offline', () => {
    dispatchOfflineEvent('offline');
  });
}
