import '../styles/main.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Homeowner Portal — Dashboard, Projects, Service Requests, Approvals, Escrow
   Wires to: /api/homeowner/*
   ═══════════════════════════════════════════════════════════════════════════ */

const API = '/api/homeowner';

function getToken(): string {
    return localStorage.getItem('nammerha_token') ?? '';
}

const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
});

// ─── Types ──────────────────────────────────────────────────────────────────
interface Stats {
    active_projects: number;
    completed_projects: number;
    pending_approvals: number;
    active_service_requests: number;
    total_invested: number;
    total_bids_received: number;
}

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

interface ServiceReq {
    request_id: string;
    trade_needed: string;
    title: string;
    description: string | null;
    urgency: string;
    status: string;
    tradesperson_name: string | null;
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

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupServiceRequestForm();
    loadStats();
    loadDashboardProjects();
});

// ─── Tab Navigation ─────────────────────────────────────────────────────────
function setupTabs(): void {
    const tabs: TabName[] = ['dashboard', 'projects', 'requests', 'approvals', 'payments'];

    for (const tab of tabs) {
        const el = document.getElementById(`tab-${tab}`);
        if (!el) { continue; }
        el.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(tab);
        });
    }
}

function switchTab(tab: TabName): void {
    const allTabs: TabName[] = ['dashboard', 'projects', 'requests', 'approvals', 'payments'];

    for (const t of allTabs) {
        const el = document.getElementById(`tab-${t}`);
        if (!el) { continue; }
        el.className = t === tab
            ? 'flex items-center gap-3 px-3 py-2 bg-blue-600/10 text-blue-700 rounded-lg cursor-pointer'
            : 'flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer';

        const section = document.getElementById(`section-${t}`);
        if (section) { section.style.display = t === tab ? '' : 'none'; }
    }

    if (tab === 'projects') { loadProjects(); }
    if (tab === 'requests') { loadServiceRequests(); }
    if (tab === 'approvals') { loadApprovals(); }
    if (tab === 'payments') { loadEscrow(); }
}

// ─── KPIs ───────────────────────────────────────────────────────────────────
async function loadStats(): Promise<void> {
    try {
        const res = await fetch(`${API}/stats`, { headers: headers() });
        if (!res.ok) { return; }
        const json = await res.json() as { data: Stats };
        const s = json.data;

        setText('kpi-active', String(s.active_projects));
        setText('kpi-bids', String(s.total_bids_received));
        setText('kpi-approvals', String(s.pending_approvals));
        setText('kpi-escrow', `$${(s.total_invested / 100).toLocaleString()}`);
        setText('approval-count', String(s.pending_approvals));
        setText('sr-count', String(s.active_service_requests));
    } catch (err) {
        console.warn('[Homeowner] Stats load failed, showing defaults:', err);
    }
}

// ─── Dashboard — Active Projects ────────────────────────────────────────────
async function loadDashboardProjects(): Promise<void> {
    const container = document.getElementById('active-projects-list');
    if (!container) { return; }

    try {
        const res = await fetch(`${API}/projects`, { headers: headers() });
        if (!res.ok) { throw new Error('Failed'); }
        const json = await res.json() as { data: Project[] };
        const projects = json.data.filter((p) => !['completed', 'cancelled'].includes(p.status));

        if (projects.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <i class="ph ph-house" style="font-size:40px" aria-hidden="true"></i>
                <p class="mt-3 text-sm font-medium">No active projects</p>
                <p class="text-xs mt-1">Report damage to get started</p>
                <a href="/homeowner-report.html" class="inline-block mt-3 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg">Report Damage</a>
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
                            ${p.bid_count > 0 ? `<span class="text-blue-600 font-bold"><i class="ph ph-file-text" aria-hidden="true"></i> ${p.bid_count} bids</span>` : ''}
                        </div>
                        ${p.total_boq_cost > 0 ? `<p class="text-xs text-slate-500 mt-1">BOQ Total: <span class="font-mono font-bold">$${(p.total_boq_cost / 100).toLocaleString()}</span></p>` : ''}
                    </div>
                    <span class="text-[10px] text-slate-400 shrink-0">${esc(p.project_id)}</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('[Homeowner] Dashboard projects load failed:', err);
        container.innerHTML = `<div class="p-5 text-center text-red-400 text-sm">Failed to load</div>`;
    }
}

// ─── All Projects ───────────────────────────────────────────────────────────
async function loadProjects(): Promise<void> {
    const tbody = document.getElementById('projects-body');
    if (!tbody) { return; }

    try {
        const res = await fetch(`${API}/projects`, { headers: headers() });
        if (!res.ok) { throw new Error('Failed'); }
        const json = await res.json() as { data: Project[] };
        const projects = json.data;

        if (projects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">
                <p class="text-sm font-medium">No projects yet</p>
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
    } catch (err) {
        console.error('[Homeowner] Projects table load failed:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-4 text-center text-red-400 text-sm">Failed to load</td></tr>`;
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
            alert('Please enter a title for your request');
            return;
        }

        const b = btn as HTMLButtonElement;
        b.disabled = true;
        b.textContent = 'Submitting...';

        try {
            const res = await fetch(`${API}/service-requests`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                    trade_needed: trade,
                    title,
                    description: desc || undefined,
                    address_text: address || undefined,
                    urgency: urgency || 'routine',
                    budget_max: budget ? parseInt(budget, 10) * 100 : undefined,
                }),
            });

            if (!res.ok) {
                const err = await res.json() as { error: string };
                throw new Error(err.error);
            }

            b.textContent = '✓ Submitted';
            b.className = 'px-5 py-2.5 bg-green-100 text-green-700 text-sm font-bold rounded-lg';

            // Reset form
            (document.getElementById('sr-title') as HTMLInputElement).value = '';
            (document.getElementById('sr-description') as HTMLTextAreaElement).value = '';
            (document.getElementById('sr-address') as HTMLInputElement).value = '';
            (document.getElementById('sr-budget') as HTMLInputElement).value = '';

            setTimeout(() => {
                b.textContent = '📢 Submit Request';
                b.className = 'px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors';
                b.disabled = false;
            }, 2000);

            loadServiceRequests();
            loadStats();
        } catch (err) {
            b.textContent = err instanceof Error ? err.message : 'Failed';
            b.className = 'px-5 py-2.5 bg-red-100 text-red-600 text-sm font-bold rounded-lg';
            setTimeout(() => {
                b.textContent = '📢 Submit Request';
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
        const res = await fetch(`${API}/service-requests`, { headers: headers() });
        if (!res.ok) { throw new Error('Failed'); }
        const json = await res.json() as { data: ServiceReq[] };
        const requests = json.data;

        if (requests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">
                <p class="text-sm font-medium">No service requests yet</p>
                <p class="text-xs mt-1">Use the form above to post your first request</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = requests.map((r) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(r.title)}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tradeColor(r.trade_needed)}">${esc(r.trade_needed)}</span></td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${urgencyColor(r.urgency)}">${esc(r.urgency)}</span></td>
                <td class="px-5 py-3 text-xs">${esc(r.tradesperson_name ?? '—')}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(r.status)}">${esc(r.status)}</span></td>
                <td class="px-5 py-3">
                    ${['open', 'matched'].includes(r.status) ? `
                        <button class="cancel-sr-btn px-2.5 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-lg hover:bg-red-200" data-id="${esc(r.request_id)}">Cancel</button>
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
                    await fetch(`${API}/service-requests/${id}/cancel`, { method: 'POST', headers: headers() });
                    loadServiceRequests();
                    loadStats();
                } catch (err) {
                    console.error('[Homeowner] Service request cancellation failed:', err);
                }
            });
        });
    } catch (err) {
        console.error('[Homeowner] Service requests load failed:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-4 text-center text-red-400 text-sm">Failed to load</td></tr>`;
    }
}

// ─── Approvals ──────────────────────────────────────────────────────────────
async function loadApprovals(): Promise<void> {
    const container = document.getElementById('approvals-list');
    if (!container) { return; }

    try {
        const res = await fetch(`${API}/approvals`, { headers: headers() });
        if (!res.ok) { throw new Error('Failed'); }
        const json = await res.json() as { data: Approval[] };
        const approvals = json.data;

        if (approvals.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <i class="ph ph-check-square" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">No pending approvals</p>
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
                        <p class="text-xs text-slate-500 mt-1">${esc(a.description ?? 'No description')}</p>
                        <div class="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                            <span><i class="ph ph-buildings" aria-hidden="true"></i> ${esc(a.project_title)}</span>
                            <span><i class="ph ph-hard-hat" aria-hidden="true"></i> ${esc(a.engineer_name)}</span>
                            <span><i class="ph ph-clock" aria-hidden="true"></i> ${timeAgo(a.created_at)}</span>
                        </div>
                    </div>
                    ${a.status === 'pending' ? `
                        <div class="flex gap-1.5 shrink-0">
                            <button class="approval-btn px-3 py-1.5 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700"
                                    data-id="${esc(a.approval_id)}" data-decision="approved">Approve</button>
                            <button class="approval-btn px-3 py-1.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-lg hover:bg-red-200"
                                    data-id="${esc(a.approval_id)}" data-decision="rejected">Reject</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        // Approval handlers
        container.querySelectorAll('.approval-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = (btn as HTMLElement).dataset['id'];
                const decision = (btn as HTMLElement).dataset['decision'];
                if (!id || !decision) { return; }
                try {
                    await fetch(`/api/dashboard/approvals/${id}`, {
                        method: 'PATCH',
                        headers: headers(),
                        body: JSON.stringify({ decision }),
                    });
                    loadApprovals();
                    loadStats();
                } catch (err) {
                    console.error('[Homeowner] Approval decision failed:', err);
                }
            });
        });
    } catch (err) {
        console.error('[Homeowner] Approvals load failed:', err);
        container.innerHTML = `<div class="p-5 text-center text-red-400 text-sm">Failed to load</div>`;
    }
}

// ─── Escrow ─────────────────────────────────────────────────────────────────
async function loadEscrow(): Promise<void> {
    const container = document.getElementById('escrow-content');
    if (!container) { return; }

    try {
        const res = await fetch(`${API}/escrow`, { headers: headers() });
        if (!res.ok) { throw new Error('Failed'); }
        const json = await res.json() as { data: EscrowData };
        const e = json.data;

        container.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-blue-50 rounded-xl p-4">
                    <p class="text-[10px] font-bold text-blue-400 uppercase">Total Deposited</p>
                    <p class="text-xl font-black mt-1 text-blue-700">$${(e.total_deposited / 100).toLocaleString()}</p>
                </div>
                <div class="bg-green-50 rounded-xl p-4">
                    <p class="text-[10px] font-bold text-green-400 uppercase">Released</p>
                    <p class="text-xl font-black mt-1 text-green-700">$${(e.total_released / 100).toLocaleString()}</p>
                </div>
                <div class="bg-amber-50 rounded-xl p-4">
                    <p class="text-[10px] font-bold text-amber-400 uppercase">Held in Escrow</p>
                    <p class="text-xl font-black mt-1 text-amber-700">$${(e.held_in_escrow / 100).toLocaleString()}</p>
                </div>
                <div class="bg-slate-50 rounded-xl p-4">
                    <p class="text-[10px] font-bold text-slate-400 uppercase">Projects</p>
                    <p class="text-xl font-black mt-1">${e.projects_with_escrow}</p>
                </div>
            </div>
            ${e.held_in_escrow > 0 ? `
                <div class="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div class="flex items-center gap-2 text-blue-700">
                        <i class="ph ph-shield-check" style="font-size:20px" aria-hidden="true"></i>
                        <p class="text-sm font-medium">Your funds are secured in escrow and will be released upon approved construction milestones.</p>
                    </div>
                </div>
            ` : ''}
        `;
    } catch (err) {
        console.error('[Homeowner] Escrow data load failed:', err);
        container.innerHTML = `<p class="text-red-400 text-sm text-center">Failed to load escrow data</p>`;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) { el.textContent = text; }
}

function esc(str: string): string {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function statusColor(s: string): string {
    const c: Record<string, string> = {
        draft: 'bg-slate-100 text-slate-500',
        open: 'bg-blue-100 text-blue-700',
        pending: 'bg-amber-100 text-amber-700',
        pending_assessment: 'bg-amber-100 text-amber-700',
        assessed: 'bg-indigo-100 text-indigo-700',
        published: 'bg-purple-100 text-purple-700',
        matched: 'bg-cyan-100 text-cyan-700',
        in_progress: 'bg-teal-100 text-teal-700',
        completed: 'bg-green-100 text-green-700',
        cancelled: 'bg-red-100 text-red-600',
        approved: 'bg-green-100 text-green-700',
        rejected: 'bg-red-100 text-red-600',
        expired: 'bg-slate-100 text-slate-500',
    };
    return c[s] ?? 'bg-slate-100 text-slate-600';
}

function tradeColor(trade: string): string {
    const c: Record<string, string> = {
        tiling: 'bg-blue-100 text-blue-700',
        painting: 'bg-purple-100 text-purple-700',
        plumbing: 'bg-cyan-100 text-cyan-700',
        electrical: 'bg-yellow-100 text-yellow-700',
        carpentry: 'bg-orange-100 text-orange-700',
        welding: 'bg-red-100 text-red-700',
        masonry: 'bg-stone-200 text-stone-700',
        plastering: 'bg-slate-100 text-slate-600',
        hvac: 'bg-sky-100 text-sky-700',
        general: 'bg-teal-100 text-teal-700',
    };
    return c[trade] ?? 'bg-slate-100 text-slate-600';
}

function urgencyColor(u: string): string {
    return u === 'emergency' ? 'bg-red-100 text-red-700'
        : u === 'urgent' ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-600';
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) { return 'Just now'; }
    if (hours < 24) { return `${hours}h ago`; }
    return `${Math.floor(hours / 24)}d ago`;
}
