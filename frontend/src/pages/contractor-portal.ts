import '../styles/main.css';
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { renderTableErrorWithRetry } from '../utils/error-retry';
import { clearAuth } from '../auth';
import { auth as authApi } from '../api';
import { phaseColor, bidColor, escrowColor } from '../utils/status-colors';
import { contractor } from '../api';
import { t } from '../utils/i18n';
import { formatCents } from '../utils/format';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
initPullToRefresh();
initBackToTop();
autoTriggerTour();
import { formatDate } from '../utils/locale';
import { setText } from '../utils/dom';
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';
// TICK-018: Haptic feedback for native-app tactile response
import { haptic } from '../utils/haptic';

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

// PLT-FE-003 FIX: Module-level constant instead of duplicating in setupTabs()/switchTab()
const ALL_TABS: TabName[] = ['dashboard', 'marketplace', 'bids', 'payments'];

// P1-003 FIX: Hash-based tab routing
const hashRouter = createHashRouter(ALL_TABS, 'dashboard');

// ─── DOM Init ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
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

// ─── Tab Switching ──────────────────────────────────────────────────────────
function setupTabs(): void {
    for (const tab of ALL_TABS) {
        const el = document.getElementById(`tab-${tab}`);
        if (!el) { continue; }

        el.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(tab);
        });
    }
}

function switchTab(tab: TabName): void {
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
        }
    }

    // Load data for tab
    if (tab === 'dashboard') { loadStats(); loadProjects(); }
    if (tab === 'marketplace') { loadMarketplace(); }
    if (tab === 'bids') { loadBids(); }
    if (tab === 'payments') { loadPayments(); }
}

// ─── KPI Cards ──────────────────────────────────────────────────────────────
async function loadStats(): Promise<void> {
    try {
        const res = await contractor.getStats();
        if (!res.data) { return; }
        const s = res.data;

        setText('kpi-active', String(s.assigned_projects));
        setText('kpi-pending', String(s.active_bids));
        setText('kpi-won', String(s.completed_projects));
        setText('kpi-escrow', formatCents(s.total_earnings));
        setText('pending-bids-count', String(s.active_bids));
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
        const res = await contractor.getProjects();
        const projects = (res.data ?? []) as unknown as Project[];

        if (projects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-clipboard-text nm-icon-32" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">${esc(t('ct_no_assigned_projects', 'No assigned projects yet'))}</p>
                <p class="text-xs mt-1">${esc(t('ct_browse_marketplace', 'Browse the marketplace and submit bids'))}</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = projects.map((p) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(p.title)}</td>
                <td class="px-5 py-3 text-slate-500">${esc(p.region)}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${phaseColor(p.phase)}">${esc(p.phase)}</span></td>
                <td class="px-5 py-3 text-slate-500">${esc(p.engineer_name ?? '—')}</td>
                <td class="px-5 py-3">
                    <div class="flex items-center gap-2">
                        <div class="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div class="h-full bg-amber-500 rounded-full nm-progress-bar" style="--progress:${Math.min(100, Math.max(0, Number(p.progress) || 0))}%"></div>
                        </div>
                        <span class="text-xs text-slate-400">${esc(String(p.progress))}%</span>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) { reportWarning('[ContractorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderTableErrorWithRetry(tbody, loadProjects, 5);
    }
}

// ─── Marketplace ────────────────────────────────────────────────────────────
async function loadMarketplace(): Promise<void> {
    const tbody = document.getElementById('marketplace-body');
    if (!tbody) { return; }

    try {
        const res = await contractor.getMarketplace();
        const projects = (res.data ?? []) as unknown as MarketProject[];

        if (projects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-magnifying-glass nm-icon-32" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">${esc(t('ct_no_projects_available', 'No projects available'))}</p>
                <p class="text-xs mt-1">${esc(t('ct_new_projects_appear', 'New projects will appear here when published'))}</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = projects.map((p) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(p.title)}</td>
                <td class="px-5 py-3 text-slate-500">${esc(p.region)}</td>
                <td class="px-5 py-3 text-xs">${esc(p.damage_type)}</td>
                <td class="px-5 py-3 font-mono text-sm">${formatCents(p.total_estimated_cost)}</td>
                <td class="px-5 py-3 text-center">${esc(String(p.boq_count))}</td>
                <td class="px-5 py-3 text-center">${esc(String(p.bid_count))}</td>
                <td class="px-5 py-3">
                    <button type="button" class="bid-btn px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition-colors"
                            data-project="${esc(p.project_id)}">
                        <span data-i18n="submit_bid">Submit Bid</span>
                    </button>
                </td>
            </tr>
        `).join('');

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
        renderTableErrorWithRetry(tbody, loadMarketplace, 7);
    }
}

// ─── My Bids ────────────────────────────────────────────────────────────────
async function loadBids(): Promise<void> {
    const tbody = document.getElementById('bids-body');
    if (!tbody) { return; }

    try {
        const res = await contractor.getBids();
        const bids = res.data ?? [];

        if (bids.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-flag-banner nm-icon-32" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">${esc(t('ct_no_bids_yet', 'No bids submitted yet'))}</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = bids.map((b) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(b.project_title)}</td>
                <td class="px-5 py-3 font-mono text-sm">${formatCents(b.proposed_cost)}</td>
                <td class="px-5 py-3">${esc(String(b.estimated_days))} ${esc(t('ct_days_short', 'd'))}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${bidColor(b.status)}">${esc(b.status)}</span></td>
                <td class="px-5 py-3 text-xs text-slate-400">${formatDate(b.created_at)}</td>
            </tr>
        `).join('');
    } catch (err) { reportWarning('[ContractorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderTableErrorWithRetry(tbody, loadBids, 5);
    }
}

// ─── Payments ───────────────────────────────────────────────────────────────
async function loadPayments(): Promise<void> {
    const tbody = document.getElementById('payments-body');
    if (!tbody) { return; }

    try {
        const res = await contractor.getPayments();
        const payments = (res.data ?? []) as unknown as Payment[];

        if (payments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-wallet nm-icon-32" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">${esc(t('ct_no_payments_yet', 'No payments yet'))}</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = payments.map((p) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(p.project_title)}</td>
                <td class="px-5 py-3 font-mono text-sm text-smoky-jade">${formatCents(p.amount)}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${escrowColor(p.transaction_type)}">${esc(p.transaction_type)}</span></td>
                <td class="px-5 py-3 text-xs text-slate-400">${formatDate(p.created_at)}</td>
            </tr>
        `).join('');
    } catch (err) { reportWarning('[ContractorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderTableErrorWithRetry(tbody, loadPayments, 4);
    }
}

// ─── Bid Modal (Inline) ─────────────────────────────────────────────────────
function openBidModal(projectId: string): void {
    // Remove existing modal
    document.getElementById('bid-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'bid-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40';
    // PLT-A11Y-004: ARIA semantics for div-based modal (WCAG 4.1.2).
    // Native <dialog> is the canonical pattern (confirm-action.ts), but this
    // modal uses div-based rendering with JS focus trap for historical reasons.
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bid-modal-title');
    modal.innerHTML = `
        <div class="bg-surface rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 id="bid-modal-title" class="font-bold text-lg" data-i18n="submit_bid">${esc(t('ct_submit_bid', 'Submit Bid'))}</h3>
            <div>
                <label for="bid-cost" class="text-xs font-bold text-slate-500 uppercase">${esc(t('ct_label_cost', 'Proposed Cost (USD)'))}</label>
                <input id="bid-cost" type="number" min="1" placeholder="25000" inputmode="decimal" enterkeyhint="next" autocomplete="off" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
                <label for="bid-days" class="text-xs font-bold text-slate-500 uppercase">${esc(t('ct_label_days', 'Estimated Days'))}</label>
                <input id="bid-days" type="number" min="1" placeholder="90" inputmode="numeric" enterkeyhint="next" autocomplete="off" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
                <label for="bid-letter" class="text-xs font-bold text-slate-500 uppercase">${esc(t('ct_label_letter', 'Cover Letter'))}</label>
                <textarea id="bid-letter" rows="3" placeholder="${esc(t('ct_placeholder_letter', 'Why you\'re the best fit...'))}" enterkeyhint="send" autocomplete="off" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"></textarea>
            </div>
            <div class="flex gap-3">
                <button type="button" id="bid-cancel" class="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200" data-i18n="btn_cancel">Cancel</button>
                <button type="button" id="bid-submit" class="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700" data-i18n="btn_submit">Submit</button>
            </div>
            <p id="bid-error" class="text-red-500 text-xs hidden"></p>
        </div>
    `;
    document.body.appendChild(modal);

    // P0-A11Y-001 FIX: Focus trap (WCAG 2.4.3) — trap Tab within modal
    const triggerEl = document.activeElement as HTMLElement | null;
    const focusableSelector = 'input, textarea, button, [tabindex]:not([tabindex="-1"])';
    function getFocusableEls(): HTMLElement[] {
        return Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector));
    }
    // Auto-focus first input
    const firstInput = modal.querySelector<HTMLElement>('input, textarea');
    firstInput?.focus();

    function trapFocus(e: KeyboardEvent): void {
        if (e.key !== 'Tab') { return; }
        const focusable = getFocusableEls();
        if (focusable.length === 0) { return; }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }
    modal.addEventListener('keydown', trapFocus);

    function closeModal(): void {
        modal.remove();
        document.removeEventListener('keydown', onEscape);
        triggerEl?.focus(); // Restore focus to trigger element
    }

    // P2-AUD-NEW-001: Escape key closes modal
    const onEscape = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') { closeModal(); }
    };
    document.addEventListener('keydown', onEscape);

    // P2-AUD-NEW-002: Backdrop click closes modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) { closeModal(); }
    });

    document.getElementById('bid-cancel')?.addEventListener('click', () => { closeModal(); });

    document.getElementById('bid-submit')?.addEventListener('click', async () => {
        const cost = parseInt((document.getElementById('bid-cost') as HTMLInputElement).value, 10);
        const days = parseInt((document.getElementById('bid-days') as HTMLInputElement).value, 10);
        const letter = (document.getElementById('bid-letter') as HTMLTextAreaElement).value;
        const errorEl = document.getElementById('bid-error');

        if (!cost || !days || cost <= 0 || days <= 0) {
            if (errorEl) { errorEl.textContent = t('ct_fill_cost_days', 'Please fill in cost and days'); errorEl.classList.remove('hidden'); }
            return;
        }

        const submitBtn = document.getElementById('bid-submit') as HTMLButtonElement;
        submitBtn.disabled = true;
        // TICK-013: Spinner icon on bid submit loading state.
        // Previous: Plain text 'Submitting...' — no visual loading indicator.
        // Now: Spinner icon matches engineer-boq publish pattern.
        // Standard: Design System Component Unity, Nielsen #1 (System Status Visibility).
        submitBtn.innerHTML = `<i class="ph ph-spinner ph-lg animate-spin" aria-hidden="true"></i> ${esc(t('btn_submitting', 'Submitting...'))}`;

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

            modal.remove();
            loadStats();
            loadMarketplace();
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = err instanceof Error ? err.message : t('ct_submission_failed', 'Submission failed');
                errorEl.classList.remove('hidden');
            }
            submitBtn.disabled = false;
            // PLT-005 FIX: Use innerHTML consistently — textContent would drop any
            // icon structure if the template ever changes. Match loading state format.
            submitBtn.innerHTML = esc(t('btn_submit', 'Submit'));
        }
    });
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
