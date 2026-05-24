// ============================================================================
// Nammerha Frontend — Local Auto-Save SWR
// P1-UXA-009 FIX: Keystroke Amnesia Prevention
// Automatically saves <textarea> and critical <input> values to sessionStorage.
// Recovers them automatically if the user accidentally closes the tab or refreshes.
// ============================================================================

import { t } from './i18n';
import { showToast } from './toast';

const AUTOSAVE_PREFIX = 'nm_autosave_';

/**
 * Initializes global auto-save for forms.
 * Binds to all textareas that have an id or name attribute.
 */
export function initAutoSaveTextareas(): void {
    // Only run in browser environment
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Use event delegation for better performance and to handle dynamically added textareas
    document.body.addEventListener('input', (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && target.classList.contains('nm-autosave'))) {
            const el = target as HTMLTextAreaElement | HTMLInputElement;
            // We need a unique identifier for this field
            const key = el.id || el.name;
            if (!key) return;

            // Save to sessionStorage (isolated per tab, clears when tab closes normally)
            // But survives accidental refresh or navigation within the same tab.
            try {
                sessionStorage.setItem(`${AUTOSAVE_PREFIX}${key}`, el.value);
            } catch {
                // Ignore storage quota errors
            }
        }
    });

    // Recover on load
    recoverAutoSavedFields();
}

/**
 * Recovers fields on page load.
 */
export function recoverAutoSavedFields(): void {
    let recoveredCount = 0;
    
    document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>('textarea, input.nm-autosave').forEach((el) => {
        const key = el.id || el.name;
        if (!key) return;

        try {
            const savedValue = sessionStorage.getItem(`${AUTOSAVE_PREFIX}${key}`);
            if (savedValue && el.value !== savedValue) {
                // Only recover if the field is currently empty or hasn't been modified
                if (!el.value || el.value.trim() === '') {
                    el.value = savedValue;
                    recoveredCount++;
                    
                    // Dispatch input event so validation/frameworks know about the change
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        } catch {
            // Ignore
        }
    });

    if (recoveredCount > 0) {
        showToast(t('autosave_recovered', 'تم استعادة مسودة غير محفوظة.'), 'info');
    }
}

/**
 * Call this when a form is successfully submitted to clear the auto-saved data.
 */
export function clearAutoSave(formOrElementId: string): void {
    const el = document.getElementById(formOrElementId);
    if (!el) return;

    if (el.tagName === 'FORM') {
        el.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>('textarea, input.nm-autosave').forEach((field) => {
            const key = field.id || field.name;
            if (key) {
                sessionStorage.removeItem(`${AUTOSAVE_PREFIX}${key}`);
            }
        });
    } else {
        sessionStorage.removeItem(`${AUTOSAVE_PREFIX}${formOrElementId}`);
    }
}
