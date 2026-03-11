import '../styles/main.css';
import { auth } from '../api';

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

// ─── Password Strength Meter ────────────────────────────────────────────────
const regPassword = document.getElementById('reg-password') as HTMLInputElement | null;
const strengthBars = document.getElementById('pw-strength-bars')?.children;
const strengthLabel = document.getElementById('pw-strength-label');

function updatePasswordStrength(password: string): number {
    let score = 0;
    if (password.length >= 8) { score++; }
    if (/[A-Z]/.test(password)) { score++; }
    if (/[0-9]/.test(password)) { score++; }
    if (/[^A-Za-z0-9]/.test(password)) { score++; }

    const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400'];

    // NMR-AUD-304 FIX: Labels paired with i18n keys for translation engine
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
        strengthLabel.textContent = '8+ chars, 1 uppercase, 1 number';
        strengthLabel.setAttribute('data-i18n', 'pw_strength_hint');
    }

    return score;
}

regPassword?.addEventListener('input', () => {
    updatePasswordStrength(regPassword.value);
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
        showBanner('error', 'Please enter your email and password.');
        return;
    }

    state.isSubmitting = true;
    const submitBtn = document.getElementById('login-submit') as HTMLButtonElement | null;
    const submitText = document.getElementById('login-submit-text');
    if (submitBtn) { submitBtn.disabled = true; }
    if (submitText) { submitText.textContent = 'Signing in...'; }

    try {
        const response = await auth.login({ email, password });
        if (response.success && response.data) {
            // Store token and redirect
            localStorage.setItem('nammerha_token', response.data.token);
            showBanner('success', 'Welcome back! Redirecting...');
            setTimeout(() => {
                window.location.href = '/';
            }, 800);
        } else {
            showBanner('error', response.error ?? 'Invalid credentials. Please try again.');
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error. Please try again.';
        showBanner('error', message);
    } finally {
        state.isSubmitting = false;
        if (submitBtn) { submitBtn.disabled = false; }
        if (submitText) { submitText.textContent = 'Sign In'; }
    }
});

// ─── Form Submission: REGISTER ──────────────────────────────────────────────
formRegister?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.isSubmitting) { return; }
    if (!state.selectedRole) {
        showBanner('error', 'Please select your role.');
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
        showBanner('error', 'Password must be at least 8 characters.');
        return;
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        showBanner('error', 'Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.');
        return;
    }

    state.isSubmitting = true;
    if (regSubmit) { regSubmit.disabled = true; }
    const submitText = document.getElementById('reg-submit-text');
    if (submitText) { submitText.textContent = 'Creating account...'; }

    try {
        const response = await auth.register({
            email,
            password,
            full_name,
            role: state.selectedRole,
        });

        if (response.success) {
            showBanner('success', 'Account created! You can now sign in.');
            // Switch to login tab after successful registration
            setTimeout(() => {
                switchTab('login');
                // Pre-fill email
                const loginEmail = document.getElementById('login-email') as HTMLInputElement | null;
                if (loginEmail) { loginEmail.value = email; }
            }, 1200);
        } else {
            showBanner('error', response.error ?? 'Registration failed. Please try again.');
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error. Please try again.';
        showBanner('error', message);
    } finally {
        state.isSubmitting = false;
        if (regSubmit) { regSubmit.disabled = false; }
        if (submitText) { submitText.textContent = 'Create Account'; }
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
