// ============================================================================
// Nammerha — Lightweight <dialog> Polyfill
// SYS-004 FIX: Dialog support for older Android WebViews in Syria.
// ============================================================================
// CONTEXT: Syria's mobile device landscape includes older Android phones
// (KitKat 4.4 — Marshmallow 6.0) running embedded WebViews, plus UC Browser
// and Samsung Internet 12 — all of which may lack native <dialog> support.
//
// STRATEGY: Instead of importing dialog-polyfill (15KB), this module provides
// a zero-dependency micro-polyfill (~2KB) that:
//   1. Feature-detects HTMLDialogElement.prototype.showModal
//   2. If missing, patches newly created <dialog> elements with:
//      - showModal(): visibility, backdrop overlay, Escape handler, inert siblings
//      - close(): cleanup, fire 'close' event
//      - .open getter/setter
//   3. Injects ::backdrop CSS fallback as a real <div> overlay (once)
//
// USAGE: Call polyfillDialog(dialog) BEFORE dialog.showModal().
//   import { polyfillDialog } from '../utils/dialog-polyfill';
//   const dialog = document.createElement('dialog');
//   polyfillDialog(dialog);
//   dialog.showModal();
//
// STANDARD: WHATWG HTML Living Standard (dialog element),
//           Progressive Enhancement, Syria Sustainable UX.
// ============================================================================

/** Whether the current browser natively supports <dialog>.showModal() */
const hasNativeDialog: boolean = typeof HTMLDialogElement !== 'undefined'
    && typeof HTMLDialogElement.prototype.showModal === 'function';

/** Whether we've injected the fallback backdrop CSS */
let cssInjected = false;

/**
 * Inject the backdrop CSS fallback exactly once.
 * Uses a real <div> since ::backdrop is not available without native <dialog>.
 */
function injectBackdropCSS(): void {
    if (cssInjected) { return; }
    cssInjected = true;

    const style = document.createElement('style');
    style.textContent = `
        /* SYS-004: Dialog polyfill backdrop */
        .nm-dialog-polyfill-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9998;
            -webkit-backdrop-filter: blur(2px);
            backdrop-filter: blur(2px);
        }
        /* Polyfill: dialog element styled as modal */
        dialog[data-nm-polyfilled] {
            position: fixed;
            inset-inline-start: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            z-index: 9999;
            margin: 0;
            border: none;
            padding: 0;
            max-width: min(90vw, 420px);
            max-height: 85vh;
            overflow: auto;
            background: transparent;
        }
        /* Ensure polyfilled dialog is hidden by default */
        dialog[data-nm-polyfilled]:not([open]) {
            display: none;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Polyfill a <dialog> element if native support is missing.
 * Safe to call on any dialog — no-ops if native support exists.
 *
 * @param dialog - The HTMLDialogElement (or Element cast as one) to polyfill.
 */
export function polyfillDialog(dialog: HTMLDialogElement): void {
    // ── Native support available — no polyfill needed ──
    if (hasNativeDialog) { return; }

    // ── Already polyfilled — skip ──
    if (dialog.hasAttribute('data-nm-polyfilled')) { return; }

    // Mark as polyfilled
    dialog.setAttribute('data-nm-polyfilled', '');
    injectBackdropCSS();

    // ── Internal state ──
    let isOpen = false;
    let backdropEl: HTMLDivElement | null = null;
    let escapeHandler: ((e: KeyboardEvent) => void) | null = null;

    // ── Define .open property ──
    Object.defineProperty(dialog, 'open', {
        get: () => isOpen,
        set: (val: boolean) => {
            isOpen = val;
            if (val) {
                dialog.setAttribute('open', '');
            } else {
                dialog.removeAttribute('open');
            }
        },
        configurable: true,
    });

    // ── showModal() ──
    (dialog as unknown as Record<string, unknown>).showModal = function showModal(): void {
        if (isOpen) { return; }
        isOpen = true;
        dialog.setAttribute('open', '');

        // Create backdrop overlay
        backdropEl = document.createElement('div');
        backdropEl.className = 'nm-dialog-polyfill-backdrop';
        backdropEl.addEventListener('click', () => {
            // Simulate backdrop click → dispatch click on dialog itself
            // (matches native behavior where clicking ::backdrop fires click on <dialog>)
            dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        document.body.appendChild(backdropEl);

        // Show dialog
        dialog.style.display = '';

        // Escape key handler
        escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                // Native <dialog> fires 'cancel' event on Escape
                const cancelEvent = new Event('cancel', { cancelable: true });
                const cancelled = !dialog.dispatchEvent(cancelEvent);
                if (!cancelled) {
                    // Call close via the polyfilled method reference
                    const closeFn = (dialog as unknown as Record<string, (...args: unknown[]) => void>).close;
                    if (typeof closeFn === 'function') { closeFn(); }
                }
            }
        };
        document.addEventListener('keydown', escapeHandler);

        // Focus first focusable element
        const focusable = dialog.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // P2-A11y FIX: Modal Focus Leakage Prevention
        // Make the main app inert so screen readers and keyboards are 
        // strictly trapped inside the polyfilled dialog.
        const appMain = document.getElementById('app') || document.querySelector('main');
        if (appMain) {
            appMain.setAttribute('inert', '');
        }
    };

    // ── close() ──
    (dialog as unknown as Record<string, unknown>).close = function close(returnValue?: string): void {
        if (!isOpen) { return; }
        isOpen = false;
        dialog.removeAttribute('open');

        // Store return value (native dialog spec)
        if (returnValue !== undefined) {
            (dialog as unknown as Record<string, string>).returnValue = returnValue;
        }

        // Remove backdrop
        backdropEl?.remove();
        backdropEl = null;

        // Remove Escape handler
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
            escapeHandler = null;
        }

        // Restore body scroll
        document.body.style.overflow = '';

        // P2-A11y FIX: Modal Focus Leakage Prevention
        // Remove inert from the main app when dialog closes.
        const appMain = document.getElementById('app') || document.querySelector('main');
        if (appMain) {
            appMain.removeAttribute('inert');
        }

        // Fire 'close' event (matches native behavior)
        dialog.dispatchEvent(new Event('close'));
    };
}

/**
 * Create a dialog element and polyfill it if needed.
 * Drop-in replacement for document.createElement('dialog').
 */
export function createDialog(): HTMLDialogElement {
    const dialog = document.createElement('dialog') as HTMLDialogElement;
    polyfillDialog(dialog);
    return dialog;
}
