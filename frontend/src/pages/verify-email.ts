import '../styles/main.css';
import { auth } from '../api';
import { t } from '../utils/i18n';

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

// ─── Extract Token from URL ────────────────────────────────────────────────
// The backend sends links like: /verify-email.html?token=<uuid>
const urlParams = new URLSearchParams(window.location.search);
const verifyToken = urlParams.get('token');

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
        'rounded-xl p-4 text-sm font-medium flex items-start gap-3 bg-emerald-50 text-emerald-700 border border-emerald-200';
      bannerIcon.className = 'ph ph-check-circle mt-0.5';
    } else if (type === 'expired') {
      bannerInner.className =
        'rounded-xl p-4 text-sm font-medium flex items-start gap-3 bg-amber-50 text-amber-700 border border-amber-200';
      bannerIcon.className = 'ph ph-clock-countdown mt-0.5';
    } else {
      bannerInner.className =
        'rounded-xl p-4 text-sm font-medium flex items-start gap-3 bg-red-50 text-red-700 border border-red-200';
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
      showResult(
        'success',
        t('verify_success_title', 'تم التحقق!'),
        data.message ?? t('verify_success_body', 'تم تأكيد بريدك الإلكتروني بنجاح'),
      );
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

// ─── FIX-07: Resend Verification Email ──────────────────────────────────────
const resendBtn = document.getElementById('verify-resend-btn');
const resendEmail = document.getElementById('verify-resend-email') as HTMLInputElement | null;
const resendFeedback = document.getElementById('verify-resend-feedback');

resendBtn?.addEventListener('click', async () => {
  const email = resendEmail?.value.trim();
  if (!email) {
    showResendFeedback('error', t('verify_resend_enter_email', 'أدخل بريدك لإعادة الإرسال'));
    resendEmail?.focus();
    return;
  }

  resendBtn.textContent = t('verify_resend_sending', 'جاري إعادة الإرسال…');
  (resendBtn as HTMLButtonElement).disabled = true;

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
    resendBtn.textContent = t('verify_resend_btn', 'إعادة إرسال رابط التحقق');
    (resendBtn as HTMLButtonElement).disabled = false;
  }
});

function showResendFeedback(type: 'success' | 'error', message: string): void {
  if (!resendFeedback) {
    return;
  }
  // DEF-VIS-003 FIX: Replaced style.display with classList toggle.
  resendFeedback.classList.remove('nm-hidden');
  resendFeedback.className = `mt-2 rounded-lg p-2 text-xs font-medium ${
    type === 'success'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : 'bg-red-50 text-red-700 border border-red-200'
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
    const draft = sessionStorage.getItem('nm_reg_draft');
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

// Initialize on page load
verifyEmail();
