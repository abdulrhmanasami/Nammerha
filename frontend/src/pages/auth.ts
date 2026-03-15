import '../styles/main.css';
import { auth } from '../api';
import { t } from '../utils/i18n';
import { showStructuredBanner, hideStructuredBanner, type StructuredBannerElements } from '../utils/banner';

// PLT-MAR11-004 FIX: API_BASE removed — forgot-password now uses centralized auth.forgotPassword()
// PLT-AUD-010: Type-safe i18n runtime lookup — now via shared utils/i18n.ts (FIX-004)

// ============================================================================
// Nammerha — Auth Page Engine (Login + Register)
// P0-003 FIX: Full authentication UI with API integration
// ============================================================================

type UserRole = 'homeowner' | 'donor' | 'engineer' | 'supplier' | 'contractor' | 'tradesperson';

interface AuthState {
    mode: 'login' | 'register';
    selectedRole: UserRole | null;
    isSubmitting: boolean;
}

const state: AuthState = {
    mode: 'login',
    selectedRole: null,
    isSubmitting: false,
};

// ─── DOM References ─────────────────────────────────────────────────────────
const tabLogin = document.getElementById('tab-login') as HTMLButtonElement | null;
const tabRegister = document.getElementById('tab-register') as HTMLButtonElement | null;
const formLogin = document.getElementById('form-login') as HTMLFormElement | null;
const formRegister = document.getElementById('form-register') as HTMLFormElement | null;
const banner = document.getElementById('auth-banner') as HTMLElement | null;
const bannerInner = document.getElementById('auth-banner-inner') as HTMLElement | null;
const bannerIcon = document.getElementById('auth-banner-icon') as HTMLElement | null;
const bannerText = document.getElementById('auth-banner-text') as HTMLElement | null;

// ─── Tab Switching ──────────────────────────────────────────────────────────
function switchTab(mode: 'login' | 'register'): void {
    state.mode = mode;
    hideBanner();

    if (mode === 'login') {
        tabLogin?.classList.add('auth-tab-active');
        tabLogin?.classList.remove('text-slate-500');
        tabRegister?.classList.remove('auth-tab-active');
        tabRegister?.classList.add('text-slate-500');
        if (formLogin) { formLogin.style.display = 'flex'; }
        if (formRegister) { formRegister.style.display = 'none'; }
    } else {
        tabRegister?.classList.add('auth-tab-active');
        tabRegister?.classList.remove('text-slate-500');
        tabLogin?.classList.remove('auth-tab-active');
        tabLogin?.classList.add('text-slate-500');
        if (formLogin) { formLogin.style.display = 'none'; }
        if (formRegister) { formRegister.style.display = 'flex'; }
    }
}

tabLogin?.addEventListener('click', () => switchTab('login'));
tabRegister?.addEventListener('click', () => switchTab('register'));

// ─── Banner / Feedback ──────────────────────────────────────────────────────
// P2-AUD-002 FIX: Shared banner utility replaces local duplicate
const bannerElements: StructuredBannerElements = {
    banner, inner: bannerInner, icon: bannerIcon, text: bannerText,
};

function showBanner(type: 'error' | 'success', message: string): void {
    showStructuredBanner(bannerElements, type, message);
}

function hideBanner(): void {
    hideStructuredBanner(banner);
}

// ─── Password Toggle ────────────────────────────────────────────────────────
function setupPasswordToggle(toggleId: string, inputId: string): void {
    const toggle = document.getElementById(toggleId);
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!toggle || !input) { return; }

    toggle.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        const icon = toggle.querySelector('.ph');
        if (icon) {
            icon.className = isPassword ? 'ph ph-eye-slash' : 'ph ph-eye';
        }
    });
}

setupPasswordToggle('login-toggle-pw', 'login-password');
setupPasswordToggle('reg-toggle-pw', 'reg-password');

// PLT-MAR11-005 FIX: Import shared password strength utility (single source of truth)
import { updatePasswordStrength } from '../utils/password-strength';

// ─── Password Strength Meter ────────────────────────────────────────────────
const regPassword = document.getElementById('reg-password') as HTMLInputElement | null;
const strengthBars = document.getElementById('pw-strength-bars')?.children;
const strengthLabel = document.getElementById('pw-strength-label');

regPassword?.addEventListener('input', () => {
    updatePasswordStrength(regPassword.value, strengthBars, strengthLabel);
    updateRegisterButton();
});

// Multi-Role Architecture: Role selection removed from registration.
// Users start as 'donor' by default and activate additional roles from their dashboard.

// ─── Register Button State ──────────────────────────────────────────────────
const regSubmit = document.getElementById('reg-submit') as HTMLButtonElement | null;

function updateRegisterButton(): void {
    if (!regSubmit) { return; }
    const name = (document.getElementById('reg-name') as HTMLInputElement)?.value.trim();
    const email = (document.getElementById('reg-email') as HTMLInputElement)?.value.trim();
    const password = regPassword?.value ?? '';

    // Multi-Role Architecture: role no longer required for registration
    const valid = Boolean(name) && Boolean(email) && password.length >= 8;
    // FIX-REG-001: Use visual opacity hint instead of disabled attribute.
    // The button is ALWAYS clickable so the submit handler can show validation feedback.
    regSubmit.style.opacity = valid ? '1' : '0.6';
}

// Listen for all register form inputs
['reg-name', 'reg-email'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateRegisterButton);
});

// Initialize button opacity
updateRegisterButton();

/**
 * FIX-REG-003: Validate all register fields and show clear feedback.
 * Returns true if all fields are valid, false otherwise.
 * Scrolls to and highlights the first invalid field.
 */
function validateRegisterForm(): boolean {
    const nameInput = document.getElementById('reg-name') as HTMLInputElement | null;
    const emailInput = document.getElementById('reg-email') as HTMLInputElement | null;
    const passwordInput = document.getElementById('reg-password') as HTMLInputElement | null;

    // Check name
    if (!nameInput?.value.trim()) {
        showBanner('error', t('auth_name_required', 'Please enter your full name.'));
        nameInput?.focus();
        return false;
    }

    // Check email
    if (!emailInput?.value.trim()) {
        showBanner('error', t('auth_email_required', 'Please enter your email address.'));
        emailInput?.focus();
        return false;
    }

    // Check password length
    const password = passwordInput?.value ?? '';
    if (password.length < 8) {
        showBanner('error', t('auth_password_weak', 'Password must be at least 8 characters.'));
        passwordInput?.focus();
        return false;
    }

    // Check password complexity
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        showBanner('error', t('auth_password_complexity', 'Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.'));
        passwordInput?.focus();
        return false;
    }

    // Multi-Role Architecture: role selection removed from registration.
    // Users default to 'donor' and can activate additional roles later.

    return true;
}

// ─── Form Submission: LOGIN ─────────────────────────────────────────────────
formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.isSubmitting) { return; }

    const email = (document.getElementById('login-email') as HTMLInputElement)?.value.trim();
    const password = (document.getElementById('login-password') as HTMLInputElement)?.value;

    if (!email || !password) {
        showBanner('error', t('auth_enter_email_password', 'Please enter your email and password.'));
        return;
    }

    state.isSubmitting = true;
    const submitBtn = document.getElementById('login-submit') as HTMLButtonElement | null;
    const submitText = document.getElementById('login-submit-text');
    if (submitBtn) { submitBtn.disabled = true; }
    if (submitText) { submitText.textContent = t('auth_signing_in', 'Signing in...'); }

    try {
        const response = await auth.login({ email, password });
        if (response.success && response.data) {
            // V1-AUDIT FIX: JWT is now in httpOnly cookie set by backend.
            // Only store non-sensitive user profile data for UI rendering.
            const userData = response.data.user as {
                user_id: string;
                full_name: string;
                role: string;
                roles?: string[];
                activeRole?: string;
                email: string;
                is_active: boolean;
            };
            const { setCurrentUser } = await import('../auth');
            const userRole = userData.role as import('../auth').UserRole;
            setCurrentUser({
                user_id: userData.user_id,
                full_name: userData.full_name,
                role: userRole,
                roles: (userData.roles ?? [userData.role]) as import('../auth').UserRole[],
                activeRole: (userData.activeRole ?? userData.role) as import('../auth').UserRole,
                email: userData.email,
                kyc_verified: userData.is_active,
            });
            showBanner('success', t('auth_welcome_back', 'Welcome back! Redirecting...'));
            setTimeout(() => {
                window.location.href = '/';
            }, 800);
        } else {
            showBanner('error', response.error ?? t('auth_login_failed', 'Invalid credentials. Please try again.'));
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : t('auth_network_error', 'Network error. Please try again.');
        showBanner('error', message);
    } finally {
        state.isSubmitting = false;
        if (submitBtn) { submitBtn.disabled = false; }
        if (submitText) { submitText.textContent = t('sign_in_btn', 'Sign In'); }
    }
});

// ─── Form Submission: REGISTER ──────────────────────────────────────────────
formRegister?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.isSubmitting) { return; }

    // FIX-REG-003: Comprehensive validation with clear per-field feedback
    if (!validateRegisterForm()) { return; }

    const full_name = (document.getElementById('reg-name') as HTMLInputElement)?.value.trim();
    const email = (document.getElementById('reg-email') as HTMLInputElement)?.value.trim();
    const password = (document.getElementById('reg-password') as HTMLInputElement)?.value;

    if (!full_name || !email || !password) {
        showBanner('error', t('auth_fill_all_fields', 'Please fill in all required fields.'));
        return;
    }

    // FIX-REG-006: MASTER try/catch wraps EVERYTHING after this point.
    // Previous bug: code between isSubmitting=true and the inner try{} was
    // unprotected — if t() or any DOM operation threw, the async handler
    // silently died as an unhandled rejection with no error banner and
    // the button stuck in loading state forever.
    state.isSubmitting = true;
    const submitText = document.getElementById('reg-submit-text');

    try {
        // Visual feedback — inside try so any error is caught
        if (regSubmit) {
            regSubmit.style.pointerEvents = 'none';
            regSubmit.style.opacity = '0.5';
        }
        if (submitText) { submitText.textContent = t('auth_creating_account', 'Creating account...'); }

        // ARCH-001 FIX: FIX-REG-005 workaround (inline fetch) removed.
        // The root cause was an indefinite hang without AbortController timeout.
        // api.ts request() now has a 30s AbortController (MED-AUD-009), resolving the hang.
        // Using centralized auth.register() gains: CSRF, timeout, and error reporting.
        const response = await auth.register({ email, password, full_name });

        // PLT-AUD-001 FIX: Backend no longer returns a token at registration.
        // The user must verify their email first, then log in.
        if (response.success) {
            showBanner('success', response.message ?? t('auth_reg_success', 'Registration successful! Please check your email to verify your account.'));
            // Switch to login tab after successful registration
            setTimeout(() => {
                switchTab('login');
                // Pre-fill email
                const loginEmail = document.getElementById('login-email') as HTMLInputElement | null;
                if (loginEmail) { loginEmail.value = email; }
            }, 2000);
        } else {
            showBanner('error', response.error ?? t('auth_reg_failed', 'Registration failed. Please try again.'));
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : t('auth_network_error', 'Network error. Please try again.');
        showBanner('error', message);
    } finally {
        state.isSubmitting = false;
        if (regSubmit) {
            regSubmit.style.pointerEvents = '';
            regSubmit.style.opacity = '1';
        }
        if (submitText) { submitText.textContent = t('create_account_btn', 'Create Account'); }
    }
});

// ─── Auth Tab CSS ───────────────────────────────────────────────────────────
// P1-002 FIX: Uses var(--surface) instead of hardcoded 'white'.
// Dark mode override in main.css handles html[data-theme="dark"] .auth-tab-active.
const style = document.createElement('style');
style.textContent = `
  .auth-tab-active {
    background: var(--surface);
    color: var(--trust-blue);
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }
`;
document.head.appendChild(style);

// ─── PLT-AUD-002: Forgot Password Handler ───────────────────────────────────
const forgotBtn = document.getElementById('forgot-password-btn');
forgotBtn?.addEventListener('click', async () => {
    const email = (document.getElementById('login-email') as HTMLInputElement)?.value.trim();
    if (!email) {
        showBanner('error', t('auth_forgot_enter_email', 'Please enter your email address first, then click "Forgot your password?"'));
        return;
    }

    forgotBtn.textContent = t('auth_forgot_sending', 'Sending...');
    (forgotBtn as HTMLButtonElement).disabled = true;

    try {
        // PLT-MAR11-004 FIX: Use centralized API client instead of raw fetch.
        // Gains: 30s AbortController timeout, CSRF token, unified error handling.
        const data = await auth.forgotPassword({ email });
        if (data.success) {
            showBanner('success', data.message ?? t('auth_forgot_sent', 'If an account with that email exists, a password reset link has been sent.'));
        } else {
            showBanner('error', data.error ?? t('auth_forgot_error', 'Something went wrong. Please try again.'));
        }
    } catch (err) {
        showBanner('error', err instanceof Error ? err.message : t('auth_network_error', 'Network error. Please try again.'));
    } finally {
        forgotBtn.textContent = t('auth_forgot_link_text', 'Forgot your password?');
        (forgotBtn as HTMLButtonElement).disabled = false;
    }
});
