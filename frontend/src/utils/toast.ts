// ============================================================================
// Nammerha — Global Toast Notification System
// P2-DS-003 FIX: Consistent snackbar/toast for success, error, info, warning
// PLT-UX-AUD-HF: Haptic feedback integration for native-app feel.
// ============================================================================

import { haptic } from './haptic';
import { tryTranslate } from './i18n-apply';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
    duration?: number;
    dismissable?: boolean;
    /** P0-UXA-003: Optional action button (e.g., "Undo") for reversible operations. */
    action?: {
        label: string;
        onClick: () => void;
    };
}

const TOAST_ICONS: Record<ToastType, string> = {
    success: 'ph ph-check-circle',
    error:   'ph ph-warning-circle',
    info:    'ph ph-info',
    warning: 'ph ph-warning',
};

const MAX_VISIBLE = 3;
const activeToasts: HTMLElement[] = [];
let container: HTMLElement | null = null;

/* PLT-UX-AUD-HF: Map toast type → haptic intensity.
   success/info = light (subtle confirmation)
   error/warning = medium (attention-grabbing)
   Standard: Apple HIG — "Use haptics to complement visual feedback." */
type HapticKey = 'light' | 'medium' | 'heavy' | 'success';
const TOAST_HAPTIC: Record<ToastType, HapticKey> = {
    success: 'success',
    error:   'medium',
    info:    'light',
    warning: 'medium',
};

function ensureContainer(): HTMLElement {
    if (container && document.body.contains(container)) {
        return container;
    }
    container = document.createElement('div');
    container.id = 'nm-toast-container';
    container.setAttribute('aria-live', 'polite');
    // PLT-UX-AUD P3-A11Y-001 FIX: aria-atomic="true" — each toast is a complete
    // atomic announcement. Previous "false" caused screen readers to read partial updates.
    // Standard: WCAG 4.1.3 (Status Messages), WAI-ARIA Authoring Practices.
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
    return container;
}

// P3-006 FIX: Use shared type-safe tryTranslate instead of unsafe double-cast
function resolveMessage(message: string): string {
    return tryTranslate(message, message);
}

function removeToast(el: HTMLElement): void {
    el.classList.add('nm-toast-exit');
    el.addEventListener('transitionend', () => {
        el.remove();
        const idx = activeToasts.indexOf(el);
        if (idx !== -1) {
            activeToasts.splice(idx, 1);
        }
    }, { once: true });
}

/**
 * Show a toast notification.
 * @param message - Raw text or i18n key
 * @param type - success | error | info | warning
 * @param options - { duration, dismissable }
 */
export function showToast(
    message: string,
    type: ToastType = 'info',
    options: ToastOptions = {}
): void {
    const { duration = 4000, dismissable = true } = options;
    const parent = ensureContainer();

    while (activeToasts.length >= MAX_VISIBLE) {
        const oldest = activeToasts.shift();
        if (oldest) {
            removeToast(oldest);
        }
    }

    const el = document.createElement('div');
    el.className = `nm-toast nm-toast-${type}`;
    el.setAttribute('role', 'status');

    const icon = document.createElement('i');
    icon.className = TOAST_ICONS[type];
    icon.setAttribute('aria-hidden', 'true');
    el.appendChild(icon);

    const text = document.createElement('span');
    text.className = 'nm-toast-msg';
    text.textContent = resolveMessage(message);
    el.appendChild(text);

    if (dismissable) {
        const btn = document.createElement('button');
        btn.className = 'nm-toast-close';
        // HIGH-UX-003 FIX: i18n for screen reader — was hardcoded English 'Dismiss'.
        // Arabic screen reader users heard English in an otherwise Arabic interface.
        // Standard: WCAG 4.1.2 (Name, Role, Value), Nielsen #4 (Consistency).
        btn.setAttribute('aria-label', resolveMessage('common_dismiss') || 'Dismiss');
        btn.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>';
        btn.addEventListener('click', () => removeToast(el));
        el.appendChild(btn);
    }

    // P0-UXA-003: Action button support for undo/reversible operations
    if (options.action) {
        const actionBtn = document.createElement('button');
        actionBtn.className = 'nm-toast-action';
        actionBtn.textContent = options.action.label;
        actionBtn.addEventListener('click', () => {
            options.action!.onClick();
            removeToast(el);
        });
        // Insert before close button if present
        const closeBtn = el.querySelector('.nm-toast-close');
        if (closeBtn) {
            el.insertBefore(actionBtn, closeBtn);
        } else {
            el.appendChild(actionBtn);
        }
    }

    parent.appendChild(el);
    activeToasts.push(el);

    // Force reflow then trigger enter animation
    void el.offsetHeight;
    el.classList.add('nm-toast-enter');

    // PLT-UX-AUD-HF: Trigger haptic feedback for native-app feel
    const hapticFn = haptic[TOAST_HAPTIC[type]];
    if (hapticFn) {
        hapticFn();
    }

    if (duration > 0) {
        setTimeout(() => removeToast(el), duration);
    }
}
