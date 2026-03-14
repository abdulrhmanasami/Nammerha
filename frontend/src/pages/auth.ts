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
const roleGrid = document.getElementById('role-grid');
const roleValidationMsg = document.getElementById('role-validation-msg');

roleCards.forEach((card) => {
    card.addEventListener('click', () => {
        // Deselect all
        roleCards.forEach((c) => {
            c.classList.remove('glass-card-active');
        });
        // Select clicked
        card.classList.add('glass-card-active');
        state.selectedRole = (card.dataset.role as UserRole) ?? null;
        // FIX-REG-002: Clear role validation error on selection
        if (roleGrid) { roleGrid.style.outline = ''; }
        if (roleValidationMsg) { roleValidationMsg.style.display = 'none'; }
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

    // FIX-REG-001: Check role selection — THE PRIMARY ROOT CAUSE
    if (!state.selectedRole) {
        showBanner('error', t('auth_select_role', 'Please select your role to continue.'));
        // Highlight role grid with red border
        if (roleGrid) {
            roleGrid.style.outline = '2px solid #ef4444';
            roleGrid.style.outlineOffset = '4px';
            roleGrid.style.borderRadius = '12px';
            roleGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Show inline validation message
        if (roleValidationMsg) { roleValidationMsg.style.display = 'block'; }
        return false;
    }

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
                email: string;
                is_active: boolean;
            };
            const { setCurrentUser } = await import('../auth');
            setCurrentUser({
                user_id: userData.user_id,
                full_name: userData.full_name,
                role: userData.role as import('../auth').UserRole,
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

        // FIX-REG-005: Direct inline fetch — bypasses api.ts request() chain
        // which had an unexplained module execution hang where auth.register()
        // called request() but request() never entered.

        // Step 1: Acquire CSRF token
        let csrfToken: string | null = null;
        const existingCookie = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/)?.[1];
        if (existingCookie) {
            csrfToken = existingCookie;
        } else {
            try {
                const csrfRes = await fetch('/api/csrf-token', { credentials: 'same-origin' });
                if (csrfRes.ok) {
                    const csrfData = await csrfRes.json() as { csrfToken?: string };
                    csrfToken = csrfData.csrfToken ?? null;
                }
            } catch {
                // CSRF fetch failure is non-fatal — proceed without it
            }
        }

        // Step 2: POST to /api/auth/register
        const regHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (csrfToken) { regHeaders['X-CSRF-Token'] = csrfToken; }

        const regRes = await fetch('/api/auth/register', {
            method: 'POST',
            headers: regHeaders,
            body: JSON.stringify({ email, password, full_name, role: state.selectedRole }),
            credentials: 'same-origin',
        });
        const response = await regRes.json() as { success: boolean; message?: string; error?: string };

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
