// ============================================================================
// Nammerha Frontend — Shared i18n Utility
// FIX-004: Single source of truth for the NammerhaI18n API type and t() helper.
// Previously duplicated across 5+ page files (auth.ts, verify-email.ts, etc.)
// ============================================================================

/**
 * Runtime i18n API exposed by the global `i18n.js` engine.
 * The engine attaches itself to `window.NammerhaI18n` on page load.
 */
export interface NammerhaI18nApi {
    switchLanguage: (code: string) => void;
    getCurrentLang: () => string;
    getSupportedLangs: () => Array<{ code: string; name: string; dir: string }>;
    t: (key: string, fallback?: string) => string;
}

declare global {
    interface Window {
        NammerhaI18n?: NammerhaI18nApi;
    }
}

/**
 * Safe i18n lookup — returns `fallback` if the i18n engine is not yet loaded.
 * This is safe to call at any point in the page lifecycle.
 *
 * @param key - The i18n dictionary key (e.g., 'wallet_status_locked')
 * @param fallback - English fallback text shown if key is missing or engine not loaded
 */
export function t(key: string, fallback: string): string {
    if (typeof window.NammerhaI18n?.t === 'function') {
        return window.NammerhaI18n.t(key, fallback) ?? fallback;
    }
    return fallback;
}

/**
 * P4-AUD-001 FIX: Shared RTL check — previously duplicated in profile.ts.
 * Checks both `dir` attribute and `lang` attribute
 * to cover all i18n engine configurations.
 */
export function isRTL(): boolean {
    return document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar';
}
