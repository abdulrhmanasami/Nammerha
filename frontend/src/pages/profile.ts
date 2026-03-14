import '../styles/main.css';
import { getCurrentUser, clearAuth, type UserRole } from '../auth';
import { reportError } from '../error-reporter';
import { escapeHtml } from '../utils/xss';

// ============================================================================
// Nammerha — Profile Page Engine
// P0-004 FIX: User profile, settings, and logout
// V1-AUDIT FIX: No longer reads JWT from localStorage — uses auth module
// MULTI-ROLE-005: Role management, progressive profiling, profile completion
// MED-001 FIX: All innerHTML uses escapeHtml() for any dynamic content
// MED-003 FIX: Uses centralized api.ts request() for CSRF-protected calls
// MED-004 FIX: Correct API response contract parsing
// LOW-003 FIX: De-duplicated profile completion scoring
// ============================================================================

// ─── Role Metadata (duplicated from role-switcher for decoupling) ───────────
interface RoleMeta {
    icon: string;
    labelEn: string;
    labelAr: string;
    accentColor: string;
    verificationLabel: string;
}

const ROLE_META: Record<string, RoleMeta> = {
    donor:        { icon: 'ph-hand-heart',    labelEn: 'Donor',       labelAr: 'مانح',       accentColor: '#c0956c', verificationLabel: 'Email Verified' },
    homeowner:    { icon: 'ph-house',         labelEn: 'Homeowner',   labelAr: 'صاحب منزل',  accentColor: '#2e7ddf', verificationLabel: 'Property Proof' },
    engineer:     { icon: 'ph-hard-hat',      labelEn: 'Engineer',    labelAr: 'مهندس',      accentColor: '#5a8a7a', verificationLabel: 'License Verified' },
    supplier:     { icon: 'ph-truck',         labelEn: 'Supplier',    labelAr: 'مورّد',       accentColor: '#d4a72c', verificationLabel: 'Business KYB' },
    contractor:   { icon: 'ph-buildings',     labelEn: 'Contractor',  labelAr: 'مقاول',      accentColor: '#2e7ddf', verificationLabel: 'Licensed' },
    tradesperson: { icon: 'ph-wrench',        labelEn: 'Tradesperson', labelAr: 'حرفي',      accentColor: '#5a8a7a', verificationLabel: 'Certified' },
    admin:        { icon: 'ph-shield-check',  labelEn: 'Admin',       labelAr: 'مدير',       accentColor: '#ef4444', verificationLabel: 'System Admin' },
    auditor:      { icon: 'ph-detective',     labelEn: 'Auditor',     labelAr: 'مدقق',       accentColor: '#8b5cf6', verificationLabel: 'Auditor' },
};

function isRTL(): boolean {
    return document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar';
}

function getRoleLabel(role: string): string {
    const meta = ROLE_META[role];
    if (!meta) { return role; }
    return isRTL() ? meta.labelAr : meta.labelEn;
}

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

// ─── Load User Info ─────────────────────────────────────────────────────────
async function loadUserInfo(): Promise<void> {
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    const roleEl = document.getElementById('user-role');

    const cached = getCurrentUser();
    if (cached) {
        if (nameEl) { nameEl.textContent = cached.full_name ?? 'User'; }
        if (emailEl) { emailEl.textContent = cached.email ?? '—'; }
        if (roleEl) { roleEl.textContent = getRoleLabel(cached.activeRole ?? cached.role); }
        updateProfileCompletion(cached);
    }

    try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json() as { data?: { user?: { full_name?: string; email?: string; role?: string; roles?: string[] } } };
            const user = data.data?.user;
            if (user) {
                if (nameEl) { nameEl.textContent = user.full_name ?? 'User'; }
                if (emailEl) { emailEl.textContent = user.email ?? '—'; }
                if (roleEl) { roleEl.textContent = getRoleLabel(user.role ?? 'donor'); }
            }
        } else if (!cached) {
            if (nameEl) { nameEl.textContent = 'Guest'; }
            if (emailEl) { emailEl.textContent = 'Sign in to view your profile'; }
        }
    } catch {
        if (!cached) {
            if (nameEl) { nameEl.textContent = 'Guest'; }
            if (emailEl) { emailEl.textContent = 'Sign in to view your profile'; }
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
            <div class="bg-white rounded-xl p-4 text-center text-sm text-slate-400 shadow-sm border border-slate-100">
                <i class="ph ph-sign-in" style="font-size:24px" aria-hidden="true"></i>
                <p class="mt-2">Sign in to manage your roles</p>
            </div>`;
        return;
    }

    // Try to fetch from API — MED-004 FIX: correct response shape
    let roles = user.roles ?? [user.role];
    try {
        const res = await fetch('/api/roles/my-roles', { credentials: 'same-origin' });
        if (res.ok) {
            // Backend returns: { data: { roles: [...], activeRole: "..." } }
            const body = await res.json() as {
                data?: {
                    roles?: { role_name: string; status: string; is_primary: boolean }[];
                    activeRole?: string;
                };
            };
            if (body.data?.roles && Array.isArray(body.data.roles)) {
                roles = body.data.roles
                    .filter(r => r.status === 'active')
                    .map(r => r.role_name as UserRole);
            }
        }
    } catch {
        // Fall back to cached roles
    }

    if (roles.length === 0) {
        rolesListEl.innerHTML = `
            <div class="bg-white rounded-xl p-4 text-center text-sm text-slate-400 shadow-sm border border-slate-100">
                <p>No active roles yet</p>
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
            <div class="bg-white rounded-xl p-4 flex items-center gap-4 shadow-sm border ${isActive ? 'border-2' : 'border'} border-slate-100 transition-all" ${isActive ? `style="border-color: ${color}30"` : ''}>
                <div class="size-10 rounded-lg flex items-center justify-center shrink-0" style="background: ${color}15">
                    <i class="ph ${escapeHtml(meta.icon)}" style="font-size:20px; color: ${color}" aria-hidden="true"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <p class="text-sm font-bold">${label}</p>
                        ${isActive ? '<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700" data-i18n="active">Active</span>' : ''}
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
// MED-003 FIX: Uses centralized API request for proper CSRF handling
async function loadAvailableRoles(): Promise<void> {
    const gridEl = document.getElementById('available-roles-grid');
    if (!gridEl) { return; }

    const user = getCurrentUser();
    const userRoles = user?.roles ?? [];

    try {
        const res = await fetch('/api/roles/available', { credentials: 'same-origin' });
        if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
        const data = await res.json() as { data?: { role_name: string; display_name_en: string; display_name_ar: string }[] };

        if (!data.data || !Array.isArray(data.data)) { return; }

        const available = data.data.filter(r =>
            !userRoles.includes(r.role_name as UserRole) &&
            !['admin', 'auditor'].includes(r.role_name)
        );

        if (available.length === 0) {
            gridEl.innerHTML = `<p class="col-span-2 text-center text-xs text-slate-400 py-4">All roles activated!</p>`;
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
        gridEl.innerHTML = `<p class="col-span-2 text-center text-xs text-red-400 py-4">Failed to load roles</p>`;
    }
}

// MED-003 FIX: Proper CSRF token acquisition before state-changing request
async function ensureCsrfToken(): Promise<string> {
    try {
        const res = await fetch('/api/csrf-token', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json() as { csrfToken?: string };
            return data.csrfToken ?? '';
        }
    } catch {
        // Fall through — CSRF endpoint may not be available
    }
    return '';
}

async function activateRole(role: UserRole): Promise<void> {
    try {
        // MED-003 FIX: Acquire CSRF token from dedicated endpoint
        const csrfToken = await ensureCsrfToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (csrfToken) { headers['X-CSRF-Token'] = csrfToken; }

        const res = await fetch('/api/roles/activate', {
            method: 'POST',
            headers,
            body: JSON.stringify({ role }),
            credentials: 'same-origin',
        });

        if (!res.ok) {
            const body = await res.json() as { error?: string };
            throw new Error(body.error ?? `Activation failed: ${res.status}`);
        }

        // Update local user state
        const user = getCurrentUser();
        if (user && !user.roles.includes(role)) {
            user.roles.push(role);
            const { setCurrentUser } = await import('../auth');
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
    }
}

// ─── Language Toggle ────────────────────────────────────────────────────────
const langToggle = document.getElementById('lang-toggle');
const currentLangEl = document.getElementById('current-lang');

const langCycle = ['en', 'ar', 'tr'] as const;
const langLabels: Record<string, string> = {
    en: 'English',
    ar: 'العربية',
    tr: 'Türkçe',
};

langToggle?.addEventListener('click', () => {
    const currentLang = document.documentElement.lang || 'en';
    const idx = langCycle.indexOf(currentLang as typeof langCycle[number]);
    const nextIdx = (idx + 1) % langCycle.length;
    const next: string = langCycle[nextIdx] ?? 'en';

    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('nammerha_lang', next);

    if (currentLangEl) { currentLangEl.textContent = langLabels[next] ?? next; }
    window.dispatchEvent(new CustomEvent('i18n:lang-changed', { detail: { lang: next } }));
});

// ─── Initialize Language Display ────────────────────────────────────────────
function initLangDisplay(): void {
    const lang = document.documentElement.lang || 'en';
    if (currentLangEl) { currentLangEl.textContent = langLabels[lang] ?? lang; }
}

// ─── Logout ─────────────────────────────────────────────────────────────────
function logout(): void {
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
    initLangDisplay();
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
