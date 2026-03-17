/**
 * Nammerha — Confirmation Dialog Utility
 * ═══════════════════════════════════════════════════════════════════
 * CON-AUD-01 FIX: Migrated from div-based System A (.confirm-dialog-backdrop)
 * to native <dialog> System B (.nm-confirm-dialog).
 *
 * Previous (GAP-008): Built a custom div-based dialog with manual z-index,
 * manual .active class toggling, and manual backdrop rendering.
 * Problem: Two competing dialog systems existed — div-based (this file) and
 * native <dialog> (wallet.html, donor-basket.html). Mixing both leads to
 * unpredictable z-index layering and inconsistent UX.
 *
 * Now: Single dialog system using native HTML <dialog> element.
 * Benefits:
 *   - Native browser focus trapping (no JS focus trap needed)
 *   - Native ::backdrop pseudo-element (no manual overlay div)
 *   - Correct stacking context via top-layer API (above ALL z-indices)
 *   - Accessible by default (role="dialog", aria-modal via showModal())
 *   - Escape key closes automatically (no manual keydown handler)
 *
 * Standard: WHATWG HTML — <dialog> element.
 *           Nielsen Heuristic #5 — "Confirm before irreversible actions."
 *           Apple HIG — "Use alerts for destructive actions."
 *
 * Usage:
 *   import { confirmAction } from '../utils/confirm-action';
 *   confirmAction({
 *       title: 'Sign Out',
 *       message: 'Are you sure you want to sign out?',
 *       confirmLabel: 'Sign Out',
 *       icon: 'sign-out',
 *       variant: 'danger',
 *       i18n: { title: 'confirm_sign_out', message: 'confirm_sign_out_msg',
 *               confirm: 'sign_out', cancel: 'common_cancel' },
 *       onConfirm: () => { performSignOut(); }
 *   });
 */

interface ConfirmActionOptions {
    /** Dialog title text */
    title: string;
    /** Dialog message text */
    message: string;
    /** Confirm button label */
    confirmLabel: string;
    /** Cancel button label (default: "Cancel") */
    cancelLabel?: string;
    /** Phosphor icon name (without ph- prefix) */
    icon?: string;
    /** Visual variant: 'danger' or 'warning' */
    variant?: 'danger' | 'warning';
    /** i18n keys for auto-translation */
    i18n?: {
        title?: string;
        message?: string;
        confirm?: string;
        cancel?: string;
    };
    /** Callback on confirmation */
    onConfirm: () => void;
    /** Optional callback on cancel */
    onCancel?: () => void;
}

/**
 * Shows a confirmation dialog for destructive/irreversible actions.
 * Returns a Promise that resolves true if confirmed, false if cancelled.
 *
 * Uses the native HTML <dialog> element (System B) as the single
 * platform-wide dialog standard.
 */
export function confirmAction(opts: ConfirmActionOptions): Promise<boolean> {
    return new Promise((resolve) => {
        // Remove any existing programmatic dialog
        document.getElementById('nm-confirm-programmatic')?.remove();

        const variant = opts.variant || 'danger';
        const cancelLabel = opts.cancelLabel || 'Cancel';
        const icon = opts.icon || (variant === 'danger' ? 'warning-circle' : 'info');

        // Build i18n attributes
        const i18nTitle = opts.i18n?.title ? ` data-i18n="${opts.i18n.title}"` : '';
        const i18nMsg = opts.i18n?.message ? ` data-i18n="${opts.i18n.message}"` : '';
        const i18nConfirm = opts.i18n?.confirm ? ` data-i18n="${opts.i18n.confirm}"` : '';
        const i18nCancel = opts.i18n?.cancel ? ` data-i18n="${opts.i18n.cancel}"` : '';

        // ── Build native <dialog> element ──────────────────────────────────
        const dialog = document.createElement('dialog');
        dialog.id = 'nm-confirm-programmatic';
        dialog.className = 'nm-confirm-dialog';

        // Determine destructive button class
        const actionClass = variant === 'danger' ? 'nm-confirm-destructive' : 'nm-confirm-destructive';

        dialog.innerHTML = `
            <div class="nm-confirm-body">
                <div class="size-14 rounded-full ${variant === 'danger' ? 'bg-red-50' : 'bg-amber-50'} flex items-center justify-center mx-auto mb-3">
                    <i class="ph ph-${icon} ${variant === 'danger' ? 'text-red-500' : 'text-amber-500'}" style="font-size:28px" aria-hidden="true"></i>
                </div>
                <h3${i18nTitle}>${opts.title}</h3>
                <p${i18nMsg}>${opts.message}</p>
            </div>
            <div class="nm-confirm-actions">
                <button type="button" class="nm-confirm-cancel" id="cd-cancel"${i18nCancel}>${cancelLabel}</button>
                <button type="button" class="${actionClass}" id="cd-confirm"${i18nConfirm}>${opts.confirmLabel}</button>
            </div>`;

        document.body.appendChild(dialog);

        // Apply i18n if available
        if (typeof (window as unknown as Record<string, unknown>).applyI18n === 'function') {
            ((window as unknown as Record<string, unknown>).applyI18n as () => void)();
        }

        // ── Event Handlers ────────────────────────────────────────────────
        function close(confirmed: boolean): void {
            dialog.close();
            dialog.remove();
            if (confirmed) {
                opts.onConfirm();
            } else {
                opts.onCancel?.();
            }
            resolve(confirmed);
        }

        dialog.querySelector('#cd-confirm')!.addEventListener('click', () => close(true));
        dialog.querySelector('#cd-cancel')!.addEventListener('click', () => close(false));

        // Native <dialog> fires 'cancel' on Escape key — handle it
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            close(false);
        });

        // Backdrop click = cancel (click on <dialog> itself, not its children)
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                close(false);
            }
        });

        // ── Show dialog modally ────────────────────────────────────────────
        dialog.showModal();

        // Focus the cancel button by default (safer for destructive actions)
        (dialog.querySelector('#cd-cancel') as HTMLElement)?.focus();
    });
}
