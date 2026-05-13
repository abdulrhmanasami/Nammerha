// ============================================================================
// Nammerha — Request Deduplication Utility
// P1-UX-004 FIX: Cancel stale inflight requests when user rapidly switches tabs.
// ============================================================================
// Architecture: When a user switches from Tab A → Tab B → Tab A within 100ms,
// both Tab A requests would resolve, causing double-render and potential
// stale-data display. This utility cancels the previous request for a given
// key before issuing a new one.
//
// Usage:
//   import { deduplicatedFetch } from '../utils/request-dedup';
//   const data = await deduplicatedFetch('ct-projects', () => contractor.getProjects());
// ============================================================================

/**
 * In-flight AbortController registry — keyed by resource name.
 */
const controllers = new Map<string, AbortController>();

/**
 * Execute an async fetcher function with automatic cancellation of any
 * previous in-flight request for the same key.
 *
 * @param key - Unique resource identifier (e.g., 'ct-projects', 'eng-bids')
 * @param fetcher - Async function to execute. Receives an AbortSignal.
 * @returns The result of the fetcher, or throws if aborted.
 */
export async function deduplicatedFetch<T>(
    key: string,
    fetcher: (signal?: AbortSignal) => Promise<T>,
): Promise<T> {
    // Cancel any previous in-flight request for this key
    const existing = controllers.get(key);
    if (existing) {
        existing.abort();
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    controllers.set(key, controller);

    try {
        const result = await fetcher(controller.signal);
        // Clean up — request completed successfully
        if (controllers.get(key) === controller) {
            controllers.delete(key);
        }
        return result;
    } catch (err) {
        // Clean up on error
        if (controllers.get(key) === controller) {
            controllers.delete(key);
        }

        // Re-throw non-abort errors
        if (err instanceof DOMException && err.name === 'AbortError') {
            // Silently swallow abort errors — this is expected behavior
            // when a newer request superseded this one.
            throw err;
        }
        throw err;
    }
}

/**
 * Cancel all in-flight requests.
 * Call on logout or page unload.
 */
export function cancelAllInflight(): void {
    for (const controller of controllers.values()) {
        controller.abort();
    }
    controllers.clear();
}

/**
 * Cancel a specific in-flight request by key.
 */
export function cancelInflight(key: string): void {
    const controller = controllers.get(key);
    if (controller) {
        controller.abort();
        controllers.delete(key);
    }
}
