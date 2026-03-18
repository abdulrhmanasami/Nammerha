/* ============================================================================
   PLT-UX-AUD-KB: Virtual Keyboard Viewport Management
   Problem: On mobile, when the virtual keyboard opens, fixed elements
   (bottom nav, toast) remain at their CSS position — overlapping the keyboard
   and reducing visible content area. This is the #1 giveaway of a web app.
   Solution: Listen to visualViewport.resize events, detect keyboard open/close,
   and toggle .keyboard-visible on <html> for CSS hooks.
   Standard: Visual Viewport API (Chrome 61+, Safari 13+), Apple HIG.
   ============================================================================ */

const KEYBOARD_THRESHOLD = 150; // px — keyboard must be at least this tall

/**
 * Initializes keyboard-aware viewport management.
 * Adds/removes `.keyboard-visible` class on <html> when virtual keyboard opens/closes.
 * CSS can then use:
 *   .keyboard-visible .nm-bottom-nav { display: none; }
 *   .keyboard-visible #nm-toast-container { bottom: 1rem; }
 */
export function initKeyboardViewport(): void {
    // Feature detection — visualViewport is not available in all browsers
    if (typeof window === 'undefined' || !window.visualViewport) {
        return;
    }

    const vv = window.visualViewport;

    const handleResize = (): void => {
        const currentHeight = vv.height;
        const heightDiff = window.innerHeight - currentHeight;

        if (heightDiff > KEYBOARD_THRESHOLD) {
            // Keyboard is open
            document.documentElement.classList.add('keyboard-visible');
        } else {
            // Keyboard is closed
            document.documentElement.classList.remove('keyboard-visible');
        }
    };

    // Use 'resize' event on visualViewport — fires when keyboard opens/closes
    // Passive: true — this handler doesn't call preventDefault()
    vv.addEventListener('resize', handleResize, { passive: true });
}
