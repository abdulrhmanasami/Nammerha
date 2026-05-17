/**
 * Nammerha — Breadcrumb Navigation Utility (GAP-007 FIX)
 *
 * Provides location context on deep pages. Users arriving via deep links,
 * bookmarks, or WhatsApp shares now see where they are in the hierarchy.
 *
 * Standard: Apple HIG — "People always know where they are in the app
 * and how to get to their next destination."
 *
 * Usage:
 *   import { renderBreadcrumb } from '../utils/breadcrumb';
 *   renderBreadcrumb('main-content', [
 *       { label: 'Projects', href: 'index.html', i18n: 'projects' },
 *       { label: 'BOQ Builder', i18n: 'engineer_boq_builder' }
 *   ]);
 */

// TICK-033: Import shared type-safe i18n apply utility.
import { tryApplyI18n } from '../utils/i18n-apply';

interface BreadcrumbItem {
    /** Display label (English fallback) */
    label: string;
    /** Link URL. If omitted, renders as plain text (current page). */
    href?: string;
    /** Optional i18n key for translation */
    i18n?: string;
    /** Optional Phosphor icon name */
    icon?: string;
}

/**
 * Static route hierarchy map. Defines the parent relationship
 * for all deep pages in the Nammerha platform.
 */
export const ROUTE_MAP: Record<string, BreadcrumbItem[]> = {
    'engineer-boq.html': [
        { label: 'Projects', href: 'index.html', i18n: 'projects', icon: 'squares-four' },
        { label: 'BOQ Builder', i18n: 'engineer_boq_builder', icon: 'clipboard-text' },
    ],
    'engineer-camera.html': [
        { label: 'Projects', href: 'index.html', i18n: 'projects', icon: 'squares-four' },
        { label: 'BOQ Builder', href: 'engineer-boq.html', i18n: 'engineer_boq_builder', icon: 'clipboard-text' },
        { label: 'Site Verification', i18n: 'site_verification', icon: 'camera' },
    ],
    // P2-003: donor-proof.html ERADICATED — Donation Eradication KI (May 2026)
    // UX-REM-I002 FIX: Contextual breadcrumb — shows origin portal.
    // PREVIOUS: Static 'Home > Project Details'. User loses context of WHERE
    // they came from (which portal? which tab?).
    // NOW: Detects document.referrer to inject origin portal in breadcrumb trail.
    // Standard: Nielsen #7 (Recognition), Spatial Orientation.
    'project-details.html': (() => {
        const referrer = typeof document !== 'undefined' ? document.referrer : '';
        const portalMap: Record<string, { href: string; label: string; i18n: string; icon: string }> = {
            'homeowner-portal': { href: 'homeowner-portal.html', label: 'Homeowner Portal', i18n: 'ws_homeowner', icon: 'house' },
            'engineer-portal': { href: 'engineer-portal.html', label: 'Engineer Portal', i18n: 'ws_engineer', icon: 'ruler' },
            'contractor-portal': { href: 'contractor-portal.html', label: 'Contractor Portal', i18n: 'ws_contractor', icon: 'hard-hat' },
            'supplier-dashboard': { href: 'supplier-dashboard.html', label: 'Supplier Dashboard', i18n: 'ws_supplier', icon: 'storefront' },
        };
        const crumbs: BreadcrumbItem[] = [
            { label: 'Home', href: 'index.html', i18n: 'home', icon: 'house' },
        ];
        // Check if referrer matches a known portal
        for (const [key, portal] of Object.entries(portalMap)) {
            if (referrer.includes(key)) {
                crumbs.push(portal);
                break;
            }
        }
        crumbs.push({ label: 'Project Details', i18n: 'project_details', icon: 'buildings' });
        return crumbs;
    })(),
    // P2-003: donor-basket.html ERADICATED — Donation Eradication KI (May 2026)
    'homeowner-report.html': [
        { label: 'Home', href: 'index.html', i18n: 'home', icon: 'house' },
        { label: 'Report Damage', i18n: 'report_damage', icon: 'warning' },
    ],
    // P3-UX-005 FIX: Extended breadcrumbs to high-traffic pages that were previously missing.
    // Previous: Only 6 deep pages had breadcrumbs. Portals, profile, wallet, and auth had none.
    // Standard: Nielsen #7 (Recognition), Spatial Orientation, WCAG 2.4.8 (Location).
    'profile.html': [
        { label: 'Home', href: 'index.html', i18n: 'home', icon: 'house' },
        { label: 'Profile', i18n: 'nav_profile', icon: 'user' },
    ],
    'wallet.html': [
        { label: 'Home', href: 'index.html', i18n: 'home', icon: 'house' },
        { label: 'Wallet', i18n: 'nav_wallet', icon: 'wallet' },
    ],
    'auth.html': [
        { label: 'Home', href: 'index.html', i18n: 'home', icon: 'house' },
        { label: 'Sign In', i18n: 'nav_sign_in', icon: 'sign-in' },
    ],
    'homeowner-portal.html': [
        { label: 'Home', href: 'index.html', i18n: 'home', icon: 'house' },
        { label: 'Homeowner Portal', i18n: 'ws_homeowner', icon: 'house' },
    ],
    'contractor-portal.html': [
        { label: 'Home', href: 'index.html', i18n: 'home', icon: 'house' },
        { label: 'Contractor Portal', i18n: 'ws_contractor', icon: 'hard-hat' },
    ],
    'engineer-portal.html': [
        { label: 'Home', href: 'index.html', i18n: 'home', icon: 'house' },
        { label: 'Engineer Portal', i18n: 'ws_engineer', icon: 'ruler' },
    ],
    'supplier-dashboard.html': [
        { label: 'Home', href: 'index.html', i18n: 'home', icon: 'house' },
        { label: 'Supplier Dashboard', i18n: 'ws_supplier', icon: 'storefront' },
    ],
    'tradesperson-portal.html': [
        { label: 'Home', href: 'index.html', i18n: 'home', icon: 'house' },
        { label: 'Tradesperson Portal', i18n: 'ws_tradesperson', icon: 'hammer' },
    ],
};

/**
 * Renders an accessible breadcrumb trail into the target container.
 * Injects at the TOP of the container as a <nav> element.
 *
 * @param containerId - ID of the parent element to inject into
 * @param crumbs - Optional override. If omitted, auto-detects from ROUTE_MAP.
 */
export function renderBreadcrumb(containerId: string, crumbs?: BreadcrumbItem[]): void {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    // Auto-detect from route map if no crumbs provided
    const items = crumbs ?? detectBreadcrumbs();
    if (items.length === 0) {
        return;
    }

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Breadcrumb');
    nav.className = 'breadcrumb-nav px-4 py-2 bg-slate-50/80 border-b border-slate-100';

    const ol = document.createElement('ol');
    ol.className = 'flex items-center gap-1 text-xs overflow-x-auto';

    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'flex items-center gap-1 whitespace-nowrap';

        // Separator (chevron) — skip for first item
        if (index > 0) {
            const sep = document.createElement('i');
            // Use RTL-safe chevron: CSS handles auto-flip via [dir="rtl"]
            sep.className = 'ph ph-caret-right text-slate-300 mx-0.5';
            sep.classList.add('text-3xs');
            sep.setAttribute('aria-hidden', 'true');
            li.appendChild(sep);
        }

        const isLast = index === items.length - 1;

        if (item.href && !isLast) {
            // Linked crumb (parent pages)
            const a = document.createElement('a');
            a.href = item.href;
            a.className = 'text-trust-blue hover:underline font-medium flex items-center gap-1';
            if (item.icon) {
                const icon = document.createElement('i');
                icon.className = `ph ph-${item.icon}`;
                icon.classList.add('text-xs');
                icon.setAttribute('aria-hidden', 'true');
                a.appendChild(icon);
            }
            const span = document.createElement('span');
            if (item.i18n) {
                span.setAttribute('data-i18n', item.i18n);
            }
            span.textContent = item.label;
            a.appendChild(span);
            li.appendChild(a);
        } else {
            // Current page (no link)
            const span = document.createElement('span');
            span.className = 'text-slate-500 font-semibold flex items-center gap-1';
            span.setAttribute('aria-current', 'page');
            if (item.icon) {
                const icon = document.createElement('i');
                icon.className = `ph ph-${item.icon}`;
                icon.classList.add('text-xs');
                icon.setAttribute('aria-hidden', 'true');
                span.appendChild(icon);
            }
            const text = document.createElement('span');
            if (item.i18n) {
                text.setAttribute('data-i18n', item.i18n);
            }
            text.textContent = item.label;
            span.appendChild(text);
            li.appendChild(span);
        }

        ol.appendChild(li);
    });

    nav.appendChild(ol);

    // Insert at top of container (after skip-link if present)
    const firstChild = container.firstElementChild;
    container.insertBefore(nav, firstChild);

    // TICK-033: Use shared type-safe tryApplyI18n() instead of unsafe window cast.
    // Previous: (window as unknown as Record<string, unknown>).applyI18n — PLT-AUD5-002 pattern.
    tryApplyI18n();
}

/**
 * Auto-detects breadcrumbs from the current page path using ROUTE_MAP.
 */
function detectBreadcrumbs(): BreadcrumbItem[] {
    const path = window.location.pathname;
    const filename = path.split('/').pop() ?? '';
    return ROUTE_MAP[filename] ?? [];
}

/**
 * Auto-initialize: call on pages that want automatic breadcrumbs.
 * Looks for data-breadcrumb attribute on the page container.
 */
export function initBreadcrumb(): void {
    // Auto-detect container (prefer main-content, fallback to first mobile-container)
    const container = document.getElementById('main-content')
        ?? document.querySelector('.mobile-container');

    if (container?.id) {
        renderBreadcrumb(container.id);
    }
}
