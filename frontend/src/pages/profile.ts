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

  // FORENSIC-C1.11 FIX: Filter out suspended 'donor' role from display.
  roles = roles.filter((r) => r !== 'donor');

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
        // FORENSIC-C1.11 FIX: 'donor' excluded — donation system suspended.
        !['admin', 'auditor', 'donor'].includes(r.role_name),
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
  clearAuth();
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
    setTimeout(() => toggleEditMode(false), 800);
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
      formPanel.classList.add('nm-hidden');
      caretIcon?.classList.remove('rotate-180');
    }
  });

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
    if (new_password.length < 8) {
      showToast(t('password_too_short', 'كلمة المرور قصيرة جداً'), 'error');
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
          // NOW: Shows a subtle 'Preview only' badge so users know.
          // Standard: Nielsen #1 (Visibility of System Status).
          let badge = avatarEl.querySelector('.nm-preview-badge');
          if (!badge) {
            badge = document.createElement('span');
            badge.className =
              'nm-preview-badge absolute bottom-0 inset-x-0 text-center text-3xs font-bold py-0.5 bg-amber-500/90 text-white rounded-b-full';
            badge.textContent = t('photo_preview_only', 'معاينة فقط');
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
          // PTR-FOCUS FIX: Replaced setTimeout(400) timing hack with immediate focus.
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
    function syncThemeUI(dark: boolean): void {
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
      setTimeout(() => {
        document.documentElement.classList.remove('nm-theme-transition');
      }, 500);
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
    if (!container) return;

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
          if (!deviceId) return;
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

  // Wire "Sign out all devices" button
  document.getElementById('v005-revoke-all-btn')?.addEventListener('click', async () => {
    if (
      !confirm(
        t('confirm_sign_out_all', 'تسجيل الخروج من جميع الأجهزة؟ ستحتاج لتسجيل الدخول مجدداً.'),
      )
    )
      return;
    try {
      await auth.revokeAllSessions();
      showToast(
        t('all_sessions_revoked', 'تم تسجيل الخروج من جميع الأجهزة. جاري التحويل...'),
        'success',
      );
      setTimeout(() => {
        window.location.href = '/auth.html';
      }, 1500);
    } catch {
      showToast(t('session_revoke_error', 'فشل تسجيل الخروج من الجهاز'), 'error');
    }
  });

  // Load sessions on page init
  loadActiveSessions();
  // F-001 FIX: KYC Dead-End Elimination — hide the section.
  if (kycSectionEl) {
    kycSectionEl.classList.add('nm-hidden');
  }

  // F-001: Transform the KYC completion checklist item into a non-clickable
  // "Coming soon" label instead of a focus-target that scrolls to nothing.
  const kycChecklistItem = document.querySelector('[data-completion="kyc"]');
  if (kycChecklistItem) {
    const icon = kycChecklistItem.querySelector('i');
    if (icon) {
      icon.className = 'ph ph-clock text-slate-300 text-xs';
    }
    const btn = kycChecklistItem.querySelector('button');
    if (btn) {
      const span = document.createElement('span');
      span.className = 'text-slate-400 dark:text-slate-500';
      span.setAttribute('data-i18n', 'kyc_coming_soon');
      span.textContent = t('kyc_coming_soon', 'التحقق من الهوية — قريباً');
      btn.replaceWith(span);
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
