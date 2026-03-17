/**
 * Nammerha — Confirmation Dialog Utility (GAP-008 FIX)
 *
 * Destructive actions require user confirmation.
 * Nielsen Heuristic #5: "Ask users to confirm before committing
 * to an irreversible action."
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
 */
export function confirmAction(opts: ConfirmActionOptions): Promise<boolean> {
    return new Promise((resolve) => {
        // Remove any existing dialog
        document.querySelector('.confirm-dialog-backdrop')?.remove();

        const variant = opts.variant || 'danger';
        const cancelLabel = opts.cancelLabel || 'Cancel';
        const icon = opts.icon || (variant === 'danger' ? 'warning-circle' : 'info');

        // Build i18n attributes
        const i18nTitle = opts.i18n?.title ? ` data-i18n="${opts.i18n.title}"` : '';
        const i18nMsg = opts.i18n?.message ? ` data-i18n="${opts.i18n.message}"` : '';
        const i18nConfirm = opts.i18n?.confirm ? ` data-i18n="${opts.i18n.confirm}"` : '';
        const i18nCancel = opts.i18n?.cancel ? ` data-i18n="${opts.i18n.cancel}"` : '';

        const backdrop = document.createElement('div');
        backdrop.className = 'confirm-dialog-backdrop';
        backdrop.setAttribute('role', 'presentation');
        backdrop.innerHTML = `
            <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby="cd-msg">
                <div class="confirm-dialog-icon ${variant}">
                    <i class="ph ph-${icon}" aria-hidden="true"></i>
                </div>
                <h3 id="cd-title"${i18nTitle}>${opts.title}</h3>
                <p id="cd-msg"${i18nMsg}>${opts.message}</p>
                <div class="confirm-dialog-actions">
                    <button class="btn-cancel" id="cd-cancel"${i18nCancel}>${cancelLabel}</button>
                    <button class="btn-danger" id="cd-confirm"${i18nConfirm}>${opts.confirmLabel}</button>
                </div>
            </div>`;

        document.body.appendChild(backdrop);

        // Apply i18n if available
        if (typeof (window as unknown as Record<string, unknown>).applyI18n === 'function') {
            ((window as unknown as Record<string, unknown>).applyI18n as () => void)();
        }

        // Animate in
        requestAnimationFrame(() => {
            backdrop.classList.add('active');
        });

        // ── Event Handlers ────────────────────────────────────────────────
        function close(confirmed: boolean): void {
            backdrop.classList.remove('active');
            setTimeout(() => {
                backdrop.remove();
                if (confirmed) {
                    opts.onConfirm();
                } else {
                    opts.onCancel?.();
                }
                resolve(confirmed);
            }, 200); // Wait for CSS opacity transition
        }

        backdrop.querySelector('#cd-confirm')!.addEventListener('click', () => close(true));
        backdrop.querySelector('#cd-cancel')!.addEventListener('click', () => close(false));

        // Backdrop click = cancel
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                close(false);
            }
        });

        // Escape key = cancel
        const escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', escHandler);
                close(false);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Focus the cancel button by default (safer for destructive actions)
        (backdrop.querySelector('#cd-cancel') as HTMLElement)?.focus();
    });
}
