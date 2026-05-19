// ============================================================================
// Nammerha — Unified Header Utility (CONF-006)
// ============================================================================
// Normalizes portal headers by injecting consistent back button,
// notification bell, and title styling. This is a non-destructive
// enhancement — it reads existing HTML structure and patches gaps.
//
// Usage:
//   import { normalizeHeader } from '../components/header-normalize';
//   normalizeHeader();
//
// Works on any page with the standard header pattern:
//   <header> ... h1/h2 title ... </header>
// ============================================================================

import { t } from '../utils/i18n';

interface HeaderConfig {
  /** Show back button (defaults to true if history.length > 1) */
  showBack?: boolean;
  /** Custom back href (defaults to history.back()) */
  backHref?: string;
  /** Show notification bell placeholder */
  showNotification?: boolean;
}

/**
 * Normalize the first <header> on the page to use consistent styling.
 * Safe to call on any page — no-ops gracefully if structure is missing.
 */
export function normalizeHeader(config: HeaderConfig = {}): void {
  const header = document.querySelector<HTMLElement>('header');
  if (!header) {
    return;
  }

  // P2-AUD4-001 FIX: Replaced inline style.minHeight = '3rem' with CSS class.
  // Previous: header.style.minHeight = header.style.minHeight || '3rem' — violated P1-001.
  // Standard: CSS Single Source of Truth.
  if (!header.classList.contains('nm-header-normalized')) {
    header.classList.add('nm-header-normalized');
  }

  // ── Back Button ────────────────────────────────────────────────────
  const hasBackBtn = header.querySelector(
    '[data-back-btn], .back-btn, a[href*="portal"], a[href*="dashboard"]',
  );
  const shouldShowBack = config.showBack ?? (history.length > 1 && !hasBackBtn);

  if (shouldShowBack && !hasBackBtn) {
    const backBtn = document.createElement('a');
    backBtn.setAttribute('data-back-btn', '');
    backBtn.setAttribute('aria-label', t('aria_back', 'رجوع'));
    backBtn.href = config.backHref ?? '#';
    backBtn.className =
      'size-11 flex items-center justify-center rounded-xl hover:bg-slate-100/50 transition-colors';
    backBtn.innerHTML =
      '<i class="ph ph-arrow-left text-slate-700 nm-icon-22 dark:text-slate-300" aria-hidden="true"></i>';

    // Insert as first child
    header.insertBefore(backBtn, header.firstChild);

    // Wire navigation
    backBtn.addEventListener('click', (e) => {
      if (!config.backHref && history.length > 1) {
        e.preventDefault();
        history.back();
      }
    });
  }

  // ── Notification Bell ────────────────────────────────────────────────
  const hasBell = header.querySelector('#notification-bell, [data-notif-bell]');
  if (config.showNotification && !hasBell) {
    const bell = document.createElement('button');
    bell.id = 'notification-bell';
    bell.type = 'button';
    bell.setAttribute('aria-label', t('aria_notifications', 'الإشعارات'));
    bell.setAttribute('aria-expanded', 'false');
    bell.setAttribute('aria-haspopup', 'dialog');
    bell.className =
      'relative size-11 flex items-center justify-center rounded-xl hover:bg-slate-100/50 transition-colors';
    bell.innerHTML = `
            <i class="ph ph-bell text-slate-700 nm-icon-22 dark:text-slate-300" aria-hidden="true"></i>
            <span id="notif-count" class="absolute -top-0.5 -end-0.5 bg-red-500 text-white text-3xs font-bold size-4 rounded-full flex items-center justify-center hidden">0</span>
        `;
    header.appendChild(bell);

    // IMP-015: Auto-initialize notification panel (lazy-loaded)
    import('./notification-panel')
      .then(({ initNotificationPanel }) => {
        initNotificationPanel();
      })
      .catch(() => {
        // Silent — notification panel is non-critical enhancement
      });
  }
}
