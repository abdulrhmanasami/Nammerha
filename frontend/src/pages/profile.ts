import '../styles/main.css';
import { getCurrentUser, clearAuth, setCurrentUser, type UserRole } from '../auth';
import { reportError, reportWarning } from '../error-reporter';
import { escapeHtml } from '../utils/xss';
import { renderErrorWithRetry } from '../utils/error-retry';
import { auth, roles as rolesApi } from '../api';
// DUP-001 FIX: Import ROLE_META and helpers from role-switcher (single source of truth)
// instead of maintaining a duplicate copy.
import { ROLE_META, getRoleLabel } from '../components/role-switcher';
import { t, isRTL } from '../utils/i18n';

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
    const avatarEl = document.querySelector('.size-20.bg-trust-blue');
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
    if (barEl) { barEl.style.width = `${pct}%`; }
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
                <i class="ph ph-sign-in" style="font-size:24px" aria-hidden="true"></i>
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
        const color = meta.accentColor;
        const verLabel = escapeHtml(meta.verificationLabel);

        return `
            <div class="bg-surface rounded-xl p-4 flex items-center gap-4 shadow-sm border ${isActive ? 'border-2' : 'border'} border-slate-100 transition-all" ${isActive ? `style="border-color: ${color}30"` : ''}>
                <div class="size-10 rounded-lg flex items-center justify-center shrink-0" style="background: ${color}15">
                    <i class="ph ${escapeHtml(meta.icon)}" style="font-size:20px; color: ${color}" aria-hidden="true"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <p class="text-sm font-bold">${label}</p>
                        ${isActive ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700" data-i18n="active">${t('profile_active', 'Active')}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-1 mt-0.5">
                        <i class="ph ph-shield-check text-emerald-500" style="font-size:12px" aria-hidden="true"></i>
                        <span class="text-[10px] text-slate-400">${verLabel}</span>
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
            const color = meta.accentColor;

            return `
                <button class="activate-role-btn flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-2 hover:shadow-sm transition-all text-center"
                        data-role="${escapeHtml(r.role_name)}"
                        style="--role-color: ${color}">
                    <div class="size-10 rounded-lg flex items-center justify-center" style="background: ${color}15">
                        <i class="ph ${escapeHtml(meta.icon)}" style="font-size:20px; color: ${color}" aria-hidden="true"></i>
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
        // P1-F6 FIX: Show user-visible error banner in the modal.
        // Previous: error was only sent to telemetry — user saw nothing.
        const gridEl = document.getElementById('available-roles-grid');
        if (gridEl) {
            const errorBanner = document.createElement('div');
            errorBanner.className = 'col-span-2 rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 animate-fade-in-up';
            errorBanner.innerHTML = `<i class="ph ph-warning-circle" aria-hidden="true"></i> ${t('role_activation_failed', 'Role activation failed. Please try again.')}`;
            gridEl.prepend(errorBanner);
            setTimeout(() => errorBanner.remove(), 5000);
        }
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

// ─── Initialize ─────────────────────────────────────────────────────────────
function init(): void {
    loadUserInfo();
    loadUserRoles();

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

    // P1-MOB-001 FIX: Back button handler (replaced inline onclick for CSP safety)
    const backBtn = document.querySelector<HTMLAnchorElement>('[data-back-btn]');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            if (history.length > 1) {
                e.preventDefault();
                history.back();
            }
            // else: falls through to <a href="index.html"> naturally
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
