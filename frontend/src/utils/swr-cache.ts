// ============================================================================
// Nammerha — Stale-While-Revalidate Cache Utility
// P1-004 FIX: Tab-level data caching to reduce redundant API calls.
// ============================================================================
// Architecture: Provides a lightweight SWR cache for portal tab data.
// When switching tabs, previously loaded data is shown immediately (stale)
// while a background revalidation occurs. This dramatically improves
// perceived performance, especially on Syria's restricted 2G/3G networks.
//
// Usage:
//   import { swrFetch } from '../utils/swr-cache';
//   const data = await swrFetch('contractor-stats', loadStats, {
//       onStaleData: (cached) => renderStats(cached),
//       maxAge: 60_000, // 1 minute
//   });
// ============================================================================

interface SWREntry<T> {
    data: T;
    timestamp: number;
}

interface SWROptions<T> {
    /** Callback to render stale data immediately while revalidating */
    onStaleData?: (data: T) => void;
    /** Maximum age in ms before data is considered stale. Default: 60_000 (1 min) */
    maxAge?: number;
    /** If true, skip revalidation when stale data exists. Default: false */
    skipRevalidation?: boolean;
}

const cache = new Map<string, SWREntry<unknown>>();

/**
 * Fetch data with stale-while-revalidate semantics.
 *
 * 1. If cached data exists and is fresh (< maxAge), return it immediately.
 * 2. If cached data exists but is stale, render it via onStaleData(), then
 *    revalidate in background and return fresh data.
 * 3. If no cached data exists, fetch fresh and cache it.
 *
 * @param key - Unique cache key (e.g., 'contractor-stats', 'supplier-catalog')
 * @param fetcher - Async function that returns fresh data
 * @param options - SWR configuration
 * @returns Fresh data (or cached if skipRevalidation is true)
 */
export async function swrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: SWROptions<T> = {}
): Promise<T> {
    const { onStaleData, maxAge = 60_000, skipRevalidation = false } = options;
    const now = Date.now();
    const entry = cache.get(key) as SWREntry<T> | undefined;

    // Case 1: Fresh cache hit — return immediately
    if (entry && (now - entry.timestamp) < maxAge) {
        return entry.data;
    }

    // Case 2: Stale cache — render stale, then revalidate
    if (entry && onStaleData) {
        onStaleData(entry.data);
        if (skipRevalidation) {
            return entry.data;
        }
    }

    // Case 3: Fetch fresh data
    const freshData = await fetcher();
    cache.set(key, { data: freshData, timestamp: Date.now() });
    return freshData;
}

/**
 * Invalidate a specific cache entry.
 * Call after mutations (e.g., after submitting a bid).
 */
export function invalidateCache(key: string): void {
    cache.delete(key);
}

/**
 * Invalidate all cache entries matching a prefix.
 * Example: invalidateCachePrefix('contractor-') clears all contractor data.
 */
export function invalidateCachePrefix(prefix: string): void {
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
        }
    }
}

/**
 * Clear the entire SWR cache.
 * Call on logout or major state changes.
 */
export function clearSWRCache(): void {
    cache.clear();
}
