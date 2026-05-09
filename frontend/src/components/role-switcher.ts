// ============================================================================
// Nammerha — Role Switcher Component
// Self-injecting dropdown that attaches to any element with id="role-switcher-mount"
// Fetches user roles from API, displays active role, allows switching.
// ============================================================================
import { getCurrentUser, switchActiveRole, type UserRole } from '../auth';
import { reportError } from '../error-reporter';
import { roles as rolesApi } from '../api';
import '../styles/role-switcher.css';
// TICK-027: Import shared i18n utilities instead of local duplicates.
// Previous: Local t() and isRTL() at L90-99 — identical to utils/i18n.ts.
// donor-portal, contractor-portal, tradesperson-portal already use shared versions.
// Standard: DRY Principle.
import { t } from '../utils/i18n';

// ─── Design Token Bridge ────────────────────────────────────────────────────
// PLT-AUD-DT001 FIX: Hardcoded hex values had DRIFTED from canonical Tailwind
// config (e.g. trust-blue: #2e7ddf vs canonical #1A73E8). Now reads live CSS
// custom properties at runtime. Hex fallbacks match tailwind.config.js exactly.
// Standard: Single Source of Truth, Design Token Governance.
const TOKEN_CACHE = new Map<string, string>();

function cssVar(name: string, fallback: string): string {
    const cached = TOKEN_CACHE.get(name);
    if (cached) { return cached; }
    if (typeof document === 'undefined') { return fallback; }
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(name).trim();
    const resolved = value || fallback;
    TOKEN_CACHE.set(name, resolved);
    return resolved;
}

// ─── Role Metadata ──────────────────────────────────────────────────────────
interface RoleMeta {
    icon: string;       // Phosphor icon name
    labelKey: string;   // Translation engine key
    labelFallback: string; // Translation engine fallback
    colorToken: string;    // CSS custom property name (e.g. '--trust-blue')
    colorFallback: string; // Hex fallback matching tailwind.config.js
    dashboardUrl: string;
    verificationLabel: string; // DUP-001: Merged from profile.ts duplicate
}

const ROLE_META: Record<string, RoleMeta> = {
    // DONATIONS_DISABLED: donor role hidden from role switcher
    // donor: {
    //     icon: 'ph-hand-heart',
    //     labelKey: 'role_donor',
    //     labelFallback: 'Donor',
    //     colorToken: '--warm-earth',
    //     colorFallback: '#D59F80',
    //     dashboardUrl: '/donor-portal.html',
    //     verificationLabel: 'Email Verified',
    // },
    homeowner: {
        icon: 'ph-house',
        labelKey: 'role_homeowner',
        labelFallback: 'Homeowner',
        colorToken: '--trust-blue',
        colorFallback: '#1A73E8',
        dashboardUrl: '/homeowner-portal.html',
        verificationLabel: 'Property Proof',
    },
    engineer: {
        icon: 'ph-hard-hat',
        labelKey: 'role_engineer',
        labelFallback: 'Engineer',
        colorToken: '--smoky-jade',
        colorFallback: '#109173',
        // LOW-001 FIX: Was incorrectly pointing to contractor-portal.html
        dashboardUrl: '/engineer-boq.html',
        verificationLabel: 'License Verified',
    },
    supplier: {
        icon: 'ph-truck',
        labelKey: 'role_supplier',
        labelFallback: 'Supplier',
        colorToken: '--warning-yellow',
        colorFallback: '#FCC934',
        dashboardUrl: '/supplier-dashboard.html',
        verificationLabel: 'Business KYB',
    },
    contractor: {
        icon: 'ph-buildings',
        labelKey: 'role_contractor',
        labelFallback: 'Contractor',
        colorToken: '--trust-blue',
        colorFallback: '#1A73E8',
        dashboardUrl: '/contractor-dashboard.html',
        verificationLabel: 'Licensed',
    },
    tradesperson: {
        icon: 'ph-wrench',
        labelKey: 'role_tradesperson',
        labelFallback: 'Tradesperson',
        colorToken: '--smoky-jade',
        colorFallback: '#109173',
        dashboardUrl: '/tradesperson-portal.html',
        verificationLabel: 'Certified',
    },
    admin: {
        icon: 'ph-shield-check',
        labelKey: 'role_admin',
        labelFallback: 'Admin',
        colorToken: '--red-500',
        colorFallback: '#ef4444',
        dashboardUrl: '/admin-dashboard.html',
        verificationLabel: 'System Admin',
    },
    auditor: {
        icon: 'ph-detective',
        labelKey: 'role_auditor',
        labelFallback: 'Auditor',
        colorToken: '--violet-500',
        colorFallback: '#8b5cf6',
        dashboardUrl: '/compliance-dashboard.html',
        verificationLabel: 'Auditor',
    },
};

// TICK-027: Local t() and isRTL() removed — now imported from ../utils/i18n (line 12).
// Previous: Duplicate implementations violating DRY principle.

// ─── Component State ────────────────────────────────────────────────────────
let isDropdownOpen = false;
let mountEl: HTMLElement | null = null;

/**
 * Get the display label for a role based on current locale.
 */
function getRoleLabel(role: string): string {
    const meta = ROLE_META[role];
    if (!meta) { return role; }
    return t(meta.labelKey, meta.labelFallback);
}

/**
 * Get Phosphor icon class for a role.
 */
function getRoleIcon(role: string): string {
    return ROLE_META[role]?.icon ?? 'ph-user-circle';
}

/**
 * Get accent color for a role.
 */
function getRoleColor(role: string): string {
    const meta = ROLE_META[role];
    if (!meta) { return cssVar('--slate-500', '#64748b'); }
    return cssVar(meta.colorToken, meta.colorFallback);
}

/**
 * Get dashboard URL for a role.
 */
function getDashboardUrl(role: string): string {
    return ROLE_META[role]?.dashboardUrl ?? '/';
}

// ─── Render ─────────────────────────────────────────────────────────────────

function renderSwitcher(): void {
    if (!mountEl) { return; }
    const user = getCurrentUser();
    if (!user) {
        // Not logged in — show login prompt
        mountEl.innerHTML = `
            <a href="/auth.html" class="role-switcher-login" aria-label="${t('sign_in', 'Sign In')}">
                <i class="ph ph-sign-in" aria-hidden="true"></i>
                <span>${t('sign_in', 'Sign In')}</span>
            </a>`;
        return;
    }

    const activeRole = user.activeRole ?? user.role;
    const meta = ROLE_META[activeRole];
    const color = meta ? cssVar(meta.colorToken, meta.colorFallback) : cssVar('--slate-500', '#64748b');
    const icon = getRoleIcon(activeRole);
    const label = getRoleLabel(activeRole);
    const hasMultiRoles = user.roles.length > 1;

    mountEl.innerHTML = `
        <button type="button" class="role-switcher-trigger" 
                aria-expanded="${isDropdownOpen}" 
                aria-haspopup="listbox"
                aria-label="${t('switch_role', 'Switch Role')}"
                style="--role-color: ${color}">
            <span class="role-switcher-badge nm-role-badge-bg">
                <i class="ph ${icon}" aria-hidden="true"></i>
                <span class="role-switcher-label">${label}</span>
                ${hasMultiRoles ? '<i class="ph ph-caret-down role-switcher-caret" aria-hidden="true"></i>' : ''}
            </span>
        </button>
        ${isDropdownOpen ? renderDropdown(user.roles, activeRole) : ''}`;

    // Bind events
    const trigger = mountEl.querySelector('.role-switcher-trigger');
    trigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        // LOW-002 FIX: Only toggle dropdown for multi-role users
        // Single-role users get navigated directly to profile to add roles
        if (hasMultiRoles) {
            isDropdownOpen = !isDropdownOpen;
            renderSwitcher();
        } else {
            window.location.href = '/profile.html?tab=roles';
        }
    });

    // Role option clicks
    mountEl.querySelectorAll<HTMLButtonElement>('.role-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const role = btn.dataset.role as UserRole;
            handleRoleSwitch(role);
        });
    });

    // "Add Role" button
    const addBtn = mountEl.querySelector('.role-add-btn');
    addBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        // Navigate to profile page with role activation tab
        window.location.href = '/profile.html?tab=roles';
    });

    // Dashboard shortcut
    mountEl.querySelectorAll<HTMLAnchorElement>('.role-dashboard-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            isDropdownOpen = false;
        });
    });

    // ── NMR-RS-004 FIX: Escape key to close dropdown ──────────────────────
    // WCAG 2.1 SC 2.1.1 (Keyboard): Dropdown must be dismissible via Escape.
    // NMR-RS-005 FIX: Arrow key navigation within listbox.
    // WAI-ARIA Listbox Pattern: ArrowDown/ArrowUp move focus, Home/End jump.
    const dropdown = mountEl.querySelector<HTMLElement>('.role-switcher-dropdown');
    if (dropdown) {
        dropdown.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                isDropdownOpen = false;
                renderSwitcher();
                // Return focus to trigger button
                const triggerBtn = mountEl?.querySelector<HTMLButtonElement>('.role-switcher-trigger');
                triggerBtn?.focus();
                return;
            }

            // Arrow key navigation between role options
            const options = Array.from(dropdown.querySelectorAll<HTMLButtonElement>('.role-option'));
            if (options.length === 0) { return; }
            const currentIdx = options.findIndex(opt => opt === document.activeElement);

            let nextIdx = -1;
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    nextIdx = currentIdx < options.length - 1 ? currentIdx + 1 : 0;
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    nextIdx = currentIdx > 0 ? currentIdx - 1 : options.length - 1;
                    break;
                case 'Home':
                    e.preventDefault();
                    nextIdx = 0;
                    break;
                case 'End':
                    e.preventDefault();
                    nextIdx = options.length - 1;
                    break;
            }
            if (nextIdx >= 0) {
                const target = options[nextIdx];
                if (target) { target.focus(); }
            }
        });
    }
}

function renderDropdown(roles: UserRole[], activeRole: UserRole): string {
    const roleItems = roles.map(role => {
        const isActive = role === activeRole;
        const icon = getRoleIcon(role);
        const label = getRoleLabel(role);
        const color = getRoleColor(role);
        const dashUrl = getDashboardUrl(role);

        return `
            <div class="role-option-row ${isActive ? 'role-option-active' : ''}">
                <button type="button" class="role-option" data-role="${role}" 
                        role="option" aria-selected="${isActive}">
                    <span class="role-option-icon nm-role-icon-bg" style="--role-color: ${color}">
                        <i class="ph ${icon}" aria-hidden="true"></i>
                    </span>
                    <span class="role-option-label">${label}</span>
                    ${isActive ? '<i class="ph ph-check-circle role-option-check nm-role-check" aria-hidden="true" style="--role-color: ' + color + '"></i>' : ''}
                </button>
                <a href="${dashUrl}" class="role-dashboard-link" 
                   title="${t('go_to_dashboard', 'Go to dashboard')}"
                   aria-label="${label} ${t('dashboard', 'Dashboard')}">
                    <i class="ph ph-arrow-square-out" aria-hidden="true"></i>
                </a>
            </div>`;
    }).join('');

    return `
        <div class="role-switcher-dropdown" role="listbox" aria-label="${t('your_roles', 'Your Roles')}">
            <div class="role-dropdown-header">
                <span>${t('your_roles', 'Your Roles')}</span>
                <span class="role-dropdown-count">${roles.length}</span>
            </div>
            <div class="role-dropdown-list">
                ${roleItems}
            </div>
            <button type="button" class="role-add-btn">
                <i class="ph ph-plus-circle" aria-hidden="true"></i>
                <span>${t('add_role', 'Add a new role')}</span>
            </button>
        </div>`;
}

// ─── API Integration ────────────────────────────────────────────────────────

let isSwitchingTransaction = false;

async function handleRoleSwitch(role: UserRole): Promise<void> {
    if (isSwitchingTransaction) { return; }
    const user = getCurrentUser();
    if (!user || role === user.activeRole) {
        isDropdownOpen = false;
        renderSwitcher();
        return;
    }

    // LOW-004 FIX: Capture previous role BEFORE optimistic switch for correct rollback
    const previousRole = user.activeRole;

    // Optimistic update — switch locally first
    switchActiveRole(role);
    isDropdownOpen = false;
    renderSwitcher();

    isSwitchingTransaction = true;

    // Sync with backend
    try {
        // SEC-002 FIX: Was raw fetch() without CSRF token — CSRF vulnerability.
        // Now uses centralized api.ts with automatic CSRF, 30s timeout, and error reporting.
        const result = await rolesApi.switch(role);

        if (!result.success) {
            throw new Error(result.error ?? 'Switch failed');
        }

        // Navigate to the role's dashboard
        const dashUrl = getDashboardUrl(role);
        if (window.location.pathname !== dashUrl) {
            window.location.href = dashUrl;
        }
    } catch (err) {
        reportError(err instanceof Error ? err : new Error(String(err)), {
            context: 'role_switch',
            targetRole: role,
        });
        // LOW-004 FIX: Revert to the PREVIOUS role (not the mutated one)
        switchActiveRole(previousRole);
        renderSwitcher();
    } finally {
        isSwitchingTransaction = false;
    }
}

// ─── Close on Outside Click ─────────────────────────────────────────────────
function handleDocumentClick(): void {
    if (isDropdownOpen) {
        isDropdownOpen = false;
        renderSwitcher();
    }
}

// ─── Self-Injection on DOMContentLoaded ─────────────────────────────────────
function init(): void {
    mountEl = document.getElementById('role-switcher-mount');
    if (!mountEl) { return; }

    renderSwitcher();
    document.addEventListener('click', handleDocumentClick);

    // Re-render when role switches (from other components)
    window.addEventListener('role:switched', () => {
        renderSwitcher();
    });

    // Re-render when auth state changes
    window.addEventListener('storage', (e) => {
        if (e.key === 'nammerha_auth') {
            renderSwitcher();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for programmatic use
export { ROLE_META, getRoleLabel, getRoleIcon, getRoleColor, getDashboardUrl };
