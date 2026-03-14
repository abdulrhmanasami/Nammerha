import '../styles/main.css';
import { escapeHtml as esc } from '../utils/xss';
import { phaseColor, bidColor } from '../utils/status-colors';
import { contractor } from '../api';

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

// PLT-FE-003 FIX: Module-level constant instead of duplicating in setupTabs()/switchTab()
const ALL_TABS: TabName[] = ['dashboard', 'marketplace', 'bids', 'payments'];

// ─── DOM Init ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    loadStats();
    loadProjects();
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
    // Update sidebar
    for (const t of ALL_TABS) {
        const el = document.getElementById(`tab-${t}`);
        if (!el) { continue; }

        if (t === tab) {
            el.className = 'flex items-center gap-3 px-3 py-2 bg-amber-600/10 text-amber-700 rounded-lg cursor-pointer';
        } else {
            el.className = 'flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer';
        }
    }

    // Show/hide sections
    for (const t of ALL_TABS) {
        const section = document.getElementById(`section-${t}`);
        if (section) {
            section.style.display = t === tab ? '' : 'none';
        }
    }

    // Load data for tab
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
        setText('kpi-escrow', `$${(s.total_earnings / 100).toLocaleString()}`);
        setText('pending-bids-count', String(s.active_bids));
    } catch {
        // Silent degradation — KPIs retain HTML defaults
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
                <i class="ph ph-clipboard-text" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">No assigned projects yet</p>
                <p class="text-xs mt-1">Browse the marketplace and submit bids</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = projects.map((p) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(p.title)}</td>
                <td class="px-5 py-3 text-slate-500">${esc(p.region)}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${phaseColor(p.phase)}">${esc(p.phase)}</span></td>
                <td class="px-5 py-3 text-slate-500">${esc(p.engineer_name ?? '—')}</td>
                <td class="px-5 py-3">
                    <div class="flex items-center gap-2">
                        <div class="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div class="h-full bg-amber-500 rounded-full" style="width:${p.progress}%"></div>
                        </div>
                        <span class="text-xs text-slate-400">${p.progress}%</span>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch {
        tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-4 text-center text-red-400 text-sm" data-i18n="failed_to_load">Failed to load</td></tr>`;
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
                <i class="ph ph-magnifying-glass" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">No projects available</p>
                <p class="text-xs mt-1">New projects will appear here when published</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = projects.map((p) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(p.title)}</td>
                <td class="px-5 py-3 text-slate-500">${esc(p.region)}</td>
                <td class="px-5 py-3 text-xs">${esc(p.damage_type)}</td>
                <td class="px-5 py-3 font-mono text-sm">$${(p.total_estimated_cost / 100).toLocaleString()}</td>
                <td class="px-5 py-3 text-center">${p.boq_count}</td>
                <td class="px-5 py-3 text-center">${p.bid_count}</td>
                <td class="px-5 py-3">
                    <button class="bid-btn px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition-colors"
                            data-project="${esc(p.project_id)}">
                        <span data-i18n="submit_bid">Submit Bid</span>
                    </button>
                </td>
            </tr>
        `).join('');

        // Attach bid button handlers
        tbody.querySelectorAll('.bid-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const projectId = (btn as HTMLElement).dataset['project'];
                if (projectId) { openBidModal(projectId); }
            });
        });
    } catch {
        tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-4 text-center text-red-400 text-sm" data-i18n="failed_to_load">Failed to load</td></tr>`;
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
                <i class="ph ph-flag-banner" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">No bids submitted yet</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = bids.map((b) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(b.project_title)}</td>
                <td class="px-5 py-3 font-mono text-sm">$${(b.proposed_cost / 100).toLocaleString()}</td>
                <td class="px-5 py-3">${b.estimated_days}d</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${bidColor(b.status)}">${esc(b.status)}</span></td>
                <td class="px-5 py-3 text-xs text-slate-400">${new Date(b.created_at).toLocaleDateString()}</td>
            </tr>
        `).join('');
    } catch {
        tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-4 text-center text-red-400 text-sm" data-i18n="failed_to_load">Failed to load</td></tr>`;
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
                <i class="ph ph-wallet" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">No payments yet</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = payments.map((p) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(p.project_title)}</td>
                <td class="px-5 py-3 font-mono text-sm text-smoky-jade">$${(p.amount / 100).toLocaleString()}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.transaction_type === 'release' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}">${esc(p.transaction_type)}</span></td>
                <td class="px-5 py-3 text-xs text-slate-400">${new Date(p.created_at).toLocaleDateString()}</td>
            </tr>
        `).join('');
    } catch {
        tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-4 text-center text-red-400 text-sm" data-i18n="failed_to_load">Failed to load</td></tr>`;
    }
}

// ─── Bid Modal (Inline) ─────────────────────────────────────────────────────
function openBidModal(projectId: string): void {
    // Remove existing modal
    document.getElementById('bid-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'bid-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 class="font-bold text-lg" data-i18n="submit_bid">Submit Bid</h3>
            <div>
                <label class="text-xs font-bold text-slate-500 uppercase">Proposed Cost (USD)</label>
                <input id="bid-cost" type="number" min="1" placeholder="25000" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
                <label class="text-xs font-bold text-slate-500 uppercase">Estimated Days</label>
                <input id="bid-days" type="number" min="1" placeholder="90" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
                <label class="text-xs font-bold text-slate-500 uppercase">Cover Letter</label>
                <textarea id="bid-letter" rows="3" placeholder="Why you're the best fit..." class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"></textarea>
            </div>
            <div class="flex gap-3">
                <button id="bid-cancel" class="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200" data-i18n="btn_cancel">Cancel</button>
                <button id="bid-submit" class="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700" data-i18n="btn_submit">Submit</button>
            </div>
            <p id="bid-error" class="text-red-500 text-xs hidden"></p>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('bid-cancel')?.addEventListener('click', () => { modal.remove(); });

    document.getElementById('bid-submit')?.addEventListener('click', async () => {
        const cost = parseInt((document.getElementById('bid-cost') as HTMLInputElement).value, 10);
        const days = parseInt((document.getElementById('bid-days') as HTMLInputElement).value, 10);
        const letter = (document.getElementById('bid-letter') as HTMLTextAreaElement).value;
        const errorEl = document.getElementById('bid-error');

        if (!cost || !days || cost <= 0 || days <= 0) {
            if (errorEl) { errorEl.textContent = 'Please fill in cost and days'; errorEl.classList.remove('hidden'); }
            return;
        }

        const submitBtn = document.getElementById('bid-submit') as HTMLButtonElement;
        submitBtn.disabled = true;
        submitBtn.textContent = (typeof window.NammerhaI18n?.t === 'function' ? window.NammerhaI18n.t('btn_submitting', 'Submitting...') : null) ?? 'Submitting...';

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
                errorEl.textContent = err instanceof Error ? err.message : 'Submission failed';
                errorEl.classList.remove('hidden');
            }
            submitBtn.disabled = false;
            submitBtn.textContent = (typeof window.NammerhaI18n?.t === 'function' ? window.NammerhaI18n.t('btn_submit', 'Submit') : null) ?? 'Submit';
        }
    });
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) { el.textContent = text; }
}



// ─── Expose for global access ───────────────────────────────────────────────
(window as unknown as Record<string, unknown>)['contractorPortal'] = {
    switchTab,
    loadStats,
    loadMarketplace,
};
