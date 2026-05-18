import '../styles/main.css';
import { reportError, reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { renderErrorWithRetry } from '../utils/error-retry';
import { clearAuth } from '../auth';
import { requireAuth } from '../utils/auth-guard';
import { auth as authApi } from '../api';
import { statusColor, tradeColor, urgencyColor } from '../utils/status-colors';
import { tradesperson } from '../api';
import { formatCents, relativeTimeAgo } from '../utils/format';
import { formatDate } from '../utils/locale';
import { t } from '../utils/i18n';
import { showSimpleBanner } from '../utils/banner';
import { haptic } from '../utils/haptic';
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
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';
// TICK-016: Import shared setText from utils/dom.ts.
// Previous: Local duplicate at L429 — identical to utils/dom.ts version.
// donor-portal.ts and contractor-portal.ts already use the shared version.
// Standard: DRY Principle.
import { setText } from '../utils/dom';
import { animateKPI } from '../utils/kpi-animation';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
initPullToRefresh();
initBackToTop();
autoTriggerTour();

/* ═══════════════════════════════════════════════════════════════════════════
   Tradesperson Portal — Dashboard, Requests, Assignments, Earnings
   P2-FE-004: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id) is handled by the canonical request() wrapper.
   PLT-AUD-R2-001 FIX: Removed dead 'profile' tab — profile moved to profile.html.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ──────────────────────────────────────────────────────────────────
type TabName = 'dashboard' | 'requests' | 'assignments' | 'earnings';

// LOW-AUD-001 FIX: Module-level constant instead of duplicating in setupTabs() and switchTab()
const ALL_TABS: TabName[] = ['dashboard', 'requests', 'assignments', 'earnings'];

// P1-003 FIX: Hash-based tab routing
const hashRouter = createHashRouter(ALL_TABS, 'dashboard');

// LB-003 FIX: Guards prevent duplicate event delegation on re-render.
// Previous: loadRequests() and loadAssignments() added a NEW event listener
// on every tab switch — exponential handler explosion.
const delegationWired = { requests: false, assignments: false } as Record<string, boolean>;

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // BLOCKER-1 FIX: Guard all protected content behind auth check.
    if (!requireAuth()) { return; }
    bootstrapPortal();
    mountContextSwitcher();

    setupTabs();
    setupAvailability();
    const initialTab = hashRouter.getInitialTab();
    switchTab(initialTab);
    hashRouter.onHashChange(switchTab);

    // P1-MOB-003 FIX: Swipe gestures for native-app tab navigation
    initSwipeTabs({
        containerSelector: '.dashboard-main',
        tabs: ALL_TABS as unknown as readonly string[],
        onSwitch: switchTab as (tab: string) => void,
        getCurrentTab: () => hashRouter.getInitialTab(),
    });


    // ─── Secure Logout ──────────────────────────────────────────────────
    document.getElementById('portal-logout-btn')?.addEventListener('click', async () => {
        try { await authApi.logout(); } catch { /* best-effort */ }
        clearAuth();
        window.location.href = '/auth.html';
    });
});

// ─── Tab Navigation ─────────────────────────────────────────────────────────
function setupTabs(): void {
    for (const tab of ALL_TABS) {
        const el = document.getElementById(`tab-${tab}`);
        if (!el) {continue;}
        el.addEventListener('click', (e) => {
            e.preventDefault();
            // F-024 FIX: Haptic feedback on tab switch — parity with homeowner portal.
            haptic.light();
            switchTab(tab);
        });
    }
}

function switchTab(tab: TabName): void {
    // P2-UXA-004 FIX: Save scroll position of outgoing tab
    const currentHash = hashRouter.getInitialTab();
    if (currentHash !== tab) { saveScrollPosition(currentHash); }
    saveLastTab(tab);
    // P1-003 FIX: Sync tab to URL hash
    hashRouter.setActiveTab(tab);
    // P1-FIX-3: Renamed loop variable from `t` to `tabId` to prevent
    // shadowing the imported i18n `t()` function (line 9).
    for (const tabId of ALL_TABS) {
        const el = document.getElementById(`tab-${tabId}`);
        if (!el) {continue;}
        el.className = tabId === tab
            ? 'flex items-center gap-3 px-3 py-2 bg-trust-blue/10 text-trust-blue rounded-lg cursor-pointer w-full text-start'
            : 'flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer w-full text-start';

        // LB-002 FIX: WCAG 4.1.2 — update aria-selected for screen reader parity
        el.setAttribute('aria-selected', String(tabId === tab));

        const section = document.getElementById(`section-${tabId}`);
        // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
        if (section) {
            section.classList.toggle('nm-hidden', tabId !== tab);
            // F-016 FIX: Move focus to newly visible section.
            // Standard: WCAG 2.4.3 (Focus Order). Parity with homeowner portal.
            if (tabId === tab) {
                section.setAttribute('tabindex', '-1');
                section.focus({ preventScroll: true });
                // P1-011 FIX (Wave 2): Remove tabindex after focus so Tab continues into children.
                // PREVIOUS: tabindex="-1" was set but NEVER removed — section permanently
                // focusable, trapping Tab key users instead of navigating into content.
                // NOW: Matches homeowner-portal canonical pattern (UX-REM-I010).
                // Standard: WCAG 2.4.3 (Focus Order), WAI-ARIA 1.2 (Managing Focus).
                requestAnimationFrame(() => section.removeAttribute('tabindex'));
            }
        }
    }

    if (tab === 'dashboard') { loadStats(); loadActiveJobs(); }
    if (tab === 'requests') {loadRequests();}
    if (tab === 'assignments') {loadAssignments();}
    if (tab === 'earnings') {loadEarnings();}

    // P2-UXA-004 FIX: Restore scroll position
    restoreScrollPosition(tab);
}

// ─── Availability Toggle ────────────────────────────────────────────────────
function setupAvailability(): void {
    const container = document.getElementById('availability-btns');
    if (!container) {return;}

    container.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const status = (btn as HTMLElement).dataset['status'];
            if (!status) {return;}

            try {
                await tradesperson.updateAvailability(status as 'available' | 'busy' | 'offline');
                updateAvailabilityUI(status);
            } catch (err) {
                reportError(err instanceof Error ? err : new Error(String(err)), { component: 'tradesperson', action: 'availability_update' });
                // W12-001 FIX: Show user-facing error on availability toggle failure.
                showSimpleBanner('dashboard-banner', 'error', t('tp_availability_error', 'Failed to update availability. Please try again.'));
            }
        });
    });
}

function updateAvailabilityUI(status: string): void {
    const container = document.getElementById('availability-btns');
    if (!container) {return;}

    container.querySelectorAll('button').forEach((btn) => {
        const s = (btn as HTMLElement).dataset['status'];
        if (s === status) {
            const colors: Record<string, string> = {
                available: 'border-green-200 bg-green-50 text-green-700',
                busy: 'border-amber-200 bg-amber-50 text-amber-700',
                offline: 'border-slate-200 bg-slate-50 text-slate-500',
            };
            btn.className = `flex-1 px-2 py-1.5 text-3xs font-bold rounded-lg border ${colors[s] ?? 'border-slate-200 text-slate-500'}`;
        } else {
            btn.className = 'flex-1 px-2 py-1.5 text-3xs font-bold rounded-lg border border-slate-200 text-slate-500';
        }
    });

    const badge = document.getElementById('availability-badge');
    if (badge) {
        const badgeStyles: Record<string, string> = {
            available: 'bg-green-100 text-green-700',
            busy: 'bg-amber-100 text-amber-700',
            offline: 'bg-slate-100 text-slate-500',
        };
        badge.className = `px-2.5 py-1 rounded-full text-3xs font-bold uppercase ${badgeStyles[status] ?? 'bg-slate-100 text-slate-500'}`;
        badge.textContent = status;
    }
}

// ─── KPIs ───────────────────────────────────────────────────────────────────
async function loadStats(): Promise<void> {
    try {
        // PLT-AUD-R2-002: Concurrent stats + profile fetch for header badges.
        // Profile was previously only loaded in the dead loadProfile() tab handler,
        // leaving availability-badge and trade-badge stuck at "—" forever.
        const [statsRes, profileRes] = await Promise.allSettled([
            swrFetch('tp-stats', () => tradesperson.getStats(), { maxAge: 120_000, onStaleData: () => { showStaleIndicator(); } }),
            swrFetch('tp-profile', () => tradesperson.getProfile(), { maxAge: 300_000 }),
        ]);

        // ── Stats KPIs ──
        if (statsRes.status === 'fulfilled' && statsRes.value.data) {
            const s = statsRes.value.data;
            // F-019 FIX: Animated KPI count-up (parity with engineer portal).
            animateKPI('kpi-active', s.active_jobs);
            animateKPI('kpi-completed', s.completed_jobs);
            animateKPI('kpi-earnings', s.total_earnings, { prefix: '$', isCents: true });
            const ratingEl = document.getElementById('kpi-rating');
            if (ratingEl) { ratingEl.innerHTML = s.average_rating ? `${s.average_rating.toFixed(1)} <i class="ph ph-star nm-star-rating nm-icon-gap-start" aria-hidden="true"></i>` : '—'; }
            setText('pending-count', String(s.pending_requests));
        } else {
            ['kpi-active', 'kpi-completed', 'kpi-earnings', 'kpi-rating'].forEach(id => setText(id, '—'));
            if (statsRes.status === 'rejected') {
                reportWarning('[Tradesperson] Stats load failed', { error: String(statsRes.reason) });
            }
        }

        // ── Profile → Header Badges ──
        if (profileRes.status === 'fulfilled' && profileRes.value.data) {
            const p = profileRes.value.data;
            updateAvailabilityUI(p.availability);
            const tradeBadge = document.getElementById('trade-badge');
            if (tradeBadge && p.trade) {
                tradeBadge.textContent = p.trade;
                tradeBadge.setAttribute('data-i18n', `trade_${p.trade}`);
            } else if (tradeBadge) {
                tradeBadge.textContent = '—';
            }
        } else if (profileRes.status === 'rejected') {
            reportWarning('[Tradesperson] Profile load failed', { error: String(profileRes.reason) });
        }

        // P2-UXA-002 FIX: Live KPI timestamp
        markKPIFetched();
    } catch (err) {
        reportWarning('[Tradesperson] Stats load failed, showing defaults', { component: 'tradesperson', action: 'load_stats', error: err instanceof Error ? err.message : String(err) });
        // W12-001 FIX: Show em-dash on KPI failure — visible error signal.
        ['kpi-active', 'kpi-completed', 'kpi-earnings', 'kpi-rating'].forEach(id => setText(id, '—'));
    }
}

// ─── Active Jobs Overview (Dashboard) ───────────────────────────────────────
async function loadActiveJobs(): Promise<void> {
    const tbody = document.getElementById('active-jobs-body');
    if (!tbody) {return;}

    try {
        // PLT-AUD-P001 FIX: Was Promise.all — one timeout killed all job types.
        // Promise.allSettled shows partial data (requests OR assignments) on partial failure.
        // Standard: Resilient Data Loading, Syria 2G tolerance.
        const [reqSettled, assSettled] = await Promise.allSettled([
            tradesperson.getRequests(),
            tradesperson.getAssignments('in_progress'),
        ]);

        const requests = reqSettled.status === 'fulfilled' ? (reqSettled.value.data ?? []) : [];
        const assignments = assSettled.status === 'fulfilled' ? (assSettled.value.data ?? []) : [];

        // Log individual failures without killing the whole view
        if (reqSettled.status === 'rejected') {
            reportWarning('[Tradesperson] Requests API failed', { error: String(reqSettled.reason) });
        }
        if (assSettled.status === 'rejected') {
            reportWarning('[Tradesperson] Assignments API failed', { error: String(assSettled.reason) });
        }

        if (requests.length === 0 && assignments.length === 0) {
            tbody.innerHTML = renderEmptyState({
                icon: 'sun-dim',
                title: t('tp_no_active_work', 'No active work'),
                subtitle: t('tp_check_available', 'Check Available Jobs for new opportunities'),
            });
            return;
        }

        // P2-010 FIX: Add section headers between Direct Requests and Contractor Assignments.
        // PREVIOUS: Both job types were rendered in a flat list with only small badge
        // differences ("direct" vs status). Tradesperson couldn't quickly distinguish
        // their direct client requests from contractor-assigned tasks.
        // NOW: Visual section headers separate the two categories.
        // Standard: Nielsen #6 (Recognition Over Recall), Information Architecture.
        const hasRequests = requests.length > 0;
        const hasAssignments = assignments.length > 0;

        let sectionsHtml = '';

        if (hasRequests) {
            sectionsHtml += `
                <div class="flex items-center gap-2 mb-3 mt-1">
                    <i class="ph ph-user-focus text-teal-600 dark:text-teal-400" aria-hidden="true"></i>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" data-i18n="tp_direct_requests">${esc(t('tp_direct_requests', 'Direct Requests'))}</h3>
                    <span class="text-3xs font-bold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">${requests.length}</span>
                </div>
            `;
            sectionsHtml += requests.map(r => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative dark:bg-dark-surface dark:border-dark-border">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(r.title)}</h3>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase bg-teal-100 text-teal-700" data-i18n="tp_direct">direct</span>
                </div>
                <div class="flex justify-between items-center mt-3">
                    <div class="text-xs text-slate-500 flex items-center gap-1.5 dark:text-slate-400">
                        <i class="ph ph-user text-sm" aria-hidden="true"></i>
                        <span class="font-semibold text-slate-700 dark:text-slate-300">${esc(r.homeowner_name)}</span>
                    </div>
                    ${tradeLabel(r.trade_needed)}
                </div>
            </div>`).join('');
        }

        if (hasAssignments) {
            sectionsHtml += `
                <div class="flex items-center gap-2 mb-3 ${hasRequests ? 'mt-6 pt-4 border-t border-slate-200 dark:border-dark-border' : 'mt-1'}">
                    <i class="ph ph-buildings text-trust-blue dark:text-blue-400" aria-hidden="true"></i>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" data-i18n="tp_contractor_assignments">${esc(t('tp_contractor_assignments', 'Contractor Assignments'))}</h3>
                    <span class="text-3xs font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">${assignments.length}</span>
                </div>
            `;
            sectionsHtml += assignments.map(a => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative dark:bg-dark-surface dark:border-dark-border">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(a.project_title)}</h3>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${statusColor(a.status)}">${esc(a.status)}</span>
                </div>
                <div class="flex justify-between items-center mt-3">
                    <div class="text-xs text-slate-500 flex items-center gap-1.5 dark:text-slate-400">
                        <i class="ph ph-buildings text-sm" aria-hidden="true"></i>
                        <span class="font-semibold text-slate-700 dark:text-slate-300">${esc(a.contractor_name)}</span>
                    </div>
                    ${tradeLabel(a.trade_required)}
                </div>
            </div>`).join('');
        }

        tbody.innerHTML = `<div class="flex flex-col gap-3">${sectionsHtml}</div>`;
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[Tradesperson] Active jobs load failed'), { component: 'tradesperson', action: 'load_active_jobs' });
        renderErrorWithRetry(tbody, loadActiveJobs, 'failed_to_load', undefined, err);
    }
}

// ─── Service Requests (Thumbtack) ───────────────────────────────────────────
async function loadRequests(): Promise<void> {
    const container = document.getElementById('requests-list');
    if (!container) {return;}

    try {
        const res = await tradesperson.getRequests();
        const requests = res.data ?? [];

        // P1-UXA-002 FIX: Progressive rendering for available requests
        renderProgressive({
            items: requests,
            containerEl: container,
            pageSize: 20,
            renderItem: (r, i) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-medium">${esc(r.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${urgencyColor(r.urgency)}">${esc(r.urgency)}</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-1 dark:text-slate-400">${esc(r.description ?? t('tp_no_description', 'No description'))}</p>
                        <div class="flex flex-wrap items-center gap-3 mt-2 text-3xs text-slate-400 dark:text-slate-500">
                            <span><i class="ph ph-user" aria-hidden="true"></i> ${esc(r.homeowner_name)}</span>
                            ${r.address_text ? `<span><i class="ph ph-map-pin" aria-hidden="true"></i> ${esc(r.address_text)}</span>` : ''}
                            ${r.budget_max ? `<span><i class="ph ph-coins" aria-hidden="true"></i> <span data-i18n="tp_budget">Budget</span>: ${formatCents(r.budget_max)}</span>` : ''}
                            <span><i class="ph ph-clock" aria-hidden="true"></i> ${relativeTimeAgo(r.created_at)}</span>
                        </div>
                    </div>
                    <button type="button" class="accept-req-btn px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition-colors shrink-0"
                            data-request="${esc(r.request_id)}" data-i18n="tp_accept_job">
                        Accept Job
                    </button>
                </div>
            </div>`,
            emptyState: () => renderEmptyState({
                icon: 'magnifying-glass',
                title: t('tp_no_requests', 'No requests matching your trade'),
                subtitle: t('tp_new_requests_auto', 'New requests will appear here automatically'),
            }),
        });

        // TICK-017: Event delegation for accept buttons.
        // Previous: querySelectorAll('.accept-req-btn').forEach() attached O(N) listeners.
        // Now: Single delegated listener on container — O(1).
        // LB-003 FIX: Guard prevents re-attaching on every tab switch.
        if (!delegationWired.requests) {
            delegationWired.requests = true;
        container.addEventListener('click', async (e: MouseEvent) => {
            const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.accept-req-btn');
            if (!btn) { return; }
            const requestId = btn.dataset['request'];
            if (!requestId) { return; }

            btn.disabled = true;
            btn.textContent = t('tp_accepting', 'Accepting...');
            btn.setAttribute('data-i18n', 'tp_accepting');

            try {
                const res2 = await tradesperson.acceptRequest(requestId);
                if (!res2.success) {
                    throw new Error(res2.error ?? 'Failed');
                }
                btn.innerHTML = `<i class="ph ph-check nm-icon-gap-end" aria-hidden="true"></i>${esc(t('tp_accepted', 'Accepted'))}`;
                btn.setAttribute('data-i18n', 'tp_accepted');
                btn.className = 'px-4 py-2 bg-green-100 text-green-700 text-xs font-bold rounded-lg shrink-0';
                loadStats();
            } catch (err) {
                // PLT-006 FIX: Re-enable button on error — user must be able to retry.
                // Previous: btn.disabled stayed true on error — dead-end on flaky 3G.
                // Standard: Nielsen #5 (Error Prevention), retry-friendly error recovery.
                btn.disabled = false;
                btn.textContent = err instanceof Error ? err.message : 'Failed';
                btn.removeAttribute('data-i18n');
                btn.className = 'px-4 py-2 bg-red-100 text-red-600 text-xs font-bold rounded-lg shrink-0';
            }
        });
        }
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[Tradesperson] Requests load failed'), { component: 'tradesperson', action: 'load_requests' });
        renderErrorWithRetry(container, loadRequests, undefined, undefined, err);
    }
}

// ─── Contractor Assignments ─────────────────────────────────────────────────
async function loadAssignments(): Promise<void> {
    const tbody = document.getElementById('assignments-body');
    if (!tbody) {return;}

    try {
        const res = await tradesperson.getAssignments();
        const assignments = res.data ?? [];

        // P1-UXA-002 FIX: Progressive rendering for contractor assignments
        renderProgressive({
            items: assignments,
            containerEl: tbody,
            pageSize: 20,
            renderItem: (a, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex justify-between items-start mb-1">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(a.project_title)}</h3>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${statusColor(a.status)}">${esc(a.status)}</span>
                </div>
                <div class="text-xs text-slate-500 flex items-center gap-1.5 mb-3 dark:text-slate-400">
                    <i class="ph ph-buildings text-sm" aria-hidden="true"></i>
                    <span class="font-semibold text-slate-700 dark:text-slate-300">${esc(a.contractor_name)}</span>
                    <span class="mx-1 text-slate-300">•</span>
                    ${tradeLabel(a.trade_required)}
                </div>
                <p class="text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100 dark:text-slate-400 dark:bg-dark-elevated dark:border-dark-border">${esc(a.scope_description)}</p>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-dark-border">
                    <div>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="tp_agreed_rate">Agreed Rate</p>
                        <p class="font-mono font-bold text-smoky-jade text-sm dark:text-emerald-400">${formatCents(a.agreed_rate)}<span class="text-xs font-normal text-slate-400 dark:text-slate-500">/${esc(a.rate_type)}</span></p>
                    </div>
                    ${a.status === 'pending' ? `
                    <div class="flex gap-2">
                        <button type="button" class="respond-btn flex-1 px-4 py-2 min-w-[80px] bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100 transition-colors dark:bg-red-500/10" data-id="${esc(a.assignment_id)}" data-accept="false" data-i18n="tp_decline">Decline</button>
                        <button type="button" class="respond-btn flex-1 px-4 py-2 min-w-[80px] bg-trust-blue text-white text-xs font-bold rounded-lg hover:bg-trust-blue/90 transition-colors inline-flex items-center justify-center gap-2" data-id="${esc(a.assignment_id)}" data-accept="true" data-i18n="tp_accept">Accept</button>
                    </div>
                    ` : '<span class="text-3xs text-slate-300 font-bold px-2 py-1">—</span>'}
                </div>
            </div>`,
            emptyState: () => renderEmptyState({
                icon: 'clipboard-text',
                title: t('tp_no_assignments', 'No contractor assignments'),
            }),
        });

        // TICK-017: Event delegation for respond buttons.
        // Previous: querySelectorAll('.respond-btn').forEach() attached O(N) listeners.
        // Now: Single delegated listener on tbody — O(1).
        // LB-003 FIX: Guard prevents re-attaching on every tab switch.
        if (!delegationWired.assignments) {
            delegationWired.assignments = true;
        tbody.addEventListener('click', async (e: MouseEvent) => {
            const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.respond-btn');
            if (!btn) { return; }
            const id = btn.dataset['id'];
            const accept = btn.dataset['accept'] === 'true';
            if (!id) { return; }

            // BLOCKER-B FIX: Disable button + show loading state during API call.
            // Previous: Mutating textContent stretched button width horizontally, causing Cumulative Layout Shift (CLS).
            // Standard: Nielsen #1 (System Status Visibility), 0 CLS via `.btn-loading`, Haptic physical feedback.
            btn.disabled = true;
            btn.classList.add('btn-loading', 'cursor-not-allowed');
            haptic.light();

            try {
                await tradesperson.respondToAssignment(id, accept);
                haptic.success();
                loadAssignments();
                loadStats();
            } catch (err) {
                // Re-enable button on failure — user must be able to retry.
                btn.disabled = false;
                btn.classList.remove('btn-loading', 'cursor-not-allowed');
                reportError(err instanceof Error ? err : new Error('[Tradesperson] Assignment response failed'), { component: 'tradesperson', action: 'respond_assignment' });
                showSimpleBanner('dashboard-banner', 'error', t('tp_response_error', 'Failed to respond. Please try again.'));
            }
        });
        }
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[Tradesperson] Assignments load failed'), { component: 'tradesperson', action: 'load_assignments' });
        renderErrorWithRetry(tbody, loadAssignments, undefined, undefined, err);
    }
}

// ─── Earnings ───────────────────────────────────────────────────────────────
async function loadEarnings(): Promise<void> {
    const tbody = document.getElementById('earnings-body');
    if (!tbody) {return;}

    try {
        const res = await tradesperson.getEarnings();
        const earnings = res.data ?? [];

        // P1-UXA-002 FIX: Progressive rendering for earnings
        renderProgressive({
            items: earnings,
            containerEl: tbody,
            pageSize: 20,
            renderItem: (e, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div>
                    <h3 class="font-bold text-sm text-slate-900 mb-1 dark:text-slate-100">${esc(e.title)}</h3>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${e.source_type === 'assignment' ? 'bg-blue-100 text-blue-600' : 'bg-teal-100 text-teal-600'}" data-i18n="${e.source_type === 'assignment' ? 'tp_contractor_type' : 'tp_direct_type'}">${e.source_type === 'assignment' ? 'Contractor' : 'Direct'}</span>
                        <span class="text-xs text-slate-400 dark:text-slate-500">&bull; ${formatDate(e.completed_at)}</span>
                    </div>
                </div>
                <div class="text-end">
                    <p class="font-mono font-black text-smoky-jade text-lg border-b border-transparent dark:text-emerald-400">${formatCents(e.amount)}</p>
                </div>
            </div>`,
            emptyState: () => renderEmptyState({
                icon: 'coins',
                title: t('tp_no_earnings', 'No earnings yet'),
            }),
        });
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[Tradesperson] Earnings load failed'), { component: 'tradesperson', action: 'load_earnings' });
        renderErrorWithRetry(tbody, loadEarnings, undefined, undefined, err);
    }
}

// ─── Profile ────────────────────────────────────────────────────────────────
// PLT-AUD-R2-001: loadProfile() REMOVED — dead code.
// Profile tab was moved to profile.html (RES-002). The profile data bootstrap
// (availability-badge + trade-badge) is now handled inside loadStats().

// TICK-016: Local setText() removed — now imported from ../utils/dom (line 19).
// Previous: Duplicate of shared utility, violating DRY principle.
// donor-portal.ts and contractor-portal.ts already use the shared version.


/**
 * P2-FE-003 FIX: Locale-agnostic trade label.
 * Returns a <span> with data-i18n attribute so the i18n engine's
 * MutationObserver auto-translates it to the current locale.
 */
function tradeLabel(trade: string): string {
    if (!trade) { return '—'; }
    const colorClass = tradeColor(trade);
    return `<span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${colorClass}" data-i18n="trade_${trade}">${esc(trade)}</span>`;
}

// NMR-AUD-305: timeAgo() removed — replaced by relativeTimeAgo() from '../utils/format'

// ─── Dev-Only Expose (stripped in production builds) ────────────────────────
// P2-FIX-1: Added DEV guard — matches contractor-portal.ts pattern.
if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)['tradespersonPortal'] = {
        switchTab,
        loadStats,
    };
}
