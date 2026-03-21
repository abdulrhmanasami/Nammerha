import '../styles/main.css';
import { reportError, reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { renderErrorWithRetry } from '../utils/error-retry';
import { clearAuth } from '../auth';
import { requireAuth } from '../utils/auth-guard';
import { auth as authApi } from '../api';
import { statusColor, tradeColor, urgencyColor, availabilityColor as availabilityBadge } from '../utils/status-colors';
import { tradesperson } from '../api';
import { formatCents, relativeTimeAgo } from '../utils/format';
import { formatDate } from '../utils/locale';
import { t } from '../utils/i18n';
import { showSimpleBanner } from '../utils/banner';
import { haptic } from '../utils/haptic';
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';
// TICK-016: Import shared setText from utils/dom.ts.
// Previous: Local duplicate at L429 — identical to utils/dom.ts version.
// donor-portal.ts and contractor-portal.ts already use the shared version.
// Standard: DRY Principle.
import { setText } from '../utils/dom';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
initPullToRefresh();
initBackToTop();
autoTriggerTour();

/* ═══════════════════════════════════════════════════════════════════════════
   Tradesperson Portal — Dashboard, Requests, Assignments, Earnings, Profile
   P2-FE-004: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id) is handled by the canonical request() wrapper.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ──────────────────────────────────────────────────────────────────
type TabName = 'dashboard' | 'requests' | 'assignments' | 'earnings' | 'profile';

// LOW-AUD-001 FIX: Module-level constant instead of duplicating in setupTabs() and switchTab()
const ALL_TABS: TabName[] = ['dashboard', 'requests', 'assignments', 'earnings', 'profile'];

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
            switchTab(tab);
        });
    }
}

function switchTab(tab: TabName): void {
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
        if (section) {section.classList.toggle('nm-hidden', tabId !== tab);}
    }

    if (tab === 'dashboard') { loadStats(); loadActiveJobs(); }
    if (tab === 'requests') {loadRequests();}
    if (tab === 'assignments') {loadAssignments();}
    if (tab === 'earnings') {loadEarnings();}
    if (tab === 'profile') {loadProfile();}
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
        const res = await tradesperson.getStats();
        if (!res.data) {return;}
        const s = res.data;

        setText('kpi-active', String(s.active_jobs));
        setText('kpi-completed', String(s.completed_jobs));
        setText('kpi-earnings', formatCents(s.total_earnings));
        const ratingEl = document.getElementById('kpi-rating');
        if (ratingEl) { ratingEl.innerHTML = s.average_rating ? `${s.average_rating.toFixed(1)} <i class="ph ph-star nm-star-rating nm-icon-gap-start" aria-hidden="true"></i>` : '—'; }
        setText('pending-count', String(s.pending_requests));
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
            tbody.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 py-12 text-center shadow-sm w-full mt-4 dark:bg-dark-surface dark:border-dark-border">
                <div class="size-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 text-slate-400 dark:bg-dark-elevated dark:text-slate-500">
                    <i class="ph ph-sun-dim nm-icon-32" aria-hidden="true"></i>
                </div>
                <p class="font-bold text-slate-700 text-sm mt-2 dark:text-slate-300" data-i18n="tp_no_active_work">No active work</p>
                <p class="text-xs text-slate-400 mt-1 max-w-xs mx-auto dark:text-slate-500" data-i18n="tp_check_available">Check Available Jobs for new opportunities</p>
            </div>`;
            return;
        }

        let html = '';

        // P1-FE-001 FIX: Render direct requests (Thumbtack mode)
        for (const r of requests) {
            html += `
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
            </div>`;
        }

        // Render contractor assignments (Subcontractor mode)
        for (const a of assignments) {
            html += `
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
            </div>`;
        }
        tbody.innerHTML = html || `<div class="text-center text-slate-400 text-sm py-8 dark:text-slate-500" data-i18n="tp_no_active_work">No active work</div>`;
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[Tradesperson] Active jobs load failed'), { component: 'tradesperson', action: 'load_active_jobs' });
        renderErrorWithRetry(tbody, loadActiveJobs, 'failed_to_load');
    }
}

// ─── Service Requests (Thumbtack) ───────────────────────────────────────────
async function loadRequests(): Promise<void> {
    const container = document.getElementById('requests-list');
    if (!container) {return;}

    try {
        const res = await tradesperson.getRequests();
        const requests = res.data ?? [];

        if (requests.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400 dark:text-slate-500">
                <i class="ph ph-magnifying-glass nm-icon-32" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium" data-i18n="tp_no_requests">No requests matching your trade</p>
                <p class="text-xs mt-1" data-i18n="tp_new_requests_auto">New requests will appear here automatically</p>
            </div>`;
            return;
        }

        container.innerHTML = requests.map((r) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
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
            </div>
        `).join('');

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
        renderErrorWithRetry(container, loadRequests);
    }
}

// ─── Contractor Assignments ─────────────────────────────────────────────────
async function loadAssignments(): Promise<void> {
    const tbody = document.getElementById('assignments-body');
    if (!tbody) {return;}

    try {
        const res = await tradesperson.getAssignments();
        const assignments = res.data ?? [];

        if (assignments.length === 0) {
            tbody.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 py-12 text-center shadow-sm w-full mt-4 dark:bg-dark-surface dark:border-dark-border">
                <div class="size-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 text-slate-400 dark:bg-dark-elevated dark:text-slate-500">
                    <i class="ph ph-clipboard-text nm-icon-32" aria-hidden="true"></i>
                </div>
                <p class="font-bold text-slate-700 text-sm mt-2 dark:text-slate-300" data-i18n="tp_no_assignments">No contractor assignments</p>
            </div>`;
            return;
        }

        tbody.innerHTML = assignments.map((a) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative dark:bg-dark-surface dark:border-dark-border">
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
            </div>
        `).join('');

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
        renderErrorWithRetry(tbody, loadAssignments);
    }
}

// ─── Earnings ───────────────────────────────────────────────────────────────
async function loadEarnings(): Promise<void> {
    const tbody = document.getElementById('earnings-body');
    if (!tbody) {return;}

    try {
        const res = await tradesperson.getEarnings();
        const earnings = res.data ?? [];

        if (earnings.length === 0) {
            tbody.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 py-12 text-center shadow-sm w-full mt-4 dark:bg-dark-surface dark:border-dark-border">
                <div class="size-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 text-slate-400 dark:bg-dark-elevated dark:text-slate-500">
                    <i class="ph ph-coins nm-icon-32" aria-hidden="true"></i>
                </div>
                <p class="font-bold text-slate-700 text-sm mt-2 dark:text-slate-300" data-i18n="tp_no_earnings">No earnings yet</p>
            </div>`;
            return;
        }

        tbody.innerHTML = earnings.map((e) => `
            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between dark:bg-dark-surface dark:border-dark-border">
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
            </div>
        `).join('');
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[Tradesperson] Earnings load failed'), { component: 'tradesperson', action: 'load_earnings' });
        renderErrorWithRetry(tbody, loadEarnings);
    }
}

// ─── Profile ────────────────────────────────────────────────────────────────
async function loadProfile(): Promise<void> {
    const container = document.getElementById('profile-content');
    if (!container) {return;}

    try {
        const res = await tradesperson.getProfile();
        if (!res.data) {throw new Error('Profile not found');}
        const p = res.data;

        updateAvailabilityUI(p.availability);
        // P2-FE-003 FIX: Use trade-badge element with data-i18n for locale-aware display
        const tradeBadge = document.getElementById('trade-badge');
        if (tradeBadge && p.trade) {
            tradeBadge.textContent = p.trade;
            tradeBadge.setAttribute('data-i18n', `trade_${p.trade}`);
        } else if (tradeBadge) {
            tradeBadge.textContent = '—';
        }

        container.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p class="text-3xs font-bold text-slate-400 uppercase dark:text-slate-500" data-i18n="tp_name">Name</p><p class="font-medium mt-0.5">${esc(p.full_name)}</p></div>
                <div><p class="text-3xs font-bold text-slate-400 uppercase dark:text-slate-500" data-i18n="tp_primary_trade">Primary Trade</p><p class="font-medium mt-0.5">${tradeLabel(p.trade ?? '')}</p></div>
                <div><p class="text-3xs font-bold text-slate-400 uppercase dark:text-slate-500" data-i18n="tp_experience">Experience</p><p class="font-medium mt-0.5">${esc(String(p.years_experience ?? '—'))} ${esc(t('tp_years', 'years'))}</p></div>
                <div><p class="text-3xs font-bold text-slate-400 uppercase dark:text-slate-500" data-i18n="tp_hourly_rate">Hourly Rate</p><p class="font-medium mt-0.5">${p.hourly_rate ? `${formatCents(p.hourly_rate)}${esc(t('tp_per_hour', '/hr'))}` : '—'}</p></div>
                <div><p class="text-3xs font-bold text-slate-400 uppercase dark:text-slate-500" data-i18n="tp_daily_rate">Daily Rate</p><p class="font-medium mt-0.5">${p.daily_rate ? `${formatCents(p.daily_rate)}${esc(t('tp_per_day', '/day'))}` : '—'}</p></div>
                <div><p class="text-3xs font-bold text-slate-400 uppercase dark:text-slate-500" data-i18n="tp_dynamic_score">Dynamic Score</p><p class="font-medium mt-0.5">${esc(String(p.dynamic_score))}/100</p></div>
                <div><p class="text-3xs font-bold text-slate-400 uppercase dark:text-slate-500" data-i18n="tp_jobs_completed">Jobs Completed</p><p class="font-medium mt-0.5">${esc(String(p.completed_jobs_count))}</p></div>
                <div><p class="text-3xs font-bold text-slate-400 uppercase dark:text-slate-500" data-i18n="tp_rating">Rating</p><p class="font-medium mt-0.5">${p.average_rating ? `${esc(String(p.average_rating))} <i class="ph ph-star nm-star-rating nm-icon-gap-start" aria-hidden="true"></i>` : '<span data-i18n="tp_no_ratings">No ratings yet</span>'}</p></div>
                <div><p class="text-3xs font-bold text-slate-400 uppercase dark:text-slate-500" data-i18n="tp_availability">Availability</p><p class="font-medium mt-0.5"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${availabilityBadge(p.availability)}">${esc(p.availability)}</span></p></div>
            </div>
        `;
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[Tradesperson] Profile load failed'), { component: 'tradesperson', action: 'load_profile' });
        renderErrorWithRetry(container, loadProfile, 'failed_to_load', 'Failed to load profile');
    }
}

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
