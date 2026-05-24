import { showToast } from './toast';
import { t } from './i18n';
import { scrollToField } from './scroll-to-field';

/**
 * Platinum UX: Rage-Tap Interception & Self-Healing UI
 * Detects when a user repeatedly taps a disabled button out of frustration.
 * Instead of ignoring them silently, it identifies *why* the button is disabled
 * (e.g., missing required fields in the parent form) and guides them there.
 */
export function initRageTapInterception(): void {
    const TAP_THRESHOLD = 3;
    const TIME_WINDOW_MS = 2000;
    
    let tapCount = 0;
    let lastTapTime = 0;
    let currentTarget: HTMLElement | null = null;

    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest('button, [role="button"]') as HTMLButtonElement | HTMLElement;
        
        if (!button) return;

        const isDisabled = button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true' || button.classList.contains('cursor-not-allowed');
        
        if (!isDisabled) {
            tapCount = 0;
            return;
        }

        // We intercepted a click on a disabled button. The browser normally suppresses click events
        // on truly disabled buttons, but pointer-events: none / aria-disabled / wrappers might trigger this.
        // Actually, if it's truly <button disabled>, the click event might not bubble. 
        // We capture it at the document level via pointerdown to bypass disabled button suppression.
    });

    // Use pointerdown to catch clicks on truly disabled elements (which swallow click events)
    document.addEventListener('pointerdown', (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest('button, [role="button"], .cursor-not-allowed') as HTMLButtonElement | HTMLElement;
        
        if (!button) return;

        const isDisabled = (button as HTMLButtonElement).disabled || 
                           button.getAttribute('aria-disabled') === 'true' || 
                           button.classList.contains('cursor-not-allowed') ||
                           button.classList.contains('opacity-40');
                           
        if (!isDisabled) {
            tapCount = 0;
            return;
        }

        const now = Date.now();
        if (target === currentTarget && now - lastTapTime < TIME_WINDOW_MS) {
            tapCount++;
        } else {
            tapCount = 1;
            currentTarget = target;
        }
        
        lastTapTime = now;

        if (tapCount >= TAP_THRESHOLD) {
            tapCount = 0; // reset
            handleRageTap(button);
        }
    }, { capture: true });
}

function handleRageTap(button: HTMLElement): void {
    // 1. Find parent form
    const form = button.closest('form');
    if (!form) {
        showToast(t('ux_button_disabled_reason', 'هذا الزر غير مفعل حالياً بسبب شروط غير مكتملة.'), 'info');
        return;
    }

    // 2. Find first invalid required field
    const invalidField = form.querySelector(':invalid, [aria-invalid="true"], input[required]:placeholder-shown, textarea[required]:placeholder-shown') as HTMLElement;
    
    if (invalidField) {
        showToast(t('ux_missing_field', 'يرجى إكمال هذا الحقل لتتمكن من المتابعة'), 'warning');
        scrollToField(invalidField);
        invalidField.focus();
    } else {
        showToast(t('ux_button_disabled_reason', 'هذا الزر غير مفعل حالياً بسبب شروط غير مكتملة.'), 'info');
    }
}
