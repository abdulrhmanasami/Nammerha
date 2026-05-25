/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Session Timeout Warning (P0-PLT-002)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Problem: JWT httpOnly cookies expire silently. Users editing a damage report
 * or filling a bid form lose ALL unsaved work when the next API call returns
 * 401 and _client.ts redirects to /auth.html.
 *
 * Solution: Proactive warning dialog 2 minutes before estimated session expiry.
 * Since the JWT is httpOnly (not readable by JS), we track session freshness
 * via the last successful API call timestamp and the configured session TTL.
 *
 * Architecture:
 *   1. On each successful API response, markSessionActivity() is called by
 *      the API client to update the "last active" timestamp.
 *   2. A low-frequency timer (every 30s) checks if the remaining session
 *      time is < WARNING_THRESHOLD_MS (2 minutes).
 *   3. If so, a native <dialog> warns the user and offers "Extend Session"
 *      (fires GET /api/auth/me to refresh the cookie) or "Sign Out".
 *   4. If the user does nothing for 2 minutes, auto-logout fires.
 *
 * Standard: OWASP Session Management, NIST SP 800-63B (Session Freshness),
 *           WCAG 2.2.1 (Timing Adjustable — user can extend).
 *
 * @version 1.0.0
 * @since P0-PLT-002
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { t } from './i18n';
import { tryApplyI18n } from './i18n-apply';
import { polyfillDialog } from './dialog-polyfill';
import { haptic } from './haptic';

// ─── Configuration ──────────────────────────────────────────────────────────

/** Estimated session TTL in milliseconds (matches backend JWT expiry: 2 hours). */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Show warning when remaining time drops below this (2 minutes). */
const WARNING_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/** Timer check interval (30 seconds — lightweight, no DOM thrash). */
const CHECK_INTERVAL_MS = 30 * 1000;

/** Auto-logout after warning is shown and user doesn't respond (2 minutes). */
const AUTO_LOGOUT_MS = WARNING_THRESHOLD_MS;

// ─── Storage Key ────────────────────────────────────────────────────────────
const ACTIVITY_KEY = 'nm_last_session_activity';

// ─── State ──────────────────────────────────────────────────────────────────
let checkTimer: ReturnType<typeof setInterval> | null = null;
let autoLogoutTimer: ReturnType<typeof setTimeout> | null = null;
let warningDialogEl: HTMLDialogElement | null = null;
let initialized = false;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Mark session activity. Call this on every successful authenticated API response.
 * This resets the "session freshness" clock.
 *
 * Architecture: Called by api/_client.ts after each 2xx response.
 */
export function markSessionActivity(): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* Safari private mode — degrade silently */
  }
}

/**
 * Initialize the session timeout watcher.
 * Call once on any authenticated page (e.g., from portal-bootstrap.ts).
 * Idempotent — safe to call multiple times.
 */
export function initSessionTimeoutWarning(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  // Seed initial activity if not already set
  try {
    if (!localStorage.getItem(ACTIVITY_KEY)) {
      markSessionActivity();
    }
  } catch {
    /* Safari private mode */
  }

  // Start the low-frequency check
  checkTimer = setInterval(checkSessionFreshness, CHECK_INTERVAL_MS);

  // Clean up on page unload
  window.addEventListener('beforeunload', cleanup);

  // Also mark activity on user interaction (mouse/keyboard) — debounced
  let lastInteraction = 0;
  const markOnInteraction = (): void => {
    const now = Date.now();
    // Debounce: only update every 30s regardless of interaction frequency
    if (now - lastInteraction > 30_000) {
      lastInteraction = now;
      markSessionActivity();
    }
  };
  document.addEventListener('click', markOnInteraction, { passive: true });
  document.addEventListener('keydown', markOnInteraction, { passive: true });
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

function checkSessionFreshness(): void {
  let lastActivity: number;
  try {
    const stored = localStorage.getItem(ACTIVITY_KEY);
    if (!stored) {
      return;
    }
    lastActivity = parseInt(stored, 10);
  } catch {
    return;
  }

  const elapsed = Date.now() - lastActivity;
  const remaining = SESSION_TTL_MS - elapsed;

  // Already expired — auth-guard will handle the 401
  if (remaining <= 0) {
    return;
  }

  // Within warning threshold — show the dialog
  if (remaining <= WARNING_THRESHOLD_MS && !warningDialogEl) {
    showWarningDialog(remaining);
  }
}

// ─── Warning Dialog ─────────────────────────────────────────────────────────

function showWarningDialog(remainingMs: number): void {
  // Prevent double-show
  if (warningDialogEl) {
    return;
  }

  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  const dialog = document.createElement('dialog');
  dialog.id = 'nm-session-timeout-dialog';
  dialog.className = 'nm-confirm-dialog';

  dialog.innerHTML = `
    <div class="nm-confirm-body">
      <div class="size-14 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-3">
        <i class="ph ph-hourglass-medium text-amber-500 nm-icon-28" aria-hidden="true"></i>
      </div>
      <h3 data-i18n="session_timeout_title">${t('session_timeout_title', 'جلستك على وشك الانتهاء')}</h3>
      <p data-i18n="session_timeout_msg">${t(
        'session_timeout_msg',
        `ستنتهي جلستك خلال ${remainingMinutes} دقيقة. هل تريد تمديد الجلسة؟`,
      )}</p>
      <p id="nm-timeout-countdown" class="text-xs text-amber-600 dark:text-amber-400 font-mono font-bold mt-2"></p>
    </div>
    <div class="nm-confirm-actions">
      <button type="button" class="nm-confirm-cancel" id="nm-timeout-logout" data-i18n="session_timeout_logout">
        ${t('session_timeout_logout', 'تسجيل الخروج')}
      </button>
      <button type="button" class="nm-confirm-warning" id="nm-timeout-extend" data-i18n="session_timeout_extend">
        ${t('session_timeout_extend', 'تمديد الجلسة')}
      </button>
    </div>
  `;

  document.body.appendChild(dialog);
  warningDialogEl = dialog;

  tryApplyI18n();

  // ── Countdown Timer ──
  const countdownEl = dialog.querySelector('#nm-timeout-countdown');
  let remainingSec = Math.ceil(remainingMs / 1000);
  const countdownTimer = setInterval(() => {
    remainingSec--;
    if (countdownEl) {
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      countdownEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    if (remainingSec <= 0) {
      clearInterval(countdownTimer);
    }
  }, 1000);

  // ── Extend Session ──
  dialog.querySelector('#nm-timeout-extend')?.addEventListener('click', async () => {
    haptic.medium();
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (res.ok) {
        // Session refreshed — reset activity clock
        markSessionActivity();
        dismissDialog(dialog, countdownTimer);
      } else {
        // Session already dead — redirect to login
        performLogout();
      }
    } catch {
      // Network error — dismiss dialog, let next interaction handle it
      dismissDialog(dialog, countdownTimer);
    }
  });

  // ── Sign Out ──
  dialog.querySelector('#nm-timeout-logout')?.addEventListener('click', () => {
    haptic.light();
    performLogout();
  });

  // ── Native <dialog> cancel (Escape key) = extend session ──
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    dialog.querySelector<HTMLElement>('#nm-timeout-extend')?.click();
  });

  // ── Auto-logout timer ──
  autoLogoutTimer = setTimeout(() => {
    dismissDialog(dialog, countdownTimer);
    performLogout();
  }, AUTO_LOGOUT_MS);

  // ── Show ──
  polyfillDialog(dialog);
  dialog.showModal();
  (dialog.querySelector('#nm-timeout-extend') as HTMLElement)?.focus();
}

function dismissDialog(
  dialog: HTMLDialogElement,
  countdownTimer: ReturnType<typeof setInterval>,
): void {
  clearInterval(countdownTimer);
  if (autoLogoutTimer) {
    clearTimeout(autoLogoutTimer);
    autoLogoutTimer = null;
  }
  dialog.close();
  dialog.remove();
  warningDialogEl = null;
}

function performLogout(): void {
  // P0-UXA-008 FIX: Privacy Shield Modal (In-Place Lock)
  // Destructive navigation (window.location.href) destroys data. We lock the screen in-place.
  import('../auth')
    .then(({ clearAuth }) => clearAuth(false))
    .catch(() => {
      try {
        localStorage.removeItem('nammerha_auth');
      } catch {
        /* degrade */
      }
    });

  if (document.getElementById('nm-privacy-shield')) return;

  const modal = document.createElement('div');
  modal.id = 'nm-privacy-shield';
  // Platinum UX: Dense blur to hide data, unbreakable z-index.
  modal.className =
    'fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/80 backdrop-blur-3xl animate-fade-in-up';

  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md h-[550px] overflow-hidden relative mx-4 border border-slate-700">
      <div class="absolute top-0 inset-x-0 h-10 bg-amber-500/10 flex items-center justify-center border-b border-amber-500/20 z-20">
        <p class="text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-2">
          <i class="ph-fill ph-lock-key" aria-hidden="true"></i> ${t('session_locked_privacy', 'تم تأمين الشاشة لحماية بياناتك')}
        </p>
      </div>
      <iframe src="/auth.html?mode=modal&reason=session_expired" class="w-full h-full border-none pt-10"></iframe>
    </div>
  `;
  document.body.appendChild(modal);

  const onMessage = (e: MessageEvent) => {
    if (e.data === 'nm_auth_success') {
      window.removeEventListener('message', onMessage);
      modal.remove();
      import('./session-timeout').then(({ markSessionActivity }) => markSessionActivity());
    }
  };
  window.addEventListener('message', onMessage);
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

function cleanup(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
  if (autoLogoutTimer) {
    clearTimeout(autoLogoutTimer);
    autoLogoutTimer = null;
  }
}
