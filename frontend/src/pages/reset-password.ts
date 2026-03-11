import '../styles/main.css';

// ============================================================================
// Nammerha — Reset Password Page
// PLT-AUD-002 FIX: Handles password reset flow from email link
// ============================================================================

const API_BASE = '/api';

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
    showBanner('error', 'Invalid or missing reset token. Please request a new password reset link.');
    if (form) { form.style.display = 'none'; }
}

// ─── Password Strength ─────────────────────────────────────────────────────
function updatePasswordStrength(password: string): number {
    let score = 0;
    if (password.length >= 8) { score++; }
    if (/[A-Z]/.test(password)) { score++; }
    if (/[0-9]/.test(password)) { score++; }
    if (/[^A-Za-z0-9]/.test(password)) { score++; }

    const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400'];
    const labels: Array<{ text: string; i18nKey: string }> = [
        { text: 'Weak', i18nKey: 'pw_strength_weak' },
        { text: 'Fair', i18nKey: 'pw_strength_fair' },
        { text: 'Good', i18nKey: 'pw_strength_good' },
        { text: 'Strong', i18nKey: 'pw_strength_strong' },
    ];

    if (strengthBars) {
        for (let i = 0; i < strengthBars.length; i++) {
            const bar = strengthBars[i] as HTMLElement;
            if (i < score) {
                bar.className = `h-1 flex-1 rounded-full ${colors[score - 1]}`;
            } else {
                bar.className = 'h-1 flex-1 rounded-full bg-slate-200';
            }
        }
    }

    if (strengthLabel && password.length > 0) {
        const label = labels[score - 1];
        if (label) {
            strengthLabel.textContent = label.text;
            strengthLabel.setAttribute('data-i18n', label.i18nKey);
        } else {
            strengthLabel.textContent = 'Too short';
            strengthLabel.setAttribute('data-i18n', 'pw_strength_too_short');
        }
    } else if (strengthLabel) {
        strengthLabel.textContent = '8+ chars, 1 uppercase, 1 number, 1 special';
        strengthLabel.setAttribute('data-i18n', 'pw_requirements');
    }

    return score;
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
    updatePasswordStrength(newPasswordInput.value);
    updateSubmitButton();
});
confirmPasswordInput?.addEventListener('input', updateSubmitButton);

// ─── Password Toggle ────────────────────────────────────────────────────────
const toggle = document.getElementById('reset-toggle-pw');
if (toggle && newPasswordInput) {
    toggle.addEventListener('click', () => {
        const isPassword = newPasswordInput.type === 'password';
        newPasswordInput.type = isPassword ? 'text' : 'password';
        const icon = toggle.querySelector('.ph');
        if (icon) {
            icon.className = isPassword ? 'ph ph-eye-slash' : 'ph ph-eye';
        }
    });
}

// ─── Banner ─────────────────────────────────────────────────────────────────
function showBanner(type: 'error' | 'success', message: string): void {
    if (!banner || !bannerInner || !bannerIcon || !bannerText) { return; }
    banner.style.display = 'block';
    bannerText.textContent = message;

    if (type === 'error') {
        bannerInner.className = 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200';
        bannerIcon.className = 'ph ph-warning-circle';
    } else {
        bannerInner.className = 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200';
        bannerIcon.className = 'ph ph-check-circle';
    }
}

// ─── Form Submission ────────────────────────────────────────────────────────
let isSubmitting = false;

form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting || !resetToken) { return; }

    const newPassword = newPasswordInput?.value ?? '';
    const confirmPassword = confirmPasswordInput?.value ?? '';

    if (newPassword !== confirmPassword) {
        showBanner('error', 'Passwords do not match.');
        return;
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword)
        || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
        showBanner('error', 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character.');
        return;
    }

    isSubmitting = true;
    if (submitBtn) { submitBtn.disabled = true; }
    if (submitText) { submitText.textContent = 'Resetting...'; }

    // MED-AUD-009 FIX: AbortController with 30s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
        const res = await fetch(`${API_BASE}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: resetToken, new_password: newPassword }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await res.json() as { success: boolean; error?: string; message?: string };

        if (res.ok && data.success) {
            showBanner('success', data.message ?? 'Password reset successfully! Redirecting to sign in...');
            if (form) { form.style.display = 'none'; }
            setTimeout(() => {
                window.location.href = '/auth.html';
            }, 2000);
        } else {
            showBanner('error', data.error ?? 'Password reset failed. The token may have expired.');
        }
    } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
            showBanner('error', 'Request timed out — please check your network connection and try again.');
        } else {
            showBanner('error', err instanceof Error ? err.message : 'Network error. Please try again.');
        }
    } finally {
        isSubmitting = false;
        if (submitBtn) { submitBtn.disabled = false; }
        if (submitText) { submitText.textContent = 'Reset Password'; }
    }
});
