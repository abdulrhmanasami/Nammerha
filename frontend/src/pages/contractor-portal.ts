import '../styles/main.css';
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { renderErrorWithRetry } from '../utils/error-retry';
import { clearAuth } from '../auth';
import { auth as authApi } from '../api';
import { phaseColor, bidColor, escrowColor } from '../utils/status-colors';
import { contractor } from '../api';
import { t } from '../utils/i18n';
import { formatCents } from '../utils/format';
// BLOCKER-1 FIX: Auth guard — unauthenticated visitors see "Sign in required" overlay
// instead of broken skeleton loaders with cryptic API errors.
import { requireAuth } from '../utils/auth-guard';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
initPullToRefresh();
initBackToTop();
autoTriggerTour();
import { formatDate } from '../utils/locale';
import { setText } from '../utils/dom';
import { animateKPI } from '../utils/kpi-animation';
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';
// P3-003 FIX: Skeleton timeout guard — prevents infinite loading state
import { guardSkeleton } from '../utils/skeleton-guard';
// TICK-018: Haptic feedback for native-app tactile response
import { haptic } from '../utils/haptic';
// P1-UX-002 FIX: Standardized empty state component
import { renderEmptyState } from '../utils/empty-state';
// P1-UX-003 FIX: Service Worker registration on all portal pages
import { bootstrapPortal } from '../utils/portal-bootstrap';
// P0-UXA-004 FIX: Cross-portal navigation via shared context switcher
import { mountContextSwitcher } from '../components/portal-context';
// P1-UX-001 FIX: SWR cache for perceived-instant tab switching
import { swrFetch } from '../utils/swr-cache';
// P2-UXA-002 FIX: Live KPI timestamp
import { markKPIFetched, showStaleIndicator } from '../utils/live-kpi-timestamp';
// P2-UXA-004 + P3-UXA-003 FIX: Tab state preservation
import { saveScrollPosition, restoreScrollPosition, saveLastTab } from '../utils/tab-state';
// P1-UXA-002 FIX: Progressive rendering — prevents DOM jank with 1000+ records
import { renderProgressive } from '../utils/progressive-render';
// P2-ANIM-001 FIX: Centralized animation stagger constant
import { staggerDelay } from '../constants/animation';

/* ═══════════════════════════════════════════════════════════════════════════
   Contractor Portal — Dashboard, Marketplace, Bids, Payments
   PLT-FE-001 FIX: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id, CSRF) is handled by the canonical request()
   wrapper — including 30s AbortController timeout for Syria's network conditions.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Types (local rendering shapes — raw API types are in api.ts) ────────────
interface Project {
    project_id: string;
    title: string;
    region: string;
    phase: string;
    progress: number;
    engineer_name: string | null;
}

interface MarketProject {
    project_id: string;
    title: string;
    region: string;
    damage_type: string;
    total_estimated_cost: number;
    boq_count: number;
    bid_count: number;
}

interface Payment {
    transaction_id: string;
    project_title: string;
    amount: number;
    transaction_type: string;
    created_at: string;
}

// ─── State ──────────────────────────────────────────────────────────────────
type TabName = 'dashboard' | 'marketplace' | 'bids' | 'payments';
// PLT-AUD-E001: Guards prevent duplicate event delegation on re-render.
const delegationWired = { marketplace: false } as Record<string, boolean>;

// P2-007 FIX: Module-level guard prevents bid modal rapid-click race.
// PREVIOUS: Rapid clicks on .bid-btn (especially touch double-fire) opened
// multiple <dialog> instances — each appended to DOM and called showModal().
// The L444 cleanup (getElementById('bid-modal')?.remove()) was insufficient
// because createElement+showModal is async — clicks arrive before cleanup.
// NOW: Boolean flag blocks re-entry entirely.
let bidModalOpen = false;

// PLT-FE-003 FIX: Module-level constant instead of duplicating in setupTabs()/switchTab()
const ALL_TABS: TabName[] = ['dashboard', 'marketplace', 'bids', 'payments'];

// P1-003 FIX: Hash-based tab routing
const hashRouter = createHashRouter(ALL_TABS, 'dashboard');

// ─── DOM Init ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // BLOCKER-1 FIX: Guard all protected content behind auth check.
    if (!requireAuth()) { return; }
    bootstrapPortal();
    mountContextSwitcher();

    setupTabs();
    const initialTab = hashRouter.getInitialTab();
    switchTab(initialTab);
    hashRouter.onHashChange(switchTab);

    // P3-003 FIX: Guard skeleton loaders with timeout fallback
    guardSkeleton({
        container: 'main-content',
        onRetry: () => switchTab(hashRouter.getInitialTab()),
    });

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

// ─── Tab Switching ──────────────────────────────────────────────────────────
function setupTabs(): void {
    for (const tab of ALL_TABS) {
        const el = document.getElementById(`tab-${tab}`);
        if (!el) { continue; }

        el.addEventListener('click', (e) => {
            e.preventDefault();
            // F-024 FIX: Haptic feedback on tab switch — parity with homeowner portal.
            haptic.light();
            switchTab(tab);
        });
    }
}

function switchTab(tab: TabName): void {
    // P2-UXA-004 FIX: Save scroll position of the outgoing tab
    const currentHash = hashRouter.getInitialTab();
    if (currentHash !== tab) { saveScrollPosition(currentHash); }
    // P3-UXA-003 FIX: Persist last active tab
    saveLastTab(tab);
    // P1-003 FIX: Sync tab to URL hash
    hashRouter.setActiveTab(tab);
    // Update sidebar
    // P1-FIX-3: Renamed loop variable from `t` to `tabId` to prevent
    // shadowing the imported i18n `t()` function (line 8).
    for (const tabId of ALL_TABS) {
        const el = document.getElementById(`tab-${tabId}`);
        if (!el) { continue; }

        if (tabId === tab) {
            el.className = 'flex items-center gap-3 px-3 py-2 bg-trust-blue/10 text-trust-blue rounded-lg cursor-pointer w-full text-start';
        } else {
            el.className = 'flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer w-full text-start';
        }
        // LB-002 FIX: WCAG 4.1.2 — update aria-selected for screen reader parity
        el.setAttribute('aria-selected', String(tabId === tab));
    }

    // Show/hide sections
    // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
    for (const tabId of ALL_TABS) {
        const section = document.getElementById(`section-${tabId}`);
        if (section) {
            section.classList.toggle('nm-hidden', tabId !== tab);
            // F-016 FIX: Move focus to newly visible section.
            // Previous: Focus stayed on tab button — screen reader users stranded.
            // Standard: WCAG 2.4.3 (Focus Order). Parity with homeowner portal.
            if (tabId === tab) {
                section.setAttribute('tabindex', '-1');
                section.focus({ preventScroll: true });
            }
        }
    }

    // Load data for tab
    if (tab === 'dashboard') { loadStats(); loadProjects(); }
    if (tab === 'marketplace') { loadMarketplace(); }
    if (tab === 'bids') { loadBids(); }
    if (tab === 'payments') { loadPayments(); }

    // P2-UXA-004 FIX: Restore scroll position for the incoming tab
    restoreScrollPosition(tab);
}

// ─── KPI Cards ──────────────────────────────────────────────────────────────
async function loadStats(): Promise<void> {
    try {
        const res = await swrFetch('ct-stats', () => contractor.getStats(), {
            maxAge: 120_000, // 2 minutes — KPIs don't change that fast
            onStaleData: () => { showStaleIndicator(); },
        });
        if (!res.data) { return; }
        const s = res.data;

        // F-019 FIX: Animated KPI count-up (parity with engineer portal).
        // Previous: Instant setText() — no perceived performance.
        animateKPI('kpi-active', s.active_projects);
        animateKPI('kpi-pending', s.pending_bids);
        animateKPI('kpi-won', s.won_bids);
        animateKPI('kpi-escrow', s.total_escrow_received, { prefix: '$', isCents: true });
        setText('pending-bids-count', String(s.pending_bids));

        // P3-UX-001 FIX: "Last updated" temporal context on KPI dashboard.
        // Previous: "3 Active Projects" — since when? No temporal trust signal.
        // Standard: Nielsen #1 (System Status), FinTech Data Freshness.
        // P2-UXA-002 FIX: Live KPI timestamp
        markKPIFetched();
    } catch (err) { reportWarning('[ContractorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // W8-002 FIX: Show em-dash on KPI failure — visible error signal.
        ['kpi-active', 'kpi-pending', 'kpi-won', 'kpi-escrow'].forEach(id => setText(id, '—'));
    }
}

// ─── My Projects ────────────────────────────────────────────────────────────
async function loadProjects(): Promise<void> {
    const tbody = document.getElementById('projects-body');
    if (!tbody) { return; }

    try {
        const res = await swrFetch('ct-projects', () => contractor.getProjects());
        const projects = (res.data ?? []) as unknown as Project[];

        // P1-UXA-002 FIX: Progressive rendering — prevents DOM jank with large project lists.
        // P2-UX-003 FIX: Stagger animation — cards cascade in sequentially (50ms delay).
        renderProgressive({
            items: projects,
            containerEl: tbody,
            pageSize: 20,
            renderItem: (p, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative transition-all dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(p.title)}</h3>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${phaseColor(p.phase)}">${esc(ctPhaseLabel(p.phase))}</span>
                </div>
                <div class="text-xs text-slate-500 flex items-center gap-1.5 mb-4 dark:text-slate-400">
                    <i class="ph ph-map-pin text-sm" aria-hidden="true"></i>
                    <span>${esc(p.region)}</span>
                    <span class="mx-1 text-slate-300">•</span>
                    <i class="ph ph-hard-hat text-sm" aria-hidden="true"></i>
                    <span>${esc(p.engineer_name ?? '—')}</span>
                </div>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-dark-border">
                    <span class="text-3xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500" data-i18n="th_progress">Progress</span>
                    <div class="flex items-center gap-2 flex-grow max-w-[60%] justify-end">
                        <div class="nm-progress-track">
                            <div class="bg-amber-500 nm-progress-bar" style="--progress:${Math.min(100, Math.max(0, Number(p.progress) || 0))}%"></div>
                        </div>
                        <span class="text-xs font-bold text-slate-600 w-8 text-end dark:text-slate-400">${esc(String(p.progress))}%</span>
                    </div>
                </div>
            </div>`,
            emptyState: () => renderEmptyState({
                icon: 'clipboard-text',
                title: t('ct_no_assigned_projects', 'No assigned projects yet'),
                subtitle: t('ct_browse_marketplace', 'Browse the marketplace and submit bids'),
            }),
        });
    } catch (err) { reportWarning('[ContractorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(tbody, loadProjects, undefined, undefined, err);
    }
}

// ─── Marketplace ────────────────────────────────────────────────────────────
async function loadMarketplace(): Promise<void> {
    const tbody = document.getElementById('marketplace-body');
    if (!tbody) { return; }

    try {
        const res = await contractor.getMarketplace();
        const projects = (res.data ?? []) as unknown as MarketProject[];

        // P1-UXA-002 FIX: Progressive rendering for marketplace list
        renderProgressive({
            items: projects,
            containerEl: tbody,
            pageSize: 20,
            renderItem: (p, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative transition-all dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 line-clamp-2 pe-12 dark:text-slate-100">${esc(p.title)}</h3>
                    <div class="text-end">
                        <p class="font-mono font-bold text-trust-blue">${formatCents(p.total_estimated_cost)}</p>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mt-0.5 dark:text-slate-500" data-i18n="th_est_cost">Est. Cost</p>
                    </div>
                </div>
                
                <div class="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4 flex flex-wrap gap-x-4 gap-y-2 dark:text-slate-400 dark:bg-dark-elevated dark:border-dark-border">
                    <div class="flex items-center gap-1.5">
                        <i class="ph ph-map-pin text-slate-400 dark:text-slate-500" aria-hidden="true"></i>
                        <span>${esc(p.region)}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <i class="ph ph-wrench text-slate-400 dark:text-slate-500" aria-hidden="true"></i>
                        <span>${esc(p.damage_type)}</span>
                    </div>
                </div>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-dark-border">
                    <div class="flex gap-4">
                        <div>
                            <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="th_boq_items">BOQ Items</p>
                            <p class="text-xs font-bold text-slate-700 dark:text-slate-300">${esc(String(p.boq_count))}</p>
                        </div>
                        <div>
                            <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="th_bids">Bids</p>
                            <p class="text-xs font-bold text-slate-700 dark:text-slate-300">${esc(String(p.bid_count))}</p>
                        </div>
                    </div>
                    <button type="button" class="bid-btn px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition-colors shadow-sm"
                            data-project="${esc(p.project_id)}">
                        <span data-i18n="submit_bid">Submit Bid</span>
                    </button>
                </div>
            </div>`,
            emptyState: () => renderEmptyState({
                icon: 'magnifying-glass',
                title: t('ct_no_projects_available', 'No projects available'),
                subtitle: t('ct_new_projects_appear', 'New projects will appear here when published'),
            }),
        });

        // TICK-006: Event delegation for bid buttons.
        // PLT-AUD-E001 FIX: Delegation wired ONCE — guard prevents stacking on re-render.
        if (!delegationWired.marketplace) {
            delegationWired.marketplace = true;
            tbody.addEventListener('click', (e: MouseEvent) => {
                const btn = (e.target as HTMLElement).closest<HTMLElement>('.bid-btn');
                if (!btn) { return; }
                const projectId = btn.dataset['project'];
                if (projectId) {
                    haptic.medium(); // TICK-018: Haptic on bid button click
                    openBidModal(projectId);
                }
            });
        }
    } catch (err) { reportWarning('[ContractorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(tbody, loadMarketplace, undefined, undefined, err);
    }
}

// ─── My Bids ────────────────────────────────────────────────────────────────
async function loadBids(): Promise<void> {
    const tbody = document.getElementById('bids-body');
    if (!tbody) { return; }

    try {
        const res = await contractor.getBids();
        const bids = res.data ?? [];

        // P1-UXA-002 FIX: Progressive rendering for bids list
        renderProgressive({
            items: bids,
            containerEl: tbody,
            pageSize: 20,
            renderItem: (b, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative transition-all dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(b.project_title)}</h3>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${bidColor(b.status)}">${esc(ctBidStatusLabel(b.status))}</span>
                </div>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-3 mt-3 dark:border-dark-border">
                    <div>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="contractor_th_proposed_cost">Proposed Cost</p>
                        <p class="font-mono font-bold text-slate-700 text-sm dark:text-slate-300">${formatCents(b.proposed_cost)}</p>
                    </div>
                    <div>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="contractor_th_timeline">Timeline</p>
                        <p class="text-xs font-bold text-slate-700 text-center dark:text-slate-300">${esc(String(b.estimated_days))} ${esc(t('ct_days_short', 'd'))}</p>
                    </div>
                    <div class="text-end">
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="contractor_th_submitted">Submitted</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${formatDate(b.submitted_at)}</p>
                    </div>
                </div>
            </div>`,
            emptyState: () => renderEmptyState({
                icon: 'flag-banner',
                title: t('ct_no_bids_yet', 'No bids submitted yet'),
                subtitle: t('ct_browse_marketplace', 'Browse the marketplace and submit bids'),
            }),
        });
    } catch (err) { reportWarning('[ContractorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(tbody, loadBids, undefined, undefined, err);
    }
}

// ─── Payments ───────────────────────────────────────────────────────────────
async function loadPayments(): Promise<void> {
    const tbody = document.getElementById('payments-body');
    if (!tbody) { return; }

    try {
        const res = await contractor.getPayments();
        const payments = (res.data ?? []) as unknown as Payment[];

        // P1-UXA-002 FIX: Progressive rendering for payments list
        renderProgressive({
            items: payments,
            containerEl: tbody,
            pageSize: 20,
            renderItem: (p, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative transition-all dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(p.project_title)}</h3>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${escrowColor(p.transaction_type)}">${esc(ctEscrowStatusLabel(p.transaction_type))}</span>
                </div>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-3 mt-3 dark:border-dark-border">
                    <div>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="th_amount">Amount</p>
                        <p class="font-mono font-bold text-smoky-jade text-lg dark:text-emerald-400">${formatCents(p.amount)}</p>
                    </div>
                    <div class="text-end">
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="th_date">Date</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${formatDate(p.created_at)}</p>
                    </div>
                </div>
            </div>`,
            emptyState: () => renderEmptyState({
                icon: 'wallet',
                title: t('ct_no_payments_yet', 'No payments yet'),
            }),
        });
    } catch (err) { reportWarning('[ContractorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(tbody, loadPayments, undefined, undefined, err);
    }
}

// ─── Bid Modal (Native <dialog>) ────────────────────────────────────────────
// P3-001 FIX: Migrated from div-based overlay to native HTML <dialog>.
// Benefits: native focus trapping, ::backdrop, top-layer API, Escape key, a11y.
//
// P2-007 FIX: Rapid-click race elimination — 3 race vectors neutralized:
//   1. OPEN RACE: Module-level `bidModalOpen` flag blocks re-entry.
//   2. SUBMIT RACE: Button disabled IMMEDIATELY on click (before validation).
//   3. CLOSE RACE: Cancel button disabled during in-flight API call.
function openBidModal(projectId: string): void {
    // P2-007 FIX (Race Vector 1): Guard against rapid .bid-btn clicks.
    // PREVIOUS: getElementById('bid-modal')?.remove() was insufficient —
    // on mobile touch, touchend+click double-fire opened 2 dialogs.
    if (bidModalOpen) { return; }
    bidModalOpen = true;

    // Remove any stale modal DOM (defensive — should not exist due to guard)
    document.getElementById('bid-modal')?.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'bid-modal';
    dialog.className = 'nm-dialog p-0 w-[90%] max-w-md rounded-2xl border-0 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm open:animate-fade-in-up';
    // Native <dialog> provides role="dialog" and aria-modal automatically via showModal()
    dialog.setAttribute('aria-labelledby', 'bid-modal-title');
    dialog.innerHTML = `
        <div class="bg-surface rounded-2xl p-6 w-full space-y-4">
            <h3 id="bid-modal-title" class="font-bold text-lg" data-i18n="submit_bid">${esc(t('ct_submit_bid', 'Submit Bid'))}</h3>
            <div>
                <label for="bid-cost" class="text-xs font-bold text-slate-500 uppercase dark:text-slate-400">${esc(t('ct_label_cost', 'Proposed Cost (USD)'))}</label>
                <input id="bid-cost" type="number" min="1" placeholder="25000" inputmode="decimal" enterkeyhint="next" autocomplete="off" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-base" />
            </div>
            <div>
                <label for="bid-days" class="text-xs font-bold text-slate-500 uppercase dark:text-slate-400">${esc(t('ct_label_days', 'Estimated Days'))}</label>
                <input id="bid-days" type="number" min="1" placeholder="90" inputmode="numeric" enterkeyhint="next" autocomplete="off" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-base" />
            </div>
            <div>
                <label for="bid-letter" class="text-xs font-bold text-slate-500 uppercase dark:text-slate-400">${esc(t('ct_label_letter', 'Cover Letter'))}</label>
                <textarea id="bid-letter" rows="3" placeholder="${esc(t('ct_placeholder_letter', 'Why you\'re the best fit...'))}" enterkeyhint="send" autocomplete="off" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-base resize-none"></textarea>
            </div>
            <div class="flex gap-3">
                <button type="button" id="bid-cancel" class="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 dark:text-slate-400" data-i18n="btn_cancel">Cancel</button>
                <button type="button" id="bid-submit" class="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700" data-i18n="btn_submit">Submit</button>
            </div>
            <p id="bid-error" class="text-red-500 text-xs nm-hidden"></p>
        </div>
    `;
    document.body.appendChild(dialog);

    // P3-001: Native dialog.showModal() provides focus trapping, Escape, and ::backdrop.
    const triggerEl = document.activeElement as HTMLElement | null;

    // F-021 FIX: Exit animation for bid modal (was instant dialog.close()).
    // Parity with Hub Sheet which has animate-out before close.
    function closeModal(): void {
        dialog.style.opacity = '0';
        dialog.style.transition = 'opacity 200ms ease-out';
        setTimeout(() => {
            dialog.close();
            triggerEl?.focus();
        }, 200);
    }

    // Native dialog auto-closes on Escape; we listen for cleanup + focus restore
    dialog.addEventListener('close', () => {
        dialog.remove();
        // P2-007 FIX: Release guard on ANY close path (Escape, backdrop, cancel, success).
        bidModalOpen = false;
        triggerEl?.focus();
    });

    // Backdrop click closes dialog (click on dialog element itself = backdrop area)
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) { closeModal(); }
    });

    document.getElementById('bid-cancel')?.addEventListener('click', () => { closeModal(); });

    document.getElementById('bid-submit')?.addEventListener('click', async () => {
        const submitBtn = document.getElementById('bid-submit') as HTMLButtonElement;
        const cancelBtn = document.getElementById('bid-cancel') as HTMLButtonElement;
        const errorEl = document.getElementById('bid-error');

        // P2-007 FIX (Race Vector 2): Disable submit IMMEDIATELY — before validation.
        // PREVIOUS: 30 lines of validation (L508-529) ran BEFORE disable (L531-534).
        // Rapid clicks during validation window fired multiple contractor.submitBid() calls,
        // each with a unique Idempotency-Key (crypto.randomUUID() per call in portals.ts).
        // NOW: Disable is the FIRST action. Re-enable only if validation fails.
        submitBtn.disabled = true;
        submitBtn.classList.add('btn-loading', 'cursor-not-allowed');

        const cost = parseInt((document.getElementById('bid-cost') as HTMLInputElement).value, 10);
        const days = parseInt((document.getElementById('bid-days') as HTMLInputElement).value, 10);
        const letter = (document.getElementById('bid-letter') as HTMLTextAreaElement).value;

        // Helper: re-enable buttons on validation failure
        const reEnableButtons = (): void => {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn-loading', 'cursor-not-allowed');
        };

        if (!cost || !days || cost <= 0 || days <= 0) {
            if (errorEl) { errorEl.textContent = t('ct_fill_cost_days', 'Please fill in cost and days'); errorEl.classList.remove('nm-hidden'); }
            reEnableButtons();
            return;
        }

        // P1-006 FIX (Wave 2): Maximum cost/duration validation — FinTech guard.
        // 10M USD max cost (matches homeowner-portal budget ceiling),
        // 3650 days max (10 years — reasonable upper bound for reconstruction).
        // Standard: FinTech Input Validation, OWASP Input Validation Cheat Sheet.
        const MAX_BID_COST = 10_000_000; // USD
        const MAX_BID_DAYS = 3650;       // ~10 years
        if (cost > MAX_BID_COST) {
            if (errorEl) { errorEl.textContent = t('ct_bid_cost_too_high', `Maximum bid cost is $${MAX_BID_COST.toLocaleString()}`); errorEl.classList.remove('nm-hidden'); }
            reEnableButtons();
            return;
        }
        if (days > MAX_BID_DAYS) {
            if (errorEl) { errorEl.textContent = t('ct_bid_days_too_high', `Maximum timeline is ${MAX_BID_DAYS} days`); errorEl.classList.remove('nm-hidden'); }
            reEnableButtons();
            return;
        }

        // P2-007 FIX (Race Vector 3): Disable cancel during in-flight API call.
        // PREVIOUS: User could click Cancel while submitBid() was mid-flight.
        // This closed the dialog (removing DOM) while the async handler still
        // held references to now-removed elements → silent failure or orphan state.
        cancelBtn.disabled = true;
        cancelBtn.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            const res = await contractor.submitBid({
                project_id: projectId,
                proposed_cost: cost * 100, // Convert to cents
                estimated_days: days,
                cover_letter: letter || undefined,
            });

            if (!res.success) {
                throw new Error(res.error ?? 'Bid failed');
            }

            dialog.close();
            dialog.remove();
            loadStats();
            loadMarketplace();
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = err instanceof Error ? err.message : t('ct_submission_failed', 'Submission failed');
                errorEl.classList.remove('nm-hidden');
            }
            reEnableButtons();
            // Re-enable cancel so user can dismiss after error
            cancelBtn.disabled = false;
            cancelBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });

    // Show dialog — provides native focus trapping + backdrop + escape
    dialog.showModal();
    // Auto-focus first input
    const firstInput = dialog.querySelector<HTMLElement>('input, textarea');
    firstInput?.focus();
}

// P4-001 FIX: setText() moved to shared utils/dom.ts



// ─── Dev-Only Expose (stripped in production builds) ────────────────────────
if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)['contractorPortal'] = {
        switchTab,
        loadStats,
        loadMarketplace,
    };
}

// ─── G8 FIX: Status badge translators (i18n parity) ────────────────────────
function ctPhaseLabel(phase: string): string {
    switch (phase?.toLowerCase()) {
        case 'planning': return t('ct_phase_planning', 'Planning');
        case 'in_progress': return t('ct_phase_in_progress', 'In Progress');
        case 'construction': return t('ct_phase_construction', 'Construction');
        case 'completed': return t('ct_phase_completed', 'Completed');
        case 'delivered': return t('ct_phase_delivered', 'Delivered');
        case 'published': return t('ct_phase_published', 'Published');
        default: return phase;
    }
}

function ctBidStatusLabel(status: string): string {
    switch (status?.toLowerCase()) {
        case 'pending': return t('ct_bid_pending', 'Pending');
        case 'accepted': return t('ct_bid_accepted', 'Accepted');
        case 'rejected': return t('ct_bid_rejected', 'Rejected');
        case 'withdrawn': return t('ct_bid_withdrawn', 'Withdrawn');
        default: return status;
    }
}

function ctEscrowStatusLabel(status: string): string {
    switch (status?.toLowerCase()) {
        case 'locked': return t('ct_escrow_locked', 'Locked');
        case 'released': return t('ct_escrow_released_label', 'Released');
        case 'refunded': return t('ct_escrow_refunded', 'Refunded');
        default: return status;
    }
}
