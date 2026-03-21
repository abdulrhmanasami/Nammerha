import '../styles/main.css';
import { escapeHtml as esc } from '../utils/xss';
import { reportWarning } from '../error-reporter';
// TICK-026: Import shared error-retry utility for consistent error recovery.
import { renderErrorWithRetry } from '../utils/error-retry';
import { phaseColor, phaseIcon, bidColor } from '../utils/status-colors';
import { contractor } from '../api';
import { getLocale, formatDate, applyI18n } from '../utils/locale';
// PLT-AUD-I004 FIX: Import t() for i18n-safe unit labels
import { t } from '../utils/i18n';
// PLT-AUD-I005 FIX: Use centralized formatCents (was inline Intl.NumberFormat)
import { formatCents } from '../utils/format';
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
// W6-001 FIX: Auth guard — was missing on this contractor page.
import { requireAuth } from '../utils/auth-guard';
initPullToRefresh();
initBackToTop();
autoTriggerTour();

/* ═══════════════════════════════════════════════════════════════════════════
   Contractor Dashboard — Project Execution & Bidding Engine
   PLT-2026-CRT-001 FIX: Rewired from engineer → contractor API namespace.
   The previous version imported { engineer } and displayed engineer data
   (proofs, spatial captures) on the contractor dashboard — a critical
   data wiring catastrophe discovered during the March 12 Platinum Audit.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // W6-001 FIX: Guard all protected content behind auth check.
    if (!requireAuth()) { return; }
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
        // LB-002 FIX: WCAG 4.1.2 — update aria-selected for screen reader parity
        tabProjects?.setAttribute('aria-selected', 'true');
        tabBids?.setAttribute('aria-selected', 'false');
        // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
        if (sectionProjects) { sectionProjects.classList.remove('nm-hidden'); }
        if (sectionBids) { sectionBids.classList.add('nm-hidden'); }
    } else {
        tabBids?.classList.add('bg-trust-blue/10', 'text-trust-blue');
        tabBids?.classList.remove('text-slate-600');
        tabProjects?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
        tabProjects?.classList.add('text-slate-600');
        // LB-002 FIX: WCAG 4.1.2 — update aria-selected for screen reader parity
        tabBids?.setAttribute('aria-selected', 'true');
        tabProjects?.setAttribute('aria-selected', 'false');
        // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
        if (sectionBids) { sectionBids.classList.remove('nm-hidden'); }
        if (sectionProjects) { sectionProjects.classList.add('nm-hidden'); }
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
        // W7-001 FIX: Show user-facing error state on KPI cards.
        // Previous: Silent freeze — KPI cards stayed in loading/default state forever.
        ['assigned-projects', 'active-bids', 'completed-projects', 'total-earnings'].forEach(name => {
            const el = document.querySelector<HTMLElement>(`[data-kpi="${name}"]`);
            if (el) { el.textContent = '—'; }
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
            // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
            if (loadingRow) { loadingRow.classList.add('nm-hidden'); }
            if (emptyRow) { emptyRow.classList.remove('nm-hidden'); }
            return;
        }

        // Remove loading and empty state rows before rendering data
        document.getElementById('projects-loading-row')?.remove();
        document.getElementById('projects-empty-row')?.remove();

        tbody.innerHTML = projects.map((p) => {
            const progress = Number(p['progress'] ?? 0);
            const progressColor = progress >= 75 ? 'bg-smoky-jade' : progress >= 40 ? 'bg-trust-blue' : 'bg-warning-yellow';
            return `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative transition-all dark:bg-dark-surface dark:border-dark-border">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(String(p['title'] ?? ''))}</h3>
                    <span class="text-3xs font-bold px-2 py-0.5 rounded-full ${phaseColor(String(p['phase'] ?? ''))} inline-flex items-center gap-1 uppercase">
                        <i class="ph ${phaseIcon(String(p['phase'] ?? ''))}" aria-hidden="true"></i>
                        ${esc(String(p['phase'] ?? ''))}
                    </span>
                </div>
                <div class="text-xs text-slate-500 mb-4 flex items-center gap-1.5 dark:text-slate-400">
                    <i class="ph ph-map-pin" aria-hidden="true"></i>
                    <span>${esc(String(p['region'] ?? ''))}</span>
                </div>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-dark-border">
                    <div class="flex items-center gap-2 flex-grow max-w-[60%]">
                        <span class="text-3xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500" data-i18n="contractor_th_progress">Progress</span>
                        <div class="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full ${progressColor} rounded-full nm-progress-bar" style="--progress:${progress}%"></div>
                        </div>
                        <span class="text-3xs font-bold text-slate-500 dark:text-slate-400">${esc(String(progress))}%</span>
                    </div>
                    <a href="contractor-portal.html?tab=marketplace"
                       class="text-xs font-semibold text-trust-blue hover:bg-trust-blue/5 px-2 py-1 flex items-center gap-1 rounded transition-colors border border-transparent hover:border-trust-blue/10">
                       <i class="ph ph-list-magnifying-glass" aria-hidden="true"></i>
                       <span data-i18n="browse_marketplace">Marketplace</span>
                    </a>
                </div>
            </div>`;
        }).join('');

        applyI18n();
    } catch (err) {
        // P1-PLT-003 FIX: Report post-fetch parsing errors that bypass api.ts reporter
        reportWarning('[ContractorDashboard] Project timeline load failed', {
            component: 'contractor-dashboard', action: 'load_timeline',
            error: err instanceof Error ? err.message : String(err),
        });
        // TICK-026: Use shared error-retry utility instead of manual innerHTML +=.
        // Previous: innerHTML += appended error row alongside hidden loading/empty rows.
        // renderErrorWithRetry provides consistent error display with retry button.
        // Standard: Design System Component Unity, Nielsen #9 (Error Recovery).
        renderErrorWithRetry(tbody, loadProjectTimeline);
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
            // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
            if (loadingRow) { loadingRow.classList.add('nm-hidden'); }
            if (emptyRow) { emptyRow.classList.remove('nm-hidden'); }
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
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative transition-all dark:bg-dark-surface dark:border-dark-border">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(String(b['project_title'] ?? ''))}</h3>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${bidColor(String(b['status'] ?? ''))}">
                        ${esc(String(b['status'] ?? ''))}
                    </span>
                </div>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-3 mt-3 dark:border-dark-border">
                    <div>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="contractor_th_proposed_cost">Proposed Cost</p>
                        <p class="font-mono font-bold text-slate-700 text-sm dark:text-slate-300">${costFormatted}</p>
                    </div>
                    <div>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="contractor_th_timeline">Timeline</p>
                        <p class="text-xs font-bold text-slate-700 text-center dark:text-slate-300">${esc(String(b['estimated_days']))} ${daysLabel}</p>
                    </div>
                    <div class="text-end">
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="contractor_th_submitted">Submitted</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${formatDate(String(b['submitted_at'] ?? ''))}</p>
                    </div>
                </div>
            </div>`;
        }).join('');

        applyI18n();
    } catch (err) {
        // P1-PLT-003 FIX: Report post-fetch parsing errors that bypass api.ts reporter
        reportWarning('[ContractorDashboard] Bids load failed', {
            component: 'contractor-dashboard', action: 'load_bids',
            error: err instanceof Error ? err.message : String(err),
        });
        // TICK-026: Use shared error-retry utility instead of manual innerHTML +=.
        renderErrorWithRetry(container, loadBids);
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
