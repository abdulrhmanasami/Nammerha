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
 *
 * PLT-AUD5-001 FIX: Refactored to eliminate 3 governance violations:
 *   1. Replaced Tailwind !important bang-modifiers with CSS classes
 *   2. Replaced private escapeForHTML() with canonical escapeHtml() from xss.ts (DRY + safer)
 *   3. Added btn-loading class to consume --nm-btn-lock-w custom property
 */

import { escapeHtml } from './xss';

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

    // PLT-AUD5-001 FIX: CSS custom property drives min-width via .btn-loading class.
    // Previous: --nm-btn-lock-w was set but NO CSS rule consumed it — width-lock was broken.
    const rect = btn.getBoundingClientRect();
    btn.style.setProperty('--nm-btn-lock-w', `${rect.width}px`);
    btn.classList.add('btn-loading');

    // Set loading state
    btn.disabled = true;
    btn.innerHTML = `
        <span class="inline-block size-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
        <span>${escapeHtml(text)}</span>`;
    btn.setAttribute('aria-busy', 'true');

    // Return restore function
    return (outcome?: 'success' | 'error') => {
        btn.setAttribute('aria-busy', 'false');
        btn.classList.remove('btn-loading');
        btn.style.removeProperty('--nm-btn-lock-w');

        if (outcome === 'success') {
            // Brief success flash (600ms) before restoring
            btn.innerHTML = `
                <i class="ph ph-check-circle text-lg"  aria-hidden="true"></i>
                <span>✓</span>`;
            // PLT-AUD5-001 FIX: CSS class replaces Tailwind bang-modifiers
            // Previous: btn.classList.add('!bg-smoky-jade', '!text-white')
            btn.classList.add('nm-btn-success-flash');
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.disabled = originalDisabled;
                btn.classList.remove('nm-btn-success-flash');
            }, 600);
        } else if (outcome === 'error') {
            // Brief error flash (800ms) before restoring
            btn.innerHTML = `
                <i class="ph ph-warning-circle text-lg"  aria-hidden="true"></i>
                <span>!</span>`;
            // PLT-AUD5-001 FIX: CSS class replaces Tailwind bang-modifiers
            // Previous: btn.classList.add('!bg-red-500', '!text-white')
            btn.classList.add('nm-btn-error-flash');
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.disabled = originalDisabled;
                btn.classList.remove('nm-btn-error-flash');
            }, 800);
        } else {
            btn.innerHTML = originalHTML;
            btn.disabled = originalDisabled;
        }
    };
}
