// ============================================================================
// Nammerha Frontend — Form Draft Persistence Utility
// ============================================================================
// P0-UX-004 FIX: Auto-save form data to prevent loss on network failure.
//
// On Syria's 2G/3G networks, form submissions can fail silently. Users who
// spent 10+ minutes filling a damage report lose ALL data. This utility
// provides debounced auto-save to sessionStorage with restore-on-load.
//
// Pattern: sessionStorage (tab-scoped) — prevents cross-tab interference.
// Debounce: 500ms — balances storage writes vs responsiveness.
// ============================================================================

/**
 * Debounce timer handle — module-scoped to prevent memory leaks.
 */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Saves form data to sessionStorage with debouncing.
 * @param key Unique identifier for this form (e.g., 'sr_draft', 'report_draft')
 * @param data Serializable form data object
 * @param debounceMs Debounce delay in milliseconds (default: 500ms)
 */
export function saveDraft<T extends Record<string, unknown>>(
    key: string,
    data: T,
    debounceMs = 500,
): void {
    // Clear previous debounce timer
    const existing = timers.get(key);
    if (existing) { clearTimeout(existing); }

    timers.set(key, setTimeout(() => {
        try {
            sessionStorage.setItem(`nm_draft_${key}`, JSON.stringify({
                data,
                savedAt: Date.now(),
            }));
        } catch {
            // sessionStorage full or unavailable — silent degradation
        }
    }, debounceMs));
}

/**
 * Loads a saved draft from sessionStorage.
 * Returns null if no draft exists or if the draft is older than maxAgeMs.
 *
 * @param key Unique identifier matching the saveDraft() call
 * @param maxAgeMs Maximum draft age in ms (default: 30 minutes)
 * @returns The saved data or null
 */
export function loadDraft<T extends Record<string, unknown>>(
    key: string,
    maxAgeMs = 30 * 60 * 1000,
): T | null {
    try {
        const raw = sessionStorage.getItem(`nm_draft_${key}`);
        if (!raw) { return null; }

        const parsed = JSON.parse(raw) as { data: T; savedAt: number };

        // Expire stale drafts
        if (Date.now() - parsed.savedAt > maxAgeMs) {
            sessionStorage.removeItem(`nm_draft_${key}`);
            return null;
        }

        return parsed.data;
    } catch {
        return null;
    }
}

/**
 * Checks if a draft exists for the given key.
 */
export function hasDraft(key: string): boolean {
    return loadDraft(key) !== null;
}

/**
 * Clears a saved draft after successful submission.
 * @param key Unique identifier matching the saveDraft() call
 */
export function clearDraft(key: string): void {
    try {
        sessionStorage.removeItem(`nm_draft_${key}`);
        const timer = timers.get(key);
        if (timer) {
            clearTimeout(timer);
            timers.delete(key);
        }
    } catch { /* sessionStorage unavailable */ }
}
