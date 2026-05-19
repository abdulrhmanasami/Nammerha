// ============================================================================
// Nammerha — Live KPI Timestamp Utility
// P2-UXA-002 FIX: KPI "Updated just now" text never updates after initial set.
// Users who stay on a portal page for 10+ minutes still see "just now" — stale.
//
// This utility auto-updates the KPI timestamp element with relative time
// (e.g., "Updated 2 min ago") using requestAnimationFrame-based intervals.
// Respects i18n via the translation engine.
//
// Standard: Nielsen #1 (System Status Visibility), Data Freshness Transparency.
// ============================================================================

import { t } from './i18n';

/** Timestamp when the KPI data was last fetched (set by portal modules) */
let lastFetchTime: number = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Format a relative time string from a timestamp.
 * Returns locale-aware "just now", "X min ago", "X hr ago".
 */
function formatRelativeTime(fetchedAt: number): string {
  const seconds = Math.floor((Date.now() - fetchedAt) / 1000);

  if (seconds < 30) {
    return t('kpi_just_updated', 'تم التحديث للتو');
  }
  if (seconds < 60) {
    return t('kpi_updated_seconds', 'تم التحديث منذ {n} ثانية').replace('{n}', String(seconds));
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t('kpi_updated_minutes', 'تم التحديث منذ {n} دقيقة').replace('{n}', String(minutes));
  }

  const hours = Math.floor(minutes / 60);
  return t('kpi_updated_hours', 'تم التحديث منذ {n} ساعة').replace('{n}', String(hours));
}

/**
 * Update the KPI timestamp element with the current relative time.
 */
function updateDisplay(): void {
  if (lastFetchTime === 0) {
    return;
  }

  const el = document.getElementById('kpi-last-updated');
  if (!el) {
    return;
  }

  el.textContent = formatRelativeTime(lastFetchTime);
}

/**
 * Mark that KPI data was just fetched and start the live update interval.
 * Call this after every successful KPI API response.
 *
 * @example
 *   import { markKPIFetched } from '../utils/live-kpi-timestamp';
 *   // Inside loadStats():
 *   markKPIFetched();
 */
export function markKPIFetched(): void {
  lastFetchTime = Date.now();
  updateDisplay();

  // P2-UXA-007 FIX: Remove stale indicator when fresh data arrives
  hideStaleIndicator();

  // Start interval if not already running
  if (intervalId === null) {
    // Update every 15 seconds — good balance of freshness vs performance
    intervalId = setInterval(updateDisplay, 15_000);
    // Cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    });
  }
}

// ─── P2-UXA-007 FIX: SWR Stale Data Visual Indicator ───────────────────────
// Shows a subtle pulsing dot next to the KPI timestamp when serving cached data
// while revalidating in the background. Provides data freshness transparency.
// Standard: Nielsen #1 (System Status Visibility), FinTech Data Trust.

const STALE_INDICATOR_ID = 'nm-kpi-stale-dot';

/**
 * Show a visual indicator that data is being refreshed.
 * Call this from swrFetch's onStaleData callback.
 */
export function showStaleIndicator(): void {
  const el = document.getElementById('kpi-last-updated');
  if (!el) {
    return;
  }

  // Don't duplicate
  if (document.getElementById(STALE_INDICATOR_ID)) {
    return;
  }

  const dot = document.createElement('span');
  dot.id = STALE_INDICATOR_ID;
  dot.className = 'nm-stale-dot';
  dot.setAttribute('aria-label', t('kpi_refreshing', 'جاري تحديث البيانات...'));
  dot.title = t('kpi_refreshing', 'جاري تحديث البيانات...');
  el.appendChild(dot);
}

/**
 * Remove the stale data indicator.
 * Called automatically by markKPIFetched() when fresh data arrives.
 */
function hideStaleIndicator(): void {
  document.getElementById(STALE_INDICATOR_ID)?.remove();
}
