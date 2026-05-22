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
// P1-W12-001 FIX: Import shared validators — single source of truth for email regex.
// PREVIOUS: 4 copies of the same email regex inline across auth.ts and reset-password.ts.
// Standard: DRY Principle, Centralized Validation.
import { EMAIL_REGEX } from '../utils/validators';

// W3-P2-002 FIX: Pre-fetch CSRF token on page load (fire-and-forget).
// Previous: CSRF fetched on first form submit — added invisible 2-5s delay on Syria 2G.
// Now: Token pre-fetched while user is still reading the page.
// Standard: Web Vitals (TBT), PRPL Pattern, Proactive Resource Loading.
warmCsrf();

// P0-W12-001 FIX: Re-warm CSRF token when tab becomes visible after background.
// PREVIOUS: warmCsrf() fired once on page load (L33). If the user left the tab open
// for 2+ hours (common on Syria 2G — interrupted connectivity), CSRF token expired.
// ALL subsequent form submissions silently failed with 403.
// NOW: Re-fetches CSRF on tab visibility change (fire-and-forget, no UI impact).
// Standard: Page Visibility API, Web Vitals (TBT), Syria 2G Resilience.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    warmCsrf();
  }
});

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

// ─── P1-W6-001 FIX: Module-Scoped Timer Registry ───────────────────────────
// PREVIOUS: Countdown timers used local `const resendTimer = setInterval(...)` variables.
// These leaked if the user navigated away (SPA redirect, tab close, bfcache).
// The timer continued ticking against orphaned DOM, wasting CPU and memory.
//
// FIX: All interval timers register in `_activeTimers`. Utility helpers ensure:
//   1. Automatic registration on creation (`createTrackedInterval`)
//   2. Automatic deregistration on clearance (`clearTrackedInterval`)
//   3. Bulk cleanup on `pagehide` (bfcache-safe; `beforeunload` blocks bfcache)
//
// Standard: Web Performance (Timer Hygiene), Page Lifecycle API.
// ─────────────────────────────────────────────────────────────────────────────
const _activeTimers = new Set<ReturnType<typeof setInterval>>();

/** Create a setInterval that auto-registers in the timer registry. */
function createTrackedInterval(
  callback: () => void,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  const timerId = setInterval(callback, intervalMs);
  _activeTimers.add(timerId);
  return timerId;
}

/** Clear a tracked interval and remove from registry. No-op if null. */
function clearTrackedInterval(timerId: ReturnType<typeof setInterval> | null): null {
  if (timerId !== null) {
    clearInterval(timerId);
    _activeTimers.delete(timerId);
  }
  return null;
}

/** Clear ALL active timers — called on pagehide for bfcache-safe cleanup. */
function clearAllTrackedTimers(): void {
  for (const timerId of _activeTimers) {
    clearInterval(timerId);
  }
  _activeTimers.clear();
}

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
// UX-3 FIX: When called from the register tab, the checkbox is hidden/absent.
// PREVIOUS: Returned false → social-login new users got a 24h session.
// NOW: Returns true when checkbox is not found (register tab active).
// Rationale: New users just created their account — forcing re-login the
// next day is hostile UX. Returning true gives them the 30-day session.
// Standard: Nielsen #7 (Flexibility), FinTech Onboarding Best Practices.
function getRememberMe(): boolean {
  const checkbox = document.getElementById('remember-me') as HTMLInputElement | null;
  // If checkbox exists and is visible (login tab), use its checked state.
  // If checkbox is absent/hidden (register tab), default to true for new users.
  return checkbox ? checkbox.checked : true;
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

// ─── P2-DEEP-001 FIX: Strict Name Validation ───────────────────────────────
// PREVIOUS: Only checked `!name` (non-empty). Accepted "123456", "!!!", "🎉🎊".
// These are not real human names and pollute the database.
// DESIGN DECISIONS:
//   - Min 2 chars: Backend parity (registerSchema.full_name.min(2)). Covers "Li", "عل"
//   - Max 100 chars: Backend parity (registerSchema.full_name.max(100))
//   - Must contain ≥1 Unicode letter (\p{L}): Rejects pure numbers/symbols/emoji
//     while accepting ANY script (Arabic, Chinese, Cyrillic, Devanagari, Latin, etc.)
//   - No digits anywhere: Real human names don't contain digits. "علي123" is invalid.
//   - No dangerous chars (<>{}[]\): Defense-in-depth XSS layer (escapeHtml is primary)
//   - Allows: spaces, hyphens, apostrophes, dots, commas (O'Brien, Al-Rashid, Jr.)
// Standard: Nielsen #5 (Error Prevention), Unicode CLDR Name Validation,
// OWASP Input Validation Cheat Sheet.
// ─────────────────────────────────────────────────────────────────────────────
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;

interface NameValidationResult {
  valid: boolean;
  errorKey: string;
  fallbackMsg: string;
}

function validateName(name: string): NameValidationResult {
  const trimmed = name.trim();

  // 1. Empty check
  if (!trimmed) {
    return { valid: false, errorKey: 'auth_name_required', fallbackMsg: 'الاسم مطلوب' };
  }

  // 2. Length bounds — backend parity (registerSchema L50)
  if (trimmed.length < NAME_MIN_LENGTH) {
    return {
      valid: false,
      errorKey: 'auth_name_too_short',
      fallbackMsg: `الاسم قصير جداً (الحد الأدنى ${NAME_MIN_LENGTH} أحرف)`,
    };
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return {
      valid: false,
      errorKey: 'auth_name_too_long',
      fallbackMsg: `الاسم طويل جداً (الحد الأقصى ${NAME_MAX_LENGTH} حرف)`,
    };
  }

  // 3. Must contain at least one Unicode letter — rejects "123", "!!!", "🎉🎊"
  // \p{L} matches letters in ANY Unicode script (Arabic, Latin, CJK, Cyrillic, etc.)
  if (!/\p{L}/u.test(trimmed)) {
    return {
      valid: false,
      errorKey: 'auth_name_must_have_letters',
      fallbackMsg: 'الاسم يجب أن يحتوي على أحرف',
    };
  }

  // 4. No digits — no real human name contains numbers
  if (/[0-9]/.test(trimmed)) {
    return {
      valid: false,
      errorKey: 'auth_name_no_digits',
      fallbackMsg: 'الاسم لا يجب أن يحتوي على أرقام',
    };
  }

  // 5. No dangerous characters — defense-in-depth XSS prevention
  if (/[<>{}[\]\\]/.test(trimmed)) {
    return {
      valid: false,
      errorKey: 'auth_name_invalid_chars',
      fallbackMsg: 'الاسم يحتوي على رموز غير مسموح بها',
    };
  }

  return { valid: true, errorKey: '', fallbackMsg: '' };
}

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
    // P2-W6-003 FIX: Always cap restoration at Step 1 (name + email only).
    // Previous: Could advance to Step 2, showing empty password fields with no context.
    // Password fields are never saved (correct security decision), so advancing
    // to Step 2 from a draft is confusing. Parity with Flutter RegisterWizardCubit.
    // No step restoration — user always starts at Step 1 with pre-filled name/email.
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

  // P2-DEEP-003 FIX: Re-trigger password strength meter on Step 2 navigation.
  // PREVIOUS: If user fills Step 2 (password), goes to Step 3, then back to Step 2,
  // the strength meter bars didn't reflect the current password value because the
  // `input` event wasn't re-fired on step navigation.
  // Standard: Nielsen #1 (Visibility of System Status), State Consistency.
  if (targetStep === 2 && regPassword) {
    updatePasswordStrength(regPassword.value, strengthBars, strengthLabel);
  }

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
    // P2-DEEP-001 FIX: Use validateName() for strict name validation.
    const nameResult = validateName(name ?? '');
    if (!nameResult.valid) {
      showBanner('error', t(nameResult.errorKey, nameResult.fallbackMsg));
      scrollToField(document.getElementById('reg-name'));
      return false;
    }
    if (!email) {
      showBanner('error', t('auth_email_required', 'البريد الإلكتروني مطلوب'));
      scrollToField(document.getElementById('reg-email'));
      return false;
    }
    // P1-W12-001 FIX: Use shared EMAIL_REGEX from validators.ts — single source of truth.
    // Previous: Inline regex duplicated 4 times across auth.ts and reset-password.ts.
    // Standard: DRY Principle, Centralized Validation.
    if (!EMAIL_REGEX.test(email)) {
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
    // P0-W12-003 FIX: Guard against double-submit via Enter key during in-flight request.
    // PREVIOUS: Enter key bypassed pointer-events:none (btn-loading) and re-entered
    // the submit handler while isSubmitting was true but formRegister?.requestSubmit()
    // fired before the guard check at L1227.
    // Standard: OWASP Rate Limiting, FinTech Double-Submit Prevention.
    if (state.isSubmitting) return;
    // P2-W12-001 FIX: Scroll to unchecked terms checkbox on Enter.
    // PREVIOUS: Validation error shown but terms checkbox not scrolled into view.
    // Standard: WCAG 3.3.1 (Error Identification), Material Design 3.
    const termsCheckbox = document.getElementById('reg-terms') as HTMLInputElement | null;
    if (termsCheckbox && !termsCheckbox.checked) {
      termsCheckbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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

// ─── P2-W12-008 FIX: Restore Active Lockout on Page Load ────────────────────
// PREVIOUS: User hit 429 lockout → countdown timer started → user refreshed page
// → countdown lost → user tried to submit → another 429 with no countdown.
// NOW: Check sessionStorage for persisted lockout end timestamp. If still active,
// show the countdown banner immediately.
// Standard: Nielsen #1 (System Status Visibility), Session Persistence.
// ─────────────────────────────────────────────────────────────────────────────
(function restoreLockoutTimer(): void {
  try {
    const lockoutUntilStr = sessionStorage.getItem('nmh_lockout_until');
    if (!lockoutUntilStr) return;
    const lockoutUntil = parseInt(lockoutUntilStr, 10);
    let remainingSeconds = Math.ceil((lockoutUntil - Date.now()) / 1000);
    if (remainingSeconds <= 0) {
      sessionStorage.removeItem('nmh_lockout_until');
      return;
    }
    const lockoutMsg = () =>
      t(
        'auth_lockout_countdown',
        `الحساب مقفل مؤقتاً — يمكنك المحاولة بعد ${Math.ceil(remainingSeconds / 60)} دقيقة (${remainingSeconds}s)`,
      )
        .replace('{minutes}', String(Math.ceil(remainingSeconds / 60)))
        .replace('{seconds}', String(remainingSeconds));

    showBanner('error', lockoutMsg());

    const _restoreTimer = createTrackedInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        clearTrackedInterval(_restoreTimer);
        try {
          sessionStorage.removeItem('nmh_lockout_until');
        } catch {
          /* ignore */
        }
        showBanner('success', t('auth_lockout_ended', 'يمكنك المحاولة الآن'));
      } else {
        const bannerTextEl = document.getElementById('auth-banner-text');
        if (bannerTextEl) {
          bannerTextEl.textContent = lockoutMsg();
        }
      }
    }, 1000);
  } catch {
    /* sessionStorage unavailable */
  }
})();

// ─── Password Toggle ────────────────────────────────────────────────────────
function setupPasswordToggle(toggleId: string, inputId: string): void {
  const toggle = document.getElementById(toggleId);
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!toggle || !input) {
    return;
  }

  // P2-W12-002 FIX: Set initial ARIA state for screen readers.
  // Standard: WCAG 4.1.2 (Name, Role, Value), Apple HIG (Accessibility).
  toggle.setAttribute('aria-label', t('auth_show_password', 'إظهار كلمة المرور'));
  toggle.setAttribute('aria-pressed', 'false');

  toggle.addEventListener('click', () => {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const icon = toggle.querySelector('.ph');
    if (icon) {
      icon.className = isPassword ? 'ph ph-eye-slash' : 'ph ph-eye';
    }
    // P2-W12-002 FIX: Update ARIA state on toggle.
    // PREVIOUS: No ARIA state — screen readers gave no feedback on visibility change.
    // NOW: aria-label announces "Show/Hide password", aria-pressed tracks state.
    // Standard: WCAG 4.1.2 (Name, Role, Value), Apple HIG (Accessibility).
    toggle.setAttribute(
      'aria-label',
      isPassword
        ? t('auth_hide_password', 'إخفاء كلمة المرور')
        : t('auth_show_password', 'إظهار كلمة المرور'),
    );
    toggle.setAttribute('aria-pressed', String(isPassword));
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
  // P2-DEEP-001 FIX: Use validateName() for strict name validation.
  const nameResult = validateName(nameInput?.value ?? '');
  if (!nameResult.valid) {
    goToRegStep(1); // PLAT-C01: Navigate to failing step
    showBanner('error', t(nameResult.errorKey, nameResult.fallbackMsg));
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

  // ── Step 1 optional: Phone number ──
  // P2-W5-003 FIX: Syrian phone number format validation.
  // Without this, users could enter arbitrary text ('call me') or partial numbers.
  // Format: 09XX-XXX-XXXX (local) or +963-9XX-XXX-XXXX (international).
  // Regex strips spaces/dashes, then validates the 10-digit Syrian mobile format.
  // Validation only fires when the user enters something — phone is optional.
  const phoneInput = document.getElementById('reg-phone') as HTMLInputElement | null;
  const phoneRaw = phoneInput?.value.trim() ?? '';
  if (phoneRaw) {
    const phoneDigits = phoneRaw.replace(/[\s\-()]/g, '');
    // Match: 09XXXXXXXX (local) or +96309XXXXXXXX or 96309XXXXXXXX (intl)
    const SYRIA_PHONE_REGEX = /^(?:\+?963)?0?9\d{8}$/;
    if (!SYRIA_PHONE_REGEX.test(phoneDigits)) {
      goToRegStep(1);
      showBanner('error', t('auth_phone_invalid', 'رقم الهاتف غير صالح — صيغة: 09XX-XXX-XXXX'));
      scrollToField(phoneInput);
      return false;
    }
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

  const email = (document.getElementById('login-email') as HTMLInputElement)?.value
    .trim()
    .toLowerCase();
  const password = (document.getElementById('login-password') as HTMLInputElement)?.value;

  if (!email || !password) {
    showBanner('error', t('auth_enter_email_password', 'أدخل البريد الإلكتروني وكلمة المرور'));
    return;
  }

  // P1-DEEP-001 FIX: Email format validation — parity with registration and forgot-password.
  // P1-W12-001 FIX: Use shared EMAIL_REGEX from validators.ts — single source of truth.
  // Standard: DRY Principle, Nielsen #5 (Error Prevention), Client-Side Validation.
  if (!EMAIL_REGEX.test(email)) {
    showBanner('error', t('auth_email_invalid', 'البريد الإلكتروني غير صالح'));
    scrollToField(document.getElementById('login-email'));
    return;
  }

  // P1-DEEP-002 FIX: Max password length check — parity with registration (L490) and
  // reset-password (L270). Without this, a 1MB password transfers over Syria 2G,
  // wastes bandwidth, and causes CPU starvation via bcrypt on the backend.
  // The backend Zod schema (loginSchema) limits to 128 chars and returns 400, but
  // the 1MB payload still transfers and consumes a rate limit token.
  // Standard: SEC-003 (bcrypt DoS Prevention), Nielsen #5.
  if (password.length > MAX_PASSWORD_LENGTH) {
    showBanner('error', t('auth_password_too_long', 'كلمة المرور طويلة جداً (الحد ١٢٨)'));
    scrollToField(document.getElementById('login-password'));
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
      // ── MFA Challenge Gate (Migration 046) ────────────────────────────────
      // If user has MFA enabled, the backend returns mfa_required + mfa_token
      // instead of a JWT. Show the TOTP input panel.
      const data = response.data;
      if (data.mfa_required && typeof data.mfa_token === 'string') {
        showMfaChallengePanel(data.mfa_token, email);
        return;
      }

      // UNIFIED CITIZEN: Uses shared handleLoginRedirect — single source of truth
      // for user context setting, redirect params, and onboarding detection.
      await handleLoginRedirect(
        response.data.user as unknown as Record<string, unknown>,
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
        //
        // P1-W11-008 FIX: Parse lockout minutes from backend message and show countdown.
        // PREVIOUS: Static "try again later" — user manually checked back later.
        // Backend message format: "Account temporarily locked. Try again in X minute(s)."
        // NOW: Extracts X and shows a live countdown in the banner text.
        // Standard: Nielsen #1 (System Status Visibility), FinTech Lockout UX.
        const errorMsg = err.message || '';
        const minuteMatch = errorMsg.match(/(\d+)\s*minute/i);
        const lockoutMinutes = minuteMatch ? parseInt(minuteMatch[1] ?? '0', 10) : 0;

        if (lockoutMinutes > 0) {
          let remainingSeconds = lockoutMinutes * 60;
          // P2-W12-008 FIX: Persist lockout end in sessionStorage.
          // PREVIOUS: Lockout countdown lost on page refresh — user saw no
          // indication they were locked out until another 429.
          // NOW: Stores lockout end timestamp. On page load, checks for active lockout.
          // Standard: Nielsen #1 (System Status Visibility), Session Persistence.
          try {
            sessionStorage.setItem(
              'nmh_lockout_until',
              String(Date.now() + remainingSeconds * 1000),
            );
          } catch {
            /* Safari incognito */
          }
          const lockoutMsg = () =>
            t(
              'auth_lockout_countdown',
              `الحساب مقفل مؤقتاً — يمكنك المحاولة بعد ${Math.ceil(remainingSeconds / 60)} دقيقة (${remainingSeconds}s)`,
            )
              .replace('{minutes}', String(Math.ceil(remainingSeconds / 60)))
              .replace('{seconds}', String(remainingSeconds));

          showBanner('error', lockoutMsg());

          const _lockoutTimer = createTrackedInterval(() => {
            remainingSeconds--;
            if (remainingSeconds <= 0) {
              clearTrackedInterval(_lockoutTimer);
              // P2-W12-008: Clear persisted lockout on expiry.
              try {
                sessionStorage.removeItem('nmh_lockout_until');
              } catch {
                /* ignore */
              }
              showBanner('success', t('auth_lockout_ended', 'يمكنك المحاولة الآن'));
            } else {
              // Update banner text in-place
              const bannerTextEl = document.getElementById('auth-banner-text');
              if (bannerTextEl) {
                bannerTextEl.textContent = lockoutMsg();
              }
            }
          }, 1000);
        } else {
          showBanner(
            'error',
            errorMsg ||
              t('auth_rate_limited', 'محاولات كثيرة. يرجى الانتظار قبل المحاولة مرة أخرى.'),
          );
        }
      } else {
        showBanner('error', err.message || t('auth_login_failed', 'فشل تسجيل الدخول'));
      }
    } else {
      // P1-W12-003 FIX: Differentiate timeout from generic network errors.
      // PREVIOUS: AbortError (30s timeout from _client.ts) and network failures
      // showed identical "خطأ في الشبكة" — user couldn't tell if server was down
      // or if their Syria 2G connection just timed out (actionable: just retry).
      // Parity with reset-password.ts which already checks for timeout/abort.
      // Standard: Nielsen #9 (Error Recovery), OWASP Error Handling.
      const message =
        err instanceof Error
          ? err.message
          : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.');
      if (message.includes('timeout') || message.includes('abort') || err instanceof DOMException) {
        showBanner('error', t('auth_login_timeout', 'انقطع الاتصال — حاول مرة أخرى'));
      } else {
        showBanner('error', message);
      }
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
  // P2-W6-007 FIX: Normalize email to lowercase before submission.
  // Backend does email.toLowerCase().trim() but frontend was sending raw case.
  const email = (document.getElementById('reg-email') as HTMLInputElement)?.value
    .trim()
    .toLowerCase();
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
    // P0-DEEP-001 FIX: Detect structured ApiError codes from _client.ts.
    // PREVIOUS: Only checked `err instanceof Error` — backend error codes (429 rate limit,
    // SANCTIONS_BLOCK, EMAIL_BLACKLISTED) were discarded. Users saw generic "خطأ في الشبكة"
    // for rate limiting. Parity with login handler (L966-1011).
    // Standard: OWASP Error Handling, Nielsen #9 (Error Recovery).
    if (err instanceof ApiError) {
      if (err.status === 429) {
        showBanner(
          'error',
          err.message ||
            t('auth_rate_limited', 'محاولات كثيرة. يرجى الانتظار قبل المحاولة مرة أخرى.'),
        );
      } else {
        showBanner('error', err.message || t('auth_reg_failed', 'فشل إنشاء الحساب'));
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
// ─── P1-DEEP-003 REFACTOR: Reusable Forgot Password Handler ────────────────
// PREVIOUS: Monolithic closure on #forgot-password-btn hardcoded to #login-email.
// PROBLEM: Register Step 2 users who already have an account can't access password
// reset without: 1) switching to Login tab, 2) re-typing email, 3) clicking link.
// NOW: Extracted into handleForgotPassword(triggerBtn, emailInputId) — shared by:
//   - Login tab: #forgot-password-btn → reads #login-email
//   - Register Step 2: #reg-forgot-password-btn → reads #reg-email
// Standard: Nielsen #3 (User Control & Freedom), WCAG 2.4.5 (Multiple Ways),
// DRY (Don't Repeat Yourself) — one handler, two entry points.
// ─────────────────────────────────────────────────────────────────────────────
async function handleForgotPassword(
  triggerBtn: HTMLAnchorElement,
  emailInputId: string,
): Promise<void> {
  // P2-W6-007 FIX: Normalize email to lowercase before submission.
  const emailInput = document.getElementById(emailInputId) as HTMLInputElement | null;
  const email = emailInput?.value.trim().toLowerCase() ?? '';

  if (!email) {
    // If the email field is empty, guide the user to fill it.
    // For login tab: focus the login email field directly.
    // For register tab: navigate to Step 1 where the email field lives,
    // then focus it — because Step 2 doesn't have an email field.
    if (emailInputId === 'reg-email') {
      // Navigate to Step 1 first (where #reg-email lives), then focus
      goToRegStep(1);
      requestAnimationFrame(() => {
        emailInput?.focus();
        emailInput?.classList.add('nm-input-flash-focus');
        emailInput?.addEventListener(
          'animationend',
          () => emailInput?.classList.remove('nm-input-flash-focus'),
          { once: true },
        );
      });
    } else if (emailInput) {
      emailInput.focus();
      emailInput.classList.add('nm-input-flash-focus');
      emailInput.addEventListener(
        'animationend',
        () => emailInput.classList.remove('nm-input-flash-focus'),
        { once: true },
      );
    }
    showBanner('error', t('auth_forgot_enter_email', 'أدخل بريدك الإلكتروني'));
    return;
  }

  // P2-AUD-008 FIX: Validate email format before API call.
  // P1-W12-001 FIX: Use shared EMAIL_REGEX from validators.ts — single source of truth.
  if (!EMAIL_REGEX.test(email)) {
    showBanner('error', t('auth_forgot_invalid_email', 'صيغة البريد الإلكتروني غير صحيحة'));
    return;
  }

  // Show loading state on the trigger button
  const originalHTML = triggerBtn.innerHTML;
  triggerBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-sm" aria-hidden="true"></i> ${esc(t('auth_forgot_sending', 'جاري الإرسال…'))}`;
  triggerBtn.setAttribute('aria-disabled', 'true');
  triggerBtn.classList.add('nm-btn-cooldown');

  try {
    const data = await auth.forgotPassword({ email });
    if (data.success) {
      // P2-DEEP-005 FIX: Anti-enumeration wording.
      // PREVIOUS: showBanner('success', data.message ?? t('auth_forgot_sent', '...'))
      //   - data.message is the ENGLISH backend string — shown raw to ar/de/fr/tr users.
      //   - Fallback 'تم إرسال رابط إعادة التعيين!' is affirmative — leaks existence.
      // NOW: Always use the i18n-translated anti-enumeration message.
      // Wording: "If your email is registered, you'll receive a reset link."
      // This is identical regardless of whether the email exists — OWASP SEC-009.
      // Standard: OWASP Authentication Cheat Sheet, NIST 800-63B §5.1.1.2.
      const mainMsg = t(
        'auth_forgot_sent',
        'إذا كان بريدك مسجّلاً لدينا، ستصلك رسالة لإعادة تعيين كلمة المرور.',
      );
      // Follow-up hint: check spam/junk — many Syrian ISPs aggressively filter
      const spamHint = t(
        'auth_forgot_check_spam',
        'تحقق من مجلد الرسائل غير المرغوبة (Spam) إذا لم تصلك الرسالة.',
      );
      showBanner('success', `${mainMsg} ${spamHint}`);
    } else {
      showBanner('error', data.error ?? t('auth_forgot_error', 'فشل الإرسال. حاول مرة أخرى.'));
    }
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 429) {
        showBanner('error', err.message || t('auth_rate_limited', 'محاولات كثيرة. يرجى الانتظار.'));
      } else {
        showBanner('error', err.message || t('auth_forgot_error', 'فشل الإرسال. حاول مرة أخرى.'));
      }
    } else {
      showBanner(
        'error',
        err instanceof Error
          ? err.message
          : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.'),
      );
    }
  } finally {
    // P1-W12-002 FIX: Add 60s cooldown after forgot-password success.
    // PREVIOUS: No client-side cooldown — user could click 15 times in 15 minutes,
    // each generating a real email and invalidating the previous reset token.
    // Parity with resend-verification cooldown (L1580-1600).
    // Standard: OWASP Rate Limiting, Email Spam Prevention, FinTech UX.
    triggerBtn.innerHTML = originalHTML;
    triggerBtn.setAttribute('aria-disabled', 'true');
    // Keep nm-btn-cooldown class (already added at L1408)
    let _forgotCooldown = 60;
    const forgotCooldownInterval = createTrackedInterval(() => {
      _forgotCooldown--;
      if (_forgotCooldown <= 0) {
        clearTrackedInterval(forgotCooldownInterval);
        triggerBtn.removeAttribute('aria-disabled');
        triggerBtn.classList.remove('nm-btn-cooldown');
      }
    }, 1000);
  }
}

// Wire Login tab "Forgot Password?" button
const forgotBtn = document.getElementById('forgot-password-btn') as HTMLAnchorElement | null;
forgotBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  await handleForgotPassword(forgotBtn, 'login-email');
});

// Wire Register Step 2 "Already registered? Reset password" button
const regForgotBtn = document.getElementById('reg-forgot-password-btn') as HTMLAnchorElement | null;
regForgotBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  await handleForgotPassword(regForgotBtn, 'reg-email');
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
      <p class="text-3xs text-slate-400 dark:text-slate-500 mb-4" data-i18n="auth_email_sent_existing_hint">
        ${esc(t('auth_email_sent_existing_hint', 'لم يصلك شيء خلال ٥ دقائق؟ ربما لديك حساب سابق — جرّب تسجيل الدخول'))}
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
  // P1-W6-001 UPGRADE: Now uses module-scoped tracked intervals.
  // Standard: Resource Lifecycle Management, Memory Leak Prevention.
  let _confirmResendTimer: ReturnType<typeof setInterval> | null = null;

  // Wire "Back to Login" button
  document.getElementById('nm-back-to-login-from-confirm')?.addEventListener('click', () => {
    // BUG-F05 FIX: Clear countdown timer BEFORE removing panel.
    _confirmResendTimer = clearTrackedInterval(_confirmResendTimer);
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
      // P2-W12-003 FIX: Detect structured ApiError codes — parity with login resend handler.
      // PREVIOUS: Only checked `err instanceof Error` — missed 429 rate limiting.
      // Standard: Error Handling Parity, OWASP Error Handling.
      if (err instanceof ApiError && err.status === 429) {
        showBanner(
          'error',
          err.message ||
            t('auth_rate_limited', 'محاولات كثيرة. يرجى الانتظار قبل المحاولة مرة أخرى.'),
        );
      } else {
        showBanner(
          'error',
          err instanceof Error
            ? err.message
            : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.'),
        );
      }
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
      // P1-W6-001 UPGRADE: Use tracked interval for pagehide cleanup.
      _confirmResendTimer = createTrackedInterval(() => {
        countdown--;
        if (countdownSpan) {
          countdownSpan.textContent = `${t('auth_resend_wait', 'انتظر')} (${countdown}s)`;
        }
        if (countdown <= 0) {
          _confirmResendTimer = clearTrackedInterval(_confirmResendTimer);
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
      // P1-W6-001 FIX: Use tracked interval instead of local-only variable.
      // PREVIOUS: `const resendTimer = setInterval(...)` — local variable leaked
      // if user navigated away during the 60s countdown. Timer continued ticking
      // against orphaned DOM nodes (CPU waste, potential null-ref on GC'd elements).
      // NOW: Tracked in `_activeTimers` — cleaned up on pagehide.
      let _inlineResendTimer: ReturnType<typeof setInterval> | null = null;
      _inlineResendTimer = createTrackedInterval(() => {
        countdown--;
        if (resendSpan) {
          resendSpan.textContent = `${t('auth_resend_wait', 'انتظر')} (${countdown}s)`;
        }
        if (countdown <= 0) {
          _inlineResendTimer = clearTrackedInterval(_inlineResendTimer);
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

  // P2-REM-002 FIX: Clear registration draft on successful login.
  // PREVIOUS: clearRegDraft() only called on registration success (L1100).
  // If a user started registration, abandoned, then logged in with an existing
  // account — the partial draft persisted in sessionStorage, causing ghost data
  // to auto-fill on next visit to the auth page.
  // Standard: Session Data Hygiene, Nielsen #5 (Error Prevention).
  clearRegDraft();

  showBanner('success', successMessage);

  // UNIFIED CITIZEN: All users go to homepage. ?redirect= param from auth-guard
  // takes priority for deep-link scenarios (e.g. /project-details?id=X).
  const redirectParam = new URLSearchParams(window.location.search).get('redirect');
  let finalTarget = redirectParam ? decodeURIComponent(redirectParam) : POST_LOGIN_REDIRECT;

  // P1-W5-002 FIX: Strengthened open redirect defense (CWE-601).
  // Previous check only blocked '://' and '//' prefixes.
  // Now uses strict allowlist: only relative paths starting with exactly one '/'
  // are allowed. This also blocks 'javascript:', 'data:', 'vbscript:' URI schemes,
  // protocol-relative URLs, and any non-path redirect targets.
  // Standard: OWASP Unvalidated Redirects, CWE-601 (URL Redirection to Untrusted Site).
  if (!finalTarget.startsWith('/') || finalTarget.startsWith('//')) {
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
      // SEC-5 FIX: Validate workspace URL against open redirect (CWE-601).
      // resolveWorkspaceUrl() is a whitelist lookup, but defense-in-depth
      // requires validating the output too — a future code change to the
      // whitelist could introduce a redirect to an external domain.
      if (wsUrl && wsUrl.startsWith('/') && !wsUrl.startsWith('//')) {
        finalTarget = wsUrl;
      }
    } catch {
      /* Module load failure — fall through to default homepage */
    }
  }

  // EDGE-8 FIX: Block further user interaction during redirect delay.
  // PREVIOUS: 800ms window where isSubmitting was reset (in finally) but redirect
  // hadn't fired yet — user could click submit again or start another flow.
  // Standard: Dead Zone Prevention, FinTech UX (no double-submit).
  document.body.style.pointerEvents = 'none';
  setTimeout(() => {
    window.location.href = finalTarget;
  }, 800);
  // P2-W12-006 FIX: Safety restore if redirect fails.
  // PREVIOUS: If window.location.href assignment was blocked (browser extension,
  // Content-Security-Policy, or beforeunload handler), pointerEvents stayed 'none'
  // forever — entire page permanently non-interactive.
  // NOW: 3s safety timeout restores interactivity.
  // Standard: Defense-in-Depth, Resilience Engineering.
  setTimeout(() => {
    document.body.style.pointerEvents = '';
  }, 3000);
}

// ─── MFA Challenge Panel (Migration 046) ──────────────────────────────────
// Shown after successful password/social login when MFA is enabled.
// Replaces the login form with a 6-digit TOTP code input or recovery code input.
// Standard: NIST SP 800-63B (AAL2), Apple HIG (2FA Verification Screens).

function showMfaChallengePanel(mfaToken: string, _userEmail: string): void {
  // P0-DEEP-003 FIX: Use nm-hidden class instead of style.display.
  // PREVIOUS: style.display = 'none' violated P1-SST-001 (CSS Single Source of Truth)
  // and could race with switchTab() which uses CSS classes.
  // Standard: Design System Governance, CSS Single Source of Truth.
  if (formLogin) formLogin.classList.add('nm-hidden');
  if (formRegister) formRegister.classList.add('nm-hidden');
  // Hide tabs
  if (tabLogin) tabLogin.classList.add('nm-hidden');
  if (tabRegister) tabRegister.classList.add('nm-hidden');
  hideBanner();

  // Create MFA panel
  const mfaPanel = document.createElement('div');
  mfaPanel.id = 'mfa-challenge-panel';
  mfaPanel.setAttribute('role', 'form');
  mfaPanel.setAttribute('aria-label', t('mfa_verification', 'التحقق بخطوتين'));
  // P0-DEEP-004 FIX: All inline styles converted to Tailwind classes.
  // PREVIOUS: ~30 inline style declarations (style="text-align:center; padding-block:1.5rem;" etc.)
  // Inline styles cannot be overridden by dark: variants, cannot be themed, and
  // violate AGENTS.md: "NEVER use inline styles for layout."
  // Standard: Design System Governance, Dark Mode Parity, AGENTS.md.
  mfaPanel.innerHTML = `
    <div class="text-center py-6">
      <div class="text-[2.5rem] mb-3">🔐</div>
      <h2 class="text-xl font-bold text-[color:var(--nm-text-primary,#242424)] dark:text-white mb-2">
        ${esc(t('mfa_title', 'التحقق بخطوتين'))}
      </h2>
      <p class="text-sm text-[color:var(--nm-text-secondary,#666)] dark:text-slate-400 mb-6">
        ${esc(t('mfa_subtitle', 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة'))}
      </p>

      <!-- TOTP Code Inputs -->
      <div id="mfa-totp-section">
        <div id="mfa-code-inputs" class="flex gap-2 justify-center mb-4" style="direction:ltr;">
          <input type="text" inputmode="numeric" maxlength="1" class="nm-input nm-mfa-digit" data-mfa-digit="0" autocomplete="one-time-code" aria-label="${esc(t('mfa_digit_label', 'الرقم'))} 1 ${esc(t('mfa_of_6', 'من 6'))}" />
          <input type="text" inputmode="numeric" maxlength="1" class="nm-input nm-mfa-digit" data-mfa-digit="1" aria-label="${esc(t('mfa_digit_label', 'الرقم'))} 2 ${esc(t('mfa_of_6', 'من 6'))}" />
          <input type="text" inputmode="numeric" maxlength="1" class="nm-input nm-mfa-digit" data-mfa-digit="2" aria-label="${esc(t('mfa_digit_label', 'الرقم'))} 3 ${esc(t('mfa_of_6', 'من 6'))}" />
          <input type="text" inputmode="numeric" maxlength="1" class="nm-input nm-mfa-digit" data-mfa-digit="3" aria-label="${esc(t('mfa_digit_label', 'الرقم'))} 4 ${esc(t('mfa_of_6', 'من 6'))}" />
          <input type="text" inputmode="numeric" maxlength="1" class="nm-input nm-mfa-digit" data-mfa-digit="4" aria-label="${esc(t('mfa_digit_label', 'الرقم'))} 5 ${esc(t('mfa_of_6', 'من 6'))}" />
          <input type="text" inputmode="numeric" maxlength="1" class="nm-input nm-mfa-digit" data-mfa-digit="5" aria-label="${esc(t('mfa_digit_label', 'الرقم'))} 6 ${esc(t('mfa_of_6', 'من 6'))}" />
        </div>
        <button id="mfa-verify-btn" type="button" class="nm-btn nm-btn-primary w-full mb-4">
          <span id="mfa-verify-text">${esc(t('mfa_verify_btn', 'تحقق'))}</span>
        </button>
      </div>

      <!-- Recovery Code Section (hidden by default) -->
      <div id="mfa-recovery-section" class="nm-hidden">
        <input type="text" id="mfa-recovery-input" class="nm-input text-center text-lg font-semibold tracking-widest mb-4 uppercase" placeholder="${esc(t('mfa_recovery_placeholder', 'XXXX-XXXX'))}" autocomplete="off" />
        <button id="mfa-recovery-btn" type="button" class="nm-btn nm-btn-primary w-full mb-4">
          <span id="mfa-recovery-text">${esc(t('mfa_recovery_btn', 'استخدم رمز الاسترداد'))}</span>
        </button>
      </div>

      <!-- Error Display -->
      <p id="mfa-error" class="nm-hidden text-[color:var(--nm-danger,#dc3545)] dark:text-red-400 text-[0.8125rem] mb-4"></p>

      <!-- Toggle Links -->
      <div class="flex flex-col gap-2 items-center">
        <button id="mfa-toggle-recovery" type="button" class="nm-link text-[0.8125rem] bg-transparent border-none cursor-pointer text-trust-blue dark:text-blue-400">
          ${esc(t('mfa_use_recovery', 'استخدم رمز الاسترداد'))}
        </button>
        <button id="mfa-back-to-login" type="button" class="nm-link text-[0.8125rem] bg-transparent border-none cursor-pointer text-slate-500 dark:text-slate-400">
          ${esc(t('mfa_back_to_login', 'العودة لتسجيل الدخول'))}
        </button>
      </div>
    </div>
  `;

  // Insert MFA panel after the forms
  const authCard = formLogin?.closest('.nm-auth-card') ?? formLogin?.parentElement;
  if (authCard) {
    authCard.appendChild(mfaPanel);
  } else {
    document.body.appendChild(mfaPanel);
  }

  // ── Wire digit inputs (auto-advance + auto-submit) ──
  const digitInputs = mfaPanel.querySelectorAll<HTMLInputElement>('[data-mfa-digit]');
  const mfaError = document.getElementById('mfa-error');

  function clearMfaError(): void {
    if (mfaError) {
      mfaError.textContent = '';
      mfaError.classList.add('nm-hidden');
    }
  }

  function showMfaError(msg: string): void {
    if (mfaError) {
      mfaError.textContent = msg;
      mfaError.classList.remove('nm-hidden');
    }
  }

  function getFullCode(): string {
    return Array.from(digitInputs)
      .map((inp) => inp.value)
      .join('');
  }

  digitInputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      clearMfaError();
      // Only allow digits
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      // Auto-advance to next input
      if (input.value && idx < digitInputs.length - 1) {
        digitInputs[idx + 1]?.focus();
      }
      // Auto-submit when all 6 digits are entered
      const code = getFullCode();
      if (code.length === 6) {
        submitMfaTotp();
      }
    });

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      // Backspace: clear current and move to previous
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        e.preventDefault();
        const prev = digitInputs[idx - 1];
        if (prev) {
          prev.value = '';
          prev.focus();
        }
      }
    });

    // Handle paste — distribute digits across inputs
    input.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData?.getData('text')?.replace(/\D/g, '') ?? '';
      for (let i = 0; i < Math.min(pasted.length, digitInputs.length); i++) {
        const target = digitInputs[i];
        if (target) {
          target.value = pasted[i] ?? '';
        }
      }
      // Focus last filled or submit
      const lastIdx = Math.min(pasted.length, digitInputs.length) - 1;
      if (lastIdx >= 0) {
        digitInputs[lastIdx]?.focus();
      }
      if (pasted.length >= 6) {
        submitMfaTotp();
      }
    });
  });

  // Focus first digit
  digitInputs[0]?.focus();

  // ── TOTP Submit ──
  let isMfaSubmitting = false;
  // P0-W12-002 FIX: Track failed MFA attempts for exponential client-side delay.
  // PREVIOUS: Zero delay between retries — a scripted attacker could exhaust
  // 5 backend attempts in <2 seconds via DOM injection.
  // NOW: Exponential delay (2s, 4s, 6s, 8s, 10s cap) after each failure.
  // Standard: NIST SP 800-63B (Throttling), OWASP Brute Force Prevention.
  let _mfaFailCount = 0;

  async function submitMfaTotp(): Promise<void> {
    if (isMfaSubmitting) return;
    const code = getFullCode();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      showMfaError(t('mfa_enter_6_digits', 'أدخل 6 أرقام'));
      return;
    }

    isMfaSubmitting = true;
    const verifyBtn = document.getElementById('mfa-verify-btn') as HTMLButtonElement | null;
    const verifyText = document.getElementById('mfa-verify-text');
    if (verifyBtn) verifyBtn.classList.add('btn-loading');
    if (verifyText) verifyText.textContent = t('mfa_verifying', 'جاري التحقق…');
    haptic.medium();

    try {
      const response = await auth.mfaVerify({ mfa_token: mfaToken, code });
      if (response.success && response.data) {
        haptic.success();
        // Remove MFA panel and restore UI
        mfaPanel.remove();
        await handleLoginRedirect(
          response.data.user as unknown as Record<string, unknown>,
          t('auth_welcome_back', 'أهلاً بعودتك!'),
        );
      } else {
        showMfaError(response.error ?? t('mfa_invalid_code', 'رمز غير صحيح'));
        // P0-W12-002 FIX: Exponential client-side delay after failed MFA attempt.
        _mfaFailCount++;
        const delayMs = Math.min(_mfaFailCount * 2000, 10000);
        digitInputs.forEach((inp) => {
          inp.value = '';
          inp.disabled = true;
        });
        setTimeout(() => {
          digitInputs.forEach((inp) => {
            inp.disabled = false;
          });
          digitInputs[0]?.focus();
        }, delayMs);
      }
    } catch (err) {
      haptic.heavy();
      if (err instanceof ApiError) {
        if (err.code === 'MFA_TOKEN_EXPIRED') {
          showMfaError(t('mfa_session_expired', 'انتهت صلاحية الجلسة. سجّل الدخول مجدداً.'));
        } else {
          showMfaError(err.message || t('mfa_invalid_code', 'رمز غير صحيح'));
        }
      } else {
        showMfaError(t('auth_network_error_short', 'خطأ في الشبكة'));
      }
      digitInputs.forEach((inp) => {
        inp.value = '';
      });
      digitInputs[0]?.focus();
    } finally {
      isMfaSubmitting = false;
      if (verifyBtn) verifyBtn.classList.remove('btn-loading');
      if (verifyText) verifyText.textContent = t('mfa_verify_btn', 'تحقق');
    }
  }

  // Wire verify button (in case auto-submit doesn't trigger)
  document.getElementById('mfa-verify-btn')?.addEventListener('click', submitMfaTotp);

  // ── Recovery Code Submit ──
  async function submitRecoveryCode(): Promise<void> {
    if (isMfaSubmitting) return;
    const recoveryInput = document.getElementById('mfa-recovery-input') as HTMLInputElement | null;
    const code = recoveryInput?.value.trim() ?? '';
    if (!code) {
      showMfaError(t('mfa_enter_recovery', 'أدخل رمز الاسترداد'));
      return;
    }
    // P2-W12-007 FIX: Client-side format validation for recovery codes.
    // PREVIOUS: Only checked `!code` (empty). Garbage input wasted a rate-limited
    // backend attempt. Recovery codes are XXXX-XXXX (8 alphanumeric + hyphen).
    // Standard: Nielsen #5 (Error Prevention), Client-Side Validation.
    const RECOVERY_CODE_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
    if (!RECOVERY_CODE_REGEX.test(code)) {
      showMfaError(t('mfa_invalid_recovery_format', 'صيغة رمز الاسترداد: XXXX-XXXX'));
      return;
    }

    isMfaSubmitting = true;
    const recoveryBtn = document.getElementById('mfa-recovery-btn') as HTMLButtonElement | null;
    const recoveryText = document.getElementById('mfa-recovery-text');
    if (recoveryBtn) recoveryBtn.classList.add('btn-loading');
    if (recoveryText) recoveryText.textContent = t('mfa_verifying', 'جاري التحقق…');
    haptic.medium();

    try {
      const response = await auth.mfaRecovery({ mfa_token: mfaToken, recovery_code: code });
      if (response.success && response.data) {
        haptic.success();
        mfaPanel.remove();
        await handleLoginRedirect(
          response.data.user as unknown as Record<string, unknown>,
          t('auth_welcome_back', 'أهلاً بعودتك!'),
        );
      } else {
        showMfaError(response.error ?? t('mfa_invalid_recovery', 'رمز استرداد غير صحيح'));
        if (recoveryInput) recoveryInput.value = '';
        recoveryInput?.focus();
      }
    } catch (err) {
      haptic.heavy();
      if (err instanceof ApiError) {
        showMfaError(err.message || t('mfa_invalid_recovery', 'رمز استرداد غير صحيح'));
      } else {
        showMfaError(t('auth_network_error_short', 'خطأ في الشبكة'));
      }
      if (recoveryInput) recoveryInput.value = '';
      recoveryInput?.focus();
    } finally {
      isMfaSubmitting = false;
      if (recoveryBtn) recoveryBtn.classList.remove('btn-loading');
      if (recoveryText) recoveryText.textContent = t('mfa_recovery_btn', 'استخدم رمز الاسترداد');
    }
  }

  document.getElementById('mfa-recovery-btn')?.addEventListener('click', submitRecoveryCode);

  // ── Toggle between TOTP and Recovery Code ──
  let showingRecovery = false;
  document.getElementById('mfa-toggle-recovery')?.addEventListener('click', () => {
    showingRecovery = !showingRecovery;
    clearMfaError();

    const totpSection = document.getElementById('mfa-totp-section');
    const recoverySection = document.getElementById('mfa-recovery-section');
    const toggleBtn = document.getElementById('mfa-toggle-recovery');

    if (showingRecovery) {
      totpSection?.classList.add('nm-hidden');
      recoverySection?.classList.remove('nm-hidden');
      if (toggleBtn) toggleBtn.textContent = t('mfa_use_authenticator', 'استخدم تطبيق المصادقة');
      document.getElementById('mfa-recovery-input')?.focus();
    } else {
      totpSection?.classList.remove('nm-hidden');
      recoverySection?.classList.add('nm-hidden');
      if (toggleBtn) toggleBtn.textContent = t('mfa_use_recovery', 'استخدم رمز الاسترداد');
      digitInputs[0]?.focus();
    }
  });

  // ── Back to Login ──
  document.getElementById('mfa-back-to-login')?.addEventListener('click', () => {
    mfaPanel.remove();
    // P0-DEEP-003 FIX: Restore using nm-hidden class (parity with show).
    if (formLogin) formLogin.classList.remove('nm-hidden');
    if (tabLogin) tabLogin.classList.remove('nm-hidden');
    if (tabRegister) tabRegister.classList.remove('nm-hidden');
    state.isSubmitting = false;
  });

  // Handle Enter key in recovery input
  document.getElementById('mfa-recovery-input')?.addEventListener('keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      submitRecoveryCode();
    }
  });
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
    // ── MFA Challenge Gate (Migration 046) ──────────────────────────────
    // Social login with MFA: backend returns mfa_required + mfa_token instead of user.
    const data = response.data as Record<string, unknown> | undefined;
    if (response.success && data?.mfa_required && typeof data.mfa_token === 'string') {
      showMfaChallengePanel(data.mfa_token as string, '');
      return;
    }
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
                // P1-DEEP-004 FIX: ApiError-aware catch for Google GSI callback.
                // PREVIOUS: Only checked err instanceof Error — discarded 429, SOCIAL_ONLY_ACCOUNT.
                // Standard: OWASP Error Handling, Parity with login handler.
                if (err instanceof ApiError) {
                  if (err.status === 429) {
                    showBanner(
                      'error',
                      err.message || t('auth_rate_limited', 'محاولات كثيرة. يرجى الانتظار.'),
                    );
                  } else {
                    showBanner('error', err.message || t('auth_login_failed', 'فشل تسجيل الدخول'));
                  }
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
    `width=${width},height=${height},left=${left},top=${top},noopener,noreferrer,menubar=no,toolbar=no`,
  );

  if (!popup) {
    showBanner('error', t('auth_google_popup_blocked', 'نافذة Google المنبثقة محظورة'));
    return;
  }

  // P1-DEEP-005 FIX: Belt-and-suspenders tabnabbing defense for Firefox.
  // `noopener` in window.open features string is only reliably supported in
  // Chromium. Firefox ignores it, leaving window.opener accessible to the popup.
  // Standard: OWASP Tabnabbing Prevention, Defense-in-Depth.
  try {
    popup.opener = null;
  } catch {
    /* cross-origin — safe */
  }

  // P1-W6-001 UPGRADE: Use tracked interval for pagehide cleanup.
  const pollTimer = createTrackedInterval(async () => {
    try {
      if (popup.closed) {
        clearTrackedInterval(pollTimer);
        // P2-DEEP-007 FIX: Clean stale OAuth state on popup cancel.
        // PREVIOUS: sessionStorage.__google_oauth_state lingered after user closed
        // the popup without completing OAuth. Harmless but unnecessary stale data.
        // Standard: State Hygiene, Defense-in-Depth.
        try {
          sessionStorage.removeItem('__google_oauth_state');
        } catch {
          /* ignore */
        }
        return;
      }
      // Check if the popup has navigated back to our origin
      if (popup.location.origin === window.location.origin) {
        clearTrackedInterval(pollTimer);
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
            // P1-DEEP-004 FIX: ApiError-aware catch for Google popup callback.
            if (err instanceof ApiError) {
              if (err.status === 429) {
                showBanner(
                  'error',
                  err.message || t('auth_rate_limited', 'محاولات كثيرة. يرجى الانتظار.'),
                );
              } else {
                showBanner('error', err.message || t('auth_login_failed', 'فشل تسجيل الدخول'));
              }
            } else {
              const msg =
                err instanceof Error
                  ? err.message
                  : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.');
              showBanner('error', msg);
            }
          }
        }
      }
    } catch {
      // Cross-origin — popup hasn't redirected yet, keep polling
    }
  }, 500);

  // Safety timeout: stop polling after 5 minutes
  // EDGE-3 FIX: Track the 5-minute safety timeout in _activeTimers.
  // PREVIOUS: Raw setTimeout was NOT tracked — if the user navigated away
  // before 5 minutes, this orphaned timeout survived until expiry.
  // Standard: Timer Hygiene, Page Lifecycle API.
  const safetyTimeout = setTimeout(() => {
    clearTrackedInterval(pollTimer);
    // Clean up stale state if popup was abandoned
    try {
      sessionStorage.removeItem('__google_oauth_state');
    } catch {
      /* ignore */
    }
  }, 300000);
  _activeTimers.add(safetyTimeout);
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
          // P1-DEEP-004 FIX: ApiError-aware catch for Apple Sign-In.
          if (err instanceof ApiError) {
            if (err.status === 429) {
              showBanner(
                'error',
                err.message || t('auth_rate_limited', 'محاولات كثيرة. يرجى الانتظار.'),
              );
            } else {
              showBanner('error', err.message || t('auth_login_failed', 'فشل تسجيل الدخول'));
            }
          } else {
            const msg =
              err instanceof Error
                ? err.message
                : t('auth_network_error', 'خطأ في الشبكة. حاول مرة أخرى.');
            showBanner('error', msg);
          }
        }
      } finally {
        setSocialBtnLoading(btn, false);
      }
    });
  });
}

// ─── Facebook Login ─────────────────────────────────────────────────────────
// P1-DEEP-006 FIX: Proper lazy loading of the Facebook SDK.
// PREVIOUS STATE (broken):
//   - UX-F019 removed the <script src="connect.facebook.net"> from auth.html ✅
//   - But NEVER added a dynamic loader to replace it ❌
//   - initFBSDK() set fbAsyncInit + checked window.FB, but the script was never loaded
//   - Result: FB.login was always undefined → 10× 200ms polls → "not configured" banner
//   - Facebook login was 100% broken with zero user-facing error explanation
// NOW:
//   - loadFacebookSDK() dynamically injects <script> on first Facebook button click
//   - Returns a Promise<FB> that resolves when fbAsyncInit fires
//   - Cached via module-scoped fbSDKPromise — subsequent clicks resolve instantly
//   - 8-second timeout for blocked networks (Syrian ISPs may block Facebook)
//   - CSP nonce support via existing <script> tag nonce detection
// Standard: PRPL Pattern, Web Vitals (lazy third-party), OWASP (CSP compliance).
// ─────────────────────────────────────────────────────────────────────────────

/** Facebook SDK interface — only the methods we use */
interface FacebookSDK {
  init: (config: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
  login: (
    callback: (response: { authResponse?: { accessToken: string } }) => void,
    options: { scope: string },
  ) => void;
  getLoginStatus: (
    callback: (response: { status: string; authResponse?: { accessToken: string } }) => void,
  ) => void;
}

/** Cached SDK load promise — ensures we only inject the script once */
let fbSDKPromise: Promise<FacebookSDK> | null = null;

/**
 * Lazy-load the Facebook SDK by dynamically injecting the <script> tag.
 * Returns a Promise that resolves with the initialized FB object.
 *
 * Why not load eagerly?
 *   - Facebook SDK is ~300KB+ (gzipped ~90KB)
 *   - On Syrian 2G/3G networks, this adds 5-10s to page load
 *   - Most users use email or Google login — only ~5% click Facebook
 *   - PRPL pattern: load what you need, when you need it
 */
function loadFacebookSDK(): Promise<FacebookSDK> {
  // Return cached promise if SDK is already loading/loaded
  if (fbSDKPromise) {
    return fbSDKPromise;
  }

  const fbAppId = (window as unknown as Record<string, unknown>).__FACEBOOK_APP_ID__ as
    | string
    | undefined;

  if (!fbAppId) {
    return Promise.reject(new Error('Facebook App ID not configured'));
  }

  fbSDKPromise = new Promise<FacebookSDK>((resolve, reject) => {
    // If FB is already on window (e.g., loaded by another integration), init and resolve
    const existingFB = (window as unknown as Record<string, unknown>).FB as FacebookSDK | undefined;
    if (existingFB?.login) {
      existingFB.init({ appId: fbAppId, cookie: true, xfbml: false, version: 'v19.0' });
      resolve(existingFB);
      return;
    }

    // Set up fbAsyncInit — called by the SDK when it finishes loading
    (window as unknown as Record<string, unknown>).fbAsyncInit = function () {
      const FB = (window as unknown as Record<string, unknown>).FB as FacebookSDK | undefined;
      if (!FB) {
        reject(new Error('Facebook SDK loaded but FB object not found'));
        return;
      }
      FB.init({ appId: fbAppId, cookie: true, xfbml: false, version: 'v19.0' });
      resolve(FB);
    };

    // Dynamically inject the <script> tag
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    // CSP nonce: inherit from the existing auth module script tag if available
    const existingScript = document.querySelector<HTMLScriptElement>('script[nonce]');
    if (existingScript?.nonce) {
      script.nonce = existingScript.nonce;
    }

    script.onerror = () => {
      // Facebook SDK blocked by ISP, firewall, or ad blocker
      fbSDKPromise = null; // Allow retry on next click
      reject(new Error('Facebook SDK failed to load'));
    };

    // Timeout: if SDK doesn't load within 8 seconds, reject
    // Syrian mobile networks can be extremely slow — 8s is generous but finite
    const timeoutId = setTimeout(() => {
      fbSDKPromise = null; // Allow retry on next click
      reject(new Error('Facebook SDK load timeout'));
    }, 8000);

    // Clear timeout when fbAsyncInit fires (via resolve above)
    const originalInit = (window as unknown as Record<string, unknown>).fbAsyncInit as () => void;
    (window as unknown as Record<string, unknown>).fbAsyncInit = function () {
      clearTimeout(timeoutId);
      originalInit();
    };

    // Add fb-root div required by the SDK (if not already present)
    if (!document.getElementById('fb-root')) {
      const fbRoot = document.createElement('div');
      fbRoot.id = 'fb-root';
      document.body.appendChild(fbRoot);
    }

    document.head.appendChild(script);
  });

  return fbSDKPromise;
}

function initFacebookLogin(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-sso-provider="facebook"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (state.isSubmitting) {
        return;
      }
      haptic.light();
      setSocialBtnLoading(btn, true);

      try {
        // P1-DEEP-006: Lazy-load SDK on first click
        const FB = await loadFacebookSDK();

        FB.login(
          async (fbResponse) => {
            if (!fbResponse.authResponse?.accessToken) {
              setSocialBtnLoading(btn, false);
              return; // User cancelled
            }

            try {
              // SEC-2 FIX: Facebook returns an accessToken (NOT a JWT id_token).
              // Adding token_type metadata helps the backend distinguish Facebook's
              // Graph API access token from Google/Apple's JWT id_tokens.
              const response = await auth.socialLogin({
                provider: 'facebook',
                id_token: fbResponse.authResponse.accessToken,
                token_type: 'access_token',
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
              // P1-DEEP-004 FIX: ApiError-aware catch for Facebook login.
              if (err instanceof ApiError) {
                if (err.status === 429) {
                  showBanner(
                    'error',
                    err.message || t('auth_rate_limited', 'محاولات كثيرة. يرجى الانتظار.'),
                  );
                } else {
                  showBanner('error', err.message || t('auth_login_failed', 'فشل تسجيل الدخول'));
                }
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
          },
          { scope: 'email,public_profile' },
        );
      } catch (err) {
        setSocialBtnLoading(btn, false);
        // P1-DEEP-006: Distinguish timeout/blocked from not-configured
        if (err instanceof Error && err.message.includes('timeout')) {
          showBanner(
            'error',
            t('auth_facebook_timeout', 'تعذّر تحميل Facebook. تحقق من اتصالك بالإنترنت.'),
          );
        } else if (err instanceof Error && err.message.includes('failed to load')) {
          showBanner(
            'error',
            t('auth_facebook_blocked', 'تعذّر الوصول إلى Facebook. قد يكون محظوراً في شبكتك.'),
          );
        } else {
          showBanner('info', t('auth_facebook_not_configured', 'تسجيل Facebook غير مهيأ بعد'));
        }
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

// ─── P1-W6-001 FIX: Page Lifecycle Cleanup ──────────────────────────────────
// Clear ALL tracked interval timers when the page is hidden or navigated away.
// Uses `pagehide` over `beforeunload` because:
//   1. `beforeunload` blocks bfcache — critical for Syria 2G (users frequently
//      navigate back; bfcache restores instant, re-fetch costs 5-15s on 2G).
//   2. `pagehide` fires for ALL navigation types (back/forward, tab close, SPA).
//   3. MDN and web.dev recommend `pagehide` as the modern replacement.
// Standard: Page Lifecycle API, Web Performance (bfcache eligibility).
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('pagehide', () => {
  clearAllTrackedTimers();
});

// ─── P2-DEEP-006 FIX: Caps Lock Warning on Password Fields ─────────────────
// Desktop users frequently type passwords with unintended Caps Lock, causing
// repeated "Invalid password" errors. This adds a subtle warning indicator
// that appears when Caps Lock is detected during a keypress on any password field.
// Standard: Apple HIG (Input Guidance), Material Design 3 (Helper Text).
// ─────────────────────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((pwField) => {
  let capsWarning: HTMLElement | null = null;

  function showCapsWarning(show: boolean): void {
    if (show && !capsWarning) {
      capsWarning = document.createElement('p');
      capsWarning.className = 'text-xs font-medium text-amber-600 dark:text-amber-400 mt-1';
      capsWarning.textContent = t('auth_caps_lock', '⚠ مفتاح Caps Lock مفعّل');
      capsWarning.setAttribute('aria-live', 'polite');
      pwField.parentElement?.appendChild(capsWarning);
    } else if (!show && capsWarning) {
      capsWarning.remove();
      capsWarning = null;
    }
  }

  pwField.addEventListener('keydown', (e: KeyboardEvent) => {
    // getModifierState is supported in all modern browsers
    if (typeof e.getModifierState === 'function') {
      showCapsWarning(e.getModifierState('CapsLock'));
    }
  });

  // P1-W10-015 FIX: Detect Caps Lock that was already ON before field focus.
  // PREVIOUS: Only keydown handler existed — if Caps Lock was toggled before
  // the field received focus, no warning appeared until the first keypress.
  // FocusEvent supports getModifierState in Chrome 130+, Firefox 127+, Safari 17.4+.
  // Standard: Apple HIG (Input Guidance), Defense-in-Depth.
  pwField.addEventListener('focus', (e: FocusEvent) => {
    const kbEvent = e as unknown as { getModifierState?: (key: string) => boolean };
    if (typeof kbEvent.getModifierState === 'function') {
      showCapsWarning(kbEvent.getModifierState('CapsLock'));
    }
  });

  pwField.addEventListener('blur', () => {
    showCapsWarning(false);
  });
});
