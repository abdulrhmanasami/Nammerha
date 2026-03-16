import '../styles/main.css';
import { escapeHtml as esc } from '../utils/xss';
import { reportWarning } from '../error-reporter';
import { phaseColor, phaseIcon, bidColor } from '../utils/status-colors';
import { contractor } from '../api';
import { getLocale, formatDate, applyI18n } from '../utils/locale';
// PLT-AUD-I004 FIX: Import t() for i18n-safe unit labels
import { t } from '../utils/i18n';
// PLT-AUD-I005 FIX: Use centralized formatCents (was inline Intl.NumberFormat)
import { formatCents } from '../utils/format';
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';

/* ═══════════════════════════════════════════════════════════════════════════
   Contractor Dashboard — Project Execution & Bidding Engine
   PLT-2026-CRT-001 FIX: Rewired from engineer → contractor API namespace.
   The previous version imported { engineer } and displayed engineer data
   (proofs, spatial captures) on the contractor dashboard — a critical
   data wiring catastrophe discovered during the March 12 Platinum Audit.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTimestamp();
    loadKPIs();
    loadProjectTimeline();
    setupTabs();
    initNotificationBell();
});

// ─── PLT-AUD-G002 FIX: Notification Bell ────────────────────────────────────
// Previously: #notification-bell was a complete dead UI element — no handler.
// Now: tapping bell navigates to bids tab (badge shows active_bids count).
function initNotificationBell(): void {
    const bell = document.getElementById('notification-bell');
    if (!bell) { return; }
    bell.addEventListener('click', () => {
        const count = document.getElementById('notif-count')?.textContent?.trim();
        if (count && count !== '0') {
            switchDashTab('bids');
        }
    });
}

// ─── Live Timestamp ─────────────────────────────────────────────────────────
function initTimestamp(): void {
    const el = document.getElementById('live-timestamp');
    if (!el) { return; }

    const update = (): void => {
        const now = new Date();
        // PLAT-AUD-005 FIX: Use centralized getLocale() instead of inline detection.
        el.textContent = now.toLocaleString(getLocale(), {
            weekday: 'short', month: 'short', day: 'numeric',
            year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };
    update();
    // M-002 FIX: Store interval ID and clear on page unload to prevent
    // ghost intervals from accumulating during SPA-like navigation.
    const intervalId = setInterval(update, 1000);
    window.addEventListener('beforeunload', () => clearInterval(intervalId));
}

// P1-003 FIX: Hash-based tab routing
const CONTRACTOR_TABS = ['projects', 'bids'] as const;
type ContractorDashTab = typeof CONTRACTOR_TABS[number];
const ctrHashRouter = createHashRouter(CONTRACTOR_TABS, 'projects');

// ─── Tab Switching ──────────────────────────────────────────────────────────
function setupTabs(): void {
    const tabProjects = document.getElementById('tab-projects');
    const tabBids = document.getElementById('tab-bids');

    tabProjects?.addEventListener('click', () => switchDashTab('projects'));
    tabBids?.addEventListener('click', () => switchDashTab('bids'));

    // P1-003 FIX: Activate from URL hash
    const initial = ctrHashRouter.getInitialTab();
    switchDashTab(initial);
    ctrHashRouter.onHashChange(switchDashTab);

    // P1-MOB-003 FIX: Swipe gestures for native-app tab navigation
    initSwipeTabs({
        containerSelector: '.dashboard-main',
        tabs: CONTRACTOR_TABS as unknown as readonly string[],
        onSwitch: switchDashTab as (tab: string) => void,
        getCurrentTab: () => ctrHashRouter.getInitialTab(),
    });
}

function switchDashTab(tab: ContractorDashTab): void {
    ctrHashRouter.setActiveTab(tab);
    const tabProjects = document.getElementById('tab-projects');
    const tabBids = document.getElementById('tab-bids');
    const sectionProjects = document.getElementById('section-projects');
    const sectionBids = document.getElementById('section-bids');

    if (tab === 'projects') {
        tabProjects?.classList.add('bg-trust-blue/10', 'text-trust-blue');
        tabProjects?.classList.remove('text-slate-600');
        tabBids?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
        tabBids?.classList.add('text-slate-600');
        if (sectionProjects) { sectionProjects.style.display = ''; }
        if (sectionBids) { sectionBids.style.display = 'none'; }
    } else {
        tabBids?.classList.add('bg-trust-blue/10', 'text-trust-blue');
        tabBids?.classList.remove('text-slate-600');
        tabProjects?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
        tabProjects?.classList.add('text-slate-600');
        if (sectionBids) { sectionBids.style.display = ''; }
        if (sectionProjects) { sectionProjects.style.display = 'none'; }
        loadBids();
    }
}

// ─── Load KPIs from contractor.getStats() ───────────────────────────────────
// PLT-2026-CRT-001: Uses contractor stats shape:
//   { assigned_projects, completed_projects, active_bids, total_earnings }
async function loadKPIs(): Promise<void> {
    try {
        const res = await contractor.getStats();
        if (!res.data) { return; }
        const data = res.data;

        setKPI('assigned-projects', data.assigned_projects ?? 0);
        setKPI('active-bids', data.active_bids ?? 0);
        setKPI('completed-projects', data.completed_projects ?? 0);
        setKPI('total-earnings', data.total_earnings ?? 0, '$');

        // Badge counts
        const projectCount = document.getElementById('project-count');
        if (projectCount) { projectCount.textContent = String(data.assigned_projects ?? 0); }
        const bidCount = document.getElementById('bid-count');
        if (bidCount) { bidCount.textContent = String(data.active_bids ?? 0); }
    } catch (err) {
        // P1-PLT-003 FIX: Report post-fetch parsing errors that bypass api.ts reporter
        reportWarning('[ContractorDashboard] KPI load failed', {
            component: 'contractor-dashboard', action: 'load_kpis',
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

// ─── Load Project Timeline from contractor.getProjects() ────────────────────
async function loadProjectTimeline(): Promise<void> {
    const tbody = document.getElementById('project-timeline-body');
    if (!tbody) { return; }

    try {
        const res = await contractor.getProjects();
        const projects = (res.data ?? []) as unknown as Array<Record<string, string | number>>;

        if (projects.length === 0) {
            // GAP-02 FIX: Use enriched HTML empty state instead of inline fallback
            const loadingRow = document.getElementById('projects-loading-row');
            const emptyRow = document.getElementById('projects-empty-row');
            if (loadingRow) { loadingRow.style.display = 'none'; }
            if (emptyRow) { emptyRow.style.display = ''; }
            return;
        }

        // Remove loading and empty state rows before rendering data
        document.getElementById('projects-loading-row')?.remove();
        document.getElementById('projects-empty-row')?.remove();

        tbody.innerHTML = projects.map((p) => {
            const progress = Number(p['progress'] ?? 0);
            const progressColor = progress >= 75 ? 'bg-smoky-jade' : progress >= 40 ? 'bg-trust-blue' : 'bg-warning-yellow';
            return `
            <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(String(p['title'] ?? ''))}</td>
                <td class="px-5 py-3 text-slate-500">${esc(String(p['region'] ?? ''))}</td>
                <td class="px-5 py-3">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${phaseColor(String(p['phase'] ?? ''))} inline-flex items-center gap-1">
                        <i class="ph ${phaseIcon(String(p['phase'] ?? ''))}" aria-hidden="true"></i>
                        ${esc(String(p['phase'] ?? ''))}
                    </span>
                </td>
                <td class="px-5 py-3">
                    <div class="flex items-center gap-2">
                        <div class="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full ${progressColor} rounded-full" style="width:${progress}%"></div>
                        </div>
                        <span class="text-[10px] font-bold text-slate-500">${progress}%</span>
                    </div>
                </td>
                <td class="px-5 py-3">
                    <a href="contractor-portal.html?tab=marketplace"
                       class="text-xs font-semibold text-trust-blue hover:underline flex items-center gap-1">
                       <i class="ph ph-list-magnifying-glass" aria-hidden="true"></i>
                       <span data-i18n="browse_marketplace">Browse Marketplace</span>
                    </a>
                </td>
            </tr>`;
        }).join('');

        applyI18n();
    } catch (err) {
        // P1-PLT-003 FIX: Report post-fetch parsing errors that bypass api.ts reporter
        reportWarning('[ContractorDashboard] Project timeline load failed', {
            component: 'contractor-dashboard', action: 'load_timeline',
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

// ─── Load My Bids from contractor.getBids() ─────────────────────────────────
async function loadBids(): Promise<void> {
    const container = document.getElementById('bids-body');
    if (!container) { return; }

    try {
        const res = await contractor.getBids();
        const bids = (res.data ?? []) as unknown as Array<Record<string, string | number | null>>;

        if (bids.length === 0) {
            // GAP-02 FIX: Use enriched HTML empty state instead of inline fallback
            const loadingRow = document.getElementById('bids-loading-row');
            const emptyRow = document.getElementById('bids-empty-row');
            if (loadingRow) { loadingRow.style.display = 'none'; }
            if (emptyRow) { emptyRow.style.display = ''; }
            return;
        }

        // Remove loading and empty state rows before rendering data
        document.getElementById('bids-loading-row')?.remove();
        document.getElementById('bids-empty-row')?.remove();

        container.innerHTML = bids.map((b) => {
            // PLT-AUD-I005 FIX: Use centralized formatCents (was inline Intl.NumberFormat)
            const costFormatted = formatCents(Number(b['proposed_cost']) || 0);
            // PLT-AUD-I004 FIX: Use i18n t() instead of hardcoded lang switch
            const daysLabel = t('unit_days', 'days');

            return `
            <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(String(b['project_title'] ?? ''))}</td>
                <td class="px-5 py-3 font-mono">${costFormatted}</td>
                <td class="px-5 py-3 text-slate-500">${b['estimated_days']} ${daysLabel}</td>
                <td class="px-5 py-3">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${bidColor(String(b['status'] ?? ''))}">
                        ${esc(String(b['status'] ?? ''))}
                    </span>
                </td>
                <td class="px-5 py-3 text-slate-500 text-xs">${formatDate(String(b['submitted_at'] ?? ''))}</td>
            </tr>
        `}).join('');

        applyI18n();
    } catch (err) {
        // P1-PLT-003 FIX: Report post-fetch parsing errors that bypass api.ts reporter
        reportWarning('[ContractorDashboard] Bids load failed', {
            component: 'contractor-dashboard', action: 'load_bids',
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

// ─── Utilities ──────────────────────────────────────────────────────────────
function setKPI(name: string, value: number, prefix = ''): void {
    const el = document.querySelector<HTMLElement>(`[data-kpi="${name}"]`);
    if (!el) { return; }

    const duration = 1200;
    const start = performance.now();
    // PLAT-AUD-005 FIX: Use centralized getLocale() instead of inline detection.
    const locale = getLocale();

    const tick = (now: number): void => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        if (prefix === '$') {
            const current = Math.round((value / 100) * eased);
            el.textContent = new Intl.NumberFormat(locale, {
                style: 'currency', currency: 'USD', minimumFractionDigits: 0,
            }).format(current);
        } else {
            const current = Math.round(value * eased);
            el.textContent = current.toLocaleString(locale);
        }
        if (progress < 1) { requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
}

// PLAT-AUD-005 FIX: formatDate and applyI18n are now imported from utils/locale.
