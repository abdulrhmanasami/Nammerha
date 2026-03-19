import '../styles/main.css';
import { auth } from '../api';
import { t } from '../utils/i18n';
import { showStructuredBanner, hideStructuredBanner, type StructuredBannerElements } from '../utils/banner';
// P0-PLAT-001 FIX: Wire native-app mobile utilities that exist but were never connected to auth.
// Auth is the FIRST screen every user sees — it MUST feel native.
import { initSwipeTabs } from '../utils/swipe-tabs';
import { haptic } from '../utils/haptic';
import { initPullToRefresh } from '../utils/pull-refresh';
// PLT-MAR11-005 FIX: Import shared password strength utility (single source of truth)
import { updatePasswordStrength } from '../utils/password-strength';

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
// PLAT-P2-001 FIX: Respect reduced-motion preference for panel transitions.
// Standard: WCAG 2.3.3 (Animation from Interactions), Apple HIG.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Manage tabindex on panel inputs to prevent focus escaping into animating-out panels.
 * PLAT-P2-002 FIX: Belt-and-suspenders alongside aria-hidden.
 * Standard: WCAG 2.1.1 (Keyboard).
 */
function setFormFocusable(form: HTMLFormElement | null, focusable: boolean): void {
    if (!form) { return; }
    const inputs = form.querySelectorAll<HTMLElement>('input, button, a[href], select, textarea, [tabindex]');
    inputs.forEach(el => {
        if (focusable) {
            el.removeAttribute('tabindex');
        } else {
            el.setAttribute('tabindex', '-1');
        }
    });
}

function switchTab(mode: 'login' | 'register'): void {
    state.mode = mode;
    hideBanner();

    // P0-PLAT-001 FIX: Haptic feedback on tab switch — native-app tactile response.
    haptic.light();

    // Determine which panels are entering vs exiting
    const enteringPanel = mode === 'login' ? formLogin : formRegister;
    const exitingPanel  = mode === 'login' ? formRegister : formLogin;

    // ── Tab ARIA synchronization (WCAG 4.1.2) ──
    const activeTab  = mode === 'login' ? tabLogin : tabRegister;
    const inactiveTab = mode === 'login' ? tabRegister : tabLogin;
    activeTab?.classList.add('auth-tab-active');
    activeTab?.classList.remove('text-slate-500');
    activeTab?.setAttribute('aria-selected', 'true');
    inactiveTab?.classList.remove('auth-tab-active');
    inactiveTab?.classList.add('text-slate-500');
    inactiveTab?.setAttribute('aria-selected', 'false');

    // ── PLAT-P0-001 FIX: aria-hidden sync IMMEDIATELY — before animation delay.
    // Previous: During 250ms exit animation, both panels were display:flex and
    // visible to screen readers. Now: exiting panel is instantly marked hidden.
    // Standard: WAI-ARIA Authoring Practices §3.26 (Tabs), WCAG 4.1.2.
    if (exitingPanel) {
        exitingPanel.setAttribute('aria-hidden', 'true');
        setFormFocusable(exitingPanel, false);
    }
    if (enteringPanel) {
        enteringPanel.removeAttribute('aria-hidden');
        // P2-SST-002 FIX: CSS class toggle replaces inline style.display.
        enteringPanel.classList.remove('nm-hidden', 'auth-panel-exit');
        setFormFocusable(enteringPanel, true);
    }

    // ── Panel exit animation ──
    if (exitingPanel) {
        if (prefersReducedMotion) {
            // PLAT-P2-001: Skip animation for reduced-motion users
            // P2-SST-002 FIX: CSS class toggle replaces inline style.display.
            exitingPanel.classList.add('nm-hidden');
            exitingPanel.classList.remove('auth-panel-exit');
        } else {
            exitingPanel.classList.add('auth-panel-exit');
            // SRG-13 FIX: Replaced setTimeout(250) with animationend event.
            // Previous: Hardcoded 250ms assumed CSS animation-duration wouldn't change.
            // This is a timing coupling fragility — if CSS duration changes, JS breaks.
            // Now: JS listens for the actual animation end, with a 400ms safety fallback.
            // Standard: Event-Driven Animation Lifecycle, Zero Magic Numbers.
            const onExitEnd = () => {
                exitingPanel.classList.add('nm-hidden');
                exitingPanel.classList.remove('auth-panel-exit');
            };
            exitingPanel.addEventListener('animationend', onExitEnd, { once: true });
            // Safety fallback: if animationend never fires (e.g., display:none race)
            setTimeout(() => {
                if (exitingPanel.classList.contains('auth-panel-exit')) {
                    onExitEnd();
                }
            }, 400);
        }
    }

    // P0-UXA-003 FIX: Clear hash when switching to login.
    if (mode === 'login' && window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
}

// P2-MED-001 FIX: Removed initial anonymous listeners.
// The wizard-aware listeners below (L201+) are the single source of truth.

// ─── FRIC-2026-D03 FIX: Multi-Step Registration Wizard Engine ───────────────
// Progressive disclosure: 7 fields → 3 steps × 2-3 fields.
// Step 1: Identity (name, email). Step 2: Security (password, confirm).
// Step 3: Consent (review card, terms checkbox, submit).
// Uses per-step validation before advancing. Stepper indicator shows progress.
// Standard: Miller's Law (7±2), Material Design 3, Apple HIG.
// ─────────────────────────────────────────────────────────────────────────────

let currentRegStep = 1;

/**
 * Navigate to a specific registration step.
 * Validates current step fields before advancing forward.
 */
function goToRegStep(targetStep: number): void {
    // ── Forward validation gate ──
    if (targetStep > currentRegStep) {
        if (!validateCurrentStep()) { return; }
    }

    // P0-PLAT-001 FIX: Haptic feedback on wizard step navigation.
    // Standard: Apple HIG ("Haptic for navigation state changes").
    haptic.light();

    // P2-MOT-001 FIX: Determine animation direction for spatial consistency.
    // Forward steps slide from right, backward steps slide from left.
    // Standard: Material Design 3 ("Transitions reinforce spatial model").
    const isBackward = targetStep < currentRegStep;

    // ── Update panels ──
    const panels = formRegister?.querySelectorAll<HTMLFieldSetElement>('[data-reg-step]');
    panels?.forEach(panel => {
        const step = parseInt(panel.dataset.regStep ?? '0', 10);
        if (step === targetStep) {
            // P2-MOT-001: Apply directional animation class
            panel.classList.toggle('nm-step-backward', isBackward);
            // P2-SST-002 FIX: CSS class toggle replaces inline style.display.
            panel.classList.remove('nm-hidden');
            // Re-trigger animation
            // DEF-UX-007 FIX: CSS class toggle replaces inline style.animation.
            // Previous: panel.style.animation = 'none' / '' — violated P1-SST-001.
            // Standard: CSS Single Source of Truth, class-driven animation restart.
            panel.classList.add('nm-anim-reset');
            // Force reflow
            void panel.offsetHeight;
            panel.classList.remove('nm-anim-reset');
        } else {
            // P2-SST-002 FIX: CSS class toggle replaces inline style.display.
            panel.classList.add('nm-hidden');
            panel.classList.remove('nm-step-backward');
        }
    });

    // ── Update stepper dots ──
    const dots = formRegister?.querySelectorAll<HTMLElement>('[data-step-dot]');
    dots?.forEach(dot => {
        const dotStep = parseInt(dot.dataset.stepDot ?? '0', 10);
        dot.classList.remove('active', 'completed');
        // INC-2026-008 FIX: aria-current="step" for screen readers.
        // Previous: only visual .active class — SR users couldn't identify current step.
        // Standard: WAI-ARIA Best Practices, WCAG 4.1.2 (Name, Role, Value).
        dot.removeAttribute('aria-current');
        if (dotStep === targetStep) {
            dot.classList.add('active');
            dot.setAttribute('aria-current', 'step');
        } else if (dotStep < targetStep) {
            dot.classList.add('completed');
        }
    });

    // ── Update connecting lines ──
    const lines = formRegister?.querySelectorAll<HTMLElement>('.nm-step-line');
    lines?.forEach((line, i) => {
        // Line i connects step (i+1) to step (i+2)
        const afterStep = i + 1;
        // P2-SST-002 FIX: CSS class toggle replaces inline style.background.
        line.classList.toggle('nm-step-line--completed', afterStep < targetStep);
    });

    // ── Populate Step 3 review card ──
    if (targetStep === 3) {
        const nameVal = (document.getElementById('reg-name') as HTMLInputElement)?.value.trim() ?? '—';
        const emailVal = (document.getElementById('reg-email') as HTMLInputElement)?.value.trim() ?? '—';
        const reviewName = document.getElementById('reg-review-name');
        const reviewEmail = document.getElementById('reg-review-email');
        if (reviewName) { reviewName.textContent = nameVal; }
        if (reviewEmail) { reviewEmail.textContent = emailVal; }

        // FRIC-2026-003 FIX: Show password strength status in review card.
        // Previous: Only name + email shown — no confirmation password met requirements.
        // Standard: Nielsen #1 (System Status Visibility).
        const strengthLabel = document.getElementById('pw-strength-label');
        const reviewPwStrength = document.getElementById('reg-review-pw-strength');
        if (reviewPwStrength && strengthLabel) {
            const strengthText = strengthLabel.textContent?.trim() ?? '';
            if (strengthText) {
                reviewPwStrength.classList.remove('hidden');
            }
        }
    }

    currentRegStep = targetStep;

    // ── FRIC-003 FIX: Sync URL hash with wizard step ──
    // Enables browser back-button navigation between wizard steps.
    // Standard: Nielsen #3 (User Control & Freedom), History API best practices.
    const newHash = `#register-step-${targetStep}`;
    if (window.location.hash !== newHash) {
        history.pushState(null, '', newHash);
    }

    // ── Auto-focus first input in step ──
    const activePanel = formRegister?.querySelector<HTMLFieldSetElement>(`[data-reg-step="${targetStep}"]`);
    const firstInput = activePanel?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([type="checkbox"])');
    firstInput?.focus();
}

/**
 * Validate fields in the current step before allowing forward navigation.
 */
function validateCurrentStep(): boolean {
    if (currentRegStep === 1) {
        const name = (document.getElementById('reg-name') as HTMLInputElement)?.value.trim();
        const email = (document.getElementById('reg-email') as HTMLInputElement)?.value.trim();
        if (!name) {
            showBanner('error', t('auth_name_required', 'Please enter your full name.'));
            document.getElementById('reg-name')?.focus();
            return false;
        }
        if (!email) {
            showBanner('error', t('auth_email_required', 'Please enter your email address.'));
            document.getElementById('reg-email')?.focus();
            return false;
        }
        // Basic email format check
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showBanner('error', t('auth_email_invalid', 'Please enter a valid email address.'));
            document.getElementById('reg-email')?.focus();
            return false;
        }
        hideBanner();
        return true;
    }
    if (currentRegStep === 2) {
        const pw = (document.getElementById('reg-password') as HTMLInputElement)?.value ?? '';
        const confirmPw = (document.getElementById('reg-password-confirm') as HTMLInputElement)?.value ?? '';
        if (pw.length < 8) {
            showBanner('error', t('auth_password_weak', 'Password must be at least 8 characters.'));
            document.getElementById('reg-password')?.focus();
            return false;
        }
        if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
            showBanner('error', t('auth_password_complexity', 'Password must contain uppercase, lowercase, number, and symbol.'));
            document.getElementById('reg-password')?.focus();
            return false;
        }
        if (pw !== confirmPw) {
            showBanner('error', t('pw_mismatch_error', 'Passwords do not match.'));
            document.getElementById('reg-password-confirm')?.focus();
            return false;
        }
        hideBanner();
        return true;
    }
    return true; // Step 3 validation happens at form submit
}

// ─── Wire step navigation buttons ───────────────────────────────────────────
formRegister?.querySelectorAll<HTMLButtonElement>('[data-goto-step]').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = parseInt(btn.dataset.gotoStep ?? '1', 10);
        goToRegStep(target);
    });
});

// ─── FRIC-2026-006 FIX: Enter/Next Key Handler for Wizard Steps ─────────────
// enterkeyhint="next" on wizard inputs promises the keyboard Next key will advance.
// But Next buttons are type="button" (not submit) — pressing Enter does nothing.
// This handler intercepts Enter on wizard inputs and triggers the active Next button.
// Standard: Apple HIG (Keyboard Management), WCAG 2.1.1 (Keyboard Accessible).
// ─────────────────────────────────────────────────────────────────────────────
formRegister?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') { return; }
    const target = e.target as HTMLElement;
    // Only intercept Enter on text/email/password inputs (not checkboxes, buttons)
    if (!(target instanceof HTMLInputElement) || target.type === 'checkbox') { return; }
    e.preventDefault(); // Prevent form submission
    // Find the visible Next button in the current step
    const activePanel = formRegister?.querySelector<HTMLFieldSetElement>(
        `[data-reg-step="${currentRegStep}"]`
    );
    if (!activePanel) { return; }
    // If current step has a "next" button, click it. If Step 3, let form submit handle it.
    const nextBtn = activePanel.querySelector<HTMLButtonElement>('.nm-step-next[data-goto-step]');
    if (nextBtn) {
        nextBtn.click();
    } else if (currentRegStep === 3) {
        // Step 3 has no Next — Enter should submit the form
        formRegister?.requestSubmit();
    }
});

// P2-MED-001 FIX: Single source of truth for tab click handlers.
// Reset wizard to Step 1 when switching to Register tab.
tabLogin?.addEventListener('click', () => {
    switchTab('login');
    // P0-UXA-003: Hash clearing now handled inside switchTab() — removed duplicate here.
    // FRIC-003 original logic preserved in switchTab() for all callers.
});
tabRegister?.addEventListener('click', () => {
    switchTab('register');
    goToRegStep(1);
});

// ─── FRIC-003 FIX: URL Hash State for Registration Wizard ───────────────────
// Enables browser back-button to navigate between wizard steps instead of
// leaving the page. Prevents registration progress loss on accidental back.
// Standard: Nielsen #3 (User Control & Freedom), WCAG 2.4.5 (Multiple Ways).
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('hashchange', () => {
    const match = window.location.hash.match(/^#register-step-(\d+)$/);
    if (match) {
        const step = parseInt(match[1]!, 10);
        if (step >= 1 && step <= 3 && step !== currentRegStep) {
            // Switch to register mode if not already
            if (state.mode !== 'register') { switchTab('register'); }
            // Navigate backward without validation (user chose to go back)
            // Navigate forward with validation gate (goToRegStep handles this)
            if (step < currentRegStep) {
                // Going back — bypass validation
                currentRegStep = step + 1; // trick: set current to step+1 so goToRegStep treats it as backward
                goToRegStep(step);
            } else {
                goToRegStep(step);
            }
        }
    } else if (!window.location.hash) {
        // Hash cleared (e.g., back from step-1 to no hash) — return to login
        if (state.mode === 'register') { switchTab('login'); }
    }
});

// FRIC-003: Restore wizard state from URL hash on page load
(function restoreHashState(): void {
    const match = window.location.hash.match(/^#register-step-(\d+)$/);
    if (match) {
        const step = parseInt(match[1]!, 10);
        if (step >= 1 && step <= 3) {
            switchTab('register');
            // For step > 1, we skip validation on initial load (user may have refreshed)
            currentRegStep = 1;
            if (step > 1) {
                // Set panels directly without validation
                const panels = formRegister?.querySelectorAll<HTMLFieldSetElement>('[data-reg-step]');
                panels?.forEach(panel => {
                    const s = parseInt(panel.dataset.regStep ?? '0', 10);
                    // P2-SST-002 FIX: CSS class toggle replaces inline style.display.
                    panel.classList.toggle('nm-hidden', s !== step);
                });
                currentRegStep = step;
                // Update stepper UI
                const dots = formRegister?.querySelectorAll<HTMLElement>('[data-step-dot]');
                dots?.forEach(dot => {
                    const dotStep = parseInt(dot.dataset.stepDot ?? '0', 10);
                    dot.classList.remove('active', 'completed');
                    if (dotStep === step) {
                        dot.classList.add('active');
                    } else if (dotStep < step) {
                        dot.classList.add('completed');
                    }
                });
                const lines = formRegister?.querySelectorAll<HTMLElement>('.nm-step-line');
                lines?.forEach((line, i) => {
                    // P2-SST-002 FIX: CSS class toggle replaces inline style.background.
                    line.classList.toggle('nm-step-line--completed', (i + 1) < step);
                });
            }
        }
    }
})();

// ─── Banner / Feedback ──────────────────────────────────────────────────────
// P2-AUD-002 FIX: Shared banner utility replaces local duplicate
const bannerElements: StructuredBannerElements = {
    banner, inner: bannerInner, icon: bannerIcon, text: bannerText,
};

function showBanner(type: 'error' | 'success' | 'info', message: string): void {
    showStructuredBanner(bannerElements, type, message);
    // P0-PLAT-001 FIX: Haptic feedback on banner display — tactile reinforcement.
    // Error → heavy (alert), success → success pattern, info → light.
    // Standard: Apple HIG ("Use haptics to reinforce feedback").
    if (type === 'error') { haptic.heavy(); }
    else if (type === 'success') { haptic.success(); }
    else { haptic.light(); }
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
// P0-UXA-002 FIX: Wire confirm password toggle.
// Previous: reg-password had toggle (L275) but reg-password-confirm did NOT.
// Users typing complex passwords (upper+lower+number+symbol) could not verify confirm input.
// Standard: Password UX Best Practices, Apple HIG (Authentication).
setupPasswordToggle('reg-toggle-pw-confirm', 'reg-password-confirm');

// PLT-MAR11-005 FIX: updatePasswordStrength imported at top of file (PLAT-P1-002 governance)

// ─── Password Strength Meter ────────────────────────────────────────────────
const regPassword = document.getElementById('reg-password') as HTMLInputElement | null;
const strengthBars = document.getElementById('pw-strength-bars')?.children;
const strengthLabel = document.getElementById('pw-strength-label');

regPassword?.addEventListener('input', () => {
    updatePasswordStrength(regPassword.value, strengthBars, strengthLabel);
    updateRegisterButton();
});

// P0-CRIT-001 FIX: Intent Selection Cards REMOVED.
// The multi-step wizard (FRIC-2026-D03) replaced intent cards with a 3-step
// progressive disclosure flow. All 6 orphaned selectedIntent references have
// been surgically excised. Registration now validates: name, email, password
// complexity, password confirmation, and terms acceptance (P1-CRIT-006).

// ─── Register Button State ──────────────────────────────────────────────────
const regSubmit = document.getElementById('reg-submit') as HTMLButtonElement | null;

function updateRegisterButton(): void {
    if (!regSubmit) { return; }
    const name = (document.getElementById('reg-name') as HTMLInputElement)?.value.trim();
    const email = (document.getElementById('reg-email') as HTMLInputElement)?.value.trim();
    const password = regPassword?.value ?? '';
    const confirmPw = (document.getElementById('reg-password-confirm') as HTMLInputElement)?.value ?? '';

    // FRC-002 FIX: Include password confirmation match check
    // P0-CRIT-001 FIX: Removed Boolean(state.selectedIntent) — intent cards no longer exist.
    const valid = Boolean(name) && Boolean(email) && password.length >= 8 && password === confirmPw;
    // FIX-REG-001: Use visual opacity hint instead of disabled attribute.
    // The button is ALWAYS clickable so the submit handler can show validation feedback.
    // P1-AUD4-003 FIX: Replaced inline style.opacity with CSS class toggle.
    // Previous: regSubmit.style.opacity = valid ? '1' : '0.6' — violated P1-001.
    // Standard: CSS Single Source of Truth.
    regSubmit.classList.toggle('nm-btn-disabled-soft', !valid);

    // FRC-002: Show/hide real-time mismatch error
    const mismatchEl = document.getElementById('pw-mismatch-error');
    if (mismatchEl && confirmPw.length > 0) {
        mismatchEl.classList.toggle('hidden', password === confirmPw);
    }
}

// Listen for all register form inputs
['reg-name', 'reg-email', 'reg-password-confirm'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateRegisterButton);
});

// ─── GAP-2026-009 FIX: Auto-Clear Banner Errors on User Input ───────────────
// Previous: banner errors persisted even after user started correcting the field.
// Only hideBanner() called on successful validateCurrentStep() — stale errors stayed.
// Standard: Nielsen #9 (Error Recovery), Material Design 3 (Form Validation).
// ─────────────────────────────────────────────────────────────────────────────
['reg-name', 'reg-email', 'reg-password', 'reg-password-confirm', 'login-email', 'login-password'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
        // Only hide if banner is currently showing an error (not success/info)
        if (bannerInner?.classList.contains('bg-red-50')) {
            hideBanner();
        }
    });
});

// Initialize button opacity
updateRegisterButton();

/**
 * FIX-REG-003: Validate all register fields and show clear feedback.
 * PLAT-C01 FIX: Navigates the wizard back to the first failing step so the
 * user sees the invalid field in context. Previous: validation ran but the
 * wizard stayed on Step 3 — failing fields were hidden off-screen.
 * Standard: WCAG 3.3.1 (Error Identification), Material Design 3 (Error Recovery).
 * Returns true if all fields are valid, false otherwise.
 */
function validateRegisterForm(): boolean {
    const nameInput = document.getElementById('reg-name') as HTMLInputElement | null;
    const emailInput = document.getElementById('reg-email') as HTMLInputElement | null;
    const passwordInput = document.getElementById('reg-password') as HTMLInputElement | null;

    // ── Step 1 fields (Identity) ──
    // Check name
    if (!nameInput?.value.trim()) {
        goToRegStep(1); // PLAT-C01: Navigate to failing step
        showBanner('error', t('auth_name_required', 'Please enter your full name.'));
        nameInput?.focus();
        return false;
    }

    // Check email
    if (!emailInput?.value.trim()) {
        goToRegStep(1); // PLAT-C01: Navigate to failing step
        showBanner('error', t('auth_email_required', 'Please enter your email address.'));
        emailInput?.focus();
        return false;
    }

    // ── Step 2 fields (Security) ──
    // Check password length
    const password = passwordInput?.value ?? '';
    if (password.length < 8) {
        goToRegStep(2); // PLAT-C01: Navigate to failing step
        showBanner('error', t('auth_password_weak', 'Password must be at least 8 characters.'));
        passwordInput?.focus();
        return false;
    }

    // Check password complexity
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        goToRegStep(2); // PLAT-C01: Navigate to failing step
        showBanner('error', t('auth_password_complexity', 'Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.'));
        passwordInput?.focus();
        return false;
    }

    // FRC-002 FIX: Validate password confirmation match
    const confirmInput = document.getElementById('reg-password-confirm') as HTMLInputElement | null;
    const confirmPw = confirmInput?.value ?? '';
    if (password !== confirmPw) {
        goToRegStep(2); // PLAT-C01: Navigate to failing step
        showBanner('error', t('pw_mismatch_error', 'Passwords do not match.'));
        confirmInput?.focus();
        return false;
    }

    // ── Step 3 fields (Consent) ──
    // P1-CRIT-006 FIX: Validate terms & privacy checkbox acceptance.
    // GDPR Art. 7 — consent must be demonstrably obtained before registration.
    // HTML has `required` on #reg-terms, but `novalidate` on the form disables native checks.
    const termsCheckbox = document.getElementById('reg-terms') as HTMLInputElement | null;
    if (!termsCheckbox?.checked) {
        const termsError = document.getElementById('reg-terms-error');
        if (termsError) { termsError.classList.remove('hidden'); }
        showBanner('error', t('auth_terms_required', 'Please accept the Terms and Privacy Policy.'));
        return false;
    }
    // P0-UXA-004: Hide terms error if it was previously shown
    const termsErrorEl = document.getElementById('reg-terms-error');
    if (termsErrorEl) { termsErrorEl.classList.add('hidden'); }

    return true;
}

// ─── Form Submission: LOGIN ─────────────────────────────────────────────────
formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.isSubmitting) { return; }

    // P0-UXA-005 FIX: Add .submitted class for CSS validation highlighting.
    // main.css L1646-1652 defines form[novalidate].submitted styles that highlight
    // all empty required fields on first submit attempt.
    // Standard: Nielsen #9 (Error Recognition), CSS-Driven Validation.
    formLogin.classList.add('submitted');

    const email = (document.getElementById('login-email') as HTMLInputElement)?.value.trim();
    const password = (document.getElementById('login-password') as HTMLInputElement)?.value;

    if (!email || !password) {
        showBanner('error', t('auth_enter_email_password', 'Please enter your email and password.'));
        return;
    }

    state.isSubmitting = true;
    // P0-PLAT-001 FIX: Haptic on submission start.
    haptic.medium();
    const submitBtn = document.getElementById('login-submit') as HTMLButtonElement | null;
    const submitText = document.getElementById('login-submit-text');
    // DEF-A08 FIX: Use canonical .btn-loading class instead of disabled attribute.
    // Previous: submitBtn.disabled = true → removes button from tab order (WCAG 2.1.1 violation).
    // .btn-loading: pointer-events:none + spinner animation + consistent opacity.
    // Standard: Design System Governance, WCAG 2.1.1 (Keyboard).
    if (submitBtn) { submitBtn.classList.add('btn-loading'); }
    if (submitText) { submitText.textContent = t('auth_signing_in', 'Signing in...'); }

    try {
        const response = await auth.login({ email, password, remember: (document.getElementById('remember-me') as HTMLInputElement)?.checked ?? false });
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
            // GAP-008 FIX: Role-based redirect — each role goes to their dashboard
            const ROLE_DASHBOARD: Record<string, string> = {
                homeowner: '/homeowner-portal.html',
                donor: '/donor-portal.html',
                contractor: '/contractor-portal.html',
                supplier: '/supplier-dashboard.html',
                tradesperson: '/tradesperson-portal.html',
                engineer: '/engineer-camera.html',
                admin: '/admin-dashboard.html',
                auditor: '/compliance-dashboard.html',
            };
            const activeRole = userData.activeRole ?? userData.role;
            const target = ROLE_DASHBOARD[activeRole] ?? '/';

            // GAP-002 FIX: Detect first login after registration → append onboarding param.
            // Each portal reads ?onboarding=1 to trigger its guided tour.
            let finalTarget = target;
            try {
                if (localStorage.getItem('nmh_onboarding_pending') === '1') {
                    localStorage.removeItem('nmh_onboarding_pending');
                    finalTarget += (target.includes('?') ? '&' : '?') + 'onboarding=1';
                }
            } catch { /* Safari private mode */ }

            setTimeout(() => {
                window.location.href = finalTarget;
            }, 800);
        } else {
            showBanner('error', response.error ?? t('auth_login_failed', 'Invalid credentials. Please try again.'));
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : t('auth_network_error', 'Network error. Please try again.');
        showBanner('error', message);
    } finally {
        state.isSubmitting = false;
        if (submitBtn) { submitBtn.classList.remove('btn-loading'); }
        if (submitText) { submitText.textContent = t('sign_in_btn', 'Sign In'); }
    }
});

// P0-UXA-004 FIX: Live listener — auto-hide terms error when user checks the box.
// Previous: error persisted even after correction — violates Nielsen #9 (Error Recovery).
// Standard: Immediate Error Clearance, Material Design 3 (Form Validation).
const _termsCheckbox = document.getElementById('reg-terms') as HTMLInputElement | null;
_termsCheckbox?.addEventListener('change', () => {
    const termsErr = document.getElementById('reg-terms-error');
    if (_termsCheckbox.checked && termsErr) {
        termsErr.classList.add('hidden');
    }
});

// ─── Form Submission: REGISTER ──────────────────────────────────────────────
formRegister?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.isSubmitting) { return; }

    // P0-UXA-005 FIX: Add .submitted class for CSS validation highlighting.
    formRegister.classList.add('submitted');

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
    // P0-PLAT-001 FIX: Haptic on submission start.
    haptic.medium();
    const submitText = document.getElementById('reg-submit-text');

    try {
        // DEF-A07 FIX: Use canonical .btn-loading class.
        // Previous: inline style.pointerEvents + style.opacity — no spinner, inconsistent with login.
        // .btn-loading: spinner animation + pointer-events:none + opacity:0.7.
        // Standard: Design System Governance (main.css L1491), DRY Principle.
        if (regSubmit) {
            regSubmit.classList.add('btn-loading');
        }
        if (submitText) { submitText.textContent = t('auth_creating_account', 'Creating account...'); }

        // ARCH-001 FIX: FIX-REG-005 workaround (inline fetch) removed.
        // The root cause was an indefinite hang without AbortController timeout.
        // api.ts request() now has a 30s AbortController (MED-AUD-009), resolving the hang.
        // Using centralized auth.register() gains: CSRF, timeout, and error reporting.
        // P0-CRIT-001 FIX: intent field removed — no longer collected in the wizard flow.
        const response = await auth.register({ email, password, full_name });

        // PLT-AUD-001 FIX: Backend no longer returns a token at registration.
        // The user must verify their email first, then log in.
        if (response.success) {
            // GAP-002 FIX: Set onboarding flag for first-login guided tour
            try { localStorage.setItem('nmh_onboarding_pending', '1'); } catch { /* Safari private mode */ }
            // M-AUD-010 FIX: Show transition feedback before switching tabs.
            // Previous: 2-second blank stare at Step 3 consent form with no indication.
            // Now: Banner includes countdown hint so user knows what's happening next.
            // Standard: Material Design 3 (State Transitions), Nielsen #1.
            showBanner('success', response.message ?? t('auth_reg_success', 'Registration successful! Redirecting to login...'));
            // Switch to login tab after successful registration
            setTimeout(() => {
                switchTab('login');
                // Pre-fill email
                const loginEmail = document.getElementById('login-email') as HTMLInputElement | null;
                if (loginEmail) {
                    loginEmail.value = email;
                    loginEmail.focus();
                }
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
            regSubmit.classList.remove('btn-loading');
        }
        if (submitText) { submitText.textContent = t('create_account_btn', 'Create Account'); }
    }
});

// P2-MED-004 FIX: .auth-tab-active CSS moved to main.css (single source of truth).
// Was dynamically injected via document.createElement('style') — violated DRY principle.

// ─── PLT-AUD-002: Forgot Password Handler ───────────────────────────────────
// PLAT-M08 FIX: forgotBtn is an <a> element, not <button>. Previous code cast
// it as HTMLButtonElement and used .disabled — which doesn't exist on <a>.
// Now uses aria-disabled + pointer-events for proper anchor "disable" pattern.
// Standard: TypeScript Type Safety, Nielsen #5 (Error Prevention).
const forgotBtn = document.getElementById('forgot-password-btn') as HTMLAnchorElement | null;
forgotBtn?.addEventListener('click', async (e) => {
    e.preventDefault(); // Prevent mailto fallback when JS is available
    const email = (document.getElementById('login-email') as HTMLInputElement)?.value.trim();
    if (!email) {
        // M-AUD-003 FIX: Focus the email field with guiding instruction.
        const loginEmailInput = document.getElementById('login-email') as HTMLInputElement | null;
        if (loginEmailInput) {
            loginEmailInput.focus();
            // DEF-FLASH-001 FIX: Replaced setTimeout + 3 Tailwind classes with CSS animation.
            // Previous: add('ring-2', 'ring-trust-blue/50', 'border-trust-blue')
            //   + setTimeout(remove, 3000) — 4 classes + timing hack.
            // Standard: P1-SST-001 governance, CSS-driven animation, zero setTimeout.
            loginEmailInput.classList.add('nm-input-flash-focus');
            loginEmailInput.addEventListener('animationend', () => {
                loginEmailInput.classList.remove('nm-input-flash-focus');
            }, { once: true });
        }
        showBanner('error', t('auth_forgot_enter_email', 'Enter your email above, then tap "Forgot your password?" again.'));
        return;
    }

    if (forgotBtn) {
        // GAP-2026-001 FIX: Added spinner icon for visual loading consistency.
        // Previous: text-only change "Sending..." — no visual loading indicator.
        // Standard: Design System Governance (all loading states must show spinners).
        forgotBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-sm"  aria-hidden="true"></i> ${t('auth_forgot_sending', 'Sending...')}`;
        forgotBtn.setAttribute('aria-disabled', 'true');
        // P1-AUD4-002 FIX: Replaced inline style.pointerEvents + style.opacity with CSS class.
        // Previous: forgotBtn.style.pointerEvents = 'none'; forgotBtn.style.opacity = '0.5'
        // Standard: P1-001 precedent — CSS Single Source of Truth.
        forgotBtn.classList.add('nm-btn-cooldown');
    }

    try {
        const data = await auth.forgotPassword({ email });
        if (data.success) {
            showBanner('success', data.message ?? t('auth_forgot_sent', 'If an account with that email exists, a password reset link has been sent.'));
        } else {
            showBanner('error', data.error ?? t('auth_forgot_error', 'Something went wrong. Please try again.'));
        }
    } catch (err) {
        showBanner('error', err instanceof Error ? err.message : t('auth_network_error', 'Network error. Please try again.'));
    } finally {
        if (forgotBtn) {
            // GAP-2026-001 FIX: Restore original content with i18n data attribute.
            // Previous: text-only "Sending..." with no spinner — inconsistent with btn-loading pattern.
            // Now: uses data-i18n attribute for proper i18n restoration.
            // Standard: Design System Governance (consistent loading states).
            forgotBtn.innerHTML = `<span data-i18n="forgot_password">${t('auth_forgot_link_text', 'Forgot your password?')}</span>`;
            forgotBtn.removeAttribute('aria-disabled');
            // P1-AUD4-002 FIX: Remove CSS cooldown class (replaces inline style reset).
            forgotBtn.classList.remove('nm-btn-cooldown');
        }
    }
});

// ─── C-AUD-002 FIX: SSO "Coming Soon" Click Handlers ──────────────────────────
// SSO buttons were silent dead ends — no JS handler, no feedback on click.
// PLAT-M01 FIX: Changed from 'error' (red) to 'info' (blue) — SSO coming-soon
// is informational, not an error. Red banner was alarming for a non-error state.
// Standard: Nielsen #9 (Help Users Recognize Errors), Material Design 3.
// ───────────────────────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('[data-sso-provider]').forEach(btn => {
    btn.addEventListener('click', () => {
        const provider = btn.dataset.ssoProvider === 'apple' ? 'Apple' : 'Google';
        showBanner('info', t('auth_sso_coming_soon', `Sign in with ${provider} is coming soon. Please register with email for now.`));
        haptic.light();
        // PLAT-P3-002 FIX: Auto-dismiss "Coming Soon" banner after 4s.
        // Previous: Banner stayed until next user interaction, blocking form view.
        // Standard: Material Design 3 (Snackbar Auto-Dismiss), Nielsen #1.
        setTimeout(() => hideBanner(), 4000);
    });
});

// ─── P0-PLAT-001 FIX: Native-App Mobile Utilities ──────────────────────────
// Three critical mobile utilities existed in the codebase but were NEVER wired
// to the auth page — the first screen every user sees.
// Standard: Apple HIG (Native-Feel PWA), Material Design 3 (Gesture Navigation).
// ────────────────────────────────────────────────────────────────────────────

// FIX-1: Horizontal swipe gesture between Login ↔ Register tabs.
// swipe-tabs.ts handles RTL direction, threshold, and vertical scroll rejection.
initSwipeTabs({
    containerSelector: '#main-content',
    tabs: ['login', 'register'] as const,
    onSwitch: (tab) => {
        switchTab(tab);
        if (tab === 'register') { goToRegStep(1); }
    },
    getCurrentTab: () => state.mode,
    threshold: 60,   // Slightly higher than default (50) to avoid accidental triggers
    maxVertical: 80,
});

// FIX-3: Pull-to-refresh gesture.
// On cached/stale auth page loads (common on Syrian mobile networks),
// users need a way to force-refresh without knowing browser controls.
initPullToRefresh();

// ─── FRIC-2026-004 FIX: Autofocus Login Email on Page Load ──────────────────
// Previous: No field auto-focused — mobile users had to manually tap the email field.
// Auth is the first screen every user sees; reducing time-to-first-input is critical.
// Standard: Apple HIG ("Focus the primary input"), Material Design 3.
// Only focus if user is on login mode AND not restoring a hash state (register wizard).
// ─────────────────────────────────────────────────────────────────────────────
if (state.mode === 'login') {
    // Delay to avoid competing with theme-boot.js visibility restore
    requestAnimationFrame(() => {
        document.getElementById('login-email')?.focus();
    });
}

// ─── GAP-2026-008 FIX: Clickable Stepper Dots (Completed Steps) ─────────────
// Previous: cursor:default — users couldn't click step indicators to jump.
// Now: Completed step dots are clickable (not active or future steps).
// Standard: Material Design 3 (Stepper Interaction), Nielsen #3 (User Control).
// ─────────────────────────────────────────────────────────────────────────────
formRegister?.querySelectorAll<HTMLElement>('[data-step-dot]').forEach(dot => {
    dot.addEventListener('click', () => {
        const dotStep = parseInt(dot.dataset.stepDot ?? '0', 10);
        // Allow navigation to completed steps only (not forward from current)
        if (dot.classList.contains('completed')) {
            goToRegStep(dotStep);
        }
    });
});
