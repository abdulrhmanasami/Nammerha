// ============================================================================
// Nammerha — Hydration Signal Utility (GAP-2601 FIX)
// ============================================================================
// Signals to load-guard.js that the page's TypeScript module has loaded and
// data hydration is either complete or in progress. This cancels the 10-second
// timeout that would otherwise show the "Unable to load data" error banner.
//
// Usage:
//   import { signalHydrated } from '../utils/hydration';
//   // After initial data loads (or in catch block if API fails):
//   signalHydrated();
//
// Architecture:
//   - Sets `data-hydrated` attribute on <html> element
//   - load-guard.js MutationObserver detects this and cancels the timer
//   - Idempotent: safe to call multiple times
//   - Auto-signals after 8 seconds as fallback for pages that don't call manually
// ============================================================================

let _hydrated = false;

/**
 * Signal that the page module has completed initial hydration.
 * Call this after your primary API call(s) settle (success OR failure).
 */
export function signalHydrated(): void {
    if (_hydrated) { return; }
    _hydrated = true;
    document.documentElement.setAttribute('data-hydrated', 'true');
    clearTimeout(_autoTimer);
}

// GAP-2601-V3: Auto-hydration fallback timer.
// If no page module calls signalHydrated() within 8 seconds of this module
// being imported, signal automatically. This prevents the load-guard banner
// on pages that load data successfully but forgot to call signalHydrated().
// 8s < 10s (GUARD_TIMEOUT_MS) gives a 2s safety margin.
const _autoTimer = setTimeout(signalHydrated, 8_000);
