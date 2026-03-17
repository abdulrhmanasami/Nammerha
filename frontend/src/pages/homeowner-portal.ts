import '../styles/main.css';
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { renderErrorWithRetry, renderTableErrorWithRetry } from '../utils/error-retry';
import { clearAuth } from '../auth';
import { auth as authApi } from '../api';
import { statusColor, tradeColor, urgencyColor } from '../utils/status-colors';
import { homeowner } from '../api';
import { formatCents, relativeTimeAgo } from '../utils/format';
import { t } from '../utils/i18n';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
initPullToRefresh();
initBackToTop();
autoTriggerTour();
import { setText } from '../utils/dom';
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';

// ─── HIGH-002 FIX: Inline banner replaces native alert() ────────────────────
let srBannerTimeout: ReturnType<typeof setTimeout> | null = null;
function showSrBanner(type: 'error' | 'success', message: string): void {
    const existing = document.getElementById('sr-inline-banner');
    if (existing) { existing.remove(); }
    if (srBannerTimeout) { clearTimeout(srBannerTimeout); }
    const div = document.createElement('div');
    div.id = 'sr-inline-banner';
    div.className = type === 'error'
        ? 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 mb-3 animate-fade-in-up'
        : 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 mb-3 animate-fade-in-up';
    div.innerHTML = `<i class="ph ph-${type === 'error' ? 'warning-circle' : 'check-circle'}" aria-hidden="true"></i> ${esc(message)}`;
    const form = document.getElementById('sr-form') ?? document.getElementById('submit-sr-btn')?.parentElement;
    if (form) { form.prepend(div); }
    srBannerTimeout = setTimeout(() => div.remove(), 5000);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Homeowner Portal — Dashboard, Projects, Service Requests, Approvals, Escrow
   PLT-FE-001 FIX: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id, CSRF) is handled by the canonical request()
   wrapper — including 30s AbortController timeout for Syria's network conditions.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Types (local rendering shapes) ─────────────────────────────────────────
interface Project {
    project_id: string;
    title: string;
    damage_type: string;
    status: string;
    region: string | null;
    engineer_name: string | null;
    contractor_name: string | null;
    bid_count: number;
    total_boq_cost: number;
    created_at: string;
}

interface Approval {
    approval_id: string;
    project_id: string;
    project_title: string;
    title: string;
    description: string | null;
    engineer_name: string;
    status: string;
    created_at: string;
}

interface EscrowData {
    total_deposited: number;
    total_released: number;
    held_in_escrow: number;
    projects_with_escrow: number;
}

type TabName = 'dashboard' | 'projects' | 'requests' | 'approvals' | 'payments';

// PLT-FE-003 FIX: Module-level constant
const ALL_TABS: TabName[] = ['dashboard', 'projects', 'requests', 'approvals', 'payments'];

// P1-003 FIX: Hash-based tab routing — bookmarkable, deep-linkable
const hashRouter = createHashRouter(ALL_TABS, 'dashboard');

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupServiceRequestForm();
    setupToggleDetails();  // CONF-N04 FIX
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

// ─── CONF-N04 FIX: Toggle Details via addEventListener ──────────────────────
// Previous: inline onclick in HTML — violated CSP script-src 'self'.
// FRC-N06 FIX: After toggling, re-applies i18n to translate new data-i18n spans.
// Standard: CSP Level 2 §4.1, OWASP XSS Prevention Cheat Sheet.
function setupToggleDetails(): void {
    const btn = document.getElementById('sr-toggle-details');
    const wrap = document.getElementById('sr-details-wrap');
    if (!btn || !wrap) { return; }

    let isExpanded = false;

    btn.addEventListener('click', () => {
        isExpanded = !isExpanded;
        if (isExpanded) {
            wrap.classList.remove('hidden');
            btn.innerHTML = '<i class="ph ph-minus-circle" aria-hidden="true"></i> <span data-i18n="ho_fewer_details">Fewer Details</span>';
        } else {
            wrap.classList.add('hidden');
            btn.innerHTML = '<i class="ph ph-plus-circle" aria-hidden="true"></i> <span data-i18n="ho_add_details">Add Details</span>';
        }
        // FRC-N06 FIX: Re-translate the newly injected data-i18n spans
        // so Arabic users don't see English fallback text after toggling.
        import('../utils/locale').then(m => m.applyI18n()).catch(() => { /* non-critical */ });
    });
}

// ─── Tab Navigation ─────────────────────────────────────────────────────────
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
    // P2-001 FIX: Renamed loop variable from `t` to `tabId` to prevent
    // shadowing the imported i18n `t()` function (line 9).
    for (const tabId of ALL_TABS) {
        const el = document.getElementById(`tab-${tabId}`);
        if (!el) { continue; }
        el.className = tabId === tab
            ? 'flex items-center gap-3 px-3 py-2 bg-blue-600/10 text-blue-700 rounded-lg cursor-pointer'
            : 'flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer';

        const section = document.getElementById(`section-${tabId}`);
        if (section) { section.style.display = tabId === tab ? '' : 'none'; }
    }

    if (tab === 'dashboard') { loadStats(); loadDashboardProjects(); }
    if (tab === 'projects') { loadProjects(); }
    if (tab === 'requests') { loadServiceRequests(); }
    if (tab === 'approvals') { loadApprovals(); }
    if (tab === 'payments') { loadEscrow(); }
}

// ─── KPIs ───────────────────────────────────────────────────────────────────
async function loadStats(): Promise<void> {
    try {
        const res = await homeowner.getStats();
        if (!res.data) { return; }
        const s = res.data;

        setText('kpi-active', String(s.active_projects));
        // P2-AUD-KPI-001 FIX: Use total_bids_received (was duplicating pending_approvals)
        setText('kpi-bids', String(s.total_bids_received));
        setText('kpi-approvals', String(s.pending_approvals));
        // P2-AUD-KPI-001 FIX: Backend field is total_invested, not total_funded
        setText('kpi-escrow', formatCents(s.total_invested));
        setText('approval-count', String(s.pending_approvals));
    } catch (err) { reportWarning('[HomeownerPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // Silent degradation — KPIs retain HTML defaults
    }
}

// ─── Dashboard — Active Projects ────────────────────────────────────────────
async function loadDashboardProjects(): Promise<void> {
    const container = document.getElementById('active-projects-list');
    if (!container) { return; }

    try {
        const res = await homeowner.getProjects();
        const allProjects = (res.data ?? []) as unknown as Project[];
        const projects = allProjects.filter((p) => !['completed', 'cancelled'].includes(p.status));

        if (projects.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <i class="ph ph-house" style="font-size:40px" aria-hidden="true"></i>
                <p class="mt-3 text-sm font-medium">${esc(t('ho_no_active_projects', 'No active projects'))}</p>
                <p class="text-xs mt-1">${esc(t('ho_report_to_start', 'Report damage to get started'))}</p>
                <a href="/homeowner-report.html" class="inline-block mt-3 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg">${esc(t('ho_report_damage', 'Report Damage'))}</a>
            </div>`;
            return;
        }

        container.innerHTML = projects.map((p) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-medium">${esc(p.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-slate-400">
                            <span><i class="ph ph-tag" aria-hidden="true"></i> ${esc(p.damage_type)}</span>
                            ${p.engineer_name ? `<span><i class="ph ph-hard-hat" aria-hidden="true"></i> ${esc(p.engineer_name)}</span>` : ''}
                            ${p.contractor_name ? `<span><i class="ph ph-crane" aria-hidden="true"></i> ${esc(p.contractor_name)}</span>` : ''}
                            ${p.bid_count > 0 ? `<span class="text-blue-600 font-bold"><i class="ph ph-file-text" aria-hidden="true"></i> ${p.bid_count} ${esc(t('ho_bids', 'bids'))}</span>` : ''}
                        </div>
                        ${p.total_boq_cost > 0 ? `<p class="text-xs text-slate-500 mt-1">${esc(t('ho_boq_total', 'BOQ Total'))}: <span class="font-mono font-bold">${formatCents(p.total_boq_cost)}</span></p>` : ''}
                    </div>
                    <span class="text-[10px] text-slate-400 shrink-0">${esc(p.project_id)}</span>
                </div>
            </div>
        `).join('');
    } catch (err) { reportWarning('[HomeownerPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadDashboardProjects);
    }
}

// ─── All Projects ───────────────────────────────────────────────────────────
async function loadProjects(): Promise<void> {
    const tbody = document.getElementById('projects-body');
    if (!tbody) { return; }

    try {
        const res = await homeowner.getProjects();
        const projects = (res.data ?? []) as unknown as Project[];

        if (projects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">
                <p class="text-sm font-medium">${esc(t('ho_no_projects_yet', 'No projects yet'))}</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = projects.map((p) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3">
                    <p class="font-medium">${esc(p.title)}</p>
                    <p class="text-[10px] text-slate-400">${esc(p.project_id)}</p>
                </td>
                <td class="px-5 py-3">${esc(p.damage_type)}</td>
                <td class="px-5 py-3 text-xs">${esc(p.engineer_name ?? '—')}</td>
                <td class="px-5 py-3 text-xs">${esc(p.contractor_name ?? '—')}</td>
                <td class="px-5 py-3"><span class="text-blue-600 font-bold text-xs">${p.bid_count}</span></td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span></td>
            </tr>
        `).join('');
    } catch (err) { reportWarning('[HomeownerPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderTableErrorWithRetry(tbody, loadProjects, 6);
    }
}

// ─── Service Request Form ───────────────────────────────────────────────────
function setupServiceRequestForm(): void {
    const btn = document.getElementById('submit-sr-btn');
    if (!btn) { return; }

    btn.addEventListener('click', async () => {
        const trade = (document.getElementById('sr-trade') as HTMLSelectElement)?.value;
        const title = (document.getElementById('sr-title') as HTMLInputElement)?.value;
        const desc = (document.getElementById('sr-description') as HTMLTextAreaElement)?.value;
        const address = (document.getElementById('sr-address') as HTMLInputElement)?.value;
        const budget = (document.getElementById('sr-budget') as HTMLInputElement)?.value;
        const urgency = (document.getElementById('sr-urgency') as HTMLSelectElement)?.value;

        if (!title) {
            showSrBanner('error', t('ho_sr_title_required', 'Please enter a title for your request'));
            return;
        }

        const b = btn as HTMLButtonElement;
        b.disabled = true;
        b.textContent = t('ho_submitting', 'Submitting...');

        try {
            const res = await homeowner.createServiceRequest({
                trade_needed: trade,
                title,
                description: desc || undefined,
                address_text: address || undefined,
                urgency: (urgency || 'low') as 'low' | 'medium' | 'high' | 'emergency',
                budget_max: budget ? parseInt(budget, 10) * 100 : undefined,
            });

            if (!res.success) {
                throw new Error(res.error ?? t('ho_failed', 'Failed'));
            }

            b.innerHTML = `<i class="ph ph-check" style="margin-inline-end:4px"></i>${t('ho_submitted', 'Submitted')}`;
            b.className = 'px-5 py-2.5 bg-green-100 text-green-700 text-sm font-bold rounded-lg';

            // Reset form
            (document.getElementById('sr-title') as HTMLInputElement).value = '';
            (document.getElementById('sr-description') as HTMLTextAreaElement).value = '';
            (document.getElementById('sr-address') as HTMLInputElement).value = '';
            (document.getElementById('sr-budget') as HTMLInputElement).value = '';

            setTimeout(() => {
                b.textContent = t('ho_submit_request', '📢 Submit Request');
                b.className = 'px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors';
                b.disabled = false;
            }, 2000);

            loadServiceRequests();
            loadStats();
        } catch (err) {
            b.textContent = err instanceof Error ? err.message : t('ho_failed', 'Failed');
            b.className = 'px-5 py-2.5 bg-red-100 text-red-600 text-sm font-bold rounded-lg';
            setTimeout(() => {
                b.textContent = t('ho_submit_request', '📢 Submit Request');
                b.className = 'px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors';
                b.disabled = false;
            }, 3000);
        }
    });
}

// ─── Service Requests List ──────────────────────────────────────────────────
async function loadServiceRequests(): Promise<void> {
    const tbody = document.getElementById('requests-body');
    if (!tbody) { return; }

    try {
        const res = await homeowner.getServiceRequests();
        const requests = res.data ?? [];

        if (requests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">
                <p class="text-sm font-medium">${esc(t('ho_no_requests_yet', 'No service requests yet'))}</p>
                <p class="text-xs mt-1">${esc(t('ho_post_first_request', 'Use the form above to post your first request'))}</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = requests.map((r) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(r.title)}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tradeColor(r.trade_needed)}">${esc(r.trade_needed)}</span></td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${urgencyColor(r.urgency)}">${esc(r.urgency)}</span></td>
                <td class="px-5 py-3 text-xs">—</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(r.status)}">${esc(r.status)}</span></td>
                <td class="px-5 py-3">
                    ${['open', 'matched'].includes(r.status) ? `
                        <button class="cancel-sr-btn px-2.5 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-lg hover:bg-red-200" data-id="${esc(r.request_id)}">${esc(t('ho_cancel', 'Cancel'))}</button>
                    ` : '—'}
                </td>
            </tr>
        `).join('');

        // Cancel handlers
        tbody.querySelectorAll('.cancel-sr-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = (btn as HTMLElement).dataset['id'];
                if (!id) { return; }
                try {
                    await homeowner.cancelServiceRequest(id);
                    loadServiceRequests();
                    loadStats();
                } catch (err) { reportWarning('[HomeownerPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
                    // Silent — error captured by centralized reporter
                }
            });
        });
    } catch (err) { reportWarning('[HomeownerPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderTableErrorWithRetry(tbody, loadServiceRequests, 6);
    }
}

// ─── Approvals ──────────────────────────────────────────────────────────────
async function loadApprovals(): Promise<void> {
    const container = document.getElementById('approvals-list');
    if (!container) { return; }

    try {
        const res = await homeowner.getApprovals();
        const approvals = (res.data ?? []) as unknown as Approval[];

        if (approvals.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <i class="ph ph-check-square" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">${esc(t('ho_no_pending_approvals', 'No pending approvals'))}</p>
            </div>`;
            return;
        }

        container.innerHTML = approvals.map((a) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-medium">${esc(a.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(a.status)}">${esc(a.status)}</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-1">${esc(a.description ?? t('ho_no_description', 'No description'))}</p>
                        <div class="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                            <span><i class="ph ph-buildings" aria-hidden="true"></i> ${esc(a.project_title)}</span>
                            <span><i class="ph ph-hard-hat" aria-hidden="true"></i> ${esc(a.engineer_name)}</span>
                            <span><i class="ph ph-clock" aria-hidden="true"></i> ${relativeTimeAgo(a.created_at)}</span>
                        </div>
                    </div>
                    ${a.status === 'pending' ? `
                        <div class="flex gap-1.5 shrink-0">
                            <button class="approval-btn px-3 py-1.5 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700"
                                    data-id="${esc(a.approval_id)}" data-decision="approved">${esc(t('ho_approve', 'Approve'))}</button>
                            <button class="approval-btn px-3 py-1.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-lg hover:bg-red-200"
                                    data-id="${esc(a.approval_id)}" data-decision="rejected">${esc(t('ho_reject', 'Reject'))}</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        // Approval handlers
        container.querySelectorAll('.approval-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = (btn as HTMLElement).dataset['id'];
                const decision = (btn as HTMLElement).dataset['decision'] as 'approved' | 'rejected';
                if (!id || !decision) { return; }
                try {
                    await homeowner.respondToApproval(id, decision);
                    loadApprovals();
                    loadStats();
                } catch (err) { reportWarning('[HomeownerPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
                    // Silent — error captured by centralized reporter
                }
            });
        });
    } catch (err) { reportWarning('[HomeownerPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadApprovals);
    }
}

// ─── Escrow ─────────────────────────────────────────────────────────────────
async function loadEscrow(): Promise<void> {
    const container = document.getElementById('escrow-content');
    if (!container) { return; }

    try {
        const res = await homeowner.getEscrow();
        const e = (res.data ?? {}) as unknown as EscrowData;

        container.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-blue-50 rounded-xl p-4">
                    <p class="text-[10px] font-bold text-blue-400 uppercase">${esc(t('ho_total_deposited', 'Total Deposited'))}</p>
                    <p class="text-xl font-black mt-1 text-blue-700">${formatCents(e.total_deposited ?? 0)}</p>
                </div>
                <div class="bg-green-50 rounded-xl p-4">
                    <p class="text-[10px] font-bold text-green-400 uppercase">${esc(t('ho_released', 'Released'))}</p>
                    <p class="text-xl font-black mt-1 text-green-700">${formatCents(e.total_released ?? 0)}</p>
                </div>
                <div class="bg-amber-50 rounded-xl p-4">
                    <p class="text-[10px] font-bold text-amber-400 uppercase">${esc(t('ho_held_in_escrow', 'Held in Escrow'))}</p>
                    <p class="text-xl font-black mt-1 text-amber-700">${formatCents(e.held_in_escrow ?? 0)}</p>
                </div>
                <div class="bg-slate-50 rounded-xl p-4">
                    <p class="text-[10px] font-bold text-slate-400 uppercase">${esc(t('ho_projects', 'Projects'))}</p>
                    <p class="text-xl font-black mt-1">${e.projects_with_escrow ?? 0}</p>
                </div>
            </div>
            ${(e.held_in_escrow ?? 0) > 0 ? `
                <div class="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div class="flex items-center gap-2 text-blue-700">
                        <i class="ph ph-shield-check" style="font-size:20px" aria-hidden="true"></i>
                        <p class="text-sm font-medium">${esc(t('ho_escrow_guarantee', 'Your funds are secured in escrow and will be released upon approved construction milestones.'))}</p>
                    </div>
                </div>
            ` : ''}
        `;
    } catch (err) { reportWarning('[HomeownerPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadEscrow);
    }
}

// P4-001 FIX: setText() moved to shared utils/dom.ts
// MED-004 FIX: timeAgo() removed — replaced by relativeTimeAgo() from '../utils/format'
// which uses Intl.RelativeTimeFormat for proper Arabic/RTL rendering.
