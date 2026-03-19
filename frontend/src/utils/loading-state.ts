/**
 * loading-state.ts — FRC-NEW-06 FIX: Reusable Button Loading State Utility
 *
 * Provides visual loading feedback on interactive buttons during async operations.
 * Replaces the button content with a spinner + customizable text, then restores
 * the original content when the async operation completes.
 *
 * Usage:
 *   const restore = setLoadingState(btn, 'Saving...');
 *   await someAsyncWork();
 *   restore();                  // restores original button content
 *   — OR —
 *   restore('success');         // shows success state briefly, then restores
 *
 * Standard: Material Design 3 (Determinate Feedback), Nielsen #1 (System Status Visibility).
 */

/**
 * Apply a loading spinner + text to a button, disabling it.
 * Returns a `restore` function to revert button to original state.
 *
 * @param btn   - The target button element
 * @param text  - Loading text to display (e.g., "Saving...")
 * @returns     - A function to call when loading completes.
 *                Optional param: 'success' flashes green check before restoring.
 */
export function setLoadingState(
    btn: HTMLButtonElement,
    text: string = 'Loading...'
): (outcome?: 'success' | 'error') => void {
    // Preserve original state
    const originalHTML = btn.innerHTML;
    const originalDisabled = btn.disabled;

    // DEF-UX-006 FIX: CSS custom property replaces inline style.minWidth.
    // Previous: btn.style.minWidth = `${rect.width}px` — violated P1-SST-001.
    // Standard: CSS Single Source of Truth, Custom Property-driven layout.
    const rect = btn.getBoundingClientRect();
    btn.style.setProperty('--nm-btn-lock-w', `${rect.width}px`);

    // Set loading state
    btn.disabled = true;
    btn.innerHTML = `
        <span class="inline-block size-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
        <span>${escapeForHTML(text)}</span>`;
    btn.setAttribute('aria-busy', 'true');

    // Return restore function
    return (outcome?: 'success' | 'error') => {
        btn.setAttribute('aria-busy', 'false');
        // DEF-UX-006 FIX: Clear CSS custom property on restore.
        btn.style.removeProperty('--nm-btn-lock-w');

        if (outcome === 'success') {
            // Brief success flash (600ms) before restoring
            btn.innerHTML = `
                <i class="ph ph-check-circle text-lg"  aria-hidden="true"></i>
                <span>✓</span>`;
            btn.classList.add('!bg-smoky-jade', '!text-white');
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.disabled = originalDisabled;
                btn.classList.remove('!bg-smoky-jade', '!text-white');
            }, 600);
        } else if (outcome === 'error') {
            // Brief error flash (800ms) before restoring
            btn.innerHTML = `
                <i class="ph ph-warning-circle text-lg"  aria-hidden="true"></i>
                <span>!</span>`;
            btn.classList.add('!bg-red-500', '!text-white');
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.disabled = originalDisabled;
                btn.classList.remove('!bg-red-500', '!text-white');
            }, 800);
        } else {
            btn.innerHTML = originalHTML;
            btn.disabled = originalDisabled;
        }
    };
}

/** Minimal HTML escaping for button text */
function escapeForHTML(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
