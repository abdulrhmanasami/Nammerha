// ============================================================================
// Nammerha Frontend — Lockout Countdown Utility (Shared)
// ============================================================================
// CODE-R01: Extracted from auth.ts where the same ~30-line countdown pattern
// was duplicated 4× for login lockout, login lockout restore, registration
// lockout, and registration lockout restore.
// Standard: DRY Principle, Timer Hygiene, sessionStorage Persistence.
// ============================================================================

import { createTrackedInterval, clearTrackedInterval } from './tracked-timers';
import { t } from './i18n';

interface LockoutCountdownConfig {
  /** sessionStorage key (e.g., 'nmh_lockout_until', 'nmh_reg_lockout_until') */
  storageKey: string;
  /** Lockout duration in minutes (from backend response) */
  lockoutMinutes: number;
  /** i18n key for the countdown message template */
  i18nKey: string;
  /** Arabic fallback string with {minutes} and {seconds} placeholders */
  i18nFallback: string;
  /** Function to show a banner (error/success) */
  showBanner: (type: 'error' | 'success', msg: string) => void;
  /** DOM ID of the banner text element to update in-place */
  bannerTextId: string;
}

interface RestoreLockoutConfig {
  /** sessionStorage key to check for active lockout */
  storageKey: string;
  /** i18n key for the countdown message template */
  i18nKey: string;
  /** Arabic fallback string with {minutes} and {seconds} placeholders */
  i18nFallback: string;
  /** Function to show a banner (error/success) */
  showBanner: (type: 'error' | 'success', msg: string) => void;
  /** DOM ID of the banner text element to update in-place */
  bannerTextId: string;
  /** Optional callback before showing the countdown (e.g., switch to correct tab) */
  onRestore?: () => void;
}

/**
 * Build the countdown message string with {minutes} and {seconds} replaced.
 */
function buildLockoutMsg(
  remainingSeconds: number,
  i18nKey: string,
  i18nFallback: string,
): string {
  return t(i18nKey, i18nFallback)
    .replace('{minutes}', String(Math.ceil(remainingSeconds / 60)))
    .replace('{seconds}', String(remainingSeconds));
}

/**
 * Start a lockout countdown timer.
 *
 * 1. Persists lockout end timestamp to sessionStorage (refresh-resilient)
 * 2. Shows initial countdown banner
 * 3. Updates banner text every second
 * 4. On expiry: clears storage, shows success banner
 *
 * @returns Timer ID tracked in the timer registry (cleaned up on pagehide)
 */
export function startLockoutCountdown(config: LockoutCountdownConfig): ReturnType<typeof setInterval> {
  const { storageKey, lockoutMinutes, i18nKey, i18nFallback, showBanner, bannerTextId } = config;

  let remainingSeconds = lockoutMinutes * 60;

  // Persist lockout end in sessionStorage (cross-tab, refresh-resilient)
  try {
    sessionStorage.setItem(storageKey, String(Date.now() + remainingSeconds * 1000));
  } catch {
    /* Safari incognito */
  }

  // Show initial banner
  showBanner('error', buildLockoutMsg(remainingSeconds, i18nKey, i18nFallback));

  // Start countdown
  const timerId = createTrackedInterval(() => {
    remainingSeconds--;
    if (remainingSeconds <= 0) {
      clearTrackedInterval(timerId);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      showBanner('success', t('auth_lockout_ended', 'يمكنك المحاولة الآن'));
    } else {
      const bannerTextEl = document.getElementById(bannerTextId);
      if (bannerTextEl) {
        bannerTextEl.textContent = buildLockoutMsg(remainingSeconds, i18nKey, i18nFallback);
      }
    }
  }, 1000);

  return timerId;
}

/**
 * Restore an active lockout from sessionStorage on page load.
 *
 * Checks if a lockout is still active. If so, shows the countdown banner
 * and starts the timer from the remaining duration.
 *
 * @returns Timer ID if lockout restored, null if no active lockout
 */
export function restoreLockoutFromStorage(config: RestoreLockoutConfig): ReturnType<typeof setInterval> | null {
  const { storageKey, i18nKey, i18nFallback, showBanner, bannerTextId, onRestore } = config;

  try {
    const lockoutUntilStr = sessionStorage.getItem(storageKey);
    if (!lockoutUntilStr) return null;

    const lockoutUntil = parseInt(lockoutUntilStr, 10);
    let remainingSeconds = Math.ceil((lockoutUntil - Date.now()) / 1000);

    if (remainingSeconds <= 0) {
      sessionStorage.removeItem(storageKey);
      return null;
    }

    // Optional pre-restore callback (e.g., switch to register tab)
    onRestore?.();

    // Show initial banner
    showBanner('error', buildLockoutMsg(remainingSeconds, i18nKey, i18nFallback));

    // Start countdown
    const timerId = createTrackedInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        clearTrackedInterval(timerId);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
        showBanner('success', t('auth_lockout_ended', 'يمكنك المحاولة الآن'));
      } else {
        const bannerTextEl = document.getElementById(bannerTextId);
        if (bannerTextEl) {
          bannerTextEl.textContent = buildLockoutMsg(remainingSeconds, i18nKey, i18nFallback);
        }
      }
    }, 1000);

    return timerId;
  } catch {
    /* sessionStorage unavailable */
    return null;
  }
}
