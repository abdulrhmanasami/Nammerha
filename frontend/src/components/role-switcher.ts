// ============================================================================
// Nammerha — Role Switcher Component
// Self-injecting dropdown that attaches to any element with id="role-switcher-mount"
// Fetches user roles from API, displays active role, allows switching.
// ============================================================================
import { getCurrentUser, switchActiveRole, type UserRole } from '../auth';
import { reportError } from '../error-reporter';
import { roles as rolesApi } from '../api';
import '../styles/role-switcher.css';

// ─── Role Metadata ──────────────────────────────────────────────────────────
interface RoleMeta {
    icon: string;       // Phosphor icon name
    labelEn: string;
    labelAr: string;
    accentColor: string; // CSS custom property value
    dashboardUrl: string;
    verificationLabel: string; // DUP-001: Merged from profile.ts duplicate
}

const ROLE_META: Record<string, RoleMeta> = {
    donor: {
        icon: 'ph-hand-heart',
        labelEn: 'Donor',
        labelAr: 'مانح',
        accentColor: '#c0956c',  // warm-earth
        dashboardUrl: '/donor-portal.html',
        verificationLabel: 'Email Verified',
    },
    homeowner: {
        icon: 'ph-house',
        labelEn: 'Homeowner',
        labelAr: 'صاحب منزل',
        accentColor: '#2e7ddf',  // trust-blue
        dashboardUrl: '/homeowner-portal.html',
        verificationLabel: 'Property Proof',
    },
    engineer: {
        icon: 'ph-hard-hat',
        labelEn: 'Engineer',
        labelAr: 'مهندس',
        accentColor: '#5a8a7a',  // smoky-jade
        // LOW-001 FIX: Was incorrectly pointing to contractor-portal.html
        dashboardUrl: '/engineer-boq.html',
        verificationLabel: 'License Verified',
    },
    supplier: {
        icon: 'ph-truck',
        labelEn: 'Supplier',
        labelAr: 'مورّد',
        accentColor: '#d4a72c',  // warning-yellow
        dashboardUrl: '/supplier-dashboard.html',
        verificationLabel: 'Business KYB',
    },
    contractor: {
        icon: 'ph-buildings',
        labelEn: 'Contractor',
        labelAr: 'مقاول',
        accentColor: '#2e7ddf',  // trust-blue
        dashboardUrl: '/contractor-dashboard.html',
        verificationLabel: 'Licensed',
    },
    tradesperson: {
        icon: 'ph-wrench',
        labelEn: 'Tradesperson',
        labelAr: 'حرفي',
        accentColor: '#5a8a7a',  // smoky-jade
        dashboardUrl: '/tradesperson-portal.html',
        verificationLabel: 'Certified',
    },
    admin: {
        icon: 'ph-shield-check',
        labelEn: 'Admin',
        labelAr: 'مدير',
        accentColor: '#ef4444',  // red
        dashboardUrl: '/admin-dashboard.html',
        verificationLabel: 'System Admin',
    },
    auditor: {
        icon: 'ph-detective',
        labelEn: 'Auditor',
        labelAr: 'مدقق',
        accentColor: '#8b5cf6',  // purple
        dashboardUrl: '/compliance-dashboard.html',
        verificationLabel: 'Auditor',
    },
};

// ─── i18n Helper ────────────────────────────────────────────────────────────
function t(key: string, fallback: string): string {
    // Use global i18n bridge if available
    const bridge = (window as unknown as { __i18n_t?: (k: string, f: string) => string }).__i18n_t;
    if (bridge) { return bridge(key, fallback); }
    return fallback;
}

function isRTL(): boolean {
    return document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar';
}

// ─── Component State ────────────────────────────────────────────────────────
let isDropdownOpen = false;
let mountEl: HTMLElement | null = null;

/**
 * Get the display label for a role based on current locale.
 */
function getRoleLabel(role: string): string {
    const meta = ROLE_META[role];
    if (!meta) { return role; }
    return isRTL() ? meta.labelAr : meta.labelEn;
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
    return ROLE_META[role]?.accentColor ?? '#64748b';
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
    const color = meta?.accentColor ?? '#64748b';
    const icon = getRoleIcon(activeRole);
    const label = getRoleLabel(activeRole);
    const hasMultiRoles = user.roles.length > 1;

    mountEl.innerHTML = `
        <button class="role-switcher-trigger" 
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
                <button class="role-option" data-role="${role}" 
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
            <button class="role-add-btn">
                <i class="ph ph-plus-circle" aria-hidden="true"></i>
                <span>${t('add_role', 'Add a new role')}</span>
            </button>
        </div>`;
}

// ─── API Integration ────────────────────────────────────────────────────────

async function handleRoleSwitch(role: UserRole): Promise<void> {
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
