import '../styles/main.css';
import { auth } from '../api';

// PLT-MAR11-004 FIX: API_BASE removed — forgot-password now uses centralized auth.forgotPassword()

// PLT-AUD-010: Type-safe i18n runtime lookup
interface NammerhaI18nApi {
    switchLanguage: (code: string) => void;
    getCurrentLang: () => string;
    getSupportedLangs: () => Array<{ code: string; name: string; dir: string }>;
    t: (key: string, fallback?: string) => string;
}
declare global {
    interface Window {
        NammerhaI18n?: NammerhaI18nApi;
    }
}

/** Safe i18n lookup — returns fallback if engine not yet loaded */
function t(key: string, fallback: string): string {
    return window.NammerhaI18n?.t(key, fallback) ?? fallback;
}

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

function hideBanner(): void {
    if (banner) { banner.style.display = 'none'; }
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

// ─── Role Selection ─────────────────────────────────────────────────────────
const roleCards = document.querySelectorAll<HTMLButtonElement>('.role-card');

roleCards.forEach((card) => {
    card.addEventListener('click', () => {
        // Deselect all
        roleCards.forEach((c) => {
            c.classList.remove('glass-card-active');
        });
        // Select clicked
        card.classList.add('glass-card-active');
        state.selectedRole = (card.dataset.role as UserRole) ?? null;
        updateRegisterButton();
    });
});

// ─── Register Button State ──────────────────────────────────────────────────
const regSubmit = document.getElementById('reg-submit') as HTMLButtonElement | null;

function updateRegisterButton(): void {
    if (!regSubmit) { return; }
    const name = (document.getElementById('reg-name') as HTMLInputElement)?.value.trim();
    const email = (document.getElementById('reg-email') as HTMLInputElement)?.value.trim();
    const password = regPassword?.value ?? '';

    const valid = Boolean(name) && Boolean(email) && password.length >= 8 && state.selectedRole !== null;
    regSubmit.disabled = !valid;
}

// Listen for all register form inputs
['reg-name', 'reg-email'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateRegisterButton);
});

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
            // Store token and redirect
            localStorage.setItem('nammerha_token', response.data.token);
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
    if (!state.selectedRole) {
        showBanner('error', t('auth_select_role', 'Please select your role.'));
        return;
    }

    const full_name = (document.getElementById('reg-name') as HTMLInputElement)?.value.trim();
    const email = (document.getElementById('reg-email') as HTMLInputElement)?.value.trim();
    const password = (document.getElementById('reg-password') as HTMLInputElement)?.value;

    if (!full_name || !email || !password) {
        showBanner('error', 'Please fill in all required fields.');
        return;
    }

    if (password.length < 8) {
        showBanner('error', t('auth_password_weak', 'Password must be at least 8 characters.'));
        return;
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        showBanner('error', t('auth_password_weak', 'Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.'));
        return;
    }

    state.isSubmitting = true;
    if (regSubmit) { regSubmit.disabled = true; }
    const submitText = document.getElementById('reg-submit-text');
    if (submitText) { submitText.textContent = t('auth_creating_account', 'Creating account...'); }

    try {
        const response = await auth.register({
            email,
            password,
            full_name,
            role: state.selectedRole,
        });

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
        if (regSubmit) { regSubmit.disabled = false; }
        if (submitText) { submitText.textContent = t('create_account_btn', 'Create Account'); }
    }
});

// ─── Auth Tab CSS (injected inline — minimal, no external file needed) ──────
const style = document.createElement('style');
style.textContent = `
  .auth-tab-active {
    background: white;
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
            showBanner('success', data.message ?? 'If an account with that email exists, a password reset link has been sent.');
        } else {
            showBanner('error', data.error ?? 'Something went wrong. Please try again.');
        }
    } catch (err) {
        showBanner('error', err instanceof Error ? err.message : t('auth_network_error', 'Network error. Please try again.'));
    } finally {
        forgotBtn.textContent = t('auth_forgot_link_text', 'Forgot your password?');
        (forgotBtn as HTMLButtonElement).disabled = false;
    }
});
