import '../styles/main.css';
import { auth } from '../api';
import { updatePasswordStrength } from '../utils/password-strength';
import { t } from '../utils/i18n';
import { showStructuredBanner, type StructuredBannerElements } from '../utils/banner';

// ============================================================================
// Nammerha — Reset Password Page
// PLT-AUD-002 FIX: Handles password reset flow from email link
// PLT-MAR11-005 FIX: Uses shared password strength utility (DRY)
// PLT-MAR11-006 FIX: Uses centralized API client (timeout + CSRF)
// PLT-MAR11-007 FIX: All user-facing strings wrapped with i18n t()
// FIX-004: i18n interface now from shared utils/i18n.ts
// ============================================================================

// ─── DOM References ─────────────────────────────────────────────────────────
const form = document.getElementById('form-reset') as HTMLFormElement | null;
const newPasswordInput = document.getElementById('new-password') as HTMLInputElement | null;
const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement | null;
const submitBtn = document.getElementById('reset-submit') as HTMLButtonElement | null;
const submitText = document.getElementById('reset-submit-text') as HTMLElement | null;
const banner = document.getElementById('reset-banner') as HTMLElement | null;
const bannerInner = document.getElementById('reset-banner-inner') as HTMLElement | null;
const bannerIcon = document.getElementById('reset-banner-icon') as HTMLElement | null;
const bannerText = document.getElementById('reset-banner-text') as HTMLElement | null;
const strengthBars = document.getElementById('pw-strength-bars')?.children;
const strengthLabel = document.getElementById('pw-strength-label');

// ─── Extract Token from URL ────────────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const resetToken = urlParams.get('token');

// If no token, show error immediately
if (!resetToken) {
    showBanner('error', t('reset_invalid_token', 'Invalid or missing reset token. Please request a new password reset link.'));
    // DEF-RESET-002 FIX: Replaced form.style.display = 'none' with class toggle.
    // Standard: DEF-VIS-001 precedent — CSS Single Source of Truth.
    if (form) { form.classList.add('hidden'); }
}

// ─── Form Validation ────────────────────────────────────────────────────────
function updateSubmitButton(): void {
    if (!submitBtn || !newPasswordInput || !confirmPasswordInput) { return; }
    const pw = newPasswordInput.value;
    const confirm = confirmPasswordInput.value;

    const isValid = pw.length >= 8
        && /[A-Z]/.test(pw)
        && /[a-z]/.test(pw)
        && /[0-9]/.test(pw)
        && /[^A-Za-z0-9]/.test(pw)
        && pw === confirm;

    submitBtn.disabled = !isValid;
}

newPasswordInput?.addEventListener('input', () => {
    // PLT-MAR11-005: Use shared utility (single source of truth)
    updatePasswordStrength(newPasswordInput.value, strengthBars, strengthLabel);
    updateSubmitButton();
});
confirmPasswordInput?.addEventListener('input', updateSubmitButton);

// ─── Password Toggle ────────────────────────────────────────────────────────
const toggle = document.getElementById('reset-toggle-pw');
if (toggle && newPasswordInput) {
    toggle.addEventListener('click', () => {
        const isPassword = newPasswordInput.type === 'password';
        newPasswordInput.type = isPassword ? 'text' : 'password';
        const toggleIcon = toggle.querySelector('.ph');
        if (toggleIcon) {
            toggleIcon.className = isPassword ? 'ph ph-eye-slash' : 'ph ph-eye';
        }
    });
}

// ─── Banner ─────────────────────────────────────────────────────────────────
// P2-AUD-002 FIX: Shared banner utility replaces local duplicate
const bannerElements: StructuredBannerElements = {
    banner, inner: bannerInner, icon: bannerIcon, text: bannerText,
};

function showBanner(type: 'error' | 'success', message: string): void {
    showStructuredBanner(bannerElements, type, message);
}

// ─── Form Submission ────────────────────────────────────────────────────────
let isSubmitting = false;

form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting || !resetToken) { return; }

    const newPassword = newPasswordInput?.value ?? '';
    const confirmPassword = confirmPasswordInput?.value ?? '';

    // PLT-MAR11-007 FIX: All user-facing strings wrapped with i18n t()
    if (newPassword !== confirmPassword) {
        showBanner('error', t('reset_password_mismatch', 'Passwords do not match.'));
        return;
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword)
        || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
        showBanner('error', t('reset_password_weak', 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character.'));
        return;
    }

    isSubmitting = true;
    // DEF-RESET-002 FIX: Replaced submitBtn.disabled with .btn-loading class.
    // Previous: disabled attribute removes button from tab order (WCAG 2.1.1 violation)
    // and shows no spinner. .btn-loading: pointer-events:none + spinner + opacity.
    // Standard: Design System Governance (auth.ts uses .btn-loading since DEF-A08 FIX).
    if (submitBtn) { submitBtn.classList.add('btn-loading'); }
    if (submitText) { submitText.textContent = t('reset_resetting', 'Resetting...'); }

    try {
        // PLT-MAR11-006 FIX: Use centralized API client instead of raw fetch.
        // Gains: 30s AbortController timeout, CSRF token, unified error handling.
        const data = await auth.resetPassword({ token: resetToken, new_password: newPassword });

        if (data.success) {
            showBanner('success', data.message ?? t('reset_success', 'Password reset successfully! Redirecting to sign in...'));
            // DEF-RESET-002 FIX: Hide form via class toggle.
            if (form) { form.classList.add('hidden'); }
            setTimeout(() => {
                window.location.href = '/auth.html';
            }, 2000);
        } else {
            showBanner('error', data.error ?? t('reset_failed', 'Password reset failed. The token may have expired.'));
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : t('reset_network_error', 'Network error. Please try again.');
        if (message.includes('timeout') || message.includes('abort')) {
            showBanner('error', t('reset_timeout', 'Request timed out — please check your network connection and try again.'));
        } else {
            showBanner('error', message);
        }
    } finally {
        isSubmitting = false;
        if (submitBtn) { submitBtn.classList.remove('btn-loading'); }
        if (submitText) { submitText.textContent = t('reset_submit_btn', 'Reset Password'); }
    }
});
