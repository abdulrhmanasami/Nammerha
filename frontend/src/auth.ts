// ============================================================================
// Nammerha Frontend — Auth Module
// Session management and user context
// ============================================================================
import { reportError } from './error-reporter';
// P2-AUTH-002 FIX: Import i18n for cross-tab logout banner localization.
// Uses a safe import — t() may not be available in all module contexts.
import { t } from './utils/i18n';
// W3-P1-005 FIX: Import escapeHtml for cross-tab logout banner innerHTML.
// Previous: Raw i18n strings used in innerHTML — XSS vector via localStorage injection.
// Standard: AGENTS.md mandatory pattern, OWASP XSS Prevention.
import { escapeHtml } from './utils/xss';

export type UserRole =
  | 'homeowner'
  | 'engineer'
  | 'user'
  | 'supplier'
  | 'contractor'
  | 'tradesperson'
  | 'admin'
  | 'auditor';

export interface AuthUser {
  user_id: string;
  full_name: string;
  /**
   * @deprecated FORENSIC-C2.1: Legacy singular role kept for backward compatibility.
   * Backend login still sends this field. Do NOT use for display or access control.
   * Use `roles[]` array instead — it is the sole source of truth.
   */
  role: UserRole;
  /** All active roles — sole source of truth for user capabilities. */
  roles: UserRole[];
  email?: string;
  kyc_verified: boolean;
  /** P2-UX-007: Profile photo URL — contributes to completion percentage. */
  photo_url?: string;
}

const STORAGE_KEY = 'nammerha_auth';
const DEV_USER_KEY = 'nammerha_dev_user_id';
const ORPHANED_SESSION_KEY = 'nammerha_orphaned_uid';

// ─── Auth State ─────────────────────────────────────────────────────────────
let currentUser: AuthUser | null = null;

export function getCurrentUser(): AuthUser | null {
  if (currentUser) {
    return currentUser;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as AuthUser;
      // Backward compat: older localStorage entries may lack roles[]
      if (!parsed.roles) {
        parsed.roles = [parsed.role];
      }
      currentUser = parsed;
      return currentUser;
    } catch (err) {
      reportError(err instanceof Error ? err : new Error(String(err)), {
        context: 'auth_parse_stored_user',
      });
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return null;
}

export function setCurrentUser(user: AuthUser): void {
  currentUser = user;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearAuth(skipServerLogout = false): void {
  // Store the UID before wiping it, so cross-tab re-logins know if it's the same person
  if (currentUser) {
    sessionStorage.setItem(ORPHANED_SESSION_KEY, currentUser.user_id);
  }

  currentUser = null;
  localStorage.removeItem(STORAGE_KEY);
  // V1-AUDIT FIX: Token is now in httpOnly cookie — cleared server-side.
  // P2-W5-002 FIX: Always clear the httpOnly JWT cookie via server logout.
  // Previous: Only localStorage was cleared. The httpOnly cookie survived,
  // meaning the browser still sent valid auth on subsequent API calls.
  // callers that already called authApi.logout() pass skipServerLogout=true.
  // The _client.ts 401 handler and cross-tab logout handler call clearAuth()
  // directly — without skipServerLogout, the cookie would persist.
  // Fire-and-forget: cookie clearance is best-effort, non-blocking.
  // Standard: OWASP Session Management, NIST SP 800-63B.
  if (!skipServerLogout) {
    // Fire-and-forget server logout.
    // PLATINUM FIX: X-Guest-Mode logic in _client.ts guarantees orphaned HttpOnly
    // cookies are ignored by the server if the user is locally unauthenticated.
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {
      // Failed to clear cookie on server (e.g. offline).
      // The local session is cleared, and X-Guest-Mode prevents resurrection.
    });
  }
  localStorage.removeItem(DEV_USER_KEY);
}

// ═══════════════════════════════════════════════════════════════════════════
// P1-011 FIX: Cross-tab logout broadcast via Storage API.
// Previous: Logout in one tab → other open tabs continued showing authenticated
// state until their next API call returned 401 → confusing stale session.
// Now: Uses the 'storage' event (fires in OTHER tabs when localStorage changes)
// to detect session removal and redirect to auth page immediately.
// Note: The 'storage' event does NOT fire in the tab that made the change.
// Standard: NIST SP 800-63B (Session Management), Nielsen #1 (System Status).
//
// A5 FIX: REWRITTEN — Shows non-blocking overlay instead of instant redirect.
// PREVIOUS: `window.location.href = '/auth.html'` destroyed any unsaved form
// data in the current tab. Syrian users spending 10+ minutes on damage report
// forms over 3G lost ALL progress when another tab logged out.
// NOW: Shows a visible overlay warning + "Sign In" CTA. User decides when.
// Standard: Nielsen #5 (Error Prevention), Data Loss Prevention.
// ═══════════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    // Only react to auth data being REMOVED (logout) or CHANGED (different user)
    if (e.key === STORAGE_KEY && e.newValue === null && e.oldValue !== null) {
      // Another tab cleared auth → session is gone
      currentUser = null;

      // Store orphaned UID for this tab to allow safe re-entry
      try {
        const oldData = JSON.parse(e.oldValue);
        sessionStorage.setItem(ORPHANED_SESSION_KEY, oldData.user_id);
      } catch {
        /* ignore error */
      }

      // A5 FIX: Show a non-blocking banner instead of instant redirect.
      // This preserves any unsaved form data the user has in progress.
      const existingBanner = document.getElementById('nm-cross-tab-logout');
      if (existingBanner) {
        return;
      } // Already showing

      const banner = document.createElement('div');
      banner.id = 'nm-cross-tab-logout';
      // BUG-012 FIX: Added dark: variant — was missing, banner clashed in dark mode.
      banner.className =
        'fixed inset-x-0 top-0 z-[9999] bg-red-600 dark:bg-red-700 text-white px-4 py-3 shadow-lg flex items-center justify-between gap-3 animate-fade-in-up';
      banner.setAttribute('role', 'alert');
      // P2-AUTH-002 FIX: i18n-wrapped text — was hardcoded English.
      const logoutMsg =
        typeof t === 'function'
          ? t('cross_tab_logout', 'تم تسجيل خروجك من تبويب آخر')
          : 'تم تسجيل خروجك من تبويب آخر';
      const signInText =
        typeof t === 'function' ? t('sign_in_btn', 'تسجيل الدخول') : 'تسجيل الدخول';
      // W3-P1-005 FIX: Wrap i18n strings with escapeHtml() to prevent XSS.
      // Previous: Raw logoutMsg/signInText from t() used in innerHTML.
      // Standard: AGENTS.md mandatory escapeHtml() pattern for all innerHTML.
      // PLATINUM FIX: target="_blank" forces auth in a new tab to preserve data.
      banner.innerHTML = `
                <div class="flex items-center gap-2 min-w-0">
                    <i class="ph ph-warning-circle shrink-0 text-lg" aria-hidden="true"></i>
                    <span class="text-sm font-medium truncate">${escapeHtml(logoutMsg)}</span>
                </div>
                <a href="/auth.html" target="_blank" rel="noopener noreferrer" class="shrink-0 bg-white text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors no-underline">
                    ${escapeHtml(signInText)}
                </a>
            `;
      document.body.appendChild(banner);

      // PLATINUM FIX: Removed Premature Banner Eviction (30s auto-dismiss).
      // A session termination is a Critical System State, NOT transient feedback.
      // If the user is AFK, they MUST see this banner when they return to avoid
      // the Zombie Tab Dead End. It will only be removed if they re-authenticate.
      // Standard: Nielsen #1 (Visibility of System Status).
    }

    // P1-W11-010 FIX: Auto-dismiss cross-tab logout banner when user logs in from another tab.
    // PREVIOUS: Logout banner persisted even after user re-authenticated in another tab.
    // The banner stayed visible because we only listened for key REMOVAL, not key SETTING.
    // Standard: Nielsen #1 (System Status Visibility), Session State Consistency.
    if (e.key === STORAGE_KEY && e.newValue !== null) {
      // Another tab just logged in — update local state and dismiss any logout banner
      try {
        const newUser = JSON.parse(e.newValue) as AuthUser;
        const oldUser = e.oldValue ? (JSON.parse(e.oldValue) as AuthUser) : null;

        // PLATINUM FIX: Safe Re-entry Logic.
        // If oldUser is null, check if the newUser matches the orphaned session.
        const orphanedUid = sessionStorage.getItem(ORPHANED_SESSION_KEY);
        const isSameUserReturning = !oldUser && orphanedUid === newUser.user_id;

        // PLATINUM FIX: Zero-Day UX Flaw (Cross-Tab Amnesia Paradox)
        // A violent window.location.reload() destroys any unsaved forms in this tab
        // without warning. We must freeze the UI and explain the state change,
        // allowing the user to initiate the reload themselves.
        if (!isSameUserReturning && (!oldUser || oldUser.user_id !== newUser.user_id)) {
          if (!document.getElementById('nm-cross-tab-schizophrenia')) {
            const modal = document.createElement('dialog');
            modal.id = 'nm-cross-tab-schizophrenia';
            modal.className = 'backdrop:bg-slate-900/90 backdrop:backdrop-blur-3xl animate-fade-in-up m-auto p-0 bg-transparent border-none overflow-visible w-full max-w-md';
            
            document.body.style.overflow = 'hidden';
            
            const reloadMsg = typeof t === 'function' ? t('cross_tab_user_changed', 'تم تسجيل الدخول بحساب مختلف من تبويب آخر. يجب تحديث الصفحة لمزامنة البيانات.') : 'تم تسجيل الدخول بحساب مختلف من تبويب آخر. يجب تحديث الصفحة لمزامنة البيانات.';
            const reloadBtn = typeof t === 'function' ? t('common_reload', 'تحديث الصفحة') : 'تحديث الصفحة';
            
            modal.innerHTML = `
              <div class="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full p-6 relative mx-auto border border-slate-700 outline-none text-center">
                <div class="size-16 mx-auto bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
                  <i class="ph ph-arrows-clockwise text-3xl text-amber-600 dark:text-amber-400"></i>
                </div>
                <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-2">تغيير في حالة الجلسة</h2>
                <p class="text-slate-600 dark:text-slate-300 mb-6 text-sm leading-relaxed">${escapeHtml(reloadMsg)}</p>
                <button id="btn-force-reload" class="w-full bg-trust-blue hover:bg-trust-blue/90 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-trust-blue/20">
                  ${escapeHtml(reloadBtn)}
                </button>
              </div>
            `;
            document.body.appendChild(modal);
            
            modal.addEventListener('cancel', (e) => e.preventDefault()); // Prevent ESC
            modal.querySelector('#btn-force-reload')?.addEventListener('click', () => {
              window.location.reload();
            });
            
            import('./utils/dialog-polyfill').then(({ polyfillDialog }) => {
              polyfillDialog(modal);
              modal.showModal();
              (modal.querySelector('#btn-force-reload') as HTMLElement)?.focus();
            }).catch(() => {
              modal.showModal();
            });
          }
          return;
        }

        currentUser = newUser;
        if (currentUser && !currentUser.roles) {
          currentUser.roles = [currentUser.role];
        }

        sessionStorage.removeItem(ORPHANED_SESSION_KEY);
      } catch {
        /* malformed data — ignore */
      }
      const logoutBanner = document.getElementById('nm-cross-tab-logout');
      if (logoutBanner) {
        logoutBanner.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        logoutBanner.style.opacity = '0';
        logoutBanner.style.transform = 'translateY(-100%)';
        setTimeout(() => logoutBanner.remove(), 300);
      }
    }
  });
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

export function hasRole(...roles: UserRole[]): boolean {
  const user = getCurrentUser();
  if (!user) {
    return false;
  }
  // Multi-Role: check if user has ANY of the requested roles
  return user.roles.some((r) => roles.includes(r));
}

// UNIFIED CITIZEN: switchActiveRole() removed (2026-05-10).
// All users have all roles — switching is no longer a platform concept.

// ─── Development Helpers ────────────────────────────────────────────────────
// P2-007 FIX: Use import.meta.env.DEV (Vite resolves at build time) instead of
// process.env.NODE_ENV which is unreliable in browser context.

const IS_DEV: boolean = import.meta.env.DEV === true;

// DEV_USERS are only populated in development builds.
// In production, Vite's dead-code elimination strips this entire block.
// UNIFIED CITIZEN: All dev users have ALL citizen roles — mirrors production behavior.
// FORENSIC-C2.4 FIX: 'user' removed — payment system suspended indefinitely.
const ALL_CITIZEN_ROLES: UserRole[] = [
  'homeowner',
  'engineer',
  'supplier',
  'contractor',
  'tradesperson',
];
const ALL_ADMIN_ROLES: UserRole[] = [...ALL_CITIZEN_ROLES, 'admin', 'auditor'];

const DEV_USERS: Record<string, AuthUser> = IS_DEV
  ? {
      homeowner: {
        user_id: 'dev-homeowner-001',
        full_name: 'Dev Homeowner 001',
        role: 'homeowner',
        roles: ALL_CITIZEN_ROLES,
        email: 'ahmad@example.com',
        kyc_verified: true,
      },
      engineer: {
        user_id: 'dev-engineer-001',
        full_name: 'Dev Engineer 001',
        role: 'engineer',
        roles: ALL_CITIZEN_ROLES,
        email: 'khalid@example.com',
        kyc_verified: true,
      },
      // FORENSIC-C2.4: 'user' dev user removed — payment system suspended indefinitely.
      supplier: {
        user_id: 'dev-supplier-001',
        full_name: 'Dev Supplier 001',
        role: 'supplier',
        roles: ALL_CITIZEN_ROLES,
        email: 'supplier@example.com',
        kyc_verified: true,
      },
      contractor: {
        user_id: 'dev-contractor-001',
        full_name: 'Dev Contractor 001',
        role: 'contractor',
        roles: ALL_CITIZEN_ROLES,
        email: 'contractor@example.com',
        kyc_verified: true,
      },
      tradesperson: {
        user_id: 'dev-tradesperson-001',
        full_name: 'Dev Tradesperson 001',
        role: 'tradesperson',
        roles: ALL_CITIZEN_ROLES,
        email: 'tradesperson@example.com',
        kyc_verified: true,
      },
      admin: {
        user_id: 'dev-admin-001',
        full_name: 'Dev Admin 001',
        role: 'admin',
        roles: ALL_ADMIN_ROLES,
        email: 'admin@nammerha.org',
        kyc_verified: true,
      },
      auditor: {
        user_id: 'dev-auditor-001',
        full_name: 'Dev Auditor 001',
        role: 'auditor',
        roles: ALL_ADMIN_ROLES,
        email: 'auditor@nammerha.org',
        kyc_verified: true,
      },
    }
  : {};

export function devLogin(role: UserRole): void {
  if (!IS_DEV) {
    return; // Silent no-op — dev bypass disabled in production
  }
  const user = DEV_USERS[role];
  if (user) {
    setCurrentUser(user);
    localStorage.setItem(DEV_USER_KEY, user.user_id);
  }
}

export function getDevUsers(): Record<string, AuthUser> {
  if (!IS_DEV) {
    return {};
  }
  return DEV_USERS;
}
