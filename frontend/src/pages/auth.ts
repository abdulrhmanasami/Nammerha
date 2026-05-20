import '../styles/main.css';
import { auth } from '../api';
import { reportWarning } from '../error-reporter';
import { t } from '../utils/i18n';
import { escapeHtml as esc } from '../utils/xss';
import {
  showStructuredBanner,
  hideStructuredBanner,
  type StructuredBannerElements,
} from '../utils/banner';
// P0-PLAT-001 FIX: Wire native-app mobile utilities that exist but were never connected to auth.
// Auth is the FIRST screen every user sees — it MUST feel native.
import { initSwipeTabs } from '../utils/swipe-tabs';
import { haptic } from '../utils/haptic';
import { initPullToRefresh } from '../utils/pull-refresh';
// PLT-MAR11-005 FIX: Import shared password strength utility (single source of truth)
import { updatePasswordStrength } from '../utils/password-strength';
// P1-006 FIX: Scroll-to-field on validation error — ensures failing field
// is visible, focused, and highlighted on mobile browsers.
import { scrollToField } from '../utils/scroll-to-field';
// P1-013 FIX: Auto-detect required fields and add asterisk markers to labels.
import '../utils/required-markers';
// P0-002 FIX (Wave 2): Import ApiError for structured error code detection.
import { ApiError } from '../api/_client';
// W3-P2-002 FIX: Import CSRF pre-warm for eager loading before user interaction.
// On Syria 2G, the first POST without pre-warm adds 2-5s invisible delay.
import { warmCsrf } from '../api/_client';

// W3-P2-002 FIX: Pre-fetch CSRF token on page load (fire-and-forget).
// Previous: CSRF fetched on first form submit — added invisible 2-5s delay on Syria 2G.
// Now: Token pre-fetched while user is still reading the page.
// Standard: Web Vitals (TBT), PRPL Pattern, Proactive Resource Loading.
warmCsrf();

// PLT-MAR11-004 FIX: API_BASE removed — forgot-password now uses centralized auth.forgotPassword()
// PLT-AUD-010: Type-safe i18n runtime lookup — now via shared utils/i18n.ts (FIX-004)

// ============================================================================
// Nammerha — Auth Page Engine (Login + Register)
// P0-003 FIX: Full authentication UI with API integration
// ============================================================================

interface AuthState {
  mode: 'login' | 'register';
  isSubmitting: boolean;
}

const state: AuthState = {
  mode: 'login',
  isSubmitting: false,
};

// ─── UNIFIED CITIZEN: Post-Login Redirect ─────────────────────────────────────
// Previous: ROLE_DASHBOARD map routed users to different portals based on their
// "primary role" (homeowner→homeowner-portal, engineer→engineer-camera, etc.).
// Under Unified Citizen, all users have all roles — a role-based redirect is
// misleading because it implies they "belong" to one portal.
//
// All users now land on the homepage (/), which has:
// - Quick Actions grid (role-aware, shows relevant shortcuts)
// - Featured Projects carousel
// - Interactive reconstruction map
// - Full bottom nav to all portals
//
// The ?redirect= query param from auth-guard still works for deep links.
const POST_LOGIN_REDIRECT = '/';

// H2 FIX: Mirror backend SEC-003 — bcrypt truncates at 72 bytes but still
// processes the full input. Without this check, a 1MB password from the
// frontend would cause CPU starvation on the backend.
const MAX_PASSWORD_LENGTH = 128;

// P1-001 FIX (Wave 2): Shared helper to read Remember Me checkbox value.
// Social login buttons exist on both login and register forms.
// The checkbox is on the login form — always read from there.
// Returns false if checkbox not found (register tab active).
function getRememberMe(): boolean {
  return (document.getElementById('remember-me') as HTMLInputElement | null)?.checked ?? false;
}

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
  if (!form) {
    return;
  }
  const inputs = form.querySelectorAll<HTMLElement>(
    'input, button, a[href], select, textarea, [tabindex]',
  );
  inputs.forEach((el) => {
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
  const exitingPanel = mode === 'login' ? formRegister : formLogin;

  // ── Tab ARIA synchronization (WCAG 4.1.2) ──
  const activeTab = mode === 'login' ? tabLogin : tabRegister;
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

// UX-REM-J002 FIX: Registration draft persistence.
// PREVIOUS: User fills Step 1 (name, email) → accidentally closes tab → all input lost.
// NOW: Saves non-sensitive fields (name, email) to sessionStorage on input.
// NEVER persists passwords — security constraint.
// Standard: P0-UX-004 pattern (service request auto-save), Nielsen #5 (Error Prevention).
const REG_DRAFT_KEY = 'nmh_reg_draft';

function saveRegDraft(): void {
  try {
    const name = (document.getElementById('reg-name') as HTMLInputElement)?.value ?? '';
    const email = (document.getElementById('reg-email') as HTMLInputElement)?.value ?? '';
    if (name || email) {
      sessionStorage.setItem(REG_DRAFT_KEY, JSON.stringify({ name, email, step: currentRegStep }));
    }
  } catch {
    /* Safari incognito — degrade gracefully */
  }
}

function restoreRegDraft(): void {
  try {
    const raw = sessionStorage.getItem(REG_DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw) as { name?: string; email?: string; step?: number };
    const nameEl = document.getElementById('reg-name') as HTMLInputElement | null;
    const emailEl = document.getElementById('reg-email') as HTMLInputElement | null;
    if (nameEl && draft.name) {
      nameEl.value = draft.name;
    }
    if (emailEl && draft.email) {
      emailEl.value = draft.email;
    }
    // Restore to the step the user was on (but never beyond step 2 — passwords aren't saved)
    if (draft.step && draft.step <= 2 && draft.step > 1) {
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => goToRegStep(draft.step!), 100);
    }
  } catch {
    /* ignore corrupt/missing data */
  }
}

function clearRegDraft(): void {
  try {
    sessionStorage.removeItem(REG_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Navigate to a specific registration step.
 * Validates current step fields before advancing forward.
 */
function goToRegStep(targetStep: number): void {
  // ── Forward validation gate ──
  if (targetStep > currentRegStep) {
    if (!validateCurrentStep()) {
      return;
    }
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
  panels?.forEach((panel) => {
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
  dots?.forEach((dot) => {
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
    const emailVal =
      (document.getElementById('reg-email') as HTMLInputElement)?.value.trim() ?? '—';
    const reviewName = document.getElementById('reg-review-name');
    const reviewEmail = document.getElementById('reg-review-email');
    if (reviewName) {
      reviewName.textContent = nameVal;
    }
    if (reviewEmail) {
      reviewEmail.textContent = emailVal;
    }

    // BUG-F01 FIX: Dynamically populate password strength text + color in review card.
    // PREVIOUS: auth.html hardcoded "قوي ✓" — always showed "Strong ✓" regardless of score.
    // NOW: Copy the actual strength label text and apply appropriate color.
    // Standard: Nielsen #1 (System Status Visibility), Zero False Confidence.
    const strengthLabel = document.getElementById('pw-strength-label');
    const reviewPwStrength = document.getElementById('reg-review-pw-strength');
    const reviewPwStrengthText = document.getElementById('reg-review-pw-strength-text');
    if (reviewPwStrength && strengthLabel && reviewPwStrengthText) {
      const strengthText = strengthLabel.textContent?.trim() ?? '';
      if (strengthText) {
        reviewPwStrength.classList.remove('nm-hidden');
        reviewPwStrengthText.textContent = `${strengthText} ✓`;
        // Apply color based on current strength bar state
        // Remove any previous color classes
        reviewPwStrength.classList.remove(
          'text-red-500',
          'text-orange-500',
          'text-yellow-600',
          'text-emerald-600',
          'text-smoky-jade',
          'dark:text-red-400',
          'dark:text-orange-400',
          'dark:text-yellow-400',
          'dark:text-emerald-400',
        );
        const pw = (document.getElementById('reg-password') as HTMLInputElement)?.value ?? '';
        const score = [
          pw.length >= 8,
          /[A-Z]/.test(pw),
          /[a-z]/.test(pw),
          /[0-9]/.test(pw),
          /[^A-Za-z0-9]/.test(pw),
        ].filter(Boolean).length;
        const colorMap: [string, string][] = [
          ['text-red-500', 'dark:text-red-400'], // 0-1
          ['text-red-500', 'dark:text-red-400'], // 1
          ['text-orange-500', 'dark:text-orange-400'], // 2
          ['text-yellow-600', 'dark:text-yellow-400'], // 3
          ['text-emerald-600', 'dark:text-emerald-400'], // 4
          ['text-smoky-jade', 'dark:text-emerald-400'], // 5
        ];
        const [light, dark] = colorMap[Math.min(score, 5)] ?? colorMap[0]!;
        reviewPwStrength.classList.add(light, dark);
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
  const activePanel = formRegister?.querySelector<HTMLFieldSetElement>(
    `[data-reg-step="${targetStep}"]`,
  );
  const firstInput = activePanel?.querySelector<HTMLInputElement>(
    'input:not([type="hidden"]):not([type="checkbox"])',
  );
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
      showBanner('error', t('auth_name_required', 'الاسم مطلوب'));
      scrollToField(document.getElementById('reg-name'));
      return false;
    }
    if (!email) {
      showBanner('error', t('auth_email_required', 'البريد الإلكتروني مطلوب'));
      scrollToField(document.getElementById('reg-email'));
      return false;
    }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showBanner('error', t('auth_email_invalid', 'البريد الإلكتروني غير صالح'));
      scrollToField(document.getElementById('reg-email'));
      return false;
    }
    hideBanner();
    return true;
  }
  if (currentRegStep === 2) {
    const pw = (document.getElementById('reg-password') as HTMLInputElement)?.value ?? '';
    const confirmPw =
      (document.getElementById('reg-password-confirm') as HTMLInputElement)?.value ?? '';
    if (pw.length < 8) {
      showBanner('error', t('auth_password_weak', 'كلمة المرور ضعيفة'));
      scrollToField(document.getElementById('reg-password'));
      return false;
    }
    // H2 FIX: Max length check — mirrors backend SEC-003 (bcrypt DoS prevention).
    // Without this gate, a user could submit a 1MB password that passes all other
    // checks but causes CPU starvation during bcrypt hashing on the server.
    if (pw.length > MAX_PASSWORD_LENGTH) {
      showBanner('error', t('auth_password_too_long', 'كلمة المرور طويلة جداً (الحد ١٢٨)'));
      scrollToField(document.getElementById('reg-password'));
      return false;
    }
    if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
      showBanner('error', t('auth_password_complexity', 'كلمة المرور لا تستوفي المتطلبات'));
      scrollToField(document.getElementById('reg-password'));
      return false;
    }
    if (pw !== confirmPw) {
      showBanner('error', t('pw_mismatch_error', 'كلمتا المرور غير متطابقتين'));
      scrollToField(document.getElementById('reg-password-confirm'));
      return false;
    }
    hideBanner();
    return true;
  }
  return true; // Step 3 validation happens at form submit
}

// ─── Wire step navigation buttons ───────────────────────────────────────────
formRegister?.querySelectorAll<HTMLButtonElement>('[data-goto-step]').forEach((btn) => {
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
  if (e.key !== 'Enter') {
    return;
  }
  const target = e.target as HTMLElement;
  // Only intercept Enter on text/email/password inputs (not checkboxes, buttons)
  if (!(target instanceof HTMLInputElement) || target.type === 'checkbox') {
    return;
  }
  e.preventDefault(); // Prevent form submission
  // Find the visible Next button in the current step
  const activePanel = formRegister?.querySelector<HTMLFieldSetElement>(
    `[data-reg-step="${currentRegStep}"]`,
  );
  if (!activePanel) {
    return;
  }
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
  // UX-REM-J002 FIX: Restore draft values after tab switch.
  // restoreRegDraft() fills name + email and optionally advances to saved step.
  restoreRegDraft();
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
      if (state.mode !== 'register') {
        switchTab('register');
      }
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
    if (state.mode === 'register') {
      switchTab('login');
    }
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
        panels?.forEach((panel) => {
          const s = parseInt(panel.dataset.regStep ?? '0', 10);
          // P2-SST-002 FIX: CSS class toggle replaces inline style.display.
          panel.classList.toggle('nm-hidden', s !== step);
        });
        currentRegStep = step;
        // Update stepper UI
        const dots = formRegister?.querySelectorAll<HTMLElement>('[data-step-dot]');
        dots?.forEach((dot) => {
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
          line.classList.toggle('nm-step-line--completed', i + 1 < step);
        });
      }
    }
  }
  // UX-REM-J002 FIX: Restore draft values after hash state restoration.
  restoreRegDraft();
})();

// ─── Banner / Feedback ──────────────────────────────────────────────────────
// P2-AUD-002 FIX: Shared banner utility replaces local duplicate
const bannerElements: StructuredBannerElements = {
  banner,
  inner: bannerInner,
  icon: bannerIcon,
  text: bannerText,
};

function showBanner(type: 'error' | 'success' | 'info', message: string): void {
  showStructuredBanner(bannerElements, type, message);
  // P0-PLAT-001 FIX: Haptic feedback on banner display — tactile reinforcement.
  // Error → heavy (alert), success → success pattern, info → light.
  // Standard: Apple HIG ("Use haptics to reinforce feedback").
  if (type === 'error') {
    haptic.heavy();
  } else if (type === 'success') {
    haptic.success();
  } else {
    haptic.light();
  }
}

function hideBanner(): void {
  hideStructuredBanner(banner);
}

// ─── Password Toggle ────────────────────────────────────────────────────────
function setupPasswordToggle(toggleId: string, inputId: string): void {
  const toggle = document.getElementById(toggleId);
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!toggle || !input) {
    return;
  }

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
  if (!regSubmit) {
    return;
  }
  const name = (document.getElementById('reg-name') as HTMLInputElement)?.value.trim();
  const email = (document.getElementById('reg-email') as HTMLInputElement)?.value.trim();
  const password = regPassword?.value ?? '';
  const confirmPw =
    (document.getElementById('reg-password-confirm') as HTMLInputElement)?.value ?? '';

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
    mismatchEl.classList.toggle('nm-hidden', password === confirmPw);
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
[
  'reg-name',
  'reg-email',
  'reg-password',
  'reg-password-confirm',
  'login-email',
  'login-password',
].forEach((id) => {
  document.getElementById(id)?.addEventListener('input', () => {
    // BUG-F02 FIX: Auto-clear ANY visible banner on user input, not just errors.
    // PREVIOUS: Only checked `bg-red-50` — info banners (bg-blue-50) from
    // EMAIL_NOT_VERIFIED persisted while user typed corrections.
    // NOW: Check if banner is visible (not hidden) to clear all types.
    // Standard: Nielsen #9 (Error Recovery), Material Design 3 (Form Validation).
    if (banner && !banner.classList.contains('nm-hidden')) {
      hideBanner();
    }
    // UX-REM-J002 FIX: Auto-save registration draft on input.
    // Only saves name + email — passwords are NEVER persisted.
    if (id === 'reg-name' || id === 'reg-email') {
      saveRegDraft();
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
    showBanner('error', t('auth_name_required', 'الاسم مطلوب'));
    scrollToField(nameInput);
    return false;
  }

  // Check email
  if (!emailInput?.value.trim()) {
    goToRegStep(1); // PLAT-C01: Navigate to failing step
    showBanner('error', t('auth_email_required', 'البريد الإلكتروني مطلوب'));
    scrollToField(emailInput);
    return false;
  }

  // ── Step 2 fields (Security) ──
  // Check password length
  const password = passwordInput?.value ?? '';
  if (password.length < 8) {
    goToRegStep(2); // PLAT-C01: Navigate to failing step
    showBanner('error', t('auth_password_weak', 'كلمة المرور ضعيفة'));
    scrollToField(passwordInput);
    return false;
  }

  // H2 FIX: Max length check — mirrors backend SEC-003.
  if (password.length > MAX_PASSWORD_LENGTH) {
    goToRegStep(2);
    showBanner('error', t('auth_password_too_long', 'كلمة المرور طويلة جداً (الحد ١٢٨)'));
    scrollToField(passwordInput);
    return false;
  }

  // Check password complexity
  if (
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    goToRegStep(2); // PLAT-C01: Navigate to failing step
    showBanner('error', t('auth_password_complexity', 'كلمة المرور لا تستوفي المتطلبات'));
    scrollToField(passwordInput);
    return false;
  }

  // FRC-002 FIX: Validate password confirmation match
  const confirmInput = document.getElementById('reg-password-confirm') as HTMLInputElement | null;
  const confirmPw = confirmInput?.value ?? '';
  if (password !== confirmPw) {
    goToRegStep(2); // PLAT-C01: Navigate to failing step
    showBanner('error', t('pw_mismatch_error', 'كلمتا المرور غير متطابقتين'));
    scrollToField(confirmInput);
    return false;
  }

  // ── Step 3 fields (Consent) ──
  // P1-CRIT-006 FIX: Validate terms & privacy checkbox acceptance.
  // GDPR Art. 7 — consent must be demonstrably obtained before registration.
  // HTML has `required` on #reg-terms, but `novalidate` on the form disables native checks.
  const termsCheckbox = document.getElementById('reg-terms') as HTMLInputElement | null;
  if (!termsCheckbox?.checked) {
    const termsError = document.getElementById('reg-terms-error');
    if (termsError) {
      termsError.classList.remove('nm-hidden');
    }
    showBanner('error', t('auth_terms_required', 'يجب الموافقة على الشروط'));
    return false;
  }
  // P0-UXA-004: Hide terms error if it was previously shown
  const termsErrorEl = document.getElementById('reg-terms-error');
  if (termsErrorEl) {
    termsErrorEl.classList.add('nm-hidden');
  }

  return true;
}

// ─── Form Submission: LOGIN ─────────────────────────────────────────────────
formLogin?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.isSubmitting) {
    return;
  }

  // P0-UXA-005 FIX: Add .submitted class for CSS validation highlighting.
  // main.css L1646-1652 defines form[novalidate].submitted styles that highlight
  // all empty required fields on first submit attempt.
  // Standard: Nielsen #9 (Error Recognition), CSS-Driven Validation.
  formLogin.classList.add('submitted');

  const email = (document.getElementById('login-email') as HTMLInputElement)?.value.trim();
  const password = (document.getElementById('login-password') as HTMLInputElement)?.value;

  if (!email || !password) {
    showBanner('error', t('auth_enter_email_password', 'أدخل البريد الإلكتروني وكلمة المرور'));
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
  if (submitBtn) {
    submitBtn.classList.add('btn-loading');
  }
  if (submitText) {
    submitText.textContent = t('auth_signing_in', 'جاري تسجيل الدخول…');
  }

  try {
    const response = await auth.login({
      email,
      password,
      remember: (document.getElementById('remember-me') as HTMLInputElement)?.checked ?? false,
    });
    if (response.success && response.data) {
      // UNIFIED CITIZEN: Uses shared handleLoginRedirect — single source of truth
      // for user context setting, redirect params, and onboarding detection.
      await handleLoginRedirect(
        response.data.user as Record<string, unknown>,
        t('auth_welcome_back', 'أهلاً بعودتك!'),
      );
    } else {
      // P0-002 FIX (Wave 2): This else branch only executes for responses where
      // res.ok was TRUE but success was false (e.g., anti-enumeration 200s).
      // Error codes like EMAIL_NOT_VERIFIED come with non-OK statuses (403),
      // which are now thrown as ApiError and caught in the catch block below.
      showBanner('error', response.error ?? t('auth_login_failed', 'فشل تسجيل الدخول'));
    }
  } catch (err) {
    // P0-002 FIX (Wave 2): Detect structured ApiError codes from _client.ts.
    // Previous: `err instanceof Error` only — message string available, code LOST.
    // _client.ts now throws ApiError for non-OK responses, preserving the
    // backend's `code` field (EMAIL_NOT_VERIFIED, SOCIAL_ONLY_ACCOUNT, etc.).
    // This makes showInlineResendVerification() REACHABLE for the first time.
    if (err instanceof ApiError) {
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        showBanner(
          'info',
          err.message || t('auth_email_not_verified', 'يرجى تأكيد بريدك الإلكتروني أولاً'),
        );
        showInlineResendVerification(email);
      } else if (err.code === 'SOCIAL_ONLY_ACCOUNT') {
        // W3-P1-002 FIX: Show actionable recovery CTA with social button highlight.
        // Previous: Text-only info banner — user read the message but didn't know
        // where the social button was (below the fold on mobile).
        // Now: Shows info banner + scrolls to and pulses the matching social button.
        // Standard: Nielsen #9 (Error Recovery), Apple HIG (Clear Escape Routes).
        showBanner('info', err.message);
        // Attempt to extract the provider name from the error message and highlight its button
        const socialBtns = document.querySelectorAll<HTMLButtonElement>('[data-sso-provider]');
        socialBtns.forEach((btn) => {
          const provider = btn.dataset.ssoProvider;
          // Check if the error message mentions this provider (case-insensitive)
          if (provider && err.message.toLowerCase().includes(provider.toLowerCase())) {
            // Scroll the social button into view
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Pulse animation to draw attention
            btn.classList.add('nm-input-flash-focus');
            btn.addEventListener(
              'animationend',
              () => {
                btn.classList.remove('nm-input-flash-focus');
              },
              { once: true },
            );
          }
        });
      } else if (err.status === 429) {
        // W3-P2-007 FIX: Special UX for rate limiting (HTTP 429).
        // Previous: Generic red error banner — user thought account was broken.
        // Now: Amber warning banner with clear "try again later" messaging.
        // Standard: Nielsen #9 (Error Recovery), FinTech Rate Limit UX.
        showBanner(
          'error',
          err.message ||
            t('auth_rate_limited', 'محاولات كثيرة. يرجى الانتظار قبل المحاولة مرة أخرى.'),
        );
      } else {
        showBanner('error', err.message || t('auth_login_failed', 'فشل تسجيل الدخول'));
      }
    } else {
      const message =
        err instanceof Error
          ? err.message
          : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.');
      showBanner('error', message);
    }
  } finally {
    state.isSubmitting = false;
    if (submitBtn) {
      submitBtn.classList.remove('btn-loading');
    }
    if (submitText) {
      submitText.textContent = t('sign_in_btn', 'تسجيل الدخول');
    }
  }
});

// P0-UXA-004 FIX: Live listener — auto-hide terms error when user checks the box.
// Previous: error persisted even after correction — violates Nielsen #9 (Error Recovery).
// Standard: Immediate Error Clearance, Material Design 3 (Form Validation).
const _termsCheckbox = document.getElementById('reg-terms') as HTMLInputElement | null;
_termsCheckbox?.addEventListener('change', () => {
  const termsErr = document.getElementById('reg-terms-error');
  if (_termsCheckbox.checked && termsErr) {
    termsErr.classList.add('nm-hidden');
  }
});

// ─── Form Submission: REGISTER ──────────────────────────────────────────────
formRegister?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.isSubmitting) {
    return;
  }

  // P0-UXA-005 FIX: Add .submitted class for CSS validation highlighting.
  formRegister.classList.add('submitted');

  // FIX-REG-003: Comprehensive validation with clear per-field feedback
  if (!validateRegisterForm()) {
    return;
  }

  const full_name = (document.getElementById('reg-name') as HTMLInputElement)?.value.trim();
  const email = (document.getElementById('reg-email') as HTMLInputElement)?.value.trim();
  const password = (document.getElementById('reg-password') as HTMLInputElement)?.value;
  // W3-P2-001 FIX: Read optional phone field — cross-platform registration parity.
  const phone =
    (document.getElementById('reg-phone') as HTMLInputElement)?.value.trim() || undefined;

  if (!full_name || !email || !password) {
    showBanner('error', t('auth_fill_all_fields', 'يرجى ملء جميع الحقول'));
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
    if (submitText) {
      submitText.textContent = t('auth_creating_account', 'جاري إنشاء الحساب…');
    }

    // ARCH-001 FIX: FIX-REG-005 workaround (inline fetch) removed.
    // The root cause was an indefinite hang without AbortController timeout.
    // api.ts request() now has a 30s AbortController (MED-AUD-009), resolving the hang.
    // Using centralized auth.register() gains: CSRF, timeout, and error reporting.
    // P0-CRIT-001 FIX: intent field removed — no longer collected in the wizard flow.
    // W3-P2-001 FIX: phone field added — cross-platform registration parity.
    const response = await auth.register({ email, password, full_name, phone });

    // P0-AUTH-002 FIX: Override the generic anti-enumeration backend message
    // with a clear, user-friendly success message + email verification instructions.
    // The anti-enumeration protection remains intact — the HTTP response shape
    // is identical for new/existing emails (backend). Only the frontend display
    // is improved for the user who just completed the 3-step wizard.
    if (response.success) {
      // UX-REM-J002 FIX: Clear registration draft on successful registration.
      clearRegDraft();
      // GAP-002 FIX: Set onboarding flag for first-login guided tour
      try {
        localStorage.setItem('nmh_onboarding_pending', '1');
      } catch {
        /* Safari private mode */
      }
      // P0-AUTH-003 FIX: Show "Email Sent" confirmation panel with clear
      // instructions instead of auto-switching to login tab.
      // PREVIOUS: 1.2s delay → switchTab('login') → user sees login form with
      // zero guidance about checking their inbox. They try to login immediately
      // → EMAIL_NOT_VERIFIED error → frustrated dead-end.
      // NOW: Dedicated confirmation panel with animated email icon, the user's
      // email address, clear "check your inbox" instruction, and resend option.
      // Standard: Material Design 3 (State Transitions), Nielsen #1 (System Status).
      showEmailSentConfirmation(email);
    } else {
      showBanner('error', response.error ?? t('auth_reg_failed', 'فشل إنشاء الحساب'));
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.');
    showBanner('error', message);
  } finally {
    state.isSubmitting = false;
    if (regSubmit) {
      regSubmit.classList.remove('btn-loading');
    }
    if (submitText) {
      submitText.textContent = t('create_account_btn', 'إنشاء حساب');
    }
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
      loginEmailInput.addEventListener(
        'animationend',
        () => {
          loginEmailInput.classList.remove('nm-input-flash-focus');
        },
        { once: true },
      );
    }
    showBanner('error', t('auth_forgot_enter_email', 'أدخل بريدك الإلكتروني'));
    return;
  }

  if (forgotBtn) {
    // GAP-2026-001 FIX: Added spinner icon for visual loading consistency.
    // Previous: text-only change "Sending..." — no visual loading indicator.
    // Standard: Design System Governance (all loading states must show spinners).
    forgotBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-sm" aria-hidden="true"></i> ${esc(t('auth_forgot_sending', 'جاري الإرسال…'))}`;
    forgotBtn.setAttribute('aria-disabled', 'true');
    // P1-AUD4-002 FIX: Replaced inline style.pointerEvents + style.opacity with CSS class.
    // Previous: forgotBtn.style.pointerEvents = 'none'; forgotBtn.style.opacity = '0.5'
    // Standard: P1-001 precedent — CSS Single Source of Truth.
    forgotBtn.classList.add('nm-btn-cooldown');
  }

  try {
    const data = await auth.forgotPassword({ email });
    if (data.success) {
      showBanner('success', data.message ?? t('auth_forgot_sent', 'تم إرسال رابط إعادة التعيين!'));
    } else {
      showBanner('error', data.error ?? t('auth_forgot_error', 'فشل الإرسال. حاول مرة أخرى.'));
    }
  } catch (err) {
    showBanner(
      'error',
      err instanceof Error ? err.message : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.'),
    );
  } finally {
    if (forgotBtn) {
      // P2-AUTH-003 FIX: Restore the ORIGINAL i18n key and text, not the
      // action text "Send reset link". The link should revert to "Forgot Password?".
      // PREVIOUS: t('auth_forgot_link_text', 'إرسال رابط إعادة التعيين') — permanently
      // changed the link text after the API call completed.
      forgotBtn.innerHTML = `<span data-i18n="forgot_password">${esc(t('forgot_password', 'نسيت كلمة المرور؟'))}</span>`;
      forgotBtn.removeAttribute('aria-disabled');
      // P1-AUD4-002 FIX: Remove CSS cooldown class (replaces inline style reset).
      forgotBtn.classList.remove('nm-btn-cooldown');
    }
  }
});

// ─── P0-AUTH-003 FIX: Email Sent Confirmation Panel ─────────────────────────
// After successful registration, instead of auto-switching to login tab with
// zero guidance, we show a dedicated "Email Sent" confirmation panel.
// Standard: Material Design 3 (State Transitions), Nielsen #1 (System Status).
// ─────────────────────────────────────────────────────────────────────────────
function showEmailSentConfirmation(emailAddress: string): void {
  // Hide both login and register forms
  if (formLogin) {
    formLogin.classList.add('nm-hidden');
    formLogin.setAttribute('aria-hidden', 'true');
  }
  if (formRegister) {
    formRegister.classList.add('nm-hidden');
    formRegister.setAttribute('aria-hidden', 'true');
  }
  hideBanner();

  // Remove existing panel if re-triggered
  document.getElementById('nm-email-sent-panel')?.remove();

  // Create confirmation panel
  const panel = document.createElement('div');
  panel.id = 'nm-email-sent-panel';
  panel.className = 'px-6 relative z-10 animate-fade-in-up';
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <div class="text-center py-6">
      <div class="inline-flex items-center justify-center size-20 bg-smoky-jade/10 rounded-full mb-5">
        <i class="ph ph-envelope-simple text-smoky-jade dark:text-emerald-400 nm-icon-40" aria-hidden="true"></i>
      </div>
      <h2 class="text-xl font-bold mb-2" data-i18n="auth_email_sent_title">${esc(t('auth_email_sent_title', 'تحقق من بريدك الإلكتروني'))}</h2>
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-1" data-i18n="auth_email_sent_desc">
        ${esc(t('auth_email_sent_desc', 'أرسلنا رابط التحقق إلى'))}
      </p>
      <p class="text-sm font-bold text-trust-blue mb-4 break-all" dir="ltr">${esc(emailAddress)}</p>
      <p class="text-xs text-slate-400 dark:text-slate-500 mb-6" data-i18n="auth_email_sent_hint">
        ${esc(t('auth_email_sent_hint', 'تحقق من مجلد الرسائل غير المرغوب فيها (Spam) إذا لم تجد الرسالة'))}
      </p>
      <div class="flex flex-col gap-3">
        <button type="button" id="nm-resend-from-confirm" class="btn-secondary w-full flex items-center justify-center gap-2">
          <i class="ph ph-arrow-clockwise" aria-hidden="true"></i>
          <span data-i18n="auth_resend_verification">${esc(t('auth_resend_verification', 'إعادة إرسال رابط التحقق'))}</span>
        </button>
        <button type="button" id="nm-back-to-login-from-confirm" class="text-sm text-trust-blue font-medium hover:underline">
          <i class="ph ph-arrow-left nm-icon-back-arrow" aria-hidden="true"></i>
          <span data-i18n="back_to_login">${esc(t('back_to_login', 'العودة لتسجيل الدخول'))}</span>
        </button>
      </div>
    </div>
  `;

  // Insert after the banner area
  const bannerEl = document.getElementById('auth-banner');
  if (bannerEl?.parentNode) {
    bannerEl.parentNode.insertBefore(panel, bannerEl.nextSibling);
  }

  // BUG-F05 FIX: Track active timer IDs for cleanup when panel is removed.
  // PREVIOUS: panel.remove() at L1132 orphaned running setIntervals.
  // Standard: Resource Lifecycle Management, Memory Leak Prevention.
  let _confirmResendTimer: ReturnType<typeof setInterval> | null = null;

  // Wire "Back to Login" button
  document.getElementById('nm-back-to-login-from-confirm')?.addEventListener('click', () => {
    // BUG-F05 FIX: Clear countdown timer BEFORE removing panel.
    if (_confirmResendTimer !== null) {
      clearInterval(_confirmResendTimer);
      _confirmResendTimer = null;
    }
    panel.remove();
    switchTab('login');
    // Pre-fill email for convenience
    const loginEmail = document.getElementById('login-email') as HTMLInputElement | null;
    if (loginEmail) {
      loginEmail.value = emailAddress;
      loginEmail.focus();
    }
  });

  // Wire "Resend" button with cooldown
  const resendBtn = document.getElementById('nm-resend-from-confirm') as HTMLButtonElement | null;
  resendBtn?.addEventListener('click', async () => {
    if (!resendBtn || resendBtn.classList.contains('btn-loading')) {
      return;
    }
    resendBtn.classList.add('btn-loading');

    try {
      const data = await auth.resendVerification({ email: emailAddress });
      if (data.success) {
        showBanner('success', data.message ?? t('auth_resend_sent', 'تم إعادة إرسال رابط التحقق'));
      } else {
        showBanner('error', data.error ?? t('auth_resend_failed', 'فشل إعادة الإرسال'));
      }
    } catch (err) {
      showBanner(
        'error',
        err instanceof Error
          ? err.message
          : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.'),
      );
    } finally {
      resendBtn.classList.remove('btn-loading');
      // BUG-F03 FIX: Replaced disabled + inline opacity/pointer-events with nm-btn-cooldown.
      // PREVIOUS: setAttribute('disabled', 'true') removed button from tab order
      // — WCAG 2.1.1 violation. Screen reader users lost the element during cooldown.
      // NOW: nm-btn-cooldown applies pointer-events:none + opacity:0.5 via CSS class
      // while keeping the button in tab order and accessible to assistive technology.
      // Standard: WCAG 2.1.1 (Keyboard), Design System Governance.
      resendBtn.classList.add('nm-btn-cooldown');
      resendBtn.setAttribute('aria-disabled', 'true');
      let countdown = 60;
      const countdownSpan = resendBtn.querySelector('span');
      const originalText = countdownSpan?.textContent ?? '';
      // BUG-F05 FIX: Store timer for cleanup in "Back to Login" handler.
      _confirmResendTimer = setInterval(() => {
        countdown--;
        if (countdownSpan) {
          countdownSpan.textContent = `${t('auth_resend_wait', 'انتظر')} (${countdown}s)`;
        }
        if (countdown <= 0) {
          if (_confirmResendTimer !== null) {
            clearInterval(_confirmResendTimer);
            _confirmResendTimer = null;
          }
          resendBtn.classList.remove('nm-btn-cooldown');
          resendBtn.removeAttribute('aria-disabled');
          if (countdownSpan) {
            countdownSpan.textContent = originalText;
          }
        }
      }, 1000);
    }
  });
}

// ─── P1-AUTH-001 FIX: Inline Resend Verification from Login Page ────────────
// When login fails with EMAIL_NOT_VERIFIED, show a "Resend Verification" button
// directly in the login form so the user isn't stuck at a dead-end.
// Standard: Nielsen #9 (Error Recovery), WCAG 3.3.3 (Error Suggestion).
// ─────────────────────────────────────────────────────────────────────────────
function showInlineResendVerification(emailAddress: string): void {
  // Remove existing if already shown
  document.getElementById('nm-inline-resend')?.remove();

  const container = document.createElement('div');
  container.id = 'nm-inline-resend';
  container.className =
    'mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200 text-center animate-fade-in-up dark:bg-blue-900/20 dark:border-blue-800';
  container.innerHTML = `
    <p class="text-xs text-blue-700 dark:text-blue-300 mb-2" data-i18n="auth_resend_prompt">
      ${esc(t('auth_resend_prompt', 'لم تصلك رسالة التحقق؟'))}
    </p>
    <button type="button" id="nm-inline-resend-btn" class="btn-secondary nm-btn-compact text-xs flex items-center justify-center gap-1 mx-auto">
      <i class="ph ph-envelope" aria-hidden="true"></i>
      <span>${esc(t('auth_resend_verification', 'إعادة إرسال رابط التحقق'))}</span>
    </button>
  `;

  // Insert after the login submit button
  const loginSubmitWrapper = document.getElementById('login-submit')?.parentElement;
  if (loginSubmitWrapper) {
    loginSubmitWrapper.insertAdjacentElement('afterend', container);
  }

  // Wire button
  const btn = document.getElementById('nm-inline-resend-btn') as HTMLButtonElement | null;
  btn?.addEventListener('click', async () => {
    if (!btn || btn.classList.contains('btn-loading')) {
      return;
    }
    btn.classList.add('btn-loading');

    try {
      const data = await auth.resendVerification({ email: emailAddress });
      if (data.success) {
        showBanner('success', data.message ?? t('auth_resend_sent', 'تم إعادة إرسال رابط التحقق'));
        container.remove();
      } else {
        showBanner('error', data.error ?? t('auth_resend_failed', 'فشل إعادة الإرسال'));
      }
    } catch (err) {
      showBanner(
        'error',
        err instanceof Error
          ? err.message
          : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.'),
      );
    } finally {
      btn.classList.remove('btn-loading');
      // BUG-F03 FIX: Replaced disabled + inline opacity/pointer-events with nm-btn-cooldown.
      // Same WCAG 2.1.1 fix as post-registration resend — keeps button in tab order.
      btn.classList.add('nm-btn-cooldown');
      btn.setAttribute('aria-disabled', 'true');
      let countdown = 60;
      const resendSpan = btn.querySelector('span');
      const originalResendText = resendSpan?.textContent ?? '';
      const resendTimer = setInterval(() => {
        countdown--;
        if (resendSpan) {
          resendSpan.textContent = `${t('auth_resend_wait', 'انتظر')} (${countdown}s)`;
        }
        if (countdown <= 0) {
          clearInterval(resendTimer);
          btn.classList.remove('nm-btn-cooldown');
          btn.removeAttribute('aria-disabled');
          if (resendSpan) {
            resendSpan.textContent = originalResendText;
          }
        }
      }, 1000);
    }
  });
}

// ─── OAuth-001: Social Login Integration ──────────────────────────────────────
// Replaces the old "Coming Soon" banners with real OAuth flows.
// Each provider's SDK obtains an ID token, which is sent to POST /api/auth/social.
// Backend verifies server-side and returns JWT + user (same as email login).
// ──────────────────────────────────────────────────────────────────────────────

// ─── C2 FIX: Shared Post-Login Redirect Handler ─────────────────────────────
// DRY-001: Previously, the entire user context setting + role-based routing +
// redirect param handling + onboarding detection was duplicated across:
//   - Email login success (40 lines)
//   - Social login success (40 lines)
// Now a single function governs all post-authentication redirects.
// ─────────────────────────────────────────────────────────────────────────────
async function handleLoginRedirect(
  rawUserData: Record<string, unknown>,
  successMessage: string,
): Promise<void> {
  const userData = rawUserData as {
    user_id: string;
    full_name: string;
    role: string;
    roles?: string[];
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
    email: userData.email,
    kyc_verified: userData.is_active,
  });

  showBanner('success', successMessage);

  // UNIFIED CITIZEN: All users go to homepage. ?redirect= param from auth-guard
  // takes priority for deep-link scenarios (e.g. /project-details?id=X).
  const redirectParam = new URLSearchParams(window.location.search).get('redirect');
  let finalTarget = redirectParam ? decodeURIComponent(redirectParam) : POST_LOGIN_REDIRECT;

  // Security: Only allow relative paths (prevent open redirect vulnerability)
  if (finalTarget.startsWith('//') || finalTarget.includes('://')) {
    finalTarget = POST_LOGIN_REDIRECT;
  }

  // GAP-002 FIX: Detect first login after registration → append onboarding param.
  try {
    if (localStorage.getItem('nmh_onboarding_pending') === '1') {
      localStorage.removeItem('nmh_onboarding_pending');
      finalTarget += (finalTarget.includes('?') ? '&' : '?') + 'onboarding=1';
    }
  } catch {
    /* Safari private mode */
  }

  // ─── P1-001 FIX: Workspace-Aware Post-Login Redirect ────────────────
  // Returning users who previously selected a workspace (via Welcome Chooser
  // or by clicking a portal card) are redirected directly to their preferred
  // portal instead of the generic homepage.
  //
  // Priority chain (highest → lowest):
  //   1. ?redirect= param (deep link from auth-guard — e.g. /project-details?id=X)
  //   2. nmh_onboarding_pending (first login → homepage + welcome chooser)
  //   3. nm_preferred_workspace (returning user → portal shortcut)
  //   4. POST_LOGIN_REDIRECT / (default homepage)
  //
  // Security: resolveWorkspaceUrl() is a whitelist lookup — returns null for
  // unknown IDs, preventing open redirect via tampered localStorage.
  // ─────────────────────────────────────────────────────────────────────
  if (!redirectParam && !finalTarget.includes('onboarding=1')) {
    try {
      const { resolveWorkspaceUrl, WS_STORAGE_KEY } = await import('../utils/workspace-map');
      const preferredWs = localStorage.getItem(WS_STORAGE_KEY);
      const wsUrl = resolveWorkspaceUrl(preferredWs);
      if (wsUrl) {
        finalTarget = wsUrl;
      }
    } catch {
      /* Module load failure — fall through to default homepage */
    }
  }

  setTimeout(() => {
    window.location.href = finalTarget;
  }, 800);
}

/**
 * Shared handler: after POST /api/auth/social returns successfully,
 * set user context and redirect via the shared handleLoginRedirect.
 * C2 FIX: No longer duplicates the entire redirect logic.
 */
async function handleSocialLoginSuccess(
  response: {
    success: boolean;
    data?: { user?: Record<string, unknown>; is_new_user?: boolean };
    error?: string;
  },
  _provider: string,
): Promise<void> {
  if (!response.success || !response.data?.user) {
    showBanner('error', response.error ?? t('auth_login_failed', 'فشل تسجيل الدخول'));
    return;
  }

  // P1-AUTH-004 FIX: Set onboarding flag for social login new users.
  // PREVIOUS: nmh_onboarding_pending was only set during email registration (L903-907).
  // Social login users who auto-register via Google/Apple/Facebook never got the
  // welcome tour — they landed on homepage with 5 roles and zero guidance.
  // NOW: Backend social-auth response includes is_new_user. If true, set the flag.
  // Standard: Nielsen #10 (Help \u0026 Documentation), Material Design 3 (Onboarding).
  if (response.data.is_new_user) {
    try {
      localStorage.setItem('nmh_onboarding_pending', '1');
    } catch {
      /* Safari private mode */
    }
  }

  await handleLoginRedirect(response.data.user, t('auth_welcome_social', 'مرحباً! تم تسجيل دخولك'));
}

/**
 * Set loading state on a social button.
 */
function setSocialBtnLoading(btn: HTMLButtonElement, loading: boolean): void {
  if (loading) {
    btn.classList.add('btn-loading');
    state.isSubmitting = true;
  } else {
    btn.classList.remove('btn-loading');
    state.isSubmitting = false;
  }
}
// ─── UX-F019 FIX: Lazy SDK Loader ────────────────────────────────────────────
// PREVIOUS: 3 OAuth SDK <script> tags loaded eagerly on auth.html (~450KB).
// On Syria 2G (50-100 kbps), this added 7+ seconds to initial page load.
// NOW: SDKs loaded on-demand when user first clicks a social login button.
// Each SDK is loaded at most once; subsequent clicks reuse the loaded SDK.
// Standard: PRPL Pattern, Core Web Vitals 3.0, Sustainable Web (2G-first).
const _loadedSdks = new Map<string, Promise<void>>();

function loadSdkOnDemand(src: string, id: string): Promise<void> {
  const existing = _loadedSdks.get(id);
  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve, reject) => {
    // Check if already in DOM (e.g., loaded by another code path)
    if (document.getElementById(id)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load SDK: ${id}`));
    document.head.appendChild(script);
  });

  _loadedSdks.set(id, promise);
  return promise;
}

// ─── Google Sign-In (GSI) ───────────────────────────────────────────────────
// OAUTH-FIX-001: Replaced unreliable google.accounts.id.prompt() (One Tap)
// with a proper OAuth2 popup window flow. One Tap fails in incognito,
// with ad blockers, and when 3rd-party cookies are disabled.
// Docs: https://developers.google.com/identity/gsi/web/reference/js-reference

// Declare GSI types
declare const google: {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
        auto_select?: boolean;
      }) => void;
      prompt: (
        notification?: (status: {
          isNotDisplayed: () => boolean;
          isSkippedMoment: () => boolean;
        }) => void,
      ) => void;
      renderButton: (
        element: HTMLElement,
        config: {
          type: string;
          theme: string;
          size: string;
          logo_alignment: string;
          width?: number;
        },
      ) => void;
    };
    oauth2: {
      initCodeClient: (config: {
        client_id: string;
        scope: string;
        ux_mode: string;
        callback: (response: { code: string }) => void;
      }) => { requestCode: () => void };
    };
  };
};

function initGoogleSignIn(): void {
  const googleClientId = (window as unknown as Record<string, unknown>).__GOOGLE_CLIENT_ID__ as
    | string
    | undefined;
  if (!googleClientId) {
    reportWarning('[OAuth] Google Client ID not configured.', {
      component: 'auth',
      action: 'init_google',
    });
  }

  document.querySelectorAll<HTMLButtonElement>('[data-sso-provider="google"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (state.isSubmitting) {
        return;
      }
      haptic.light();

      // UX-F019 FIX: Lazy-load Google GSI SDK on first click.
      try {
        await loadSdkOnDemand('https://accounts.google.com/gsi/client', 'gsi-sdk');
      } catch {
        /* fallback below */
      }

      // PLATINUM-001: Clean two-strategy flow (dead renderButton hack removed).
      // Strategy 1: GSI SDK loaded → use prompt() for native One Tap UX.
      // If prompt fails (incognito, ad blockers, cookies) → immediate manual popup fallback.
      if (typeof google !== 'undefined' && google?.accounts?.id) {
        setSocialBtnLoading(btn, true);
        try {
          google.accounts.id.initialize({
            client_id: googleClientId ?? '',
            callback: async (credentialResponse) => {
              try {
                const response = await auth.socialLogin({
                  provider: 'google',
                  id_token: credentialResponse.credential,
                  remember: getRememberMe(),
                });
                await handleSocialLoginSuccess(
                  response as {
                    success: boolean;
                    data?: { user?: Record<string, unknown> };
                    error?: string;
                  },
                  'Google',
                );
              } catch (err) {
                const msg =
                  err instanceof Error
                    ? err.message
                    : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.');
                showBanner('error', msg);
              } finally {
                setSocialBtnLoading(btn, false);
              }
            },
          });

          // Trigger Google One Tap prompt — best UX when it works.
          // On failure (incognito, ad blockers, 3rd-party cookies blocked),
          // immediately fall back to manual OAuth popup.
          google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              setSocialBtnLoading(btn, false);
              openGoogleOAuthPopup(googleClientId ?? '');
            }
          });
        } catch {
          setSocialBtnLoading(btn, false);
          // GSI SDK threw — fall back to manual popup
          openGoogleOAuthPopup(googleClientId ?? '');
        }
        return;
      }

      // Strategy 2: GSI SDK not loaded (blocked by ad blocker/network) — manual popup
      openGoogleOAuthPopup(googleClientId ?? '');
    });
  });
}

/**
 * OAUTH-FIX-001: Manual Google OAuth popup — works even when GSI SDK is blocked.
 * Opens Google's OAuth consent screen in a popup window, polls for the redirect
 * back to our origin, and extracts the id_token from the hash fragment.
 *
 * PLATINUM-002: Full CSRF protection via one-time-use state parameter.
 */
function openGoogleOAuthPopup(clientId: string): void {
  if (!clientId) {
    showBanner('error', t('auth_sso_unavailable', 'تسجيل الدخول الاجتماعي غير متاح حالياً'));
    return;
  }

  const redirectUri = `${window.location.origin}/auth.html`;
  const scope = 'openid email profile';

  // PLATINUM-002: Cryptographically random state for CSRF protection.
  // Uses crypto.getRandomValues for unpredictability (not Math.random).
  const stateArray = new Uint8Array(16);
  crypto.getRandomValues(stateArray);
  const oauthState = Array.from(stateArray, (b) => b.toString(16).padStart(2, '0')).join('');

  // Store state for validation in the polling callback (one-time use).
  try {
    sessionStorage.setItem('__google_oauth_state', oauthState);
  } catch {
    /* incognito — degrade gracefully */
  }

  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=id_token` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(oauthState)}` +
    `&nonce=${encodeURIComponent(nonce)}` +
    `&prompt=select_account`;

  const width = 500,
    height = 600;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  const popup = window.open(
    authUrl,
    'google_oauth',
    `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no`,
  );

  if (!popup) {
    showBanner('error', t('auth_google_popup_blocked', 'نافذة Google المنبثقة محظورة'));
    return;
  }

  // Poll for the popup redirect (hash fragment contains id_token)
  const pollTimer = setInterval(async () => {
    try {
      if (popup.closed) {
        clearInterval(pollTimer);
        return;
      }
      // Check if the popup has navigated back to our origin
      if (popup.location.origin === window.location.origin) {
        clearInterval(pollTimer);
        const hash = popup.location.hash.substring(1);
        popup.close();

        const params = new URLSearchParams(hash);
        const idToken = params.get('id_token');
        const returnedState = params.get('state');

        // PLATINUM-002: CSRF state validation — reject mismatched tokens.
        let storedState: string | null = null;
        try {
          storedState = sessionStorage.getItem('__google_oauth_state');
        } catch {
          /* ignore */
        }

        if (storedState && returnedState !== storedState) {
          console.error(
            '[OAuth] CSRF state mismatch — rejecting token. Expected:',
            storedState,
            'Got:',
            returnedState,
          );
          showBanner('error', t('auth_csrf_error', 'خطأ أمني — يرجى تحديث الصفحة'));
          // Clear one-time state
          try {
            sessionStorage.removeItem('__google_oauth_state');
          } catch {
            /* ignore */
          }
          return;
        }

        // Clear one-time state after successful validation
        try {
          sessionStorage.removeItem('__google_oauth_state');
        } catch {
          /* ignore */
        }

        if (idToken) {
          try {
            const response = await auth.socialLogin({
              provider: 'google',
              id_token: idToken,
              remember: getRememberMe(),
            });
            await handleSocialLoginSuccess(
              response as {
                success: boolean;
                data?: { user?: Record<string, unknown> };
                error?: string;
              },
              'Google',
            );
          } catch (err) {
            const msg =
              err instanceof Error
                ? err.message
                : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.');
            showBanner('error', msg);
          }
        }
      }
    } catch {
      // Cross-origin — popup hasn't redirected yet, keep polling
    }
  }, 500);

  // Safety timeout: stop polling after 5 minutes
  setTimeout(() => {
    clearInterval(pollTimer);
    // Clean up stale state if popup was abandoned
    try {
      sessionStorage.removeItem('__google_oauth_state');
    } catch {
      /* ignore */
    }
  }, 300000);
}

// ─── Apple Sign-In ──────────────────────────────────────────────────────────
// Apple Sign-In uses a popup/redirect flow. The JWT is returned directly.
// Docs: https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js

function initAppleSignIn(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-sso-provider="apple"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (state.isSubmitting) {
        return;
      }
      haptic.light();
      setSocialBtnLoading(btn, true);

      try {
        // UX-F019 FIX: Lazy-load Apple Sign-In SDK on first click.
        try {
          await loadSdkOnDemand(
            'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
            'apple-sdk',
          );
        } catch {
          /* poll below */
        }

        // Apple Sign In JS SDK check — poll briefly for async load
        let AppleID = (window as unknown as Record<string, unknown>).AppleID as
          | {
              auth: {
                init: (config: Record<string, unknown>) => void;
                signIn: () => Promise<{
                  authorization: { id_token: string; code: string };
                  user?: { name?: { firstName?: string; lastName?: string }; email?: string };
                }>;
              };
            }
          | undefined;

        // Wait up to 2s for Apple SDK to load
        if (!AppleID?.auth) {
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 200));
            AppleID = (window as unknown as Record<string, unknown>).AppleID as typeof AppleID;
            if (AppleID?.auth) {
              break;
            }
          }
        }

        if (!AppleID?.auth) {
          showBanner('info', t('auth_apple_not_configured', 'تسجيل Apple غير مهيأ بعد'));
          setSocialBtnLoading(btn, false);
          return;
        }

        const appleClientId = (window as unknown as Record<string, unknown>).__APPLE_CLIENT_ID__ as
          | string
          | undefined;
        AppleID.auth.init({
          clientId: appleClientId ?? '',
          scope: 'name email',
          redirectURI: `${window.location.origin}/auth.html`,
          usePopup: true,
        });

        const appleResponse = await AppleID.auth.signIn();
        const fullName = appleResponse.user?.name
          ? `${appleResponse.user.name.firstName ?? ''} ${appleResponse.user.name.lastName ?? ''}`.trim()
          : undefined;

        const response = await auth.socialLogin({
          provider: 'apple',
          id_token: appleResponse.authorization.id_token,
          full_name: fullName || undefined,
          remember: getRememberMe(),
        });

        await handleSocialLoginSuccess(
          response as {
            success: boolean;
            data?: { user?: Record<string, unknown> };
            error?: string;
          },
          'Apple',
        );
      } catch (err) {
        // User cancelled Apple popup — not an error
        if (err instanceof Error && err.message.includes('popup_closed')) {
          // Silent — user just closed the popup
        } else {
          const msg =
            err instanceof Error
              ? err.message
              : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.');
          showBanner('error', msg);
        }
      } finally {
        setSocialBtnLoading(btn, false);
      }
    });
  });
}

// ─── Facebook Login ─────────────────────────────────────────────────────────
// OAUTH-FIX-002: Added FB.init() — was completely missing before.
// Without FB.init(), the Facebook SDK loads but never initializes,
// causing FB.login() to be undefined.
// Docs: https://developers.facebook.com/docs/facebook-login/web

// Initialize Facebook SDK
(function initFBSDK() {
  const fbAppId = (window as unknown as Record<string, unknown>).__FACEBOOK_APP_ID__ as
    | string
    | undefined;
  if (!fbAppId) {
    return;
  }

  // fbAsyncInit is called by the Facebook SDK when it finishes loading
  (window as unknown as Record<string, unknown>).fbAsyncInit = function () {
    const FB = (window as unknown as Record<string, unknown>).FB as
      | {
          init: (config: Record<string, unknown>) => void;
        }
      | undefined;
    FB?.init({
      appId: fbAppId,
      cookie: true,
      xfbml: false,
      version: 'v19.0',
    });
  };

  // If FB SDK already loaded before this code ran
  const FB = (window as unknown as Record<string, unknown>).FB as
    | {
        init: (config: Record<string, unknown>) => void;
      }
    | undefined;
  if (FB?.init) {
    FB.init({
      appId: fbAppId,
      cookie: true,
      xfbml: false,
      version: 'v19.0',
    });
  }
})();

function initFacebookLogin(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-sso-provider="facebook"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (state.isSubmitting) {
        return;
      }
      haptic.light();
      setSocialBtnLoading(btn, true);

      try {
        // Wait up to 2s for FB SDK to initialize
        let FB = (window as unknown as Record<string, unknown>).FB as
          | {
              login: (
                callback: (response: { authResponse?: { accessToken: string } }) => void,
                options: { scope: string },
              ) => void;
              getLoginStatus: (
                callback: (response: {
                  status: string;
                  authResponse?: { accessToken: string };
                }) => void,
              ) => void;
            }
          | undefined;

        if (!FB?.login) {
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 200));
            FB = (window as unknown as Record<string, unknown>).FB as typeof FB;
            if (FB?.login) {
              break;
            }
          }
        }

        if (!FB?.login) {
          showBanner('info', t('auth_facebook_not_configured', 'تسجيل Facebook غير مهيأ بعد'));
          setSocialBtnLoading(btn, false);
          return;
        }

        FB.login(
          async (fbResponse) => {
            if (!fbResponse.authResponse?.accessToken) {
              setSocialBtnLoading(btn, false);
              return; // User cancelled
            }

            try {
              const response = await auth.socialLogin({
                provider: 'facebook',
                id_token: fbResponse.authResponse.accessToken,
                remember: getRememberMe(),
              });
              await handleSocialLoginSuccess(
                response as {
                  success: boolean;
                  data?: { user?: Record<string, unknown> };
                  error?: string;
                },
                'Facebook',
              );
            } catch (err) {
              const msg =
                err instanceof Error
                  ? err.message
                  : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.');
              showBanner('error', msg);
            } finally {
              setSocialBtnLoading(btn, false);
            }
          },
          { scope: 'email,public_profile' },
        );
      } catch {
        setSocialBtnLoading(btn, false);
        showBanner('error', t('auth_sso_unavailable', 'تسجيل الدخول الاجتماعي غير متاح حالياً'));
      }
    });
  });
}

// Initialize all social providers
initGoogleSignIn();
initAppleSignIn();
initFacebookLogin();

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
    if (tab === 'register') {
      goToRegStep(1);
    }
  },
  getCurrentTab: () => state.mode,
  threshold: 60, // Slightly higher than default (50) to avoid accidental triggers
  maxVertical: 80,
});

// FIX-3: Pull-to-refresh gesture.
// On cached/stale auth page loads (common on Syrian mobile networks),
// users need a way to force-refresh without knowing browser controls.
initPullToRefresh();

// ─── PLT-UX-AUD P0-SESSION-003 FIX: Session Expiry URL Fallback ─────────────
// When _client.ts detects a 401, it tries to show a toast via dynamic import.
// On Syria's 2G, that import can fail silently — user arrives here with zero
// explanation. The &reason=session_expired URL param is the fallback.
// This is independent of any dynamic import — guaranteed to work.
// ─────────────────────────────────────────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('reason') === 'session_expired') {
  showBanner('info', t('session_expired', 'انتهت جلستك. يرجى تسجيل الدخول مجدداً.'));
  // Clean the URL to prevent showing the banner on refresh
  urlParams.delete('reason');
  const cleanSearch = urlParams.toString();
  const cleanUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '');
  history.replaceState(null, '', cleanUrl);
}

// BUG-F13 FIX: Pre-fill login email from ?email= URL param.
// After successful email verification, verify-email.ts appends ?email=<user@example.com>
// to the Sign In link. This avoids forcing the user to re-type their email.
// Standard: Nielsen #6 (Recognition over Recall), Zero Re-entry Friction.
const emailParam = urlParams.get('email');
if (emailParam) {
  const loginEmailInput = document.getElementById('login-email') as HTMLInputElement | null;
  if (loginEmailInput) {
    loginEmailInput.value = decodeURIComponent(emailParam);
  }
  // Clean the URL to avoid leaking email in address bar
  urlParams.delete('email');
  const cleanSearch = urlParams.toString();
  const cleanUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '');
  history.replaceState(null, '', cleanUrl);
}

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
} else if (state.mode === 'register') {
  // W3-P3-004 FIX: Autofocus for register tab — was missing.
  // Previous: Only login mode had autofocus. Register users had to manually tap name field.
  // Standard: Apple HIG ("Focus the primary input"), Material Design 3.
  requestAnimationFrame(() => {
    document.getElementById('reg-name')?.focus();
  });
}

// ─── GAP-2026-008 FIX: Clickable Stepper Dots (Completed Steps) ─────────────
// Previous: cursor:default — users couldn't click step indicators to jump.
// Now: Completed step dots are clickable (not active or future steps).
// Standard: Material Design 3 (Stepper Interaction), Nielsen #3 (User Control).
// ─────────────────────────────────────────────────────────────────────────────
formRegister?.querySelectorAll<HTMLElement>('[data-step-dot]').forEach((dot) => {
  dot.addEventListener('click', () => {
    const dotStep = parseInt(dot.dataset.stepDot ?? '0', 10);
    // Allow navigation to completed steps only (not forward from current)
    if (dot.classList.contains('completed')) {
      goToRegStep(dotStep);
    }
  });
});
