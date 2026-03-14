// ============================================================================
// Nammerha Frontend — Locale Utility
// PLAT-AUD-005 FIX: Centralized locale detection to eliminate boilerplate
// duplication across 5+ dashboard pages.
// ============================================================================

/**
 * Returns the ICU locale string derived from the current page language.
 * Uses `document.documentElement.lang` which is set by the i18n engine on page load.
 *
 * Supported mappings:
 *   'ar' → 'ar-SY' (Syrian Arabic — Nammerha's primary locale)
 *   'tr' → 'tr-TR' (Turkish — for northern Syria communities)
 *   default → 'en-US'
 */
export function getLocale(): string {
    const lang = document.documentElement.lang || 'en';
    if (lang === 'ar') { return 'ar-SY'; }
    if (lang === 'tr') { return 'tr-TR'; }
    return 'en-US';
}

/**
 * Formats an ISO date string using the current page locale.
 * Returns '—' for empty, null, or invalid dates.
 */
export function formatDate(iso: string | null | undefined): string {
    if (!iso) { return '—'; }
    try {
        return new Date(iso).toLocaleDateString(getLocale(), {
            month: 'short', day: 'numeric', year: 'numeric',
        });
    } catch {
        return '—';
    }
}

/**
 * MED-003 FIX: formatCents re-exported from format.ts (single source of truth).
 * Previously had a local copy here with slightly different signature.
 * Backward-compatible: existing `import { formatCents } from '../utils/locale'` still works.
 */
export { formatCents } from './format';

/**
 * Re-applies the i18n engine to dynamically inserted DOM content.
 * Checks for the global `applyI18n` function injected by the i18n bridge.
 */
export function applyI18n(): void {
    if (typeof (window as unknown as Record<string, unknown>)['applyI18n'] === 'function') {
        ((window as unknown as Record<string, unknown>)['applyI18n'] as () => void)();
    }
}
