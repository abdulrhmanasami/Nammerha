// ============================================================================
// Nammerha — Service Worker Registration
// ============================================================================
// Registers the SW, handles updates, provides online/offline utilities.
// Must be imported from main.ts AFTER DOMContentLoaded.
// ============================================================================

import { reportWarning } from '../error-reporter';

/**
 * Registers the Service Worker and sets up update detection.
 * Call once from the main entry point.
 */
export async function registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
        console.warn('[SW] Service Workers not supported in this browser');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
        });

        // ─── Update Detection ───────────────────────────────────────────
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) {
            return;
        }

            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                    // New version activated — notify user to refresh
                    dispatchOfflineEvent('sw-updated');
                }
            });
        });

        // Check for updates periodically (every 60 minutes)
        setInterval(() => {
            registration.update().catch(() => {
                // Silent fail — network may be unavailable
            });
        }, 60 * 60 * 1000);

        // MED-002 FIX: Demoted from console.log to dev-only debug.
        if (import.meta.env.DEV) { console.debug('[SW] Registered, scope:', registration.scope); }
    } catch (error) {
        // P2-FIX-2: Replaced console.error with centralized error reporter.
        reportWarning('[SW] Registration failed', { error: error instanceof Error ? error.message : String(error) });
    }
}

/**
 * Listen for messages from the Service Worker (sync status, queue events).
 */
export function listenToServiceWorker(
    callback: (message: { type: string; url?: string; method?: string }) => void
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
