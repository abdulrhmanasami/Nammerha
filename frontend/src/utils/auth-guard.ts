/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Authentication Guard Utility
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GAP-004 FIX: Protected pages (wallet, profile, portals, dashboards)
 * must verify authentication state before rendering content.
 * If no valid session exists, the user sees a clear "Please sign in"
 * message instead of skeleton loaders that persist forever.
 *
 * P0-AUTH-001 FIX: REWRITTEN — Previous implementation checked
 * localStorage('nm_access_token') for a JWT that NEVER EXISTS.
 * The login flow (auth.ts → pages/auth.ts) stores user profile data
 * under 'nammerha_auth', and the JWT lives in an httpOnly cookie
 * (inaccessible to JavaScript by design — api.ts documents this).
 * Result: requireAuth() ALWAYS returned false → wallet page showed
 * "Sign in required" even for authenticated users.
 *
 * Now uses the canonical isAuthenticated() from auth.ts which checks
 * the actual session data in localStorage('nammerha_auth').
 * Standard: Single Source of Truth, DRY Principle, Zero-Assumption Policy.
 *
 * Usage:
 *   import { requireAuth } from '../utils/auth-guard';
 *   requireAuth(); // Call at top of any protected page module
 *
 * @version 2.0.0
 * @since GAP-004, P0-AUTH-001
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { isAuthenticated as checkSession } from '../auth';
import { tryApplyI18n } from './i18n-apply';
import { initNotificationPanel } from '../components/notification-panel';

/**
 * A3 FIX: Clears ALL user-specific localStorage keys on session termination.
 * Prevents User A's wizard drafts, workspace preferences, and form data
 * from leaking to User B on the same device.
 *
 * Prefixes targeted:
 *   - nammerha_auth     → session identity
 *   - nammerha_dev_user → dev mode user
 *   - nm_*              → platform preferences (workspace, tour, FTV)
 *   - nmr_*             → wizard state (damage report)
 *   - nmh_*             → registration drafts
 *   - sr_form           → service request form draft
 *   - fallback_*        → cached HTML fallbacks (carousel, etc.)
 *
 * Keys NOT cleared:
 *   - nm_theme          → dark/light mode persists across sessions (device pref, not user pref)
 *   - nm-locale         → language persists (device pref)
 *
 * Standard: NIST SP 800-63B (Session Termination), Zero-Trust Session Hygiene.
 */
export function clearUserLocalData(): void {
  // BUG-006 FIX: Was 'nm_locale' — mismatched actual key 'nm-locale' (hyphen) used by _client.ts.
  const PRESERVED_KEYS = new Set(['nm_theme', 'nm-locale']);
  const USER_PREFIXES = ['nammerha_', 'nm_', 'nmr_', 'nmh_', 'sr_form', 'fallback_'];

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || PRESERVED_KEYS.has(key)) {
        continue;
      }
      if (USER_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // Also clear sessionStorage (wizard drafts, registration drafts)
    sessionStorage.clear();
  } catch {
    /* Safari private mode — degrade gracefully */
  }
}

/**
 * Shows the "Please sign in" overlay on the current page.
 * Replaces skeleton loaders with a clear auth-required message.
 *
 * P0-UX-005 FIX: Contextual session expiry message.
 * Previous: Identical "Sign in required" for both expired sessions and
 * unauthenticated users. Users mid-task thought the app was broken.
 * Now: Detects stale auth data in localStorage to distinguish:
 *   - 'expired': Had a session that is no longer valid → "Session expired"
 *   - 'unauthenticated': Never logged in → "Sign in required"
 * Standard: Nielsen #1 (System Status Visibility), FinTech Trust UX.
 */
function showAuthRequired(): void {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) {
    return;
  }

  // P0-UX-005: Detect if this is a session expiry vs first visit
  let isExpired = false;
  try {
    const staleAuth = localStorage.getItem('nammerha_auth');
    if (staleAuth) {
      // User HAD a session but it's no longer valid
      isExpired = true;
      // A3 FIX: Clear ALL user-specific localStorage keys on session expiry.
      // PREVIOUS: Only 'nammerha_auth' was removed — leaving wizard drafts,
      // workspace preferences, form drafts, and other user data orphaned.
      // If User B logs in on the same device, they inherit User A's drafts.
      // NOW: Purge all nm_*/nmr_*/nmh_*/sr_form prefixed keys.
      // Standard: Zero-Trust Session Hygiene, NIST SP 800-63B (Session Termination).
      clearUserLocalData();
    }
  } catch {
    /* Safari private mode */
  }

  const icon = isExpired ? 'clock' : 'lock';
  const titleKey = isExpired ? 'session_expired' : 'auth_required';
  const titleDefault = isExpired ? 'Session Expired' : 'Sign in required';
  const msgKey = isExpired ? 'session_expired_msg' : 'auth_required_msg';
  const msgDefault = isExpired
    ? 'Your session has expired for security. Please sign in again to continue.'
    : 'Please sign in to access this page. Your data is safe and waiting for you.';

  // Determine current page path for redirect-after-login
  const returnPath = encodeURIComponent(window.location.pathname + window.location.search);

  mainContent.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
            <div class="size-20 rounded-full ${isExpired ? 'bg-warning-yellow/10' : 'bg-trust-blue/10'} flex items-center justify-center">
                <i class="ph ph-${icon} ${isExpired ? 'text-warning-yellow' : 'text-trust-blue'} nm-icon-40" aria-hidden="true"></i>
            </div>
            <h2 class="text-lg font-bold" data-i18n="${titleKey}">${titleDefault}</h2>
            <p class="text-sm text-slate-500 max-w-xs dark:text-slate-400" data-i18n="${msgKey}">
                ${msgDefault}
            </p>
            <a href="/auth.html?redirect=${returnPath}" class="btn-primary nm-btn-inline mt-2">
                <i class="ph ph-sign-in" aria-hidden="true"></i>
                <span data-i18n="sign_in_btn">Sign In</span>
            </a>
        </div>`;

  // PLT-AUD5-002 FIX: Replaced unsafe (window as unknown as Record<string, unknown>)
  // double-cast with shared type-safe utility.
  tryApplyI18n();
}

/**
 * Enforces authentication on the current page.
 * Call this at the top of any protected page's TS module.
 *
 * P0-AUTH-001 FIX: Uses canonical checkSession() from auth.ts
 * which reads localStorage('nammerha_auth') — the ACTUAL session data
 * stored by the login flow. Previous: checked nm_access_token (never set).
 *
 * @returns true if authenticated, false if auth overlay was shown
 */
export function requireAuth(): boolean {
  if (checkSession()) {
    initNotificationPanel();
    return true;
  }

  // No valid session — show auth overlay
  showAuthRequired();
  return false;
}

/**
 * Checks auth status without blocking the page.
 * Useful for conditionally showing/hiding UI elements.
 *
 * P0-AUTH-001 FIX: Delegates to canonical auth.ts instead of
 * duplicating broken JWT localStorage logic.
 */
export function isAuthenticated(): boolean {
  const isAuth = checkSession();
  if (isAuth) {
    initNotificationPanel();
  }
  return isAuth;
}
