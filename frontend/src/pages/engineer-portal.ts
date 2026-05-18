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
import { animateKPI } from '../utils/kpi-animation';
// P1-UX-002 FIX: Standardized empty state component
import { renderEmptyState } from '../utils/empty-state';
// P1-UX-003 FIX: Service Worker registration on all portal pages
import { bootstrapPortal } from '../utils/portal-bootstrap';
// P1-UX-001 FIX: SWR cache for perceived-instant tab switching
import { swrFetch } from '../utils/swr-cache';
// P0-UXA-004 FIX: Cross-portal navigation via shared context switcher
import { mountContextSwitcher } from '../components/portal-context';
// P2-UXA-002 FIX: Live KPI timestamp
import { markKPIFetched, showStaleIndicator } from '../utils/live-kpi-timestamp';
// P2-UXA-004 + P3-UXA-003 FIX: Tab state preservation
import { saveScrollPosition, restoreScrollPosition, saveLastTab } from '../utils/tab-state';
// P1-UXA-002 FIX: Progressive rendering — prevents DOM jank with 1000+ records
import { renderProgressive } from '../utils/progressive-render';
// P2-ANIM-001 FIX: Centralized animation stagger constant
import { staggerDelay } from '../constants/animation';
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
    // F-024 FIX: Haptic feedback on tab switch — parity with homeowner portal.
    document.getElementById('tab-projects')?.addEventListener('click', () => { haptic.light(); switchTab('projects'); });
    document.getElementById('tab-bids')?.addEventListener('click', () => { haptic.light(); switchTab('bids'); });
    document.getElementById('tab-captures')?.addEventListener('click', () => { haptic.light(); switchTab('captures'); });

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
    // P2-UXA-004 FIX: Save scroll position of outgoing tab
    const currentHash = engineerHashRouter.getInitialTab();
    if (currentHash !== tab) { saveScrollPosition(currentHash); }
    saveLastTab(tab);
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
            // F-016 FIX: Move focus to newly visible section.
            // Standard: WCAG 2.4.3 (Focus Order). Parity with homeowner portal.
            if (sectionEl) {
                sectionEl.setAttribute('tabindex', '-1');
                sectionEl.focus({ preventScroll: true });
                // P1-011 FIX (Wave 2): Remove tabindex after focus so Tab continues into children.
                // PREVIOUS: tabindex="-1" was set but NEVER removed — section permanently
                // focusable, trapping Tab key users instead of navigating into content.
                // NOW: Matches homeowner-portal canonical pattern (UX-REM-I010).
                // Standard: WCAG 2.4.3 (Focus Order), WAI-ARIA 1.2 (Managing Focus).
                requestAnimationFrame(() => sectionEl.removeAttribute('tabindex'));
            }
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

    // P2-UXA-004 FIX: Restore scroll position for the incoming tab
    restoreScrollPosition(tab);
}


// ─── Load KPIs ──────────────────────────────────────────────────────────────
async function loadKPIs(): Promise<void> {
    try {
        const res = await swrFetch('eng-stats', () => engineer.getStats(), {
            maxAge: 120_000, // 2 minutes
            onStaleData: () => { showStaleIndicator(); },
        });
        if (!res.data) { return; }
        const data = res.data as unknown as EngineerStats;

        // F-019 FIX: Use shared animateKPI (was local setKPI).
        animateKPI('kpi-assigned-projects', data.assigned_projects ?? 0);
        animateKPI('kpi-proofs-pending', data.proofs_pending ?? 0);
        animateKPI('kpi-proofs-verified', data.proofs_verified ?? 0);
        animateKPI('kpi-escrow-released', data.escrow_released ?? 0, { prefix: '$', isCents: true });

        // SYS-002 FIX: Removed active_bids → #notif-count write.
        // PREVIOUS: active_bids (role-specific stat) was written to the header
        // notification bell badge — conflating engineer workflow counts with
        // unread notifications. Badge oscillated between notification-panel.ts
        // poll (real unread count) and this write (active_bids) every 60s.
        // NOW: notification-panel.ts is the sole owner of #notif-count.
        // Standard: SRP (Single Responsibility), Nielsen #1 (System Status).

        // P2-UXA-002 FIX: Live KPI timestamp
        markKPIFetched();
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

        // P1-UXA-002 FIX: Progressive rendering for engineer projects
        renderProgressive({
            items: items,
            containerEl: container,
            pageSize: 20,
            renderItem: (p, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex justify-between items-start mb-3">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(p.title)}</h3>
                    <span class="text-3xs font-bold px-2 py-0.5 rounded-full uppercase ${phaseColor(p.phase)}">${esc(phaseLabel(p.phase))}</span>
                </div>
                <div class="flex items-center gap-4 text-xs text-slate-500 mb-3 dark:text-slate-400">
                    <span class="flex items-center gap-1"><i class="ph ph-map-pin text-sm" aria-hidden="true"></i> ${esc(p.region || t('eng_no_region', 'N/A'))}</span>
                    <span class="flex items-center gap-1"><i class="ph ph-list-checks text-sm" aria-hidden="true"></i> ${esc(String(p.boq_count))} ${esc(t('eng_boq_items', 'BOQ items'))}</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="nm-progress-track">
                        <div class="bg-trust-blue nm-progress-bar" style="--progress: ${Math.min(p.progress, 100)}%"></div>
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
            </div>`,
            emptyState: () => renderEmptyState({
                icon: 'buildings',
                title: t('eng_no_projects', 'No assigned projects yet'),
                subtitle: t('eng_no_projects_desc', 'Projects will appear here once assigned by the platform.'),
            }),
        });

        applyI18n();
    } catch (err) {
        reportWarning('[EngineerPortal] Projects load failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadProjects, undefined, undefined, err);
    }
}

// ─── Load Bids ──────────────────────────────────────────────────────────────
async function loadBids(): Promise<void> {
    const container = document.getElementById('bids-body');
    if (!container) { return; }

    try {
        const res = await engineer.getBids();
        const items = (res.data ?? []) as unknown as EngineerBid[];

        // P1-UXA-002 FIX: Progressive rendering for bids list
        renderProgressive({
            items: items,
            containerEl: container,
            pageSize: 20,
            renderItem: (b, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
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
            </div>`,
            emptyState: () => renderEmptyState({
                icon: 'flag-banner',
                title: t('eng_no_bids', 'No bids submitted yet'),
            }),
        });

        applyI18n();
    } catch (err) {
        reportWarning('[EngineerPortal] Bids load failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadBids, undefined, undefined, err);
    }
}

// ─── Load Captures ──────────────────────────────────────────────────────────
async function loadCaptures(): Promise<void> {
    const container = document.getElementById('captures-body');
    if (!container) { return; }

    try {
        const res = await engineer.getCaptures(20);
        const items = (res.data ?? []) as unknown as EngineerCapture[];

        // P1-UXA-002 FIX: Progressive rendering for captures list
        renderProgressive({
            items: items,
            containerEl: container,
            pageSize: 20,
            renderItem: (c, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4 dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="size-14 rounded-lg bg-slate-100 overflow-hidden shrink-0 dark:bg-dark-elevated">
                    <img src="${esc(c.file_url)}" alt="${esc(c.title ?? 'Capture')}" class="size-14 object-cover" loading="lazy" data-capture-fallback />
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
            </div>`,
            emptyState: () => renderEmptyState({
                icon: 'camera',
                title: t('eng_no_captures', 'No captures yet'),
                subtitle: t('eng_no_captures_desc', 'Start capturing field evidence using the Field Camera.'),
            }),
        });

        // P1-007 FIX (Wave 2): CSP-safe image error fallback via addEventListener.
        // PREVIOUS: Inline onerror="this.parentElement.innerHTML='...'" — the ONLY remaining
        // inline event handler across the entire frontend. Violates CSP script-src 'self'.
        // NOW: addEventListener('error') wired post-render. Same fallback, CSP-compliant.
        // Standard: Content-Security-Policy compliance, OWASP CSP Best Practices.
        container.querySelectorAll<HTMLImageElement>('img[data-capture-fallback]').forEach((img) => {
            img.addEventListener('error', () => {
                const parent = img.parentElement;
                if (parent) {
                    parent.innerHTML = '<div class="size-14 flex items-center justify-center"><i class="ph ph-image-broken text-slate-400 text-xl" aria-hidden="true"></i></div>';
                }
            }, { once: true });
        });

        applyI18n();
    } catch (err) {
        reportWarning('[EngineerPortal] Captures load failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadCaptures, undefined, undefined, err);
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
// F-019 FIX: Local setKPI() replaced with shared animateKPI() from utils/kpi-animation.ts.


// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) { return; }
    bootstrapPortal();
    mountContextSwitcher();
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
