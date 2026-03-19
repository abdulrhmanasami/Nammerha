// ============================================================================
// Nammerha — Global Toast Notification System
// P2-DS-003 FIX: Consistent snackbar/toast for success, error, info, warning
// PLT-UX-AUD-HF: Haptic feedback integration for native-app feel.
// ============================================================================

import { haptic } from './haptic';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
    duration?: number;
    dismissable?: boolean;
}

interface NammerhaI18nAPI {
    t: (key: string) => string;
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
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
    return container;
}

function resolveMessage(message: string): string {
    const i18n = (window as unknown as Record<string, unknown>).NammerhaI18n as NammerhaI18nAPI | undefined;
    if (i18n?.t) {
        const translated = i18n.t(message);
        if (translated && translated !== message) {
            return translated;
        }
    }
    return message;
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
        btn.setAttribute('aria-label', 'Dismiss');
        btn.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>';
        btn.addEventListener('click', () => removeToast(el));
        el.appendChild(btn);
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
