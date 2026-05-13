import '../styles/main.css';
import { DONATIONS_ENABLED } from '../utils/feature-flags';
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { renderErrorWithRetry } from '../utils/error-retry';
import { clearAuth } from '../auth';
import { requireAuth } from '../utils/auth-guard';
import { auth as authApi } from '../api';
import { statusColor, escrowColor } from '../utils/status-colors';
import { donor } from '../api';
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

/* ═══════════════════════════════════════════════════════════════════════════
   Donor Portal — Impact Dashboard, Marketplace, Donations, Impact, Proofs
   PLT-FE-001 FIX: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id, CSRF) is handled by the canonical request()
   wrapper — including 30s AbortController timeout for Syria's network conditions.

   FORENSIC-C1.1: GATED — Donation system suspended indefinitely (2026-05-12).
   ═══════════════════════════════════════════════════════════════════════════ */

type TabName = 'dashboard' | 'marketplace' | 'donations' | 'impact' | 'proofs';

// PLT-FE-003 FIX: Module-level constant instead of duplicating in setupTabs()/switchTab()
const ALL_TABS: TabName[] = ['dashboard', 'marketplace', 'donations', 'impact', 'proofs'];

// P1-003 FIX: Hash-based tab routing
const hashRouter = createHashRouter(ALL_TABS, 'dashboard');

// ─── FORENSIC-C1.1 FIX: Suspension Gate ─────────────────────────────────────
// When donations are suspended, replace the entire portal with a clear notice.
// Previous: Portal loaded, called suspended APIs, showed cryptic errors.
// Standard: Nielsen #1 (System Status Visibility) — tell users what's happening.
function showSuspensionNotice(): void {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) { return; }

    mainContent.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
            <div class="size-20 rounded-full bg-warning-yellow/10 flex items-center justify-center">
                <i class="ph ph-clock text-warning-yellow nm-icon-40" aria-hidden="true"></i>
            </div>
            <h2 class="text-lg font-bold" data-i18n="donor_suspended_title">${esc(t('donor_suspended_title', 'Donations Coming Soon'))}</h2>
            <p class="text-sm text-slate-500 max-w-xs dark:text-slate-400" data-i18n="donor_suspended_msg">${esc(t('donor_suspended_msg', 'The donation system is being upgraded. You will be able to fund projects again soon. Thank you for your patience.'))}</p>
            <a href="/" class="btn-primary nm-btn-inline mt-2">
                <i class="ph ph-house" aria-hidden="true"></i>
                <span data-i18n="back_to_home">${esc(t('back_to_home', 'Back to Home'))}</span>
            </a>
        </div>`;
}

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // BLOCKER-1 FIX: Guard all protected content behind auth check.
    if (!requireAuth()) { return; }

    // FORENSIC-C1.1 FIX: Block entire portal when donations are suspended.
    if (!DONATIONS_ENABLED) {
        showSuspensionNotice();
        return;
    }

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
    // P2-AUD-002 FIX: Renamed loop variable from `t` to `tabId` to prevent
    // shadowing the imported i18n `t()` function (line 8).
    for (const tabId of ALL_TABS) {
        const el = document.getElementById(`tab-${tabId}`);
        if (!el) { continue; }
        el.className = tabId === tab
            ? 'flex items-center gap-3 px-3 py-2 bg-trust-blue/10 text-trust-blue rounded-lg cursor-pointer w-full text-start'
            : 'flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer w-full text-start';

        // LB-002 FIX: WCAG 4.1.2 — update aria-selected for screen reader parity
        el.setAttribute('aria-selected', String(tabId === tab));

        // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
        const section = document.getElementById(`section-${tabId}`);
        if (section) { section.classList.toggle('nm-hidden', tabId !== tab); }
    }

    if (tab === 'dashboard') { loadStats(); loadFundedProjects(); }
    if (tab === 'marketplace') { loadMarketplace(); }
    if (tab === 'donations') { loadDonations(); }
    if (tab === 'impact') { loadImpact(); }
    if (tab === 'proofs') { loadProofs(); }
}

// ─── KPIs ───────────────────────────────────────────────────────────────────
async function loadStats(): Promise<void> {
    try {
        const res = await donor.getStats();
        if (!res.data) { return; }
        const s = res.data;

        setText('kpi-donated', formatCents(s.total_donated));
        setText('kpi-projects', String(s.projects_supported));
        setText('kpi-items', String(s.items_funded));
        setText('kpi-score', `${s.impact_score}%`);
        setText('kpi-locked', formatCents(s.escrow_locked));
        setText('kpi-released', formatCents(s.escrow_released));
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // W8-002 FIX: Show em-dash on KPI failure — visible error signal.
        ['kpi-donated', 'kpi-projects', 'kpi-items', 'kpi-score', 'kpi-locked', 'kpi-released'].forEach(id => setText(id, '—'));
    }
}

// ─── Dashboard — Funded Projects ────────────────────────────────────────────
async function loadFundedProjects(): Promise<void> {
    const container = document.getElementById('funded-projects-list');
    if (!container) { return; }

    try {
        const res = await donor.getImpact();
        const projects = res.data ?? [];

        if (projects.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400 dark:text-slate-500">
                <i class="ph ph-hand-heart nm-icon-40" aria-hidden="true"></i>
                <p class="mt-3 text-sm font-medium">${esc(t('donor_no_funded_projects', 'No funded projects yet'))}</p>
                <p class="text-xs mt-1">${esc(t('donor_browse_start_impact', 'Browse projects and start making an impact'))}</p>
            </div>`;
            return;
        }

        container.innerHTML = projects.map((p) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-medium">${esc(p.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${statusColor(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-3 mt-2 text-3xs text-slate-400 dark:text-slate-500">
                            <span><i class="ph ph-tag" aria-hidden="true"></i> ${esc(p.damage_type)}</span>
                            ${p.region ? `<span><i class="ph ph-map-pin" aria-hidden="true"></i> ${esc(p.region)}</span>` : ''}
                            <span class="text-emerald-600 font-bold">${esc(t('donor_my_contribution', 'My contribution'))}: ${formatCents(p.my_total_donated)}</span>
                            <span>${esc(String(p.items_i_funded))} ${esc(t('donor_items_label', 'items'))}</span>
                        </div>
                        <!-- Funding Progress Bar -->
                        <div class="mt-3 flex items-center gap-3">
                            <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div class="h-full bg-emerald-500 rounded-full transition-all nm-progress-bar" style="--progress:${Math.min(p.funded_percentage, 100)}%"></div>
                            </div>
                            <span class="text-3xs font-bold text-emerald-600">${esc(String(p.funded_percentage))}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadFundedProjects, undefined, undefined, err);
    }
}

// ─── Marketplace ────────────────────────────────────────────────────────────
async function loadMarketplace(): Promise<void> {
    const container = document.getElementById('marketplace-list');
    if (!container) { return; }

    try {
        const res = await donor.getMarketplace();
        const projects = res.data ?? [];

        if (projects.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400 dark:text-slate-500">
                <p class="text-sm font-medium">${esc(t('donor_no_marketplace_projects', 'No projects available at the moment'))}</p>
            </div>`;
            return;
        }

        container.innerHTML = projects.map((p) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <h4 class="font-medium">${esc(p.title)}</h4>
                        <div class="flex items-center gap-3 mt-1 text-3xs text-slate-400 dark:text-slate-500">
                            <span><i class="ph ph-tag" aria-hidden="true"></i> ${esc(p.damage_type)}</span>
                            ${p.region ? `<span><i class="ph ph-map-pin" aria-hidden="true"></i> ${esc(p.region)}</span>` : ''}
                            <span>${esc(String(p.items_count))} ${esc(t('donor_items_label', 'items'))}</span>
                        </div>
                        <div class="mt-3 flex items-center gap-3">
                            <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all ${p.funded_percentage >= 100 ? 'bg-green-500' : 'bg-emerald-400'} nm-progress-bar" style="--progress:${Math.min(p.funded_percentage, 100)}%"></div>
                            </div>
                            <span class="text-3xs font-bold ${p.funded_percentage >= 100 ? 'text-green-600' : 'text-emerald-600'}">${esc(String(p.funded_percentage))}%</span>
                        </div>
                        <div class="flex items-center justify-between mt-2">
                            <span class="text-xs text-slate-500 dark:text-slate-400">${formatCents(p.total_funded)} / ${formatCents(p.total_cost)}</span>
                            ${p.funded_percentage < 100 ? `
                                <a href="/donor-basket.html?project=${esc(p.project_id)}" class="px-3 py-1 bg-emerald-600 text-white text-3xs font-bold rounded-lg hover:bg-emerald-700">${esc(t('donor_fund_this', 'Fund This'))}</a>
                            ` : `<span class="text-3xs font-bold text-green-600" data-i18n="fully_funded"><i class="ph ph-check-circle nm-icon-gap-end" aria-hidden="true"></i>${esc(t('fully_funded', 'Fully Funded'))}</span>`}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadMarketplace, undefined, undefined, err);
    }
}

// ─── Donation History ───────────────────────────────────────────────────────
async function loadDonations(): Promise<void> {
    const tbody = document.getElementById('donations-body');
    if (!tbody) { return; }

    try {
        const res = await donor.getDonations();
        const donations = res.data ?? [];

        if (donations.length === 0) {
            tbody.innerHTML = `
            <div class="bg-white rounded-xl border border-slate-200 py-12 text-center shadow-sm w-full dark:bg-dark-surface dark:border-dark-border">
                <div class="size-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 text-slate-400 dark:bg-dark-elevated dark:text-slate-500">
                    <i class="ph ph-hand-heart nm-icon-32" aria-hidden="true"></i>
                </div>
                <p class="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">${esc(t('donor_no_donations', 'No donations yet'))}</p>
            </div>`;
            return;
        }

        tbody.innerHTML = donations.map((d) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative transition-all dark:bg-dark-surface dark:border-dark-border">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(d.material_name)}</h3>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${escrowColor(d.status)}">${esc(d.status)}</span>
                </div>
                
                <div class="text-xs text-slate-500 mb-4 flex items-center gap-1.5 overflow-hidden dark:text-slate-400">
                    <i class="ph ph-buildings shrink-0" aria-hidden="true"></i>
                    <span class="truncate">${esc(d.project_title)}</span>
                </div>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-dark-border">
                    <div>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="th_amount">Amount</p>
                        <p class="font-mono font-bold text-emerald-600">${formatCents(d.amount_locked)}</p>
                    </div>
                    <div class="text-end">
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="th_date">Date</p>
                        <p class="text-xs text-slate-600 dark:text-slate-400">${formatDate(d.locked_at)}</p>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(tbody, loadDonations, undefined, undefined, err);
    }
}

// ─── Impact ─────────────────────────────────────────────────────────────────
async function loadImpact(): Promise<void> {
    const container = document.getElementById('impact-list');
    if (!container) { return; }

    try {
        const res = await donor.getImpact();
        const projects = res.data ?? [];

        if (projects.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400 dark:text-slate-500">
                <p class="text-sm font-medium">${esc(t('donor_no_impact', 'No impact data yet'))}</p>
            </div>`;
            return;
        }

        container.innerHTML = projects.map((p) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-center gap-4">
                    <div class="size-12 rounded-lg flex items-center justify-center ${p.status === 'completed' ? 'bg-green-100' : 'bg-emerald-100'}">
                        <i class="ph ${p.status === 'completed' ? 'ph-check-circle text-green-600' : 'ph-buildings text-emerald-600'} text-xl" aria-hidden="true"></i>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-medium">${esc(p.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${statusColor(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span>
                        </div>
                        <div class="flex items-center gap-3 mt-1 text-3xs text-slate-400 dark:text-slate-500">
                            <span>${esc(t('donor_donated_label', 'Donated'))}: <strong class="text-emerald-600">${formatCents(p.my_total_donated)}</strong></span>
                            <span>${esc(String(p.items_i_funded))} ${esc(t('donor_items_funded', 'items funded'))}</span>
                            <span>${esc(t('donor_progress_label', 'Progress'))}: <strong class="${p.funded_percentage >= 100 ? 'text-green-600' : 'text-emerald-600'}">${esc(String(p.funded_percentage))}%</strong></span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadImpact, undefined, undefined, err);
    }
}

// ─── Proofs ─────────────────────────────────────────────────────────────────
async function loadProofs(): Promise<void> {
    const container = document.getElementById('proofs-grid');
    if (!container) { return; }

    try {
        const res = await donor.getProofs();
        const proofs = res.data ?? [];

        if (proofs.length === 0) {
            container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 dark:text-slate-500">
                <i class="ph ph-camera nm-icon-40" aria-hidden="true"></i>
                <p class="mt-3 text-sm font-medium">${esc(t('donor_no_proofs', 'No proofs yet'))}</p>
                <p class="text-xs mt-1">${esc(t('donor_proofs_hint', 'GPS-verified photos appear here after on-site verification'))}</p>
            </div>`;
            return;
        }

        container.innerHTML = proofs.map((proof) => `
            <div class="border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow dark:border-dark-border">
                <div class="aspect-video bg-slate-100 flex items-center justify-center relative">
                    ${proof.photo_url
                ? `<img src="${esc(proof.photo_url)}" alt="${esc(t('donor_site_proof', 'Site proof'))}" class="w-full h-full object-cover" loading="lazy" />`
                : `<i class="ph ph-image text-slate-300 nm-icon-40" aria-hidden="true"></i>`
            }
                    ${proof.gps_lat ? `
                        <div class="absolute bottom-2 end-2 bg-black/60 text-white text-3xs px-2 py-1 rounded-full font-mono">
                            <i class="ph ph-map-pin" aria-hidden="true"></i> ${proof.gps_lat.toFixed(4)}, ${proof.gps_lng?.toFixed(4) ?? ''}
                        </div>
                    ` : ''}
                </div>
                <div class="p-3">
                    <p class="font-medium text-sm">${esc(proof.project_title)}</p>
                    <p class="text-3xs text-slate-400 mt-0.5 dark:text-slate-500">${esc(proof.material_name ?? t('not_available', 'N/A'))}</p>
                    ${proof.verified_by ? `<p class="text-3xs text-emerald-600 mt-1"><i class="ph ph-shield-check" aria-hidden="true"></i> ${esc(proof.verified_by)}</p>` : ''}
                    ${proof.verified_at ? `<p class="text-3xs text-slate-400 dark:text-slate-500">${formatDate(proof.verified_at)}</p>` : ''}
                </div>
            </div>
        `).join('');
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        renderErrorWithRetry(container, loadProofs, undefined, undefined, err);
    }
}

// P4-001 FIX: setText() moved to shared utils/dom.ts


