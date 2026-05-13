/* ═══════════════════════════════════════════════════════════════════════════
   Nammerha — Engineer Portal Dashboard (engineer-portal.ts)
   E1 IMPLEMENTATION: Full engineer dashboard — Projects, Bids, Captures.
   Mirrors contractor-dashboard.ts pattern exactly.

   Auth (JWT, dev-mode X-User-Id, CSRF) is handled by the canonical request()
   wrapper — including 30s AbortController timeout for Syria's network conditions.
   ═══════════════════════════════════════════════════════════════════════════ */
import '../styles/main.css';
import { signalHydrated } from '../utils/hydration';
import { escapeHtml as esc } from '../utils/xss';
import { reportWarning } from '../error-reporter';
import { renderErrorWithRetry } from '../utils/error-retry';
import { engineer, auth as authApi } from '../api';
import { clearAuth } from '../auth';
import { getLocale, applyI18n } from '../utils/locale';
import { t } from '../utils/i18n';
import { formatCents, relativeTimeAgo } from '../utils/format';
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
import { requireAuth } from '../utils/auth-guard';
import { haptic } from '../utils/haptic';
// P1-UX-002 FIX: Standardized empty state component
import { renderEmptyState } from '../utils/empty-state';
// P1-UX-003 FIX: Service Worker registration on all portal pages
import { bootstrapPortal } from '../utils/portal-bootstrap';
// P1-UX-001 FIX: SWR cache for perceived-instant tab switching
import { swrFetch } from '../utils/swr-cache';
// NOTE: Sidebar is loaded via <script src="/sidebar.js"> in engineer-portal.html

initPullToRefresh();
initBackToTop();
autoTriggerTour();

// ─── Types (local rendering shapes) ─────────────────────────────────────────
interface EngineerProject {
    project_id: string;
    title: string;
    region: string;
    status: string;
    phase: string;
    progress: number;
    boq_count: number;
    next_proof_due: string | null;
    created_at: string;
}

interface EngineerBid {
    bid_id: string;
    project_id: string;
    project_title: string;
    proposed_cost: number;
    estimated_days: number;
    cover_letter: string | null;
    status: string;
    engineer_score_snapshot: number | null;
    submitted_at: string;
    responded_at: string | null;
}

interface EngineerCapture {
    capture_id: string;
    project_id: string;
    project_title: string;
    capture_type: string;
    construction_phase: string;
    title: string | null;
    file_url: string;
    is_verified: boolean;
    captured_at: string;
}

interface EngineerStats {
    assigned_projects: number;
    proofs_pending: number;
    proofs_verified: number;
    escrow_released: number;
    active_bids: number;
    total_bids: number;
}


// ─── Live Timestamp ─────────────────────────────────────────────────────────
function initLiveTimestamp(): void {
    const el = document.getElementById('live-timestamp');
    if (!el) { return; }
    const update = (): void => {
        const locale = getLocale();
        el.textContent = new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    };
    update();
    const intervalId = setInterval(update, 1000);
    window.addEventListener('beforeunload', () => clearInterval(intervalId));
}

// ─── Tab Routing ────────────────────────────────────────────────────────────
const ENGINEER_TABS = ['projects', 'bids', 'captures'] as const;
type EngineerTab = typeof ENGINEER_TABS[number];
const engineerHashRouter = createHashRouter(ENGINEER_TABS, 'projects');

function setupTabs(): void {
    document.getElementById('tab-projects')?.addEventListener('click', () => switchTab('projects'));
    document.getElementById('tab-bids')?.addEventListener('click', () => switchTab('bids'));
    document.getElementById('tab-captures')?.addEventListener('click', () => switchTab('captures'));

    const initial = engineerHashRouter.getInitialTab();
    switchTab(initial);
    engineerHashRouter.onHashChange(switchTab);

    initSwipeTabs({
        containerSelector: '.dashboard-main',
        tabs: ENGINEER_TABS as unknown as readonly string[],
        onSwitch: switchTab as (tab: string) => void,
        getCurrentTab: () => engineerHashRouter.getInitialTab(),
    });
}

function switchTab(tab: EngineerTab): void {
    engineerHashRouter.setActiveTab(tab);
    const tabIds = { projects: 'tab-projects', bids: 'tab-bids', captures: 'tab-captures' };
    const sectionIds = { projects: 'section-projects', bids: 'section-bids', captures: 'section-captures' };

    for (const [key, tabId] of Object.entries(tabIds)) {
        const tabEl = document.getElementById(tabId);
        const sectionEl = document.getElementById(sectionIds[key as EngineerTab]);
        if (key === tab) {
            tabEl?.classList.add('bg-trust-blue/10', 'text-trust-blue');
            tabEl?.classList.remove('text-slate-600');
            tabEl?.setAttribute('aria-selected', 'true');
            sectionEl?.classList.remove('nm-hidden');
        } else {
            tabEl?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
            tabEl?.classList.add('text-slate-600');
            tabEl?.setAttribute('aria-selected', 'false');
            sectionEl?.classList.add('nm-hidden');
        }
    }

    // Lazy-load tab data
    if (tab === 'bids') { loadBids(); }
    if (tab === 'captures') { loadCaptures(); }
}


// ─── Load KPIs ──────────────────────────────────────────────────────────────
async function loadKPIs(): Promise<void> {
    try {
        const res = await swrFetch('eng-stats', () => engineer.getStats(), {
            maxAge: 120_000, // 2 minutes
        });
        if (!res.data) { return; }
        const data = res.data as unknown as EngineerStats;

        setKPI('assigned-projects', data.assigned_projects ?? 0);
        setKPI('proofs-pending', data.proofs_pending ?? 0);
        setKPI('proofs-verified', data.proofs_verified ?? 0);
        setKPI('escrow-released', data.escrow_released ?? 0, '$');

        const bidCount = document.getElementById('notif-count');
        if (bidCount && data.active_bids > 0) {
            bidCount.textContent = String(data.active_bids);
            bidCount.classList.remove('nm-hidden');
        }

        // W5-005: KPI timestamp for data freshness trust signal
        const kpiTimestamp = document.getElementById('kpi-last-updated');
        if (kpiTimestamp) {
            kpiTimestamp.textContent = t('kpi_just_updated', 'Updated just now');
            kpiTimestamp.dataset.timestamp = new Date().toISOString();
        }
    } catch (err) {
        reportWarning('[EngineerPortal] KPI load failed', { error: err instanceof Error ? err.message : String(err) });
        ['kpi-assigned-projects', 'kpi-proofs-pending', 'kpi-proofs-verified', 'kpi-escrow-released'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = '—'; }
        });
    }
}

// ─── Load Projects ──────────────────────────────────────────────────────────
async function loadProjects(): Promise<void> {
    const container = document.getElementById('projects-body');
    if (!container) { return; }

    try {
        const res = await swrFetch('eng-projects', () => engineer.getProjects());
        const items = (res.data ?? []) as unknown as EngineerProject[];

        if (!items || items.length === 0) {
            container.innerHTML = renderEmptyState({
                icon: 'buildings',
                title: t('eng_no_projects', 'No assigned projects yet'),
                subtitle: t('eng_no_projects_desc', 'Projects will appear here once assigned by the platform.'),
            });
            return;
        }

        container.innerHTML = items.map((p, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${i * 50}ms">
                <div class="flex justify-between items-start mb-3">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(p.title)}</h3>
                    <span class="text-3xs font-bold px-2 py-0.5 rounded-full uppercase ${phaseColor(p.phase)}">${esc(phaseLabel(p.phase))}</span>
                </div>
                <div class="flex items-center gap-4 text-xs text-slate-500 mb-3 dark:text-slate-400">
                    <span class="flex items-center gap-1"><i class="ph ph-map-pin text-sm" aria-hidden="true"></i> ${esc(p.region || t('eng_no_region', 'N/A'))}</span>
                    <span class="flex items-center gap-1"><i class="ph ph-list-checks text-sm" aria-hidden="true"></i> ${esc(String(p.boq_count))} ${esc(t('eng_boq_items', 'BOQ items'))}</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden dark:bg-dark-elevated">
                        <div class="h-full bg-trust-blue rounded-full transition-all" style="width: ${Math.min(p.progress, 100)}%"></div>
                    </div>
                    <span class="text-xs font-bold text-slate-600 dark:text-slate-300">${p.progress}%</span>
                </div>
                <div class="mt-3 flex gap-2">
                    <a href="engineer-boq.html?project=${p.project_id}" class="text-3xs font-bold text-trust-blue hover:underline flex items-center gap-1">
                        <i class="ph ph-list-checks" aria-hidden="true"></i> ${esc(t('eng_view_boq', 'View BOQ'))}
                    </a>
                    <a href="engineer-camera.html?project=${p.project_id}" class="text-3xs font-bold text-smoky-jade hover:underline flex items-center gap-1">
                        <i class="ph ph-camera" aria-hidden="true"></i> ${esc(t('eng_capture', 'Capture'))}
                    </a>
                </div>
            </div>
        `).join('');

        applyI18n();
    } catch (err) {
        reportWarning('[EngineerPortal] Projects load failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadProjects);
    }
}

// ─── Load Bids ──────────────────────────────────────────────────────────────
async function loadBids(): Promise<void> {
    const container = document.getElementById('bids-body');
    if (!container) { return; }

    try {
        const res = await engineer.getBids();
        const items = (res.data ?? []) as unknown as EngineerBid[];

        if (!items || items.length === 0) {
            container.innerHTML = renderEmptyState({
                icon: 'flag-banner',
                title: t('eng_no_bids', 'No bids submitted yet'),
            });
            return;
        }

        container.innerHTML = items.map((b, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${i * 50}ms">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(b.project_title)}</h3>
                    <span class="text-3xs font-bold px-2 py-0.5 rounded-full uppercase ${bidStatusColor(b.status)}">${esc(bidStatusLabel(b.status))}</span>
                </div>
                <div class="flex items-center justify-between border-t border-slate-100 pt-3 mt-2 dark:border-dark-border">
                    <div>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500">${esc(t('eng_proposed_cost', 'Proposed Cost'))}</p>
                        <p class="font-mono font-bold text-sm text-smoky-jade dark:text-emerald-400">${formatCents(b.proposed_cost)}</p>
                    </div>
                    <div class="text-center">
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500">${esc(t('eng_est_days', 'Est. Days'))}</p>
                        <p class="font-bold text-sm text-slate-700 dark:text-slate-300">${b.estimated_days}</p>
                    </div>
                    <div class="text-end">
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500">${esc(t('eng_submitted', 'Submitted'))}</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${relativeTimeAgo(b.submitted_at)}</p>
                    </div>
                </div>
            </div>
        `).join('');

        applyI18n();
    } catch (err) {
        reportWarning('[EngineerPortal] Bids load failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadBids);
    }
}

// ─── Load Captures ──────────────────────────────────────────────────────────
async function loadCaptures(): Promise<void> {
    const container = document.getElementById('captures-body');
    if (!container) { return; }

    try {
        const res = await engineer.getCaptures(20);
        const items = (res.data ?? []) as unknown as EngineerCapture[];

        if (!items || items.length === 0) {
            container.innerHTML = renderEmptyState({
                icon: 'camera',
                title: t('eng_no_captures', 'No captures yet'),
                subtitle: t('eng_no_captures_desc', 'Start capturing field evidence using the Field Camera.'),
            });
            return;
        }

        container.innerHTML = items.map((c, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4 dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${i * 50}ms">
                <div class="size-14 rounded-lg bg-slate-100 overflow-hidden shrink-0 dark:bg-dark-elevated">
                    <img src="${esc(c.file_url)}" alt="${esc(c.title ?? 'Capture')}" class="size-14 object-cover" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'size-14 flex items-center justify-center\\'><i class=\\'ph ph-image-broken text-slate-400 text-xl\\'></i></div>'" />
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <h3 class="font-bold text-sm text-slate-900 truncate dark:text-slate-100">${esc(c.title ?? c.construction_phase)}</h3>
                        ${c.is_verified
                            ? `<span class="text-3xs font-bold px-1.5 py-0.5 rounded-full bg-smoky-jade/10 text-smoky-jade flex items-center gap-0.5"><i class="ph ph-seal-check text-xs" aria-hidden="true"></i> ${esc(t('eng_verified', 'Verified'))}</span>`
                            : `<span class="text-3xs font-bold px-1.5 py-0.5 rounded-full bg-warning-yellow/10 text-warning-yellow">${esc(t('eng_pending', 'Pending'))}</span>`
                        }
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5 dark:text-slate-400">${esc(c.project_title)}</p>
                    <p class="text-3xs text-slate-400 mt-0.5 dark:text-slate-500">${relativeTimeAgo(c.captured_at)}</p>
                </div>
            </div>
        `).join('');

        applyI18n();
    } catch (err) {
        reportWarning('[EngineerPortal] Captures load failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadCaptures);
    }
}

// ─── Phase/Status Helpers ───────────────────────────────────────────────────
function phaseColor(phase: string): string {
    switch (phase?.toLowerCase()) {
        case 'planning': return 'bg-trust-blue/10 text-trust-blue';
        case 'in_progress': case 'construction': return 'bg-warning-yellow/10 text-warning-yellow';
        case 'completed': case 'delivered': return 'bg-smoky-jade/10 text-smoky-jade';
        default: return 'bg-slate-100 text-slate-600 dark:bg-dark-elevated dark:text-slate-400';
    }
}

function phaseLabel(phase: string): string {
    switch (phase?.toLowerCase()) {
        case 'planning': return t('eng_phase_planning', 'Planning');
        case 'in_progress': return t('eng_phase_in_progress', 'In Progress');
        case 'construction': return t('eng_phase_construction', 'Construction');
        case 'completed': return t('eng_phase_completed', 'Completed');
        case 'delivered': return t('eng_phase_delivered', 'Delivered');
        case 'published': return t('eng_phase_published', 'Published');
        default: return phase;
    }
}

function bidStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
        case 'pending': return 'bg-warning-yellow/10 text-warning-yellow';
        case 'accepted': return 'bg-smoky-jade/10 text-smoky-jade';
        case 'rejected': return 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400';
        default: return 'bg-slate-100 text-slate-600 dark:bg-dark-elevated dark:text-slate-400';
    }
}

function bidStatusLabel(status: string): string {
    switch (status?.toLowerCase()) {
        case 'pending': return t('eng_bid_pending', 'Pending');
        case 'accepted': return t('eng_bid_accepted', 'Accepted');
        case 'rejected': return t('eng_bid_rejected', 'Rejected');
        default: return status;
    }
}

// ─── KPI Animation ──────────────────────────────────────────────────────────
function setKPI(name: string, value: number, prefix = ''): void {
    const el = document.getElementById(`kpi-${name}`);
    if (!el) { return; }

    const duration = 1200;
    const start = performance.now();
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


// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) { return; }
    bootstrapPortal();
    initLiveTimestamp();
    setupTabs();

    // Load initial data — signal hydration when primary content renders
    Promise.allSettled([loadKPIs(), loadProjects()]).then(signalHydrated);

    // Secure Logout (parity with contractor-portal.ts)
    document.getElementById('portal-logout-btn')?.addEventListener('click', async () => {
        haptic.medium();
        try { await authApi.logout(); } catch { /* best-effort */ }
        clearAuth();
        window.location.href = '/auth.html';
    });

    applyI18n();
});
