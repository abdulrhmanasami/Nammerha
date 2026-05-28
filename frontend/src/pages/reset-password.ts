import '../styles/main.css';
import { auth } from '../api';
import { updatePasswordStrength } from '../utils/password-strength';
import { t } from '../utils/i18n';
import {
  showStructuredBanner,
  hideStructuredBanner,
  type StructuredBannerElements,
} from '../utils/banner';
// P1-W12-005 FIX: Import ApiError for structured error code detection.
// PREVIOUS: Only `err instanceof Error` — missed 429 rate-limit and other structured errors.
// Standard: Error Handling Parity with auth.ts login handler.
import { ApiError } from '../api/_client';
// P3-W13-003 FIX: Use shared EMAIL_REGEX from validators.ts — single source of truth.
// PREVIOUS: Inline `const EMAIL_REGEX = /^.../` at L205 — 4th duplicate across pages.
// auth.ts was already fixed in Wave 12 (P1-W12-001). This is the last copy.
// Standard: DRY Principle, Centralized Validation.
// P0-W13-001 + P0-W13-002 FIX: Import shared password validators.
// PREVIOUS: Inline regex checks + local MAX_PASSWORD_LENGTH duplicated from validators.ts.
// Standard: DRY Principle, OWASP ASVS 2.1.1, validators.ts parity.
import { EMAIL_REGEX, validatePasswordComplexity } from '../utils/validators';
// P2-W6-009 FIX: Pre-warm CSRF token for POST requests.
// Parity with auth.ts L33 — prevents 2-5s invisible delay on Syria 2G.
import { warmCsrf } from '../api/_client';
// P3-AUD-001 FIX: Import haptic for tactile feedback — parity with auth.ts.
import { haptic } from '../utils/haptic';
// P3-AUD-003 FIX: Pull-to-refresh for cached/stale pages on Syria 2G.
import { initPullToRefresh } from '../utils/pull-refresh';
warmCsrf();
// P1-006 FIX: Scroll-to-field on validation error
import { scrollToField } from '../utils/scroll-to-field';
// P1-013 FIX: Auto-detect required fields and add asterisk markers to labels.
import '../utils/required-markers';
// P2-W13-002 FIX: Tracked timer utilities extracted to shared module.
// PREVIOUS: Identical timer tracking code duplicated in auth.ts and reset-password.ts.
// Standard: DRY Principle, Timer Hygiene.
import {
  addTrackedTimer,
  createTrackedInterval,
  clearTrackedInterval,
  clearAllTrackedTimers,
} from '../utils/tracked-timers';

// P2-W13-002: Timer tracking utilities now imported from '../utils/tracked-timers'.
// PREVIOUS: 25 lines of timer registry code duplicated from auth.ts.
// See import at top of file. Standard: DRY Principle.

// P1-AUD-002 FIX: Re-warm CSRF token when tab becomes visible after background.
// PREVIOUS: warmCsrf() fired once on page load. If user left the tab open for
// 2+ hours (common on Syria 2G), CSRF token expired and password reset submit
// silently failed with 403.
// Parity with auth.ts L45-49.
// Standard: Page Visibility API, Syria 2G Resilience.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    warmCsrf();
  }
});

// P3-AUD-003 FIX: Pull-to-refresh — parity with auth.ts L3054.
// On cached/stale reset pages (common on Syria 2G), users need a way to
// force-refresh without knowing browser controls.
// Standard: Apple HIG (Pull-to-Refresh), Syria 2G Resilience.
initPullToRefresh();

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

// P2-S4-005 FIX: Store email from URL BEFORE stripping params.
// PREVIOUS: urlParams.get('email') at L467 read an already-stripped param (L105
// deletes it). If backend response has no data.email AND requestEmailInput is
// hidden, emailParam resolves to empty — user must re-type email after reset.
// NOW: Module-scoped variable captures email at extraction time as last-resort fallback.
// Standard: Nielsen #6 (Recognition Over Recall), Defense-in-Depth.
const originalUrlEmail = urlParams.get('email') ?? '';

// P2-W11-006 FIX: Remove token from URL bar after extraction.
// PREVIOUS: Reset token persisted in browser address bar and history.
// On shared/public computers (common in Syrian internet cafes), the token is exposed
// to the next user via browser history or the visible URL.
// Standard: OWASP Token Handling, CWE-598 (Sensitive Info in GET Request).
if (resetToken) {
  try {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('token');
    // P2-W13-002 FIX: Also strip email param from URL bar.
    // PREVIOUS: Only token was stripped. Email remained visible in the URL bar
    // on shared/public computers (Syrian internet cafes). While less sensitive
    // than the token, it still leaks which email was being reset.
    // Standard: OWASP Sensitive Data Exposure, CWE-598.
    cleanUrl.searchParams.delete('email');
    history.replaceState(null, '', cleanUrl.toString());
  } catch {
    /* URL manipulation failed — non-critical */
  }
}

// P3-W15-008: MAX_PASSWORD_LENGTH import removed — validatePasswordComplexity handles max check internally.

// If no token, show guidance instead of error.
// W3-P0-004 FIX: Changed from error banner to info banner with helpful guidance.
// Previous: "الرمز غير صالح أو منتهٍ" (Token invalid) — confusing for users
// arriving from "Forgot Password?" link when JS failed to load on auth page.
// Now: Shows clear guidance to request a reset link, with the form as primary CTA.
// Standard: Nielsen #9 (Error Recovery), Apple HIG (Clear Escape Routes).
if (!resetToken) {
  // P2-W13-001 FIX: Changed from 'error' to 'info' — no-token state is guidance, not an error.
  // PREVIOUS: Red error banner for informational guidance ("Enter your email to receive a reset link").
  // Standard: Nielsen #9 (Error Recovery), Semantic Color Coding.
  showBanner(
    'info',
    t('reset_no_token', 'أدخل بريدك الإلكتروني لاستلام رابط إعادة تعيين كلمة المرور'),
  );
  // DEF-RESET-002 FIX: Replaced form.style.display = 'none' with class toggle.
  // Standard: DEF-VIS-001 precedent — CSS Single Source of Truth.
  if (form) {
    form.classList.add('nm-hidden');
  }
}

// ─── Form Validation ────────────────────────────────────────────────────────
// W3-P2-003 FIX: Match indicator element for real-time confirm feedback.
const matchEl = document.getElementById('reset-pw-match');

function updateSubmitButton(): void {
  if (!submitBtn || !newPasswordInput || !confirmPasswordInput) {
    return;
  }
  const pw = newPasswordInput.value;
  const confirm = confirmPasswordInput.value;

  // P0-W13-001 + P2-W13-004 FIX: Use shared validatePasswordComplexity().
  // PREVIOUS: 6 inline conditions duplicating the exact logic in validators.ts.
  // If rules change (e.g., min length 10), validators.ts updates but this stayed at 8.
  // Standard: DRY Principle, OWASP ASVS 2.1.1, validators.ts parity.
  const pwResult = validatePasswordComplexity(pw);
  const isValid = pwResult.valid && pw === confirm;

  // BUG-007 FIX: Replaced disabled attribute with CSS class toggle.
  // disabled removes button from tab order (WCAG 2.1.1 violation) and
  // prevents users from understanding WHY it's disabled.
  // Standard: Parity with auth.ts L629 pattern.
  submitBtn.classList.toggle('nm-btn-disabled-soft', !isValid);

  // W3-P2-003 FIX: Real-time password match/mismatch indicator.
  // Previous: Zero feedback until form submit — user typed blindly in confirm field.
  // Now: Immediate ✓/✗ indicator below confirm field with color-coded status.
  // Standard: Nielsen #1 (Visibility of System Status), auth.ts pw-mismatch-error parity.
  if (matchEl && confirm.length > 0) {
    matchEl.classList.remove('nm-hidden');
    if (pw === confirm) {
      matchEl.textContent = t('pw_match_ok', '✓ كلمتا المرور متطابقتان');
      matchEl.className = 'text-xs mt-1.5 font-medium text-emerald-600 dark:text-emerald-400';
    } else {
      matchEl.textContent = t('pw_match_fail', '✗ كلمتا المرور غير متطابقتين');
      matchEl.className = 'text-xs mt-1.5 font-medium text-red-600 dark:text-red-400';
    }
  } else if (matchEl) {
    matchEl.classList.add('nm-hidden');
  }
}

newPasswordInput?.addEventListener('input', () => {
  // PLT-MAR11-005: Use shared utility (single source of truth)
  updatePasswordStrength(newPasswordInput.value, strengthBars, strengthLabel);
  updateSubmitButton();
});
confirmPasswordInput?.addEventListener('input', updateSubmitButton);

// ─── Password Toggle (New Password) ────────────────────────────────────────
const toggle = document.getElementById('reset-toggle-pw');
if (toggle && newPasswordInput) {
  toggle.addEventListener('click', () => {
    const isPassword = newPasswordInput.type === 'password';
    newPasswordInput.type = isPassword ? 'text' : 'password';
    const toggleIcon = toggle.querySelector('.ph');
    if (toggleIcon) {
      toggleIcon.className = isPassword ? 'ph ph-eye-slash' : 'ph ph-eye';
    }
    // P2-AUD-003 FIX: ARIA attributes for screen reader parity with auth.ts.
    // PREVIOUS: No ARIA — SR users had no feedback about password visibility state.
    // Standard: WCAG 4.1.2 (Name, Role, Value), auth.ts setupPasswordToggle() parity.
    toggle.setAttribute(
      'aria-label',
      isPassword
        ? t('auth_hide_password', 'إخفاء كلمة المرور')
        : t('auth_show_password', 'إظهار كلمة المرور'),
    );
    toggle.setAttribute('aria-pressed', String(isPassword));
  });
}

// ─── Banner ─────────────────────────────────────────────────────────────────
// P2-AUD-002 FIX: Shared banner utility replaces local duplicate
const bannerElements: StructuredBannerElements = {
  banner,
  inner: bannerInner,
  icon: bannerIcon,
  text: bannerText,
};

function showBanner(type: 'error' | 'success' | 'info', message: string): void {
  showStructuredBanner(bannerElements, type, message);
  // P2-W13-005 FIX: Haptic feedback on banner display — parity with auth.ts.
  // PREVIOUS: Zero haptic feedback on error/success banners. auth.ts L818-830
  // has haptic.heavy() for errors, haptic.success() for success, haptic.light()
  // for info. This page was inconsistent.
  // Standard: Apple HIG ("Use haptics to reinforce feedback"), auth.ts parity.
  if (type === 'error') {
    haptic.heavy();
  } else if (type === 'success') {
    haptic.success();
  } else {
    haptic.light();
  }
}

// ─── Form Submission ────────────────────────────────────────────────────────
let isSubmitting = false;

// ─── P1-W13-005 FIX: Auto-clear banner on input ────────────────────────────
// PREVIOUS: Error banners persisted while user corrected their password.
// auth.ts has comprehensive auto-clear at L986-1009 — when the user types in
// any auth field, visible banners auto-hide. reset-password.ts had NO equivalent.
// Standard: Nielsen #1 (Visibility of System Status), auth.ts parity.
// ────────────────────────────────────────────────────────────────────────────
function autoClearBannerOnInput(): void {
  if (banner && !banner.classList.contains('nm-hidden')) {
    hideStructuredBanner(banner);
  }
}
newPasswordInput?.addEventListener('input', autoClearBannerOnInput);
confirmPasswordInput?.addEventListener('input', autoClearBannerOnInput);

// ─── P1-AUTH-003 FIX: Confirm Password Toggle ──────────────────────────────
// auth.html has toggles on BOTH password fields. reset-password.html was missing
// the toggle on confirm-password — users couldn't verify their input.
// Standard: Password UX Parity, WCAG 1.3.1.
const confirmToggle = document.getElementById('reset-toggle-pw-confirm');
if (confirmToggle && confirmPasswordInput) {
  confirmToggle.addEventListener('click', () => {
    const isPassword = confirmPasswordInput.type === 'password';
    confirmPasswordInput.type = isPassword ? 'text' : 'password';
    const toggleIcon = confirmToggle.querySelector('.ph');
    if (toggleIcon) {
      toggleIcon.className = isPassword ? 'ph ph-eye-slash' : 'ph ph-eye';
    }
    // P2-AUD-003 FIX: ARIA attributes — same as new-password toggle above.
    confirmToggle.setAttribute(
      'aria-label',
      isPassword
        ? t('auth_hide_password', 'إخفاء كلمة المرور')
        : t('auth_show_password', 'إظهار كلمة المرور'),
    );
    confirmToggle.setAttribute('aria-pressed', String(isPassword));
  });
}

// ─── P1-AUTH-002 FIX: Request New Reset Link (Expired/Missing Token) ────────
// When token is missing or expired, the form is hidden. But previously there was
// NO way to request a new link — user had to manually navigate to auth.html.
// Now: Show an inline "Request New Link" form with email input.
// Standard: Nielsen #9 (Error Recovery), WCAG 3.3.3 (Error Suggestion).
// ─────────────────────────────────────────────────────────────────────────────
const requestNewSection = document.getElementById('reset-request-new');
const requestEmailInput = document.getElementById('reset-request-email') as HTMLInputElement | null;
const requestBtn = document.getElementById('reset-request-btn') as HTMLButtonElement | null;
const requestFeedback = document.getElementById('reset-request-feedback');

// Show "Request New Link" section when token is missing
if (!resetToken && requestNewSection) {
  requestNewSection.classList.remove('nm-hidden');
}

requestBtn?.addEventListener('click', async () => {
  const email = requestEmailInput?.value.trim();
  if (!email) {
    showRequestFeedback('error', t('reset_enter_email', 'أدخل بريدك الإلكتروني'));
    requestEmailInput?.focus();
    return;
  }

  // P3-W13-003 FIX: Use shared EMAIL_REGEX from validators.ts (imported at top).
  // PREVIOUS: Inline `const EMAIL_REGEX = /^.../` — 4th duplicate of the same regex.
  // auth.ts was fixed in Wave 12. This was the last remaining inline copy.
  // Standard: DRY Principle, Centralized Validation.
  if (email.length > 254 || !EMAIL_REGEX.test(email)) {
    showRequestFeedback('error', t('reset_invalid_email', 'صيغة البريد الإلكتروني غير صالحة'));
    requestEmailInput?.focus();
    return;
  }

  if (requestBtn.classList.contains('btn-loading')) {
    return;
  }
  requestBtn.classList.add('btn-loading');

  try {
    const data = await auth.forgotPassword({ email });
    if (data.success) {
      showRequestFeedback(
        'success',
        data.message ??
          t(
            'reset_link_sent',
            'إذا كان بريدك مسجّلاً لدينا، ستصلك رسالة لإعادة تعيين كلمة المرور.',
          ),
      );
      // P3-AUD-001 FIX: Haptic success feedback — parity with auth.ts.
      haptic.success();
    } else {
      showRequestFeedback('error', data.error ?? t('reset_request_failed', 'فشل إرسال الرابط'));
      haptic.heavy();
    }
  } catch (err) {
    // P2-AUD-002 FIX: Detect structured ApiError — parity with main form submit handler.
    // PREVIOUS: Only `err instanceof Error` — 429 rate limiting showed raw backend message.
    // Standard: Error Handling Parity, OWASP Error Handling.
    if (err instanceof ApiError) {
      if (err.status === 429) {
        showRequestFeedback(
          'error',
          err.message || t('reset_rate_limited', 'محاولات كثيرة. يرجى الانتظار.'),
        );
      } else {
        showRequestFeedback('error', err.message || t('reset_request_failed', 'فشل إرسال الرابط'));
      }
    } else {
      showRequestFeedback(
        'error',
        err instanceof Error ? err.message : t('reset_network_error', 'خطأ في الشبكة'),
      );
    }
    haptic.heavy();
  } finally {
    requestBtn.classList.remove('btn-loading');
    // P1-AUD-001 FIX: 60s cooldown on "Request New Link" button.
    // PREVIOUS: Button immediately re-enabled after API call — no cooldown.
    // Users could rapid-click 5+ times on Syria 2G before first response arrives.
    // Parity with auth.ts handleForgotPassword() L1567-1575.
    // Standard: Rate Limit UX, Debounce Pattern.
    requestBtn.classList.add('nm-btn-cooldown');
    requestBtn.setAttribute('aria-disabled', 'true');
    const origBtnText = requestBtn.textContent ?? '';
    let cooldown = 60;
    // P0-W12-002 FIX: Use tracked interval instead of raw setInterval.
    // PREVIOUS: Raw setInterval was NOT tracked — if user navigated away
    // during 60s cooldown, the orphaned timer survived.
    // Standard: Timer Hygiene, auth.ts parity (P1-W6-001).
    let cooldownTimer: ReturnType<typeof setInterval> | null = createTrackedInterval(() => {
      cooldown--;
      requestBtn.textContent = `${t('verify_resend_wait', 'انتظر')} (${cooldown}s)`;
      if (cooldown <= 0) {
        cooldownTimer = clearTrackedInterval(cooldownTimer);
        requestBtn.classList.remove('nm-btn-cooldown');
        requestBtn.removeAttribute('aria-disabled');
        requestBtn.textContent = origBtnText;
      }
    }, 1000);
  }
});

function showRequestFeedback(type: 'success' | 'error', message: string): void {
  if (!requestFeedback) {
    return;
  }
  requestFeedback.classList.remove('nm-hidden');
  // BUG-F08 FIX: Added dark: variants for dark mode parity.
  // PREVIOUS: bg-emerald-50/bg-red-50 only — light backgrounds clashed in dark mode.
  // Standard: Dark Mode Parity, Nammerha Design System.
  requestFeedback.className = `mt-2 rounded-lg p-2 text-xs font-medium ${
    type === 'success'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
      : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
  }`;
  requestFeedback.textContent = message;
}

// Also show "Request New Link" on expired token errors from the API
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSubmitting || !resetToken) {
    return;
  }

  // BUG-F10 FIX: Add .submitted class for CSS validation highlighting.
  // PREVIOUS: auth.ts added this at L786/L887 but reset-password.ts did NOT.
  // CSS validation indicators (main.css L1646-1652) require this class.
  // Standard: CSS-Driven Validation Parity, Nielsen #9 (Error Recognition).
  form.classList.add('submitted');

  const newPassword = newPasswordInput?.value ?? '';
  const confirmPassword = confirmPasswordInput?.value ?? '';

  // PLT-MAR11-007 FIX: All user-facing strings wrapped with i18n t()
  if (newPassword !== confirmPassword) {
    showBanner('error', t('reset_password_mismatch', 'كلمتا المرور غير متطابقتين'));
    scrollToField(confirmPasswordInput);
    return;
  }

  // P0-W13-001 FIX: Use shared validatePasswordComplexity() — replaces inline regex.
  // PREVIOUS: 5 inline conditions duplicating the exact logic in validators.ts.
  // If rules change, validators.ts + auth.ts + profile.ts + backend schemas.ts all
  // update, but this file stayed at the old rule. Users could set passwords on
  // reset that are accepted here but rejected at login.
  // Standard: DRY Principle, OWASP ASVS 2.1.1, validators.ts parity.
  const pwValidation = validatePasswordComplexity(newPassword);
  if (!pwValidation.valid) {
    showBanner('error', t('reset_password_weak', 'كلمة المرور ضعيفة جداً'));
    scrollToField(newPasswordInput);
    return;
  }

  // P3-W15-008: Explicit max-length check removed — unreachable dead code.
  // validatePasswordComplexity() at L425 already checks max(128).

  isSubmitting = true;
  if (submitBtn) {
    submitBtn.classList.add('btn-loading');
  }
  if (submitText) {
    submitText.textContent = t('reset_resetting', 'جاري إعادة التعيين…');
  }

  // P3-AUD-001 FIX: Haptic start feedback — parity with auth.ts submit handler.
  haptic.medium();

  try {
    const data = await auth.resetPassword({ token: resetToken, new_password: newPassword });

    if (data.success) {
      // P3-AUD-001 FIX: Haptic success feedback — parity with auth.ts.
      haptic.success();
      showBanner('success', data.message ?? t('reset_success', 'تم تغيير كلمة المرور بنجاح'));
      if (form) {
        form.classList.add('nm-hidden');
      }
      // P0-DEEP-002 FIX: Pre-fill email from API response data instead of requestEmailInput.
      // PREVIOUS: requestEmailInput is the "Request New Link" email field — only visible
      // when token is missing/expired. During a SUCCESSFUL reset, it's hidden and empty.
      // NOW: Backend returns { data: { email } } in the success response.
      // Fallback chain: response.data.email → requestEmailInput → URL param → empty.
      // Standard: Nielsen #6 (Recognition Over Recall), verify-email.ts parity.
      // P1-W13-002 FIX: Show fallback "Go to login" link immediately.
      // PREVIOUS: Only setTimeout redirect at 2000ms. If redirect fails (network
      // drop, browser extension, CSP block), user is stuck — form hidden, success
      // banner shown, but no way to proceed. Unlike auth.ts (P2-W12-006) which
      // has a safety restore, reset-password.ts had NO fallback.
      // Standard: Nielsen #3 (User Control & Freedom), Defense-in-Depth.
      const responseData = data as { data?: { email?: string } };
      // P2-S4-005 FIX: Use module-scoped `originalUrlEmail` (captured before URL stripping)
      // instead of `urlParams.get('email')` which reads the already-stripped param (empty).
      // Fallback priority: backend response > form input > pre-strip URL > empty.
      const userEmail =
        responseData.data?.email ?? requestEmailInput?.value.trim() ?? originalUrlEmail;
      const emailParam = userEmail ? `?email=${encodeURIComponent(userEmail)}` : '';
      const fallbackContainer = document.createElement('div');
      fallbackContainer.className = 'mt-4 text-center animate-fade-in-up';
      // AGENTS.md: ALL innerHTML MUST use escapeHtml(). Using safe DOM APIs
      // instead to eliminate XSS surface entirely — zero innerHTML needed.
      const fallbackLink = document.createElement('a');
      fallbackLink.href = `/auth.html${emailParam}`;
      fallbackLink.className =
        'text-sm text-trust-blue font-medium hover:underline inline-flex items-center gap-1';
      const arrowIcon = document.createElement('i');
      arrowIcon.className = 'ph ph-arrow-left nm-icon-back-arrow';
      arrowIcon.setAttribute('aria-hidden', 'true');
      fallbackLink.appendChild(arrowIcon);
      fallbackLink.appendChild(
        document.createTextNode(t('reset_go_to_login', 'الانتقال لتسجيل الدخول')),
      );
      fallbackContainer.appendChild(fallbackLink);
      // Insert after the banner
      const bannerParent = banner?.parentNode;
      if (bannerParent && banner) {
        bannerParent.insertBefore(fallbackContainer, banner.nextSibling);
      }

      addTrackedTimer(setTimeout(() => {
        window.location.href = `/auth.html${emailParam}`;
      }, 2000));
    } else {
      showBanner('error', data.error ?? t('reset_failed', 'فشلت إعادة التعيين'));
      // P1-AUTH-002 FIX: If the error indicates an expired token, show the
      // "Request New Link" section so user isn't stuck at a dead-end.
      const errorMsg = (data.error ?? '').toLowerCase();
      if (errorMsg.includes('expired') || errorMsg.includes('منته')) {
        if (form) {
          form.classList.add('nm-hidden');
        }
        if (requestNewSection) {
          requestNewSection.classList.remove('nm-hidden');
        }
      }
    }
  } catch (err) {
    // P1-W12-005 FIX: Detect structured ApiError codes from _client.ts.
    // PREVIOUS: Only `err instanceof Error` — missed 429 rate-limit, 410 expired,
    // and other structured errors. Users saw raw English backend messages.
    // NOW: Full ApiError detection with translated user-facing messages.
    // Standard: Error Handling Parity with auth.ts (L1079-1161), OWASP Error Handling.
    if (err instanceof ApiError) {
      if (err.status === 429) {
        showBanner(
          'error',
          err.message ||
            t('reset_rate_limited', 'محاولات كثيرة. يرجى الانتظار قبل المحاولة مرة أخرى.'),
        );
      } else if (err.status === 410) {
        // 410 Gone — token expired
        showBanner('error', t('reset_token_expired', 'انتهت صلاحية الرمز'));
        if (form) {
          form.classList.add('nm-hidden');
        }
        if (requestNewSection) {
          requestNewSection.classList.remove('nm-hidden');
        }
      } else if (err.message.includes('different') || err.message.includes('مختلفة')) {
        // Password reuse check — backend returns 400 with "must be different"
        showBanner(
          'error',
          t('reset_password_reuse', 'يجب أن تكون كلمة المرور الجديدة مختلفة عن الحالية'),
        );
      } else if (
        err.status === 400 &&
        (err.message.includes('Invalid') || err.message.includes('expired'))
      ) {
        showBanner(
          'error',
          t('reset_token_invalid', 'الرمز غير صالح أو تم استخدامه — اطلب رابط جديد'),
        );
        if (form) {
          form.classList.add('nm-hidden');
        }
        if (requestNewSection) {
          requestNewSection.classList.remove('nm-hidden');
        }
      } else {
        showBanner('error', err.message || t('reset_network_error', 'خطأ في الشبكة'));
      }
    } else {
      // Fallback: non-ApiError (network failures, timeouts, etc.)
      const message =
        err instanceof Error ? err.message : t('reset_network_error', 'خطأ في الشبكة');
      if (message.includes('timeout') || message.includes('abort')) {
        showBanner('error', t('reset_timeout', 'انقطع الاتصال'));
      } else {
        showBanner('error', message);
      }
    }
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.classList.remove('btn-loading');
    }
    if (submitText) {
      submitText.textContent = t('reset_submit_btn', 'إعادة تعيين');
    }
  }
});

// P2-DEEP-004 FIX: Auto-focus the new-password input when a valid token is present.
// PREVIOUS: Users arriving from email reset link had to manually tap the field.
// auth.ts has autofocus at L2536-2547 — parity was missing here.
// Standard: Apple HIG ("Focus the primary input"), Material Design 3.
if (resetToken && newPasswordInput) {
  requestAnimationFrame(() => {
    newPasswordInput.focus();
  });
}

// P1-W12-001 FIX: Page Lifecycle Cleanup — parity with auth.ts L3161-3163.
// PREVIOUS: reset-password.ts had NO pagehide handler. The cooldown timer
// (P0-W12-002) survived page navigation and bfcache restoration.
// Uses `pagehide` over `beforeunload` because:
//   1. `beforeunload` blocks bfcache — critical for Syria 2G
//   2. `pagehide` fires for ALL navigation types
// Standard: Page Lifecycle API, Web Performance (bfcache eligibility).
window.addEventListener('pagehide', () => {
  clearAllTrackedTimers();
});
