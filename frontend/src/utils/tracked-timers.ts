// ============================================================================
// Nammerha Frontend — Tracked Timer Registry (Shared Utility)
// ============================================================================
// P2-W13-002: Extracted from auth.ts (P1-W6-001) and reset-password.ts (P0-W12-002).
// PREVIOUS: Identical timer tracking code was copy-pasted across both files.
// If a bug fix or enhancement was needed (e.g., adding setTimeout tracking),
// both files had to be updated independently — DRY violation.
// NOW: Single source of truth for interval tracking + lifecycle cleanup.
// Standard: DRY Principle, Timer Hygiene, Page Lifecycle API.
// ============================================================================

const _activeTimers = new Set<ReturnType<typeof setInterval>>();

/**
 * Create a setInterval that auto-registers in the timer registry.
 * On page unload (via clearAllTrackedTimers), all registered timers
 * are automatically cleared to prevent memory leaks and orphaned callbacks.
 */
export function createTrackedInterval(
  callback: () => void,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  const timerId = setInterval(callback, intervalMs);
  _activeTimers.add(timerId);
  return timerId;
}

/**
 * Clear a tracked interval and remove from registry.
 * Returns null for convenient reassignment: `timer = clearTrackedInterval(timer)`
 * No-op if null (safe to call without null-checking).
 */
export function clearTrackedInterval(timerId: ReturnType<typeof setInterval> | null): null {
  if (timerId !== null) {
    clearInterval(timerId);
    _activeTimers.delete(timerId);
  }
  return null;
}

/**
 * Clear ALL active timers — called on pagehide for bfcache-safe cleanup.
 * Uses `pagehide` over `beforeunload` because:
 *   1. `beforeunload` blocks bfcache — critical for Syria 2G
 *   2. `pagehide` fires for ALL navigation types (back/forward, tab close, SPA)
 *   3. MDN and web.dev recommend `pagehide` as the modern replacement
 */
export function clearAllTrackedTimers(): void {
  for (const timerId of _activeTimers) {
    clearInterval(timerId);
  }
  _activeTimers.clear();
}

/**
 * Register a raw timer ID (from setTimeout or setInterval) for lifecycle cleanup.
 * Per HTML spec §8.6, setTimeout and setInterval IDs share the same numeric space,
 * so clearInterval() on a setTimeout ID is valid and vice versa.
 * Use this when you need to track a setTimeout alongside intervals.
 */
export function addTrackedTimer(timerId: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
  _activeTimers.add(timerId as unknown as ReturnType<typeof setInterval>);
  return timerId;
}
