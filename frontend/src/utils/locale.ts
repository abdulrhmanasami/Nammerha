// ============================================================================
// Nammerha Frontend — Locale Utility
// PLAT-AUD-005 FIX: Centralized locale detection to eliminate boilerplate
// duplication across 5+ dashboard pages.
// ============================================================================
// TICK-033: Import shared type-safe i18n apply utility.
import { tryApplyI18n } from './i18n-apply';

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
    // LOCALE-001: Default to Arabic — Nammerha's primary audience is Syrian.
    const lang = document.documentElement.lang || 'ar';
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
        /* Intentional: Invalid ISO string → show em-dash fallback.
           Date constructor may throw on malformed input from API. */
        return '—';
    }
}

/**
 * Formats an ISO date string with date AND time using the current page locale.
 * P1-001 FIX: Deduplication — replaces local formatDate copies in
 * donor-proof.ts and wallet.ts that included hour/minute formatting.
 * Returns '—' for empty, null, or invalid dates.
 */
export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) { return '—'; }
    try {
        return new Date(iso).toLocaleString(getLocale(), {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        /* Intentional: Invalid ISO string → show em-dash fallback.
           Date constructor may throw on malformed input from API. */
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
    // TICK-033: Use shared type-safe tryApplyI18n() instead of unsafe window cast.
    tryApplyI18n();
}
