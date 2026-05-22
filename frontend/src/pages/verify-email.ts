import '../styles/main.css';
import { auth } from '../api';
import { t } from '../utils/i18n';
// P2-W6-009 FIX: Pre-warm CSRF token for POST requests (resend verification).
// Parity with auth.ts L33 — prevents 2-5s invisible delay on Syria 2G.
import { warmCsrf } from '../api/_client';
warmCsrf();

// EDGE-6 FIX: Module-scoped timer reference for cooldown cleanup.
// Prevents timer leak when user navigates away during 60s resend countdown.
let _activeCooldownTimer: ReturnType<typeof setInterval> | null = null;

// EDGE-6 FIX: Clean up timer on page unload (bfcache-safe).
// Uses 'pagehide' instead of 'beforeunload' to avoid blocking bfcache.
window.addEventListener('pagehide', () => {
  if (_activeCooldownTimer !== null) {
    clearInterval(_activeCooldownTimer);
    _activeCooldownTimer = null;
  }
});

// ============================================================================
// Nammerha — Email Verification Landing Page
// PLT-AUD-006 FIX: User-friendly verification result display
// PLT-MAR11-006 FIX: Uses centralized API client instead of raw fetch
// I18N-001 FIX: All user-facing strings wrapped with i18n t()
// FIX-004: i18n interface now from shared utils/i18n.ts
// ============================================================================

// ─── DOM References ─────────────────────────────────────────────────────────
const iconContainer = document.getElementById('verify-icon-container');
const icon = document.getElementById('verify-icon');
const title = document.getElementById('verify-title');
const subtitle = document.getElementById('verify-subtitle');
const banner = document.getElementById('verify-banner');
const bannerInner = document.getElementById('verify-banner-inner');
const bannerIcon = document.getElementById('verify-banner-icon');
const bannerTitle = document.getElementById('verify-banner-title');
const bannerText = document.getElementById('verify-banner-text');
const actions = document.getElementById('verify-actions');

// P2-W6-005 FIX: Moved resend DOM references above verifyEmail() function.
// Previously at L165-167, referenced at L124 inside verifyEmail() — fragile
// code ordering dependency (temporal dead zone with const declarations).
const resendBtn = document.getElementById('verify-resend-btn');
const resendEmail = document.getElementById('verify-resend-email') as HTMLInputElement | null;
const resendFeedback = document.getElementById('verify-resend-feedback');

// ─── Extract Token from URL ────────────────────────────────────────────────
// The backend sends links like: /verify-email.html?token=<uuid>
const urlParams = new URLSearchParams(window.location.search);
const verifyToken = urlParams.get('token');

// P2-W11-007 FIX: Remove token from URL bar after extraction.
// Same as P2-W11-006 for reset-password — prevents token exposure on shared computers.
// Standard: OWASP Token Handling, CWE-598 (Sensitive Info in GET Request).
if (verifyToken) {
  try {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('token');
    history.replaceState(null, '', cleanUrl.toString());
  } catch {
    /* URL manipulation failed — non-critical */
  }
}

function showResult(
  type: 'success' | 'error' | 'expired',
  titleText: string,
  message: string,
): void {
  // Update header icon
  if (iconContainer && icon) {
    if (type === 'success') {
      iconContainer.className =
        'inline-flex items-center justify-center size-16 bg-smoky-jade rounded-2xl shadow-lg shadow-smoky-jade/20 mb-4';
      icon.className = 'ph ph-check-circle text-white';
      icon.classList.add('nm-icon-32');
    } else if (type === 'expired') {
      iconContainer.className =
        'inline-flex items-center justify-center size-16 bg-warning-yellow rounded-2xl shadow-lg shadow-warning-yellow/20 mb-4';
      icon.className = 'ph ph-clock-countdown text-white';
      icon.classList.add('nm-icon-32');
    } else {
      iconContainer.className =
        'inline-flex items-center justify-center size-16 bg-red-500 rounded-2xl shadow-lg shadow-red-500/20 mb-4';
      icon.className = 'ph ph-x-circle text-white';
      icon.classList.add('nm-icon-32');
    }
  }

  // Update title and subtitle
  if (title) {
    title.textContent = titleText;
  }
  if (subtitle) {
    subtitle.textContent = '';
  }

  // Show banner
  if (banner && bannerInner && bannerIcon && bannerTitle && bannerText) {
    // DEF-VIS-002 FIX: Replaced style.display with classList toggle.
    banner.classList.remove('nm-hidden');
    bannerTitle.textContent = titleText;
    bannerText.textContent = message;

    if (type === 'success') {
      bannerInner.className =
        'rounded-xl p-4 text-sm font-medium flex items-start gap-3 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
      bannerIcon.className = 'ph ph-check-circle mt-0.5';
    } else if (type === 'expired') {
      bannerInner.className =
        'rounded-xl p-4 text-sm font-medium flex items-start gap-3 bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
      bannerIcon.className = 'ph ph-clock-countdown mt-0.5';
    } else {
      bannerInner.className =
        'rounded-xl p-4 text-sm font-medium flex items-start gap-3 bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800';
      bannerIcon.className = 'ph ph-warning-circle mt-0.5';
    }
  }

  // Show sign-in action + resend section for expired/error states
  // DEF-VIS-003 FIX: Replaced style.display with classList toggle.
  if (actions) {
    actions.classList.remove('nm-hidden');
  }
  const resendSection = document.getElementById('verify-resend');
  if (resendSection && (type === 'expired' || type === 'error')) {
    resendSection.classList.remove('nm-hidden');
  }
}

// ─── Verify Token via API ───────────────────────────────────────────────────
async function verifyEmail(): Promise<void> {
  if (!verifyToken) {
    // I18N-001 FIX: Wrapped with t()
    showResult(
      'error',
      t('verify_invalid_link', 'رابط تحقق غير صالح'),
      t('verify_no_token', 'الرمز مفقود'),
    );
    return;
  }

  try {
    // PLT-MAR11-006 FIX: Uses centralized API client with 30s timeout,
    // CSRF token attachment, and unified error handling.
    const data = await auth.verifyEmail(verifyToken);

    if (data.success) {
      // P1-DEEP-007 FIX: Distinguish "already verified" from "just verified".
      // Backend returns "Email already verified" (auth.routes.ts L668-672) when
      // the user clicks the verification link a second time. Showing the same
      // celebratory "تم التحقق!" is misleading — the action didn't DO anything.
      // Standard: Nielsen #1 (System Status Visibility), Honest Feedback.
      const isAlreadyVerified =
        data.message?.toLowerCase().includes('already verified') ||
        data.message?.includes('تم التحقق مسبقاً');

      if (isAlreadyVerified) {
        showResult(
          'success',
          t('verify_already_title', 'تم التحقق مسبقاً'),
          data.message ??
            t('verify_already_body', 'بريدك الإلكتروني مؤكد بالفعل — يمكنك تسجيل الدخول'),
        );
      } else {
        showResult(
          'success',
          t('verify_success_title', 'تم التحقق!'),
          data.message ?? t('verify_success_body', 'تم تأكيد بريدك الإلكتروني بنجاح'),
        );
      }
      // BUG-F13 FIX: Update "Sign In" link to include verified email for pre-fill.
      // PREVIOUS: <a href="/auth.html"> — user had to re-type email after verification.
      // NOW: Appends ?email= param. auth.ts reads it for pre-fill convenience.
      // Standard: Nielsen #6 (Recognition over Recall), Zero Re-entry Friction.
      const signInLink = document.getElementById('verify-action-btn') as HTMLAnchorElement | null;
      const verifiedEmail = urlParams.get('email') ?? resendEmail?.value.trim() ?? '';
      if (signInLink && verifiedEmail) {
        signInLink.href = `/auth.html?email=${encodeURIComponent(verifiedEmail)}`;
      }
    } else {
      showResult(
        'error',
        t('verify_failed_title', 'فشل التحقق'),
        data.error ?? t('verify_failed_body', 'لم نتمكن من التحقق من بريدك'),
      );
    }
  } catch (err) {
    // The centralized API client throws on network errors, timeouts, and non-2xx responses
    const message =
      err instanceof Error ? err.message : t('verify_server_unreachable', 'لا يمكن الوصول للخادم');

    if (message.includes('timeout') || message.includes('abort')) {
      showResult(
        'error',
        t('verify_timeout_title', 'انقطع الاتصال'),
        t('verify_timeout_body', 'حاول مرة أخرى لاحقاً'),
      );
    } else if (message.includes('expired') || message.includes('410')) {
      showResult(
        'expired',
        t('verify_expired_title', 'انتهت صلاحية الرابط'),
        t('verify_expired_body', 'يرجى طلب رابط تحقق جديد'),
      );
    } else if (message.includes('not found') || message.includes('404')) {
      showResult(
        'error',
        t('verify_not_found_title', 'الحساب غير موجود'),
        t('verify_not_found_body', 'لم نعثر على حساب بهذا البريد'),
      );
    } else {
      showResult('error', t('verify_network_error', 'خطأ في الشبكة'), message);
    }
  }
}

// FIX-07: Resend Verification Email (DOM refs moved to top — P2-W6-005)

resendBtn?.addEventListener('click', async () => {
  const email = resendEmail?.value.trim();
  if (!email) {
    showResendFeedback('error', t('verify_resend_enter_email', 'أدخل بريدك لإعادة الإرسال'));
    resendEmail?.focus();
    return;
  }

  // BUG-F03 FIX: Replaced `.disabled = true` with nm-btn-cooldown CSS class.
  // PREVIOUS: `disabled` removed button from tab order — WCAG 2.1.1 violation.
  // Standard: WCAG 2.1.1 (Keyboard), Parity with auth.ts resend pattern.
  resendBtn.classList.add('btn-loading');
  (resendBtn as HTMLElement).setAttribute('aria-disabled', 'true');

  try {
    const data = await auth.resendVerification({ email });
    if (data.success) {
      showResendFeedback(
        'success',
        data.message ?? t('verify_resend_success', 'تم إعادة إرسال رابط التحقق'),
      );
    } else {
      showResendFeedback('error', data.error ?? t('verify_resend_failed', 'فشلت إعادة الإرسال'));
    }
  } catch (err) {
    showResendFeedback(
      'error',
      err instanceof Error
        ? err.message
        : t('verify_resend_network_error', 'خطأ في الشبكة أثناء الإرسال'),
    );
  } finally {
    resendBtn.classList.remove('btn-loading');
    // BUG-F06 FIX: Apply 60s cooldown to prevent spam (parity with auth.ts).
    // PREVIOUS: Button immediately re-enabled — users hammered it → 429 errors.
    // Standard: Rate Limit UX, Parity with auth.ts cooldown pattern.
    resendBtn.classList.add('nm-btn-cooldown');
    (resendBtn as HTMLElement).setAttribute('aria-disabled', 'true');
    const btnEl = resendBtn as HTMLElement;
    const origText = btnEl.textContent ?? '';
    let countdown = 60;
    // EDGE-6 FIX: Track cooldown timer to prevent memory leak on navigation.
    // PREVIOUS: Raw setInterval was NOT tracked — if the user navigated away
    // during the 60s countdown, this timer leaked until expiry.
    // Standard: Timer Hygiene, Page Lifecycle API.
    if (_activeCooldownTimer !== null) {
      clearInterval(_activeCooldownTimer);
    }
    _activeCooldownTimer = setInterval(() => {
      countdown--;
      btnEl.textContent = `${t('verify_resend_wait', 'انتظر')} (${countdown}s)`;
      if (countdown <= 0) {
        if (_activeCooldownTimer !== null) {
          clearInterval(_activeCooldownTimer);
          _activeCooldownTimer = null;
        }
        resendBtn.classList.remove('nm-btn-cooldown');
        btnEl.removeAttribute('aria-disabled');
        btnEl.textContent = origText;
      }
    }, 1000);
  }
});

function showResendFeedback(type: 'success' | 'error', message: string): void {
  if (!resendFeedback) {
    return;
  }
  // DEF-VIS-003 FIX: Replaced style.display with classList toggle.
  resendFeedback.classList.remove('nm-hidden');
  // BUG-F08 FIX: Added dark: variants for dark mode parity.
  // PREVIOUS: bg-emerald-50/bg-red-50 only — light backgrounds clashed in dark mode.
  // Standard: Dark Mode Parity, Nammerha Design System.
  resendFeedback.className = `mt-2 rounded-lg p-2 text-xs font-medium ${
    type === 'success'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
      : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
  }`;
  resendFeedback.textContent = message;
}

// P2-AUTH-006 FIX: Pre-fill resend email from registration draft or URL.
// Users just registered — they shouldn't have to re-type their email.
// Priority: URL param > sessionStorage draft > empty.
// Standard: Nielsen #6 (Recognition over Recall).
try {
  const urlEmail = urlParams.get('email');
  if (urlEmail && resendEmail) {
    resendEmail.value = urlEmail;
  } else if (resendEmail) {
    // BUG-005 FIX: Was 'nm_reg_draft' — mismatched auth.ts REG_DRAFT_KEY ('nmh_reg_draft').
    const draft = sessionStorage.getItem('nmh_reg_draft');
    if (draft) {
      const parsed = JSON.parse(draft) as { email?: string };
      if (parsed.email) {
        resendEmail.value = parsed.email;
      }
    }
  }
} catch {
  /* sessionStorage may be unavailable in private mode */
}

// P2-W12-004 FIX: Guard against DOM not being ready.
// PREVIOUS: verifyEmail() called synchronously during module execution.
// With type="module" + defer on slow networks (Syria 2G), DOM refs at L31-47
// could be null if document parsing hasn't completed.
// NOW: readyState check ensures DOM is fully parsed before running.
// Standard: Web Spec (Document readyState), Defense-in-Depth.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', verifyEmail);
} else {
  verifyEmail();
}
