import { addTrackedTimer } from './tracked-timers';

// ============================================================================
// Nammerha — P1-006: Scroll-to-Field Utility
// ============================================================================
// Shared utility for scrolling to and highlighting invalid form fields.
//
// Problem: `.focus()` alone does NOT reliably scroll on mobile browsers
// (iOS Safari, Samsung Internet). When forms have off-screen fields
// (e.g. auth wizard step navigation, long profile forms), the user
// sees the error banner but not the failing field.
//
// Solution: `scrollToField()` performs a 3-step sequence:
//   1. scrollIntoView({ behavior: 'smooth', block: 'center' })
//   2. focus({ preventScroll: true }) — avoids double-scroll jank
//   3. Adds .nm-field-highlight CSS class — brief flash animation
//
// Standards:
//   - WCAG 3.3.1 (Error Identification): Field must be visible + focused
//   - WCAG 3.3.3 (Error Suggestion): Scroll ensures context is visible
//   - Apple HIG (Forms): "Scroll to the first field that needs attention"
//   - Material Design 3: "Auto-scroll to the first error in the form"
// ============================================================================

/**
 * Scroll to a form field, focus it, and apply a brief highlight animation.
 *
 * Designed as a drop-in replacement for `field?.focus()` in validation flows.
 *
 * @param field - The HTMLElement to scroll to and focus (typically an input/textarea)
 * @param options - Optional configuration
 * @param options.block - ScrollIntoView block alignment (default: 'center')
 * @param options.highlight - Whether to apply the flash highlight class (default: true)
 * @param options.delay - Delay before focusing, in ms (default: 300 — lets scroll settle)
 */
export function scrollToField(
    field: HTMLElement | null | undefined,
    options?: {
        block?: ScrollLogicalPosition;
        highlight?: boolean;
        delay?: number;
    },
): void {
    if (!field) { return; }

    const {
        block = 'center',
        highlight = true,
        delay = 300,
    } = options ?? {};

    // Step 1: Scroll the field into the viewport center.
    // `block: 'center'` ensures context above AND below is visible,
    // which is critical for multi-step wizard forms where the error banner
    // is above the field.
    field.scrollIntoView({ behavior: 'smooth', block });

    // Step 2: Focus after scroll animation settles.
    // `preventScroll: true` avoids the browser's native focus-scroll
    // fighting with our smooth scrollIntoView.
    addTrackedTimer(setTimeout(() => {
        field.focus({ preventScroll: true });

        // Step 3: Highlight flash — brief visual cue that THIS is the problem field.
        // The CSS animation auto-removes after 1.5s via animationend listener.
        if (highlight) {
            // Remove any previous highlight (in case of rapid re-validation)
            field.classList.remove('nm-field-highlight');
            // Force reflow to restart animation if class was just removed
            void field.offsetWidth;
            field.classList.add('nm-field-highlight');

            field.addEventListener('animationend', () => {
                field.classList.remove('nm-field-highlight');
            }, { once: true });
        }
    }, delay));
}
