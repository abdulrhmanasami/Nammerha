// ============================================================================
// Nammerha Frontend — Shared i18n Bridge Utility
// PLT-AUD5-002 FIX: DRY + Type Safety for window.applyI18n / NammerhaI18n
// Previous: auth-guard.ts L63 and skeleton-guard.ts L47 both duplicated
// unsafe `(window as unknown as Record<string, unknown>)` chains.
// Now: Single source of truth with proper type guards.
// Standard: P1-SST-001 governance, TypeScript strict mode, DRY Principle.
// ============================================================================

/**
 * Extended Window interface for Nammerha's i18n runtime bindings.
 * These are injected by the i18n engine at runtime — may not exist
 * if the engine hasn't loaded yet or is disabled.
 */
interface NammerhaWindow {
    applyI18n?: () => void;
    NammerhaI18n?: {
        t?: (key: string) => string;
    };
}

/**
 * Apply i18n translations to the current DOM if the engine is loaded.
 * Safe to call at any time — gracefully no-ops if the engine is absent.
 */
export function tryApplyI18n(): void {
    const w = window as unknown as NammerhaWindow;
    if (typeof w.applyI18n === 'function') {
        w.applyI18n();
    }
}

/**
 * Attempt to translate a key using the i18n engine.
 * Returns the translated string, or the fallback if the engine is absent.
 *
 * @param key      - i18n dictionary key
 * @param fallback - Fallback string if translation is unavailable
 */
export function tryTranslate(key: string, fallback: string): string {
    const w = window as unknown as NammerhaWindow;
    return w.NammerhaI18n?.t?.(key) ?? fallback;
}
