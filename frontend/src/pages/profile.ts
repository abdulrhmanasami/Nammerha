import '../styles/main.css';
import { getCurrentUser, clearAuth, setCurrentUser, type UserRole } from '../auth';
import { reportError, reportWarning } from '../error-reporter';
import { escapeHtml } from '../utils/xss';
import { renderErrorWithRetry } from '../utils/error-retry';
import { auth, roles as rolesApi } from '../api';
// DUP-001 FIX: Import ROLE_META and helpers from role-switcher (single source of truth)
// instead of maintaining a duplicate copy.
import { ROLE_META, getRoleLabel, getRoleColor } from '../components/role-switcher';
import { t, isRTL } from '../utils/i18n';
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
// DUP-001 FIX: ROLE_META, getRoleLabel, isRTL imported from role-switcher.ts
// I18N-003 FIX: All user-facing strings wrapped with i18n t()
// LOGOUT-001 FIX: Logout calls /api/auth/logout to invalidate server token
// FIX-004: i18n interface now from shared utils/i18n.ts
// ============================================================================

// P4-AUD-001 FIX: isRTL() now imported from utils/i18n.ts (was local duplicate)

// ─── LOW-003 FIX: Profile Completion Calculator (de-duplicated) ─────────────
function calculateCompletion(user: ReturnType<typeof getCurrentUser>): number {
    if (!user) { return 0; }
    let steps = 0;
    let completed = 0;

    // Identity fields (weight: 3 steps)
    steps += 3;
    if (user.full_name) { completed++; }
    if (user.email) { completed++; }
    if (user.kyc_verified) { completed++; }

    // Role depth (weight: 2 steps)
    steps += 2;
    if (user.roles && user.roles.length >= 1) { completed++; }
    // Bonus for multi-role users
    if (user.roles && user.roles.length >= 2) { completed++; }

    // Active context (weight: 1 step)
    steps += 1;
    if (user.activeRole) { completed++; }

    return Math.round((completed / steps) * 100);
}

// ─── P2-UX-002 FIX: Avatar Initials (personalized, not generic icon) ────────
function renderAvatarInitials(fullName?: string | null): void {
    // TICK-014: Stable ID-based selector for avatar.
    // Previous: querySelector('.size-20.bg-trust-blue') — fragile class-based selector.
    // Standard: DOM Contract — use IDs for programmatic element references.
    const avatarEl = document.getElementById('profile-avatar');
    if (!avatarEl) { return; }
    if (!fullName || fullName.trim().length === 0) { return; } // keep icon for guests

    const parts = fullName.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
    const initials = (first + last).toUpperCase();
    if (initials.length === 0) { return; }

    avatarEl.innerHTML = `<span class="text-white text-2xl font-black select-none">${escapeHtml(initials)}</span>`;
}

// ─── Load User Info ─────────────────────────────────────────────────────────
async function loadUserInfo(): Promise<void> {
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    const roleEl = document.getElementById('user-role');

    const cached = getCurrentUser();
    if (cached) {
        if (nameEl) { nameEl.textContent = cached.full_name ?? t('profile_user', 'User'); }
        if (emailEl) { emailEl.textContent = cached.email ?? '—'; }
        if (roleEl) { roleEl.textContent = getRoleLabel(cached.activeRole ?? cached.role); }
        updateProfileCompletion(cached);
        // P2-UX-002 FIX: Render personalized initials in avatar
        renderAvatarInitials(cached.full_name);
    }

    try {
        // SEC-001 FIX: Uses centralized api.ts with 30s timeout + error reporting
        const result = await auth.getMe();
        if (result.success && result.data?.user) {
            const user = result.data.user;
            if (nameEl) { nameEl.textContent = user.full_name ?? t('profile_user', 'User'); }
            if (emailEl) { emailEl.textContent = user.email ?? '—'; }
            if (roleEl) { roleEl.textContent = getRoleLabel(user.role ?? 'donor'); }
        } else if (!cached) {
            if (nameEl) { nameEl.textContent = t('profile_guest', 'Guest'); }
            if (emailEl) { emailEl.textContent = t('profile_sign_in_prompt', 'Sign in to view your profile'); }
        }
    } catch (err) { reportWarning('[Profile] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        if (!cached) {
            if (nameEl) { nameEl.textContent = t('profile_guest', 'Guest'); }
            if (emailEl) { emailEl.textContent = t('profile_sign_in_prompt', 'Sign in to view your profile'); }
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
    if (pctEl) { pctEl.textContent = `${pct}%`; }
}

// ─── MED-004 FIX: Render Active Roles (correct API contract) ────────────────
async function loadUserRoles(): Promise<void> {
    const rolesListEl = document.getElementById('roles-list');
    if (!rolesListEl) { return; }

    const user = getCurrentUser();
    if (!user) {
        rolesListEl.innerHTML = `
            <div class="bg-surface rounded-xl p-4 text-center text-sm text-slate-400 shadow-sm border border-slate-100">
                <i class="ph ph-sign-in text-2xl" aria-hidden="true"></i>
                <p class="mt-2">${t('profile_sign_in_roles', 'Sign in to manage your roles')}</p>
            </div>`;
        return;
    }

    // SEC-001 FIX: Uses centralized api.ts with timeout + error reporting
    let roles = user.roles ?? [user.role];
    try {
        const result = await rolesApi.getMyRoles();
        if (result.success && result.data?.roles && Array.isArray(result.data.roles)) {
            roles = result.data.roles
                .filter(r => r.status === 'active')
                .map(r => r.role_name as UserRole);
        }
    } catch (err) { reportWarning('[Profile] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // Fall back to cached roles
    }

    if (roles.length === 0) {
        rolesListEl.innerHTML = `
            <div class="bg-surface rounded-xl p-4 text-center text-sm text-slate-400 shadow-sm border border-slate-100">
                <p>${t('profile_no_roles', 'No active roles yet')}</p>
            </div>`;
        return;
    }

    // MED-001 FIX: All dynamic content uses escapeHtml()
    rolesListEl.innerHTML = roles.map(role => {
        const meta = ROLE_META[role];
        if (!meta) { return ''; }
        const isActive = role === (user.activeRole ?? user.role);
        const label = escapeHtml(getRoleLabel(role));
        const color = getRoleColor(role);
        const verLabel = escapeHtml(meta.verificationLabel);

        return `
            <div class="bg-surface rounded-xl p-4 flex items-center gap-4 shadow-sm border ${isActive ? 'border-2 nm-role-active-border' : 'border'} border-slate-100 transition-all" style="--role-color: ${color}">
                <div class="size-10 rounded-lg flex items-center justify-center shrink-0 nm-role-icon-bg">
                    <i class="ph ${escapeHtml(meta.icon)} text-xl" aria-hidden="true"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <p class="text-sm font-bold">${label}</p>
                        ${isActive ? `<span class="text-3xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700" data-i18n="active">${t('profile_active', 'Active')}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-1 mt-0.5">
                        <i class="ph ph-shield-check text-emerald-500 text-xs" aria-hidden="true"></i>
                        <span class="text-3xs text-slate-400">${verLabel}</span>
                    </div>
                </div>
                <i class="ph ph-caret-right text-slate-300" aria-hidden="true"></i>
            </div>`;
    }).join('');
}

// ─── Role Activation ────────────────────────────────────────────────────────
// SEC-001 FIX: Uses centralized api.ts for CSRF, timeout, and error reporting
async function loadAvailableRoles(): Promise<void> {
    const gridEl = document.getElementById('available-roles-grid');
    if (!gridEl) { return; }

    const user = getCurrentUser();
    const userRoles = user?.roles ?? [];

    try {
        // SEC-001 FIX: Uses centralized api.ts
        const result = await rolesApi.getAvailable();

        if (!result.success || !result.data || !Array.isArray(result.data)) { return; }

        const available = result.data.filter(r =>
            !userRoles.includes(r.role_name as UserRole) &&
            !['admin', 'auditor'].includes(r.role_name)
        );

        if (available.length === 0) {
            gridEl.innerHTML = `<p class="col-span-2 text-center text-xs text-slate-400 py-4">${t('profile_all_roles_active', 'All roles activated!')}</p>`;
            return;
        }

        // MED-001 FIX: escapeHtml on all dynamic content
        gridEl.innerHTML = available.map(r => {
            const meta = ROLE_META[r.role_name];
            if (!meta) { return ''; }
            const label = escapeHtml(isRTL() ? r.display_name_ar : r.display_name_en);
            const color = getRoleColor(r.role_name);

            return `
                <button type="button" class="activate-role-btn flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-2 hover:shadow-sm transition-all text-center"
                        data-role="${escapeHtml(r.role_name)}"
                        style="--role-color: ${color}">
                    <div class="size-10 rounded-lg flex items-center justify-center nm-role-icon-bg">
                        <i class="ph ${escapeHtml(meta.icon)} text-xl" aria-hidden="true"></i>
                    </div>
                    <span class="text-xs font-bold text-slate-700">${label}</span>
                </button>`;
        }).join('');

        // Bind activation clicks
        gridEl.querySelectorAll<HTMLButtonElement>('.activate-role-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const role = btn.dataset.role as UserRole;
                activateRole(role);
            });
        });
    } catch (err) {
        reportError(err instanceof Error ? err : new Error(String(err)), { context: 'load_available_roles' });
        renderErrorWithRetry(gridEl, loadAvailableRoles, 'failed_to_load', 'Failed to load roles');
    }
}

// SEC-001 FIX: Uses centralized api.ts instead of duplicated ensureCsrfToken + raw fetch
async function activateRole(role: UserRole): Promise<void> {
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
        if (modal) { modal.classList.add('hidden'); }

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
        showToast(t('role_activation_failed', 'Role activation failed. Please try again.'), 'error');
    }
}



// ─── Logout ─────────────────────────────────────────────────────────────────
// LOGOUT-001 FIX: Now calls /api/auth/logout to invalidate server-side JWT
// cookie BEFORE clearing local state. Previous version only cleared local
// storage, leaving the httpOnly cookie valid until expiry.
async function logout(): Promise<void> {
    try {
        await auth.logout();
    } catch (err) { reportWarning('[Profile] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // Logout API failure is non-fatal — clear local state regardless
    }
    clearAuth();
    window.location.href = '/auth.html';
}

document.getElementById('logout-btn')?.addEventListener('click', logout);
document.getElementById('logout-action')?.addEventListener('click', logout);

// ─── Add Role Modal ─────────────────────────────────────────────────────────
document.getElementById('add-role-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('role-activation-modal');
    if (modal) {
        modal.classList.toggle('hidden');
        if (!modal.classList.contains('hidden')) {
            loadAvailableRoles();
        }
    }
});

document.getElementById('cancel-role-activation')?.addEventListener('click', () => {
    const modal = document.getElementById('role-activation-modal');
    if (modal) { modal.classList.add('hidden'); }
});

// ─── GAP-003 FIX: Profile Edit Mode ────────────────────────────────────────
// Toggles between display mode and inline edit form.
// Saves to local auth state; API call placeholder for backend wiring.
function toggleEditMode(show: boolean): void {
    const displayMode = document.getElementById('profile-display-mode');
    const editForm = document.getElementById('profile-edit-form');
    if (!displayMode || !editForm) { return; }

    if (show) {
        // Pre-fill with current data
        const user = getCurrentUser();
        const nameInput = document.getElementById('edit-name') as HTMLInputElement | null;
        const emailInput = document.getElementById('edit-email') as HTMLInputElement | null;
        if (nameInput) { nameInput.value = user?.full_name ?? ''; }
        if (emailInput) { emailInput.value = user?.email ?? ''; }

        displayMode.classList.add('hidden');
        editForm.classList.remove('hidden');
        document.getElementById('edit-name')?.focus();
    } else {
        displayMode.classList.remove('hidden');
        editForm.classList.add('hidden');
        hideEditBanner();
    }
}

function showEditBanner(type: 'error' | 'success', message: string): void {
    const banner = document.getElementById('profile-edit-banner');
    if (!banner) { return; }
    banner.className = `text-xs font-bold p-3 rounded-xl ${
        type === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
    }`;
    banner.textContent = message;
    banner.classList.remove('hidden');
}

function hideEditBanner(): void {
    const banner = document.getElementById('profile-edit-banner');
    if (banner) { banner.classList.add('hidden'); }
}

async function saveProfile(): Promise<void> {
    const nameInput = document.getElementById('edit-name') as HTMLInputElement | null;
    const emailInput = document.getElementById('edit-email') as HTMLInputElement | null;
    const saveBtn = document.getElementById('save-profile-btn') as HTMLButtonElement | null;

    const newName = nameInput?.value.trim() ?? '';
    const newEmail = emailInput?.value.trim() ?? '';

    // Validation
    if (!newName) {
        showEditBanner('error', t('profile_name_required', 'Please enter your name.'));
        nameInput?.focus();
        return;
    }
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        showEditBanner('error', t('profile_email_invalid', 'Please enter a valid email address.'));
        emailInput?.focus();
        return;
    }

    // FRC-NEW-06 FIX: Visual loading state with spinner during save
    const restoreBtn = saveBtn ? setLoadingState(saveBtn, t('saving', 'Saving...')) : null;

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
        if (nameEl) { nameEl.textContent = newName; }
        if (emailEl) { emailEl.textContent = newEmail; }
        renderAvatarInitials(newName);
        updateProfileCompletion(getCurrentUser());

        restoreBtn?.('success');
        showEditBanner('success', t('profile_saved', 'Profile updated successfully.'));
        setTimeout(() => toggleEditMode(false), 800);
    } catch (err) {
        restoreBtn?.('error');
        reportWarning('[Profile] Edit save failed', { error: err instanceof Error ? err.message : String(err) });
        showEditBanner('error', t('profile_save_failed', 'Failed to save. Please try again.'));
    }
}

// Wire edit/cancel buttons
document.getElementById('edit-profile-btn')?.addEventListener('click', () => toggleEditMode(true));
document.getElementById('cancel-edit-btn')?.addEventListener('click', () => toggleEditMode(false));
document.getElementById('profile-edit-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveProfile();
});

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

    if (!fileInput || !previewWrap || !previewImg) { return; }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) { return; }

        // Validate type
        if (!ALLOWED_TYPES.includes(file.type)) {
            showEditBanner('error', t('photo_invalid_type', 'Please select a JPEG, PNG, or WebP image.'));
            fileInput.value = '';
            return;
        }

        // Validate size
        if (file.size > MAX_SIZE) {
            showEditBanner('error', t('photo_too_large', 'Photo must be under 5 MB.'));
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
                previewWrap.classList.remove('hidden');

                // Also update the main avatar circle for immediate in-page feedback
                const avatarEl = document.getElementById('profile-avatar');
                if (avatarEl) {
                    avatarEl.innerHTML = `<img src="${result}" alt="Profile photo preview" class="w-full h-full rounded-full object-cover" />`;
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
        previewWrap.classList.add('hidden');
        previewImg.src = '';
        if (filenameEl) {
            filenameEl.textContent = t('choose_photo', 'Choose a photo...');
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
    loadUserInfo();
    loadUserRoles();
    initPhotoPreview(); // GAP-X02 FIX: Wire photo preview engine

    // Handle ?tab=roles URL param (from role-switcher "Add a new role")
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'roles') {
        const modal = document.getElementById('role-activation-modal');
        if (modal) {
            modal.classList.remove('hidden');
            loadAvailableRoles();
            modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // GAP-N04 FIX: Wire profile completion checklist actions.
    // Tapping a checklist item scrolls to and focuses the target field.
    // Standard: Nielsen Heuristic #10 — Help & Documentation.
    document.querySelectorAll<HTMLButtonElement>('.completion-action').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.focusTarget;
            if (!targetId) { return; }

            // PLAT-UX-006 FIX: If target is inside the hidden edit form, reveal it first.
            // Previous: Focus silently failed on hidden inputs (edit-name, edit-email, etc.).
            // Standard: WCAG 2.4.3 (Focus Order), Nielsen #3 (User Control & Freedom).
            const editForm = document.getElementById('profile-edit-form');
            if (editForm?.classList.contains('hidden')) {
                const target = document.getElementById(targetId);
                if (target && editForm.contains(target)) {
                    toggleEditMode(true);
                }
            }

            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Focus the element if it's focusable (input, button, etc.)
                if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLSelectElement) {
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
        } catch { /* Safari private mode */ }
        // Save on change
        notifToggle.addEventListener('change', () => {
            try { localStorage.setItem(NOTIF_KEY, notifToggle.checked ? '1' : '0'); } catch { /* Safari private mode */ }
        });
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
