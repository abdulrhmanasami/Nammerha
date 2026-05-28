import '../styles/main.css';
import { getCurrentUser, clearAuth, setCurrentUser, type UserRole } from '../auth';
import { reportError, reportWarning } from '../error-reporter';
import { escapeHtml } from '../utils/xss';
import { renderErrorWithRetry } from '../utils/error-retry';
import { auth, roles as rolesApi } from '../api';
import { requireAuth } from '../utils/auth-guard';
// UNIFIED CITIZEN: Pure data imports from role-meta.ts (extracted from role-switcher.ts).
// Previous: Imported from role-switcher.ts which brought in 16KB of dead UI component code.
import { ROLE_META, getRoleLabel, getRoleColor } from '../utils/role-meta';
import { t, isRTL } from '../utils/i18n';
// SYS-004 FIX: Dialog polyfill for older Android WebViews (Syria).
import { polyfillDialog } from '../utils/dialog-polyfill';
// FRC-NEW-06: Loading state feedback for save buttons
import { setLoadingState } from '../utils/loading-state';
// TICK-015: showToast for consistent error feedback
import { showToast } from '../utils/toast';
// GAP-002 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { initBackToTop } from '../components/back-to-top';
// GAP-N03 FIX: Global search overlay on inner pages
import { initSearch } from '../utils/search-overlay';
// INC-NEW-01 FIX: Unified page header — eliminates duplicate back-button wiring
import { initPageHeader } from '../components/page-header';
// F-004 FIX: Hub FAB on all pages — portal navigation from inner pages
import { mountHubFAB } from '../components/portal-context';
// P1-006 FIX: Scroll-to-field on validation error
import { scrollToField } from '../utils/scroll-to-field';
// F-010 FIX: Breadcrumb navigation on inner pages
import { initBreadcrumb } from '../utils/breadcrumb';
// UX-REM-J007 FIX: Unified password strength (was using divergent inline algorithm)
import { updatePasswordStrength } from '../utils/password-strength';
// P2-W12-001 FIX: Shared password complexity validation — single source of truth.
// PREVIOUS: profile.ts only checked `length < 8` — no uppercase/digit/special checks.
import { validatePasswordComplexity } from '../utils/validators';
import { DirtyStateGuard } from '../utils/dirty-guard';
import { addTrackedTimer } from '../utils/tracked-timers';


const profileGuard = new DirtyStateGuard();

initPullToRefresh();
initBackToTop();
initSearch();
initPageHeader();

// ============================================================================
// Nammerha — Profile Page Engine
// P0-004 FIX: User profile, settings, and logout
// V1-AUDIT FIX: No longer reads JWT from localStorage — uses auth module
// MULTI-ROLE-005: Role management, progressive profiling, profile completion
// MED-001 FIX: All innerHTML uses escapeHtml() for any dynamic content
// SEC-001 FIX: All raw fetch() migrated to centralized api.ts (CSRF + timeout)
// UNIFIED CITIZEN: ROLE_META, getRoleLabel imported from utils/role-meta.ts
// I18N-003 FIX: All user-facing strings wrapped with i18n t()
// LOGOUT-001 FIX: Logout calls /api/auth/logout to invalidate server token
// FIX-004: i18n interface now from shared utils/i18n.ts
// ============================================================================

// P4-AUD-001 FIX: isRTL() now imported from utils/i18n.ts (was local duplicate)

// ─── LOW-003 FIX: Profile Completion Calculator (de-duplicated) ─────────────
function calculateCompletion(user: ReturnType<typeof getCurrentUser>): number {
  if (!user) {
    return 0;
  }
  let steps = 0;
  let completed = 0;

  // Identity fields (weight: 3 steps)
  steps += 3;
  if (user.full_name) {
    completed++;
  }
  if (user.email) {
    completed++;
  }
  if (user.kyc_verified) {
    completed++;
  }

  // P1-PHOTO-001 FIX: photo_url REMOVED from completion calculation.
  // Previous: Photo upload counted towards completion % (P2-UX-007), but photo_url
  // is CLIENT-SIDE ONLY — it never persists to the backend API.
  // Users would upload a photo → see 83% → refresh → drop back to 67% → feel regression.
  // This creates a Sisyphean UX loop that destroys trust in the platform.
  // photo_url will be re-added to completion once backend S3 photo persistence is implemented.
  // Standard: Zeigarnik Effect (only count PERSISTENT progress), Trust-First UX.

  // Role depth (weight: 2 steps)
  steps += 2;
  if (user.roles && user.roles.length >= 1) {
    completed++;
  }
  // Bonus for multi-role users
  if (user.roles && user.roles.length >= 2) {
    completed++;
  }

  return Math.round((completed / steps) * 100);
}

// ─── P2-UX-002 FIX: Avatar Initials (personalized, not generic icon) ────────
function renderAvatarInitials(fullName?: string | null): void {
  // TICK-014: Stable ID-based selector for avatar.
  // Previous: querySelector('.size-20.bg-trust-blue') — fragile class-based selector.
  // Standard: DOM Contract — use IDs for programmatic element references.
  const avatarEl = document.getElementById('profile-avatar');
  if (!avatarEl) {
    return;
  }
  if (!fullName || fullName.trim().length === 0) {
    return;
  } // keep icon for guests

  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  const initials = (first + last).toUpperCase();
  if (initials.length === 0) {
    return;
  }

  avatarEl.innerHTML = `<span class="text-white text-2xl font-black select-none">${escapeHtml(initials)}</span>`;
}

// ─── Load User Info ─────────────────────────────────────────────────────────
async function loadUserInfo(): Promise<void> {
  const nameEl = document.getElementById('user-name');
  const emailEl = document.getElementById('user-email');
  const roleEl = document.getElementById('user-role');

  const cached = getCurrentUser();
  if (cached) {
    if (nameEl) {
      nameEl.textContent = cached.full_name ?? t('profile_user', 'مستخدم');
    }
    if (emailEl) {
      emailEl.textContent = cached.email ?? '—';
    }
    // FORENSIC-C2.2 FIX: No more singular role display.
    // Unified Citizen: all users share the same identity label.
    if (roleEl) {
      roleEl.textContent = t('citizen_label', 'مواطن نعمّرها');
    }
    updateProfileCompletion(cached);
    // P2-UX-002 FIX: Render personalized initials in avatar
    renderAvatarInitials(cached.full_name);
  }

  try {
    // SEC-001 FIX: Uses centralized api.ts with 30s timeout + error reporting
    const result = await auth.getMe();
    if (result.success && result.data?.user) {
      const user = result.data.user;
      if (nameEl) {
        nameEl.textContent = user.full_name ?? t('profile_user', 'مستخدم');
      }
      if (emailEl) {
        emailEl.textContent = user.email ?? '—';
      }
      // FORENSIC-C2.2 FIX: Universal citizen label instead of singular role.
      if (roleEl) {
        roleEl.textContent = t('citizen_label', 'مواطن نعمّرها');
      }
    } else if (!cached) {
      if (nameEl) {
        nameEl.textContent = t('profile_guest', 'زائر');
      }
      if (emailEl) {
        emailEl.textContent = t('profile_sign_in_prompt', 'سجّل دخولك لعرض ملفك');
      }
    }
  } catch (err) {
    reportWarning('[Profile] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    if (!cached) {
      if (nameEl) {
        nameEl.textContent = t('profile_guest', 'زائر');
      }
      if (emailEl) {
        emailEl.textContent = t('profile_sign_in_prompt', 'سجّل دخولك لعرض ملفك');
      }
    }
  }
}

// ─── Update Profile Completion Bar ──────────────────────────────────────────
function updateProfileCompletion(user: ReturnType<typeof getCurrentUser>): void {
  const pct = calculateCompletion(user);
  const barEl = document.getElementById('profile-completion-bar');
  const pctEl = document.getElementById('profile-completion-pct');
  if (barEl) {
    // SST-004 FIX: CSS custom property drives width; class swap reveals bar.
    // .nm-progress-init → .nm-progress-active toggles opacity & width via CSS.
    barEl.style.setProperty('--progress', `${pct}%`);
    barEl.classList.remove('nm-progress-init');
    barEl.classList.add('nm-progress-active');
  }
  if (pctEl) {
    pctEl.textContent = `${pct}%`;
  }
}

// ─── MED-004 FIX: Render Active Roles (correct API contract) ────────────────
async function loadUserRoles(): Promise<void> {
  const rolesListEl = document.getElementById('roles-list');
  if (!rolesListEl) {
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    rolesListEl.innerHTML = `
            <div class="bg-surface rounded-xl p-4 text-center text-sm text-slate-400 shadow-sm border border-slate-100 dark:text-slate-500 dark:border-dark-border">
                <i class="ph ph-sign-in text-2xl" aria-hidden="true"></i>
                <p class="mt-2">${escapeHtml(t('profile_sign_in_roles', 'سجّل دخولك لعرض الأدوار'))}</p>
            </div>`;
    return;
  }

  // SEC-001 FIX: Uses centralized api.ts with timeout + error reporting
  let roles = user.roles ?? [user.role];
  try {
    const result = await rolesApi.getMyRoles();
    if (result.success && result.data?.roles && Array.isArray(result.data.roles)) {
      roles = result.data.roles
        .filter((r) => r.status === 'active')
        .map((r) => r.role_name as UserRole);
    }
  } catch (err) {
    reportWarning('[Profile] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fall back to cached roles
  }

  // FORENSIC-C1.11 FIX: Filter out suspended 'user' role from display.
  roles = roles.filter((r) => r !== 'user');

  if (roles.length === 0) {
    rolesListEl.innerHTML = `
            <div class="bg-surface rounded-xl p-4 text-center text-sm text-slate-400 shadow-sm border border-slate-100 dark:text-slate-500 dark:border-dark-border">
                <p>${escapeHtml(t('profile_no_roles', 'لا توجد أدوار مُفعّلة'))}</p>
            </div>`;
    return;
  }

  // MED-001 FIX: All dynamic content uses escapeHtml()
  // FORENSIC-C2.2 FIX: Removed isActive concept — Unified Citizen model
  // means no role is "primary". All roles are equal capabilities.
  rolesListEl.innerHTML = roles
    .map((role) => {
      const meta = ROLE_META[role];
      if (!meta) {
        return '';
      }
      const label = escapeHtml(getRoleLabel(role));
      const color = getRoleColor(role);
      const verLabel = escapeHtml(meta.verificationLabel);

      return `
            <div class="bg-surface rounded-xl p-4 flex items-center gap-4 shadow-sm border border-slate-100 transition-all dark:border-dark-border" style="--role-color: ${color}">
                <div class="size-10 rounded-lg flex items-center justify-center shrink-0 nm-role-icon-bg">
                    <i class="ph ${escapeHtml(meta.icon)} text-xl" aria-hidden="true"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <p class="text-sm font-bold">${label}</p>
                        <span class="text-3xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" data-i18n="active">${escapeHtml(t('profile_active', 'نشط'))}</span>
                    </div>
                    <div class="flex items-center gap-1 mt-0.5">
                        <i class="ph ph-shield-check text-emerald-500 text-xs" aria-hidden="true"></i>
                        <span class="text-3xs text-slate-400 dark:text-slate-500">${verLabel}</span>
                    </div>
                </div>
                <i class="ph ph-caret-right text-slate-300 nm-dir-shift" aria-hidden="true"></i>
            </div>`;
    })
    .join('');
}

// ─── Role Activation ────────────────────────────────────────────────────────
// SEC-001 FIX: Uses centralized api.ts for CSRF, timeout, and error reporting
async function loadAvailableRoles(): Promise<void> {
  const gridEl = document.getElementById('available-roles-grid');
  if (!gridEl) {
    return;
  }

  const user = getCurrentUser();
  const userRoles = user?.roles ?? [];

  try {
    // SEC-001 FIX: Uses centralized api.ts
    const result = await rolesApi.getAvailable();

    if (!result.success || !result.data || !Array.isArray(result.data)) {
      return;
    }

    const available = result.data.filter(
      (r) =>
        !userRoles.includes(r.role_name as UserRole) &&
        // FORENSIC-C1.11 FIX: 'user' excluded — payment system suspended.
        !['admin', 'auditor', 'user'].includes(r.role_name),
    );

    if (available.length === 0) {
      gridEl.innerHTML = `<p class="col-span-2 text-center text-xs text-slate-400 py-4 dark:text-slate-500">${escapeHtml(t('profile_all_roles_active', 'جميع الأدوار مُفعّلة'))}</p>`;
      return;
    }

    // MED-001 FIX: escapeHtml on all dynamic content
    gridEl.innerHTML = available
      .map((r) => {
        const meta = ROLE_META[r.role_name];
        if (!meta) {
          return '';
        }
        const label = escapeHtml(isRTL() ? r.display_name_ar : r.display_name_en);
        const color = getRoleColor(r.role_name);

        return `
                <button type="button" class="activate-role-btn flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-2 hover:shadow-sm transition-all text-center dark:border-dark-border"
                        data-role="${escapeHtml(r.role_name)}"
                        style="--role-color: ${color}">
                    <div class="size-10 rounded-lg flex items-center justify-center nm-role-icon-bg">
                        <i class="ph ${escapeHtml(meta.icon)} text-xl" aria-hidden="true"></i>
                    </div>
                    <span class="text-xs font-bold text-slate-700 dark:text-slate-300">${label}</span>
                </button>`;
      })
      .join('');

    // Bind activation clicks
    gridEl.querySelectorAll<HTMLButtonElement>('.activate-role-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.role as UserRole;
        activateRole(role);
      });
    });
  } catch (err) {
    reportError(err instanceof Error ? err : new Error(String(err)), {
      context: 'load_available_roles',
    });
    renderErrorWithRetry(gridEl, loadAvailableRoles, 'failed_to_load', 'Failed to load roles', err);
  }
}

// SEC-001 FIX: Uses centralized api.ts instead of duplicated ensureCsrfToken + raw fetch
// PLT-W2-001 FIX: Double-submit guard prevents parallel rolesApi.activate() calls
// on Syria 2G/3G networks (5-30s response). Same pattern as isSavingProfile (PLT-003).
let isActivatingRole = false;

async function activateRole(role: UserRole): Promise<void> {
  if (isActivatingRole) {
    return;
  }
  isActivatingRole = true;
  try {
    const result = await rolesApi.activate(role);

    if (!result.success) {
      throw new Error(result.error ?? `Activation failed`);
    }

    // Update local user state
    const user = getCurrentUser();
    if (user && !user.roles.includes(role)) {
      user.roles.push(role);
      setCurrentUser(user);
    }

    // Close modal + refresh
    const modal = document.getElementById('role-activation-modal');
    if (modal) {
      modal.classList.add('nm-hidden');
    }

    await loadUserRoles();
    updateProfileCompletion(getCurrentUser());
  } catch (err) {
    reportError(err instanceof Error ? err : new Error(String(err)), {
      context: 'activate_role',
      targetRole: role,
    });
    // TICK-015: Role activation error — use showToast() instead of inline banner.
    // Previous: 6 lines of manual DOM creation, className, innerHTML, setTimeout.
    // showToast() already handles positioning, animation, dark mode, haptics, auto-dismiss.
    // Standard: DRY Principle, Design System Component Unity.
    showToast(t('role_activation_failed', 'فشل تفعيل الدور'), 'error');
  } finally {
    isActivatingRole = false;
  }
}

// ─── Logout ─────────────────────────────────────────────────────────────────
// LOGOUT-001 FIX: Now calls /api/auth/logout to invalidate server-side JWT
// cookie BEFORE clearing local state. Previous version only cleared local
// storage, leaving the httpOnly cookie valid until expiry.
async function logout(): Promise<void> {
  try {
    await auth.logout();
  } catch (err) {
    reportWarning('[Profile] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Logout API failure is non-fatal — clear local state regardless
  }
  clearAuth(true); // P2-W5-002: skipServerLogout — auth.logout() already called above
  window.location.href = '/auth.html';
}

// PLATINUM FIX: Wire Destructive Action Confirmation Dialog
// Previous: Button triggered logout() instantly, bypassing the <dialog> entirely.
const logoutBtn = document.getElementById('logout-action');
const logoutDialog = document.getElementById('confirm-logout') as HTMLDialogElement | null;

logoutBtn?.addEventListener('click', () => {
  if (logoutDialog) {
    // SYS-004: Polyfill for older browsers before calling showModal().
    polyfillDialog(logoutDialog);
    logoutDialog.showModal();
  } else {
    // Ultimate fallback: no dialog element in DOM at all
    if (confirm(t('confirm_logout_title', 'تسجيل الخروج'))) {
      logout();
    }
  }
});

logoutDialog?.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
  logoutDialog.close();
});

logoutDialog?.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
  logoutDialog.close();
  logout();
});

document.getElementById('logout-btn')?.addEventListener('click', logout);

// ─── Add Role Modal ─────────────────────────────────────────────────────────
document.getElementById('add-role-btn')?.addEventListener('click', () => {
  const modal = document.getElementById('role-activation-modal');
  if (modal) {
    modal.classList.toggle('nm-hidden');
    if (!modal.classList.contains('nm-hidden')) {
      loadAvailableRoles();
    }
  }
});

document.getElementById('cancel-role-activation')?.addEventListener('click', () => {
  const modal = document.getElementById('role-activation-modal');
  if (modal) {
    modal.classList.add('nm-hidden');
  }
});

// ─── GAP-003 FIX: Profile Edit Mode ────────────────────────────────────────
// Toggles between display mode and inline edit form.
// Saves to local auth state; API call placeholder for backend wiring.
function toggleEditMode(show: boolean): void {
  const displayMode = document.getElementById('profile-display-mode');
  const editForm = document.getElementById('profile-edit-form');
  if (!displayMode || !editForm) {
    return;
  }

  if (show) {
    // Pre-fill with current data
    const user = getCurrentUser();
    const nameInput = document.getElementById('edit-name') as HTMLInputElement | null;
    const emailInput = document.getElementById('edit-email') as HTMLInputElement | null;
    if (nameInput) {
      nameInput.value = user?.full_name ?? '';
    }
    if (emailInput) {
      emailInput.value = user?.email ?? '';
    }

    displayMode.classList.add('nm-hidden');
    editForm.classList.remove('nm-hidden');
    document.getElementById('edit-name')?.focus();
  } else {
    profileGuard.markClean();
    displayMode.classList.remove('nm-hidden');
    editForm.classList.add('nm-hidden');
    hideEditBanner();
  }
}

function showEditBanner(type: 'error' | 'success', message: string): void {
  const banner = document.getElementById('profile-edit-banner');
  if (!banner) {
    return;
  }
  // PLT-UX-AUD P2-PROFILE-004 FIX: Added dark mode classes.
  // Previous: bg-red-50/bg-emerald-50 had no dark: variants — jarring in dark theme.
  banner.className = `text-xs font-bold p-3 rounded-xl ${
    type === 'error'
      ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
      : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
  }`;
  banner.textContent = message;
  banner.classList.remove('nm-hidden');
}

function hideEditBanner(): void {
  const banner = document.getElementById('profile-edit-banner');
  if (banner) {
    banner.classList.add('nm-hidden');
  }
}

// PLT-003 FIX: Double-submit guard — prevents re-entry on slow 3G double-tap.
// Previous: setLoadingState() provided visual feedback but no mutex. User could
// trigger 2+ saves before the first completes, corrupting local state.
// Standard: Mutex flag pattern for async form submission.
let isSavingProfile = false;

async function saveProfile(): Promise<void> {
  if (isSavingProfile) {
    return;
  }
  isSavingProfile = true;

  const nameInput = document.getElementById('edit-name') as HTMLInputElement | null;
  const emailInput = document.getElementById('edit-email') as HTMLInputElement | null;
  const saveBtn = document.getElementById('save-profile-btn') as HTMLButtonElement | null;

  const newName = nameInput?.value.trim() ?? '';
  const newEmail = emailInput?.value.trim() ?? '';

  // Validation
  if (!newName) {
    showEditBanner('error', t('profile_name_required', 'الاسم مطلوب'));
    scrollToField(nameInput);
    return;
  }
  // PLT-UX-AUD P3-VAL-005 FIX: Stricter email regex for FinTech platform.
  // Previous: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ — allowed 'a@b.c' (1-char TLD).
  // Now: Requires 2+ char local part, 2+ char domain, 2+ char TLD.
  if (!newEmail || !/^[^\s@]{2,}@[^\s@]{2,}\.[^\s@]{2,}$/.test(newEmail)) {
    showEditBanner('error', t('profile_email_invalid', 'البريد الإلكتروني غير صالح'));
    scrollToField(emailInput);
    return;
  }

  // FRC-NEW-06 FIX: Visual loading state with spinner during save
  const restoreBtn = saveBtn ? setLoadingState(saveBtn, t('saving', 'جاري الحفظ...')) : null;

  try {
    // PROG-ENH-001: Saves to local auth state (progressive enhancement).
    // When backend auth.updateProfile() endpoint ships, this will call the API first
    // and fall back to local state on network failure (Syria 3G resilience).
    const user = getCurrentUser();
    if (user) {
      setCurrentUser({
        ...user,
        full_name: newName,
        email: newEmail,
      });
    }

    // Re-render profile display
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    if (nameEl) {
      nameEl.textContent = newName;
    }
    if (emailEl) {
      emailEl.textContent = newEmail;
    }
    renderAvatarInitials(newName);
    updateProfileCompletion(getCurrentUser());

    restoreBtn?.('success');
    // F-003 FIX: Honest "saved to this device only" message.
    // Previous: '✓ Saved locally — will sync when available' — ambiguous phrasing that
    // implies automatic sync. Users on a FinTech platform must know data is device-local
    // and won't appear on other devices or survive browser data clearing.
    // Standard: Nielsen #1 (System Status Visibility), FinTech Trust UX.
    showEditBanner(
      'success',
      t('profile_saved_locally', "✓ Saved to this device — won't appear on other devices yet"),
    );
    profileGuard.markClean();
    addTrackedTimer(setTimeout(() => toggleEditMode(false), 800));
  } catch (err) {
    restoreBtn?.('error');
    reportWarning('[Profile] Edit save failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    showEditBanner('error', t('profile_save_failed', 'فشل حفظ الملف الشخصي'));
  } finally {
    isSavingProfile = false;
  }
}

// Wire edit/cancel buttons
document.getElementById('edit-profile-btn')?.addEventListener('click', () => toggleEditMode(true));
document.getElementById('cancel-edit-btn')?.addEventListener('click', () => toggleEditMode(false));
document
  .getElementById('profile-edit-form')
  ?.addEventListener('input', () => profileGuard.markDirty());
document.getElementById('profile-edit-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  saveProfile();
});

// ─── GAP-N02 FIX: Password Change Engine ────────────────────────────────────
// Hydrates the previously dead #password-change-form ghost feature.
// Standard: Nielsen #3 (User Control), Progressive Disclosure, Security UX.
function initPasswordChangeEngine(): void {
  const toggleBtn = document.getElementById('toggle-password-change');
  const formPanel = document.getElementById('password-change-form');
  const caretIcon = document.getElementById('password-caret');
  const saveBtn = document.getElementById('save-password-btn') as HTMLButtonElement | null;

  if (!toggleBtn || !formPanel) {
    return;
  }

  toggleBtn.addEventListener('click', () => {
    const isHidden = formPanel.classList.contains('nm-hidden');
    if (isHidden) {
      formPanel.classList.remove('nm-hidden');
      caretIcon?.classList.add('rotate-180');
    } else {
      profileGuard.markClean();
      formPanel.classList.add('nm-hidden');
      caretIcon?.classList.remove('rotate-180');
    }
  });

  formPanel.addEventListener('input', () => profileGuard.markDirty());

  const currentInput = document.getElementById('current-password') as HTMLInputElement | null;
  const newPasswordInput = document.getElementById('new-password') as HTMLInputElement | null;
  const confirmInput = document.getElementById('confirm-new-password') as HTMLInputElement | null;

  let isSavingPassword = false;
  saveBtn?.addEventListener('click', async () => {
    if (isSavingPassword) {
      return;
    }

    const current_password = currentInput?.value || '';
    const new_password = newPasswordInput?.value || '';
    const confirm_password = confirmInput?.value || '';

    if (!current_password || !new_password) {
      showToast(t('password_empty', 'كلمة المرور فارغة'), 'error');
      return;
    }
    if (new_password !== confirm_password) {
      showToast(t('password_mismatch', 'كلمتا المرور غير متطابقتين'), 'error');
      return;
    }
    // P2-W12-001 FIX: Full password complexity validation — single source of truth.
    // PREVIOUS: Only `new_password.length < 8` — accepted 'abcdefgh' (no uppercase,
    // no digit, no special). Backend Zod rejected it with confusing generic 400 error.
    // NOW: Uses shared validatePasswordComplexity() — parity with auth.ts and backend.
    // Standard: DRY Principle, OWASP ASVS 2.1.1, UX Consistency.
    const pwResult = validatePasswordComplexity(new_password);
    if (!pwResult.valid) {
      showToast(t('password_complexity', 'كلمة المرور لا تستوفي المتطلبات'), 'error');
      return;
    }

    isSavingPassword = true;
    const restoreBtn = setLoadingState(saveBtn, t('updating', 'جاري التحديث...'));

    try {
      const result = await auth.updatePassword({ current_password, new_password });
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to update password');
      }
      restoreBtn('success');
      showToast(t('password_changed_success', 'تم تغيير كلمة المرور'), 'success');
      profileGuard.markClean();
      formPanel.classList.add('nm-hidden');
      caretIcon?.classList.remove('rotate-180');
      // Clean up fields
      if (currentInput) {
        currentInput.value = '';
      }
      if (newPasswordInput) {
        newPasswordInput.value = '';
      }
      if (confirmInput) {
        confirmInput.value = '';
      }
    } catch (err) {
      restoreBtn('error');
      reportError(err instanceof Error ? err : new Error(String(err)), {
        context: 'change_password',
      });
      showToast(t('password_change_failed', 'فشل تغيير كلمة المرور'), 'error');
    } finally {
      isSavingPassword = false;
    }
  });

  // FRC-NEW-03 FIX: Live password strength visualizer (UX parity with auth.html)
  const pwBars = document.getElementById('pw-change-strength-bars')?.children;
  // UX-REM-J007 FIX: Unified password strength algorithm.
  // PREVIOUS: Inline algorithm (L577) used val.length + regex checks — a DIFFERENT
  // scoring system than password-strength.ts (which uses +1 per criterion: 8+ chars,
  // uppercase, digit, special). "Strong" on profile ≠ "Strong" on auth page.
  // NOW: Uses the shared `updatePasswordStrength()` utility — single source of truth.
  // Standard: DRY, Consistent Security Feedback across platform.
  newPasswordInput?.addEventListener('input', (e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    updatePasswordStrength(val, pwBars as HTMLCollection | undefined, null);
  });
}

// ─── GAP-X02 FIX: Profile Photo Preview Engine ─────────────────────────────
// Uses FileReader API for instant client-side preview after file selection.
// Validates size (5MB) and type before showing circular preview.
// Standard: Material Design 3 (Immediate Feedback), Trust UX (visual verification).
function initPhotoPreview(): void {
  const fileInput = document.getElementById('edit-photo') as HTMLInputElement | null;
  const filenameEl = document.getElementById('photo-filename');
  const previewWrap = document.getElementById('photo-preview-wrap');
  const previewImg = document.getElementById('photo-preview-img') as HTMLImageElement | null;
  const removeBtn = document.getElementById('photo-preview-remove');

  if (!fileInput || !previewWrap || !previewImg) {
    return;
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      showEditBanner('error', t('photo_invalid_type', 'نوع الصورة غير مدعوم'));
      fileInput.value = '';
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      showEditBanner('error', t('photo_too_large', 'الصورة كبيرة جداً (الحد ٢ ميغابايت)'));
      fileInput.value = '';
      return;
    }

    // Update filename display
    if (filenameEl) {
      filenameEl.textContent = file.name;
      filenameEl.classList.remove('text-slate-400');
      filenameEl.classList.add('text-slate-700');
    }

    // Read and show preview via FileReader
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        previewImg.src = result;
        previewWrap.classList.remove('nm-hidden');

        // Also update the main avatar circle for immediate in-page feedback
        // PLT-004 FIX: DOM API replaces innerHTML for avatar preview.
        // Previous: `avatarEl.innerHTML = \`<img src="${result}"...\``
        // — unescaped FileReader result violated zero-trust XSS policy.
        // Standard: Use DOM createElement/setAttribute for dynamic content.
        const avatarEl = document.getElementById('profile-avatar');
        if (avatarEl) {
          const img = document.createElement('img');
          img.src = result;
          img.alt = 'Profile photo preview';
          img.className = 'w-full h-full rounded-full object-cover';
          avatarEl.innerHTML = '';
          avatarEl.appendChild(img);
          // UX-REM-J003 FIX: Preview-only warning badge.
          // PREVIOUS: No indication that photo is client-side only.
          // User sees photo → leaves → returns → photo gone. Confusion.
          // P1-JRN-005 FIX: Badge made more prominent — upgraded from text-3xs
          // to text-xs with icon and pulse animation. On mobile, the original
          // 8px text was nearly invisible on a 64px avatar circle.
          // Standard: Nielsen #1 (Visibility of System Status).
          let badge = avatarEl.querySelector('.nm-preview-badge');
          if (!badge) {
            badge = document.createElement('span');
            badge.className =
              'nm-preview-badge absolute bottom-0 inset-x-0 text-center text-xs font-bold py-1 bg-amber-500 text-white rounded-b-full animate-pulse flex items-center justify-center gap-1';
            badge.innerHTML = `<i class="ph ph-eye text-xs" aria-hidden="true"></i>${escapeHtml(t('photo_preview_only', 'معاينة فقط'))}`;
            badge.setAttribute('data-i18n', 'photo_preview_only');
            avatarEl.style.position = 'relative';
            avatarEl.appendChild(badge);
          }
        }
      }
    };
    reader.onerror = () => {
      reportWarning('[Profile] FileReader error during photo preview');
    };
    reader.readAsDataURL(file);
  });

  // Remove photo handler
  removeBtn?.addEventListener('click', () => {
    fileInput.value = '';
    previewWrap.classList.add('nm-hidden');
    previewImg.src = '';
    if (filenameEl) {
      filenameEl.textContent = t('choose_photo', 'اختر صورة');
      filenameEl.classList.add('text-slate-400');
      filenameEl.classList.remove('text-slate-700');
    }
    // Restore avatar initials
    const user = getCurrentUser();
    renderAvatarInitials(user?.full_name);
  });
}

// ─── Initialize ─────────────────────────────────────────────────────────────
function init(): void {
  // BLOCKER-1 FIX: Guard all protected content behind auth check.
  if (!requireAuth()) {
    return;
  }

  // F-004 FIX: Hub FAB — portal navigation from inner pages.
  mountHubFAB('');
  // F-010 FIX: Breadcrumb — spatial orientation on inner pages.
  initBreadcrumb();

  loadUserInfo();
  loadUserRoles();
  initPhotoPreview(); // GAP-X02 FIX: Wire photo preview engine
  initPasswordChangeEngine(); // GAP-N02 FIX: Wire password change system

  // Handle ?tab=roles URL param (opens role activation modal directly)
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'roles') {
    const modal = document.getElementById('role-activation-modal');
    if (modal) {
      modal.classList.remove('nm-hidden');
      loadAvailableRoles();
      modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // GAP-N04 FIX: Wire profile completion checklist actions.
  // Tapping a checklist item scrolls to and focuses the target field.
  // Standard: Nielsen Heuristic #10 — Help & Documentation.
  document.querySelectorAll<HTMLButtonElement>('.completion-action').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.focusTarget;
      if (!targetId) {
        return;
      }

      // PLAT-UX-006 FIX: If target is inside the hidden edit form, reveal it first.
      // Previous: Focus silently failed on hidden inputs (edit-name, edit-email, etc.).
      // Standard: WCAG 2.4.3 (Focus Order), Nielsen #3 (User Control & Freedom).
      const editForm = document.getElementById('profile-edit-form');
      if (editForm?.classList.contains('nm-hidden')) {
        const target = document.getElementById(targetId);
        if (target && editForm.contains(target)) {
          toggleEditMode(true);
        }
      }

      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Focus the element if it's focusable (input, button, etc.)
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLButtonElement ||
          target instanceof HTMLSelectElement
        ) {
          // PTR-FOCUS FIX: Replaced addTrackedTimer(setTimeout(400)) timing hack with immediate focus.
          // preventScroll avoids interfering with the ongoing smooth scrollIntoView.
          // Standard: CSS-driven scroll, no arbitrary delays.
          target.focus({ preventScroll: true });
        }
      }
    });
  });

  // GAP-N06 FIX: Wire notification toggle with localStorage persistence.
  // Previous: Cosmetic toggle — looked interactive but saved nothing.
  // Now: Persists to localStorage immediately; restored on load.
  // When backend notification API is available, this preference will be synced.
  // Standard: Progressive Enhancement — save locally now, sync later.
  const notifToggle = document.getElementById('notif-toggle') as HTMLInputElement | null;
  if (notifToggle) {
    const NOTIF_KEY = 'nmr_notifications_enabled';
    // W16-001 FIX: Wrap in try-catch for Safari private mode.
    try {
      const saved = localStorage.getItem(NOTIF_KEY);
      if (saved !== null) {
        notifToggle.checked = saved === '1';
      }
    } catch {
      /* Safari private mode */
    }
    // Save on change
    notifToggle.addEventListener('change', () => {
      try {
        localStorage.setItem(NOTIF_KEY, notifToggle.checked ? '1' : '0');
      } catch {
        /* Safari private mode */
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // THEME-SURG-001: Platform Theme Toggle (Settings)
  // Moved from floating FAB (nav.js) to profile settings.
  // Toggle: OFF = light (default), ON = dark.
  // Standard: Apple HIG (Settings), Material Design 3 (Preferences).
  // ═══════════════════════════════════════════════════════════════════════
  const themeToggle = document.getElementById('theme-mode-toggle') as HTMLInputElement | null;
  const themeIcon = document.getElementById('theme-setting-icon');
  const themeLabel = document.getElementById('theme-setting-label');

  if (themeToggle) {
    // Determine current theme state
    const THEME_KEY = 'nm-theme';
    let currentTheme: string;
    try {
      currentTheme = localStorage.getItem(THEME_KEY) ?? 'light';
    } catch {
      currentTheme = document.documentElement.getAttribute('data-theme') ?? 'light';
    }

    const isDark = currentTheme === 'dark';
    themeToggle.checked = isDark;

    // Sync UI to current state
    const syncThemeUI = (dark: boolean): void => {
      if (themeIcon) {
        themeIcon.className = dark
          ? 'ph ph-sun-dim text-amber-500'
          : 'ph ph-moon-stars text-indigo-500 dark:text-indigo-400';
      }
      if (themeLabel) {
        themeLabel.textContent = dark
          ? t('theme_dark', 'الوضع الداكن')
          : t('theme_light', 'الوضع الفاتح');
        themeLabel.setAttribute('data-i18n', dark ? 'theme_dark' : 'theme_light');
      }
    }
    syncThemeUI(isDark);

    // Handle toggle change
    themeToggle.addEventListener('change', () => {
      const goingDark = themeToggle.checked;
      const nextTheme = goingDark ? 'dark' : 'light';

      // Apply theme with smooth transition
      document.documentElement.classList.add('nm-theme-transition');
      document.documentElement.setAttribute('data-theme', nextTheme);

      // Persist
      try {
        localStorage.setItem(THEME_KEY, nextTheme);
      } catch {
        /* incognito */
      }

      // Sync UI
      syncThemeUI(goingDark);

      // Dispatch event for nav.js and other listeners
      try {
        document.dispatchEvent(
          new CustomEvent('nm-theme-changed', {
            detail: {
              theme: nextTheme,
              mode: nextTheme,
              previousMode: goingDark ? 'light' : 'dark',
            },
          }),
        );
      } catch {
        /* CustomEvent not supported */
      }

      // Remove transition class after animation
      addTrackedTimer(setTimeout(() => {
        document.documentElement.classList.remove('nm-theme-transition');
      }, 500));
    });

    // Listen for external theme changes (e.g., OS preference change)
    document.addEventListener('nm-theme-changed', ((e: CustomEvent) => {
      const next = e.detail?.theme;
      if (next && document.activeElement !== themeToggle) {
        themeToggle.checked = next === 'dark';
        syncThemeUI(next === 'dark');
      }
    }) as EventListener);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // V-005 FIX: Active Sessions / Security Section
  // Shows all active login sessions. User can revoke per-device or all.
  // Standard: NIST SP 800-63B (Session Management), OWASP Session Mgmt.
  // ═══════════════════════════════════════════════════════════════════════
  const esc = escapeHtml;

  async function loadActiveSessions(): Promise<void> {
    const container = document.getElementById('v005-sessions-list');
    if (!container) {return;}

    container.innerHTML = `<div class="flex justify-center py-4"><div class="nm-skeleton-pulse rounded-lg" style="width:100%;height:48px"></div></div>`;

    try {
      const res = await auth.getSessions();
      if (!res.success || !res.data) {
        container.innerHTML = `<p class="text-sm text-slate-400">${esc(t('sessions_error', 'تعذّر تحميل الجلسات'))}</p>`;
        return;
      }

      const sessions = res.data.sessions;
      if (sessions.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-400">${esc(t('no_sessions', 'لا توجد جلسات نشطة'))}</p>`;
        return;
      }

      const platformIcons: Record<string, string> = {
        ios: 'ph-apple-logo',
        android: 'ph-android-logo',
        web: 'ph-globe',
      };

      container.innerHTML = sessions
        .map((s) => {
          const iconClass = platformIcons[s.platform ?? ''] ?? 'ph-device-mobile';
          const loginDate = new Date(s.created_at).toLocaleDateString(isRTL() ? 'ar-SY' : 'en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const currentBadge = s.is_current
            ? `<span class="text-xs bg-smoky-jade/10 text-smoky-jade px-2 py-0.5 rounded-full font-semibold">${esc(t('current_session', 'هذا الجهاز'))}</span>`
            : '';
          const revokeBtn =
            !s.is_current && s.device_id
              ? `<button class="v005-revoke-btn text-xs text-red-500 hover:text-red-700 transition-colors font-medium" data-device="${esc(s.device_id)}">${esc(t('sign_out_device', 'تسجيل الخروج'))}</button>`
              : '';

          return `<div class="flex items-center gap-3 py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0">
                    <div class="flex-shrink-0 size-9 rounded-lg bg-cloud-dancer dark:bg-slate-700/50 flex items-center justify-center">
                        <i class="ph ${esc(iconClass)} text-lg text-trust-blue"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-medium text-slate-700 dark:text-slate-200 capitalize">${esc(s.platform ?? 'Unknown')}</span>
                            ${currentBadge}
                        </div>
                        <p class="text-xs text-slate-400 dark:text-slate-500">${esc(loginDate)}</p>
                    </div>
                    ${revokeBtn}
                </div>`;
        })
        .join('');

      // Wire revoke buttons
      container.querySelectorAll<HTMLButtonElement>('.v005-revoke-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const deviceId = btn.dataset['device'];
          if (!deviceId) {return;}
          btn.disabled = true;
          btn.textContent = '...';
          try {
            await auth.revokeDevice(deviceId);
            showToast(t('session_revoked', 'تم تسجيل الخروج من الجهاز'), 'success');
            await loadActiveSessions(); // Refresh list
          } catch {
            showToast(t('session_revoke_error', 'فشل تسجيل الخروج من الجهاز'), 'error');
            btn.disabled = false;
            btn.textContent = t('sign_out_device', 'تسجيل الخروج');
          }
        });
      });
    } catch {
      container.innerHTML = `<p class="text-sm text-slate-400">${esc(t('sessions_error', 'تعذّر تحميل الجلسات'))}</p>`;
    }
  }

  // Inject the security section into the DOM
  const kycSectionEl = document.getElementById('kyc-section');
  const securitySectionHtml = `
        <section id="v005-security-section" class="bg-white dark:bg-slate-800/50 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700/30">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <i class="ph ph-shield-check text-trust-blue text-lg"></i>
                    ${esc(t('security_sessions', 'الجلسات النشطة'))}
                </h3>
                <button id="v005-revoke-all-btn" class="text-xs text-red-500 hover:text-red-700 transition-colors font-medium">
                    ${esc(t('sign_out_all', 'تسجيل الخروج من جميع الأجهزة'))}
                </button>
            </div>
            <div id="v005-sessions-list"></div>
        </section>
    `;
  if (kycSectionEl?.parentElement) {
    kycSectionEl.insertAdjacentHTML('beforebegin', securitySectionHtml);
  } else {
    // Fallback: append to main content area
    const main = document.querySelector('main') ?? document.body;
    main.insertAdjacentHTML('beforeend', securitySectionHtml);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Migration 046: MFA/2FA Management Section
  // Injects after the sessions section. Users can:
  //   - See MFA status (enabled/disabled)
  //   - Enable MFA (QR → confirm → recovery codes)
  //   - Disable MFA (password confirmation)
  //   - Regenerate recovery codes
  // Standard: NIST SP 800-63B (AAL2), OWASP ASVS v4 §2.8
  // ═══════════════════════════════════════════════════════════════════════

  const mfaSectionHtml = `
    <section id="mfa-management-section" class="bg-white dark:bg-slate-800/50 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700/30">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <i class="ph ph-shield-star text-trust-blue text-lg"></i>
          ${esc(t('mfa_section_title', 'المصادقة الثنائية (2FA)'))}
        </h3>
        <span id="mfa-status-badge" class="text-xs px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
          ${esc(t('mfa_loading', 'جاري التحميل…'))}
        </span>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
        ${esc(t('mfa_description', 'أضف طبقة حماية إضافية لحسابك باستخدام تطبيق مصادقة مثل Google Authenticator أو Authy.'))}
      </p>
      <div id="mfa-action-area"></div>
      <div id="mfa-setup-flow" class="nm-hidden"></div>
    </section>
  `;

  const securitySection = document.getElementById('v005-security-section');
  if (securitySection) {
    securitySection.insertAdjacentHTML('afterend', mfaSectionHtml);
  } else {
    const mainEl = document.querySelector('main') ?? document.body;
    mainEl.insertAdjacentHTML('beforeend', mfaSectionHtml);
  }

  // ── MFA State Management ──
  async function loadMfaStatus(): Promise<void> {
    const badge = document.getElementById('mfa-status-badge');
    const actionArea = document.getElementById('mfa-action-area');
    if (!badge || !actionArea) {return;}

    try {
      const res = await auth.mfaStatus();
      if (!res.success || !res.data) {
        badge.textContent = esc(t('mfa_error', 'خطأ'));
        badge.className =
          'text-xs px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400';
        return;
      }

      const { enabled, recovery_codes_remaining } = res.data;

      if (enabled) {
        badge.textContent = esc(t('mfa_enabled', 'مفعّلة'));
        badge.className =
          'text-xs px-2 py-0.5 rounded-full font-semibold bg-smoky-jade/10 text-smoky-jade';

        actionArea.innerHTML = `
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between p-3 bg-cloud-dancer dark:bg-slate-700/30 rounded-lg">
              <div>
                <p class="text-sm font-medium text-slate-700 dark:text-slate-200">${esc(t('mfa_recovery_codes', 'رموز الاسترداد'))}</p>
                <p class="text-xs text-slate-400">${esc(t('mfa_remaining', 'المتبقي'))}: <strong class="${esc(recovery_codes_remaining <= 2 ? 'text-red-500' : 'text-smoky-jade')}">${esc(recovery_codes_remaining)}</strong></p>
              </div>
              <button id="mfa-regen-codes-btn" class="text-xs text-trust-blue hover:text-trust-blue-hover font-medium transition-colors">
                ${esc(t('mfa_regenerate', 'إعادة توليد'))}
              </button>
            </div>
            <button id="mfa-disable-btn" class="nm-btn text-xs px-4 py-2 border border-red-200 dark:border-red-500/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
              ${esc(t('mfa_disable_btn', 'إلغاء المصادقة الثنائية'))}
            </button>
          </div>
        `;

        // Wire disable button
        document.getElementById('mfa-disable-btn')?.addEventListener('click', () => {
          const password = prompt(
            t('mfa_enter_password', 'أدخل كلمة المرور لتأكيد إلغاء المصادقة الثنائية:'),
          );
          if (!password) {return;}
          disableMfaAction(password);
        });

        // Wire regenerate button
        document.getElementById('mfa-regen-codes-btn')?.addEventListener('click', async () => {
          if (!confirm(t('mfa_regen_confirm', 'سيتم إبطال الرموز القديمة. هل تريد المتابعة؟')))
            {return;}
          try {
            const res = await auth.mfaRegenerateCodes();
            if (res.success && res.data) {
              showRecoveryCodes(res.data.recovery_codes);
            } else {
              showToast(res.error ?? t('mfa_regen_failed', 'فشل توليد الرموز'), 'error');
            }
          } catch {
            showToast(t('mfa_regen_failed', 'فشل توليد الرموز'), 'error');
          }
        });
      } else {
        badge.textContent = esc(t('mfa_disabled', 'معطّلة'));
        badge.className =
          'text-xs px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500';

        actionArea.innerHTML = `
          <button id="mfa-enable-btn" class="nm-btn nm-btn-primary text-sm w-full py-2.5 flex items-center justify-center gap-2">
            <i class="ph ph-shield-plus text-base"></i>
            ${esc(t('mfa_enable_btn', 'تفعيل المصادقة الثنائية'))}
          </button>
        `;

        document.getElementById('mfa-enable-btn')?.addEventListener('click', startMfaSetup);
      }
    } catch {
      if (badge) {
        badge.textContent = esc(t('mfa_error', 'خطأ'));
      }
    }
  }

  async function startMfaSetup(): Promise<void> {
    const setupFlow = document.getElementById('mfa-setup-flow');
    const actionArea = document.getElementById('mfa-action-area');
    if (!setupFlow) {return;}

    // Hide action area, show setup flow
    if (actionArea) {actionArea.classList.add('nm-hidden');}
    setupFlow.classList.remove('nm-hidden');
    setupFlow.innerHTML = `<div class="flex justify-center py-4"><div class="nm-skeleton-pulse rounded-lg" style="width:100%;height:120px"></div></div>`;

    try {
      const res = await auth.mfaSetup();
      if (!res.success || !res.data) {
        setupFlow.innerHTML = `<p class="text-sm text-red-500">${esc(res.error ?? t('mfa_setup_failed', 'فشل بدء الإعداد'))}</p>`;
        return;
      }

      const { qr_data_url, secret } = res.data;

      setupFlow.innerHTML = `
        <div class="text-center">
          <p class="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
            ${esc(t('mfa_scan_qr', 'امسح رمز QR بتطبيق المصادقة:'))}
          </p>
          <div class="flex justify-center mb-3">
            <img src="${esc(qr_data_url)}" alt="MFA QR Code" width="192" height="192" class="rounded-lg border border-slate-200 dark:border-slate-600" />
          </div>
          <details class="text-start mb-4">
            <summary class="text-xs text-trust-blue cursor-pointer font-medium">
              ${esc(t('mfa_manual_entry', 'أو أدخل المفتاح يدوياً'))}
            </summary>
            <code class="block mt-2 p-2 bg-slate-50 dark:bg-slate-700 rounded text-xs font-mono text-slate-600 dark:text-slate-300 break-all select-all" dir="ltr">
              ${esc(secret)}
            </code>
          </details>
          <div class="mb-4">
            <label class="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              ${esc(t('mfa_enter_code', 'أدخل الرمز من التطبيق للتأكيد:'))}
            </label>
            <input type="text" id="mfa-setup-code" inputmode="numeric" maxlength="6"
              class="nm-input text-center text-lg font-bold tracking-widest" dir="ltr"
              placeholder="000000" autocomplete="one-time-code" />
          </div>
          <div class="flex gap-2">
            <button id="mfa-setup-cancel" class="nm-btn flex-1 text-sm border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
              ${esc(t('cancel', 'إلغاء'))}
            </button>
            <button id="mfa-setup-confirm" class="nm-btn nm-btn-primary flex-1 text-sm">
              <span id="mfa-setup-confirm-text">${esc(t('mfa_confirm_btn', 'تأكيد'))}</span>
            </button>
          </div>
          <p id="mfa-setup-error" class="nm-hidden text-xs text-red-500 mt-2"></p>
        </div>
      `;

      // Wire cancel
      document.getElementById('mfa-setup-cancel')?.addEventListener('click', () => {
        setupFlow.classList.add('nm-hidden');
        setupFlow.innerHTML = '';
        if (actionArea) {actionArea.classList.remove('nm-hidden');}
      });

      // Wire confirm
      let isConfirming = false;
      const confirmSetup = async (): Promise<void> => {
        if (isConfirming) {return;}
        const codeInput = document.getElementById('mfa-setup-code') as HTMLInputElement | null;
        const code = codeInput?.value.trim() ?? '';
        const errorEl = document.getElementById('mfa-setup-error');

        if (code.length !== 6 || !/^\d{6}$/.test(code)) {
          if (errorEl) {
            errorEl.textContent = t('mfa_enter_6_digits', 'أدخل 6 أرقام');
            errorEl.classList.remove('nm-hidden');
          }
          return;
        }

        isConfirming = true;
        const confirmBtn = document.getElementById('mfa-setup-confirm') as HTMLButtonElement | null;
        const confirmText = document.getElementById('mfa-setup-confirm-text');
        if (confirmBtn) {confirmBtn.classList.add('btn-loading');}
        if (confirmText) {confirmText.textContent = t('mfa_verifying', 'جاري التحقق…');}

        try {
          const result = await auth.mfaConfirm({ token: code });
          if (result.success && result.data) {
            showToast(t('mfa_enabled_success', 'تم تفعيل المصادقة الثنائية بنجاح ✓'), 'success');
            showRecoveryCodes(result.data.recovery_codes);
            if (setupFlow) {
              setupFlow.classList.add('nm-hidden');
              setupFlow.innerHTML = '';
            }
            await loadMfaStatus(); // Refresh status
          } else {
            if (errorEl) {
              errorEl.textContent = result.error ?? t('mfa_invalid_code', 'رمز غير صحيح');
              errorEl.classList.remove('nm-hidden');
            }
            if (codeInput) {codeInput.value = '';}
            codeInput?.focus();
          }
        } catch (err) {
          if (errorEl) {
            errorEl.textContent =
              err instanceof Error ? err.message : t('mfa_setup_failed', 'فشل التأكيد');
            errorEl.classList.remove('nm-hidden');
          }
          if (codeInput) {codeInput.value = '';}
          codeInput?.focus();
        } finally {
          isConfirming = false;
          if (confirmBtn) {confirmBtn.classList.remove('btn-loading');}
          if (confirmText) {confirmText.textContent = t('mfa_confirm_btn', 'تأكيد');}
        }
      }

      document.getElementById('mfa-setup-confirm')?.addEventListener('click', confirmSetup);
      document.getElementById('mfa-setup-code')?.addEventListener('keydown', (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') {
          e.preventDefault();
          confirmSetup();
        }
      });
      // Focus code input
      document.getElementById('mfa-setup-code')?.focus();
    } catch {
      setupFlow.innerHTML = `<p class="text-sm text-red-500">${esc(t('mfa_setup_failed', 'فشل بدء الإعداد'))}</p>`;
    }
  }

  async function disableMfaAction(password: string): Promise<void> {
    try {
      const res = await auth.mfaDisable({ password });
      if (res.success) {
        showToast(t('mfa_disabled_success', 'تم إلغاء المصادقة الثنائية'), 'success');
        await loadMfaStatus();
      } else {
        showToast(res.error ?? t('mfa_disable_failed', 'فشل إلغاء المصادقة الثنائية'), 'error');
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : t('mfa_disable_failed', 'فشل إلغاء المصادقة الثنائية'),
        'error',
      );
    }
  }

  function showRecoveryCodes(codes: string[]): void {
    // Show a modal/dialog with recovery codes
    const existing = document.getElementById('mfa-recovery-dialog');
    if (existing) {existing.remove();}

    const dialog = document.createElement('div');
    dialog.id = 'mfa-recovery-dialog';
    dialog.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', t('mfa_recovery_codes', 'رموز الاسترداد'));

    const codesHtml = codes
      .map(
        (c) =>
          `<code class="block py-1 text-sm font-mono font-bold text-slate-700 dark:text-slate-200">${esc(c)}</code>`,
      )
      .join('');

    dialog.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl" style="max-height:90vh; overflow-y:auto;">
        <div class="text-center mb-4">
          <div class="text-3xl mb-2">🔑</div>
          <h3 class="text-lg font-bold text-slate-700 dark:text-slate-200">${esc(t('mfa_recovery_codes', 'رموز الاسترداد'))}</h3>
          <p class="text-xs text-red-500 font-medium mt-1">${esc(t('mfa_codes_warning', '⚠️ احفظ هذه الرموز — لن تُعرض مرة أخرى!'))}</p>
        </div>
        <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 mb-4 text-center" dir="ltr">
          ${esc(codesHtml)}
        </div>
        <p class="text-xs text-slate-400 mb-4 text-center">
          ${esc(t('mfa_codes_info', 'كل رمز يُستخدم مرة واحدة فقط. استخدمه إذا فقدت الوصول لتطبيق المصادقة.'))}
        </p>
        <button id="mfa-codes-close" class="nm-btn nm-btn-primary w-full text-sm">
          ${esc(t('mfa_codes_saved', 'لقد حفظت الرموز'))}
        </button>
      </div>
    `;

    document.body.appendChild(dialog);

    document.getElementById('mfa-codes-close')?.addEventListener('click', () => {
      dialog.remove();
    });
  }

  // Load MFA status on init
  loadMfaStatus();

  // ═══════════════════════════════════════════════════════════════════════
  // Migration 047: GDPR Account Deletion — Danger Zone
  // Standards: GDPR Art. 17, ISO/IEC 25010 (Platinum), OWASP ASVS v4 §1.4
  // ═══════════════════════════════════════════════════════════════════════

  const dangerZoneHtml = `
    <section id="gdpr-danger-zone" class="bg-white dark:bg-slate-800/50 rounded-xl p-5 shadow-sm border border-red-200 dark:border-red-500/20 mt-4">
      <div class="flex items-center gap-2 mb-4">
        <i class="ph ph-warning-octagon text-red-500 text-lg"></i>
        <h3 class="text-sm font-bold text-red-600 dark:text-red-400">${esc(t('danger_zone', 'منطقة الخطر'))}</h3>
      </div>

      <!-- Deletion status banner (shown if deletion is pending) -->
      <div id="gdpr-deletion-banner" class="nm-hidden mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg">
        <div class="flex items-start gap-2">
          <i class="ph ph-timer text-red-500 text-base mt-0.5"></i>
          <div class="flex-1">
            <p class="text-sm font-medium text-red-700 dark:text-red-300" id="gdpr-deletion-message"></p>
            <p class="text-xs text-red-500 mt-1" id="gdpr-deletion-date"></p>
            <button id="gdpr-cancel-deletion-btn" class="nm-btn mt-2 text-xs px-3 py-1.5 bg-smoky-jade text-white hover:bg-smoky-jade/90 rounded-lg transition-colors">
              ${esc(t('cancel_deletion', 'إلغاء حذف الحساب'))}
            </button>
          </div>
        </div>
      </div>

      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        ${esc(t('delete_account_warning', 'حذف الحساب نهائي. سيتم حذف جميع بياناتك الشخصية بعد فترة سماح 30 يوم.'))}
      </p>

      <button id="gdpr-delete-account-btn" class="nm-btn text-xs px-4 py-2 border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2">
        <i class="ph ph-trash text-sm"></i>
        ${esc(t('delete_account_btn', 'حذف الحساب نهائياً'))}
      </button>
    </section>
  `;

  const mfaSection = document.getElementById('mfa-management-section');
  if (mfaSection) {
    mfaSection.insertAdjacentHTML('afterend', dangerZoneHtml);
  } else {
    const mainEl = document.querySelector('main') ?? document.body;
    mainEl.insertAdjacentHTML('beforeend', dangerZoneHtml);
  }

  // ── GDPR: Load Deletion Status ──
  async function loadDeletionStatus(): Promise<void> {
    const banner = document.getElementById('gdpr-deletion-banner');
    const deleteBtn = document.getElementById('gdpr-delete-account-btn');
    if (!banner) {return;}

    try {
      const res = await auth.deletionStatus();
      if (!res.success || !res.data) {return;}

      const { deletion_pending, grace_period_ends, days_remaining } = res.data;

      if (deletion_pending && grace_period_ends) {
        banner.classList.remove('nm-hidden');
        if (deleteBtn) {deleteBtn.classList.add('nm-hidden');}

        const msgEl = document.getElementById('gdpr-deletion-message');
        const dateEl = document.getElementById('gdpr-deletion-date');
        if (msgEl) {
          msgEl.textContent = t(
            'deletion_pending_msg',
            `حسابك مجدول للحذف النهائي. لديك ${days_remaining ?? 0} يوم لإلغاء القرار.`,
          );
        }
        if (dateEl) {
          const endDate = new Date(grace_period_ends);
          dateEl.textContent = t(
            'deletion_date',
            `تاريخ الحذف النهائي: ${endDate.toLocaleDateString('ar-SY')}`,
          );
        }

        // Wire cancel button
        document.getElementById('gdpr-cancel-deletion-btn')?.addEventListener('click', async () => {
          try {
            const cancelRes = await auth.cancelDeletion();
            if (cancelRes.success) {
              showToast(
                t('deletion_cancelled', 'تم إلغاء حذف الحساب. حسابك نشط مجدداً ✓'),
                'success',
              );
              banner.classList.add('nm-hidden');
              if (deleteBtn) {deleteBtn.classList.remove('nm-hidden');}
            } else {
              showToast(cancelRes.error ?? t('cancel_failed', 'فشل إلغاء الحذف'), 'error');
            }
          } catch {
            showToast(t('cancel_failed', 'فشل إلغاء الحذف'), 'error');
          }
        });
      }
    } catch {
      // Silently fail — deletion status is not critical
    }
  }

  loadDeletionStatus();

  // ── GDPR: Delete Account Dialog ──
  document.getElementById('gdpr-delete-account-btn')?.addEventListener('click', () => {
    // Remove any existing dialog
    document.getElementById('gdpr-delete-dialog')?.remove();

    const dialog = document.createElement('div');
    dialog.id = 'gdpr-delete-dialog';
    dialog.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', t('delete_account', 'حذف الحساب'));

    dialog.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" style="max-height:90vh; overflow-y:auto;">
        <div class="text-center mb-4">
          <div class="w-12 h-12 bg-red-100 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <i class="ph ph-warning text-2xl text-red-500"></i>
          </div>
          <h3 class="text-lg font-bold text-slate-700 dark:text-slate-200">${esc(t('delete_account_title', 'حذف الحساب نهائياً'))}</h3>
        </div>

        <div class="bg-red-50 dark:bg-red-500/10 rounded-lg p-3 mb-4">
          <p class="text-xs text-red-700 dark:text-red-300 font-medium mb-2">${esc(t('delete_warning_title', '⚠️ هذا الإجراء لا يمكن التراجع عنه:'))}</p>
          <ul class="text-xs text-red-600 dark:text-red-400 space-y-1" style="padding-inline-start: 1rem; list-style-type: disc;">
            <li>${esc(t('delete_w1', 'سيتم حذف جميع بياناتك الشخصية'))}</li>
            <li>${esc(t('delete_w2', 'سيتم إلغاء جميع الجلسات النشطة'))}</li>
            <li>${esc(t('delete_w3', 'سيتم حذف رموز MFA ومفاتيح API'))}</li>
            <li>${esc(t('delete_w4', 'ستبقى السجلات المالية مجهولة للامتثال'))}</li>
            <li>${esc(t('delete_w5', 'لديك 30 يوم لإلغاء القرار قبل الحذف النهائي'))}</li>
          </ul>
        </div>

        <div class="space-y-3 mb-4">
          <div>
            <label class="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              ${esc(t('delete_confirm_label', 'اكتب "DELETE" أو "حذف" للتأكيد:'))}
            </label>
            <input type="text" id="gdpr-confirm-text" class="nm-input text-sm" dir="auto"
              placeholder="${esc(t('delete_confirm_placeholder', 'DELETE'))}" autocomplete="off" />
          </div>
          <div>
            <label class="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              ${esc(t('delete_password_label', 'كلمة المرور:'))}
            </label>
            <input type="password" id="gdpr-confirm-password" class="nm-input text-sm"
              placeholder="••••••••" autocomplete="current-password" />
          </div>
          <div>
            <label class="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
              ${esc(t('delete_reason_label', 'سبب الحذف (اختياري):'))}
            </label>
            <textarea id="gdpr-delete-reason" class="nm-input text-sm resize-none" rows="2"
              maxlength="500" placeholder="${esc(t('delete_reason_placeholder', 'أخبرنا لماذا تغادر...'))}"></textarea>
          </div>
        </div>

        <p id="gdpr-delete-error" class="nm-hidden text-xs text-red-500 mb-3"></p>

        <div class="flex gap-2">
          <button id="gdpr-cancel-dialog" class="nm-btn flex-1 text-sm border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
            ${esc(t('cancel', 'إلغاء'))}
          </button>
          <button id="gdpr-confirm-delete" class="nm-btn flex-1 text-sm bg-red-500 hover:bg-red-600 text-white">
            <span id="gdpr-confirm-delete-text">${esc(t('delete_confirm_btn', 'حذف الحساب'))}</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Wire cancel
    document.getElementById('gdpr-cancel-dialog')?.addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {dialog.remove();}
    });

    // Wire confirm
    let isDeleting = false;
    document.getElementById('gdpr-confirm-delete')?.addEventListener('click', async () => {
      if (isDeleting) {return;}

      const confirmText =
        (document.getElementById('gdpr-confirm-text') as HTMLInputElement)?.value.trim() ?? '';
      const password =
        (document.getElementById('gdpr-confirm-password') as HTMLInputElement)?.value ?? '';
      const reason =
        (document.getElementById('gdpr-delete-reason') as HTMLTextAreaElement)?.value.trim() ?? '';
      const errorEl = document.getElementById('gdpr-delete-error');

      // Validate confirmation text
      const normalized = confirmText.toUpperCase();
      if (normalized !== 'DELETE' && confirmText !== 'حذف') {
        if (errorEl) {
          errorEl.textContent = t('delete_type_confirm', 'اكتب "DELETE" أو "حذف" للتأكيد');
          errorEl.classList.remove('nm-hidden');
        }
        return;
      }

      if (!password) {
        if (errorEl) {
          errorEl.textContent = t('delete_enter_password', 'أدخل كلمة المرور');
          errorEl.classList.remove('nm-hidden');
        }
        return;
      }

      isDeleting = true;
      const confirmBtn = document.getElementById('gdpr-confirm-delete') as HTMLButtonElement | null;
      const confirmBtnText = document.getElementById('gdpr-confirm-delete-text');
      if (confirmBtn) {confirmBtn.classList.add('btn-loading');}
      if (confirmBtnText) {confirmBtnText.textContent = t('deleting', 'جاري الحذف…');}

      try {
        const res = await auth.deleteAccount({
          password,
          confirmation: confirmText,
          reason: reason || undefined,
        });

        if (res.success) {
          dialog.remove();
          // Show success message, then redirect to auth page
          showToast(
            t('account_deleted_msg', 'تم جدولة حذف حسابك. لديك 30 يوم لإلغاء القرار.'),
            'success',
          );
          addTrackedTimer(setTimeout(() => {
            window.location.href = '/auth.html';
          }, 2500));
        } else {
          // Handle blockers
          const data = res.data as Record<string, unknown> | undefined;
          if (data && Array.isArray(data['blockers'])) {
            const blockers = data['blockers'] as Array<{ message_ar?: string; message?: string }>;
            const blockerMsg = blockers.map((b) => b.message_ar ?? b.message ?? '').join('\n');
            if (errorEl) {
              errorEl.textContent = blockerMsg;
              errorEl.classList.remove('nm-hidden');
            }
          } else {
            if (errorEl) {
              errorEl.textContent = res.error ?? t('delete_failed', 'فشل حذف الحساب');
              errorEl.classList.remove('nm-hidden');
            }
          }
        }
      } catch (err) {
        if (errorEl) {
          errorEl.textContent =
            err instanceof Error ? err.message : t('delete_failed', 'فشل حذف الحساب');
          errorEl.classList.remove('nm-hidden');
        }
      } finally {
        isDeleting = false;
        if (confirmBtn) {confirmBtn.classList.remove('btn-loading');}
        if (confirmBtnText) {confirmBtnText.textContent = t('delete_confirm_btn', 'حذف الحساب');}
      }
    });

    // Focus confirm text input
    document.getElementById('gdpr-confirm-text')?.focus();
  });

  // Wire "Sign out all devices" button
  document.getElementById('v005-revoke-all-btn')?.addEventListener('click', async () => {
    if (
      !confirm(
        t('confirm_sign_out_all', 'تسجيل الخروج من جميع الأجهزة؟ ستحتاج لتسجيل الدخول مجدداً.'),
      )
    )
      {return;}
    try {
      await auth.revokeAllSessions();
      showToast(
        t('all_sessions_revoked', 'تم تسجيل الخروج من جميع الأجهزة. جاري التحويل...'),
        'success',
      );
      addTrackedTimer(setTimeout(() => {
        window.location.href = '/auth.html';
      }, 1500));
    } catch {
      showToast(t('session_revoke_error', 'فشل تسجيل الخروج من الجهاز'), 'error');
    }
  });

  // Load sessions on page init
  loadActiveSessions();
  // [Platinum UX]: Cognitive Collapse during KYC (Graceful Human Escalation UI)
  if (kycSectionEl) {
    kycSectionEl.classList.remove('nm-hidden');

    // Inject Platinum KYC UI
    kycSectionEl.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <i class="ph ph-identification-card text-trust-blue text-lg"></i>
            ${esc(t('kyc_title', 'توثيق الهوية (KYC)'))}
        </h3>
      </div>
      <div id="kyc-camera-container" class="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 text-center border border-slate-200 dark:border-slate-700 border-dashed mb-4">
        <i class="ph ph-camera text-3xl text-slate-400 mb-2"></i>
        <p class="text-sm text-slate-600 dark:text-slate-300 font-medium">${esc(t('kyc_scan_id', 'قم بتوجيه الكاميرا نحو الهوية الشخصية'))}</p>
        <button id="kyc-scan-btn" class="nm-btn nm-btn-primary mt-4 px-6 text-sm">${esc(t('kyc_start_scan', 'بدء المسح'))}</button>
      </div>
      <div id="kyc-error-container" class="nm-hidden text-center p-4">
         <!-- Will be replaced by Graceful Escalation after 2 failures -->
      </div>
    `;

    let kycFailures = 0;
    document.getElementById('kyc-scan-btn')?.addEventListener('click', (e) => {
      const btn = e.target as HTMLButtonElement;
      const errorContainer = document.getElementById('kyc-error-container');
      const cameraContainer = document.getElementById('kyc-camera-container');

      btn.disabled = true;
      btn.textContent = t('kyc_scanning', 'جاري مسح الهوية...');

      // Simulate AI scanning failure
      addTrackedTimer(setTimeout(() => {
        kycFailures++;
        btn.disabled = false;
        btn.textContent = t('kyc_start_scan', 'إعادة المسح');

        if (errorContainer && cameraContainer) {
          if (kycFailures < 2) {
            // Standard error
            errorContainer.classList.remove('nm-hidden');
            errorContainer.innerHTML = `<p class="text-red-500 text-sm font-bold"><i class="ph ph-warning-circle"></i> ${esc(t('kyc_fail_1', 'الإضاءة ضعيفة، يرجى المحاولة مجدداً.'))}</p>`;
          } else {
            // Platinum UX: Graceful Human Escalation
            cameraContainer.classList.add('nm-hidden');
            errorContainer.classList.remove('nm-hidden');
            errorContainer.className =
              'bg-trust-blue/10 border border-trust-blue/30 rounded-lg p-6 text-center animate-fade-in-up';
            errorContainer.innerHTML = `
              <div class="size-12 bg-trust-blue/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <i class="ph-fill ph-headset text-trust-blue text-2xl"></i>
              </div>
              <h4 class="text-trust-blue font-bold mb-2">${esc(t('kyc_human_help_title', 'يبدو أن الكاميرا لا تساعدنا اليوم'))}</h4>
              <p class="text-sm text-trust-blue/80 mb-4">${esc(t('kyc_human_help_desc', 'لا تقلق، لقد حفظنا بياناتك الأساسية. احجز مكالمة فيديو لمدة دقيقة واحدة مع موظف التوثيق لمساعدتك فوراً دون الحاجة لإعادة التصوير.'))}</p>
              <button id="kyc-video-call-btn" class="nm-btn bg-trust-blue text-white px-6 w-full text-sm hover:bg-trust-blue-hover shadow-lg">
                <i class="ph ph-video-camera me-1"></i> ${esc(t('kyc_book_call', 'حجز مكالمة فيديو'))}
              </button>
            `;

            // Wire up the new button
            document.getElementById('kyc-video-call-btn')?.addEventListener('click', () => {
              showToast(
                t(
                  'kyc_call_booked',
                  'تم حجز المكالمة بنجاح، سيقوم الموظف بالتواصل معك خلال 5 دقائق.',
                ),
                'success',
              );
            });
          }
        }
      }, 1000));
    });
  }

  // Transform the KYC completion checklist item
  const kycChecklistItem = document.querySelector('[data-completion="kyc"]');
  if (kycChecklistItem) {
    const icon = kycChecklistItem.querySelector('i');
    if (icon) {
      icon.className = 'ph ph-identification-card text-trust-blue text-xs';
    }
    const btn = kycChecklistItem.querySelector('button');
    if (btn) {
      btn.textContent = t('kyc_complete_now', 'وثّق هويتك الآن');
      btn.addEventListener('click', () => {
        document.getElementById('kyc-section')?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }

  // INC-NEW-01 FIX: Back button wiring moved to shared page-header.ts.
  // Previous: 8 lines of duplicate code (identical to wallet.ts).
  // Now: initPageHeader() called at module top — single source of truth.
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
