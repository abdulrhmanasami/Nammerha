import '../styles/main.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Tradesperson Portal — Dashboard, Requests, Assignments, Earnings, Profile
   Wires to: /api/tradesperson/*
   ═══════════════════════════════════════════════════════════════════════════ */

const API = '/api/tradesperson';

function getToken(): string {
    return localStorage.getItem('auth_token') ?? '';
}

const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
});

// ─── Types ──────────────────────────────────────────────────────────────────
interface Stats {
    active_jobs: number;
    completed_jobs: number;
    pending_requests: number;
    active_assignments: number;
    total_earnings: number;
    average_rating: number | null;
}

interface Profile {
    trade: string | null;
    hourly_rate: number | null;
    daily_rate: number | null;
    availability: string;
    years_experience: number | null;
    completed_jobs_count: number;
    average_rating: number | null;
    dynamic_score: number;
    full_name: string;
}

interface ServiceReq {
    request_id: string;
    homeowner_name: string;
    trade_needed: string;
    title: string;
    description: string | null;
    address_text: string | null;
    urgency: string;
    budget_min: number | null;
    budget_max: number | null;
    created_at: string;
}

interface Assignment {
    assignment_id: string;
    contractor_name: string;
    project_title: string;
    trade_required: string;
    scope_description: string;
    agreed_rate: number;
    rate_type: string;
    estimated_days: number | null;
    status: string;
    created_at: string;
}

interface Earning {
    source_type: string;
    source_id: string;
    title: string;
    amount: number;
    rate_type: string | null;
    completed_at: string | null;
}

// ─── State ──────────────────────────────────────────────────────────────────
type TabName = 'dashboard' | 'requests' | 'assignments' | 'earnings' | 'profile';

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupAvailability();
    loadStats();
    loadActiveJobs();
    loadProfile();
});

// ─── Tab Navigation ─────────────────────────────────────────────────────────
function setupTabs(): void {
    const tabs: TabName[] = ['dashboard', 'requests', 'assignments', 'earnings', 'profile'];

    for (const tab of tabs) {
        const el = document.getElementById(`tab-${tab}`);
        if (!el) continue;
        el.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(tab);
        });
    }
}

function switchTab(tab: TabName): void {
    const allTabs: TabName[] = ['dashboard', 'requests', 'assignments', 'earnings', 'profile'];

    for (const t of allTabs) {
        const el = document.getElementById(`tab-${t}`);
        if (!el) continue;
        el.className = t === tab
            ? 'flex items-center gap-3 px-3 py-2 bg-teal-600/10 text-teal-700 rounded-lg cursor-pointer'
            : 'flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer';

        const section = document.getElementById(`section-${t}`);
        if (section) section.style.display = t === tab ? '' : 'none';
    }

    if (tab === 'requests') loadRequests();
    if (tab === 'assignments') loadAssignments();
    if (tab === 'earnings') loadEarnings();
    if (tab === 'profile') loadProfile();
}

// ─── Availability Toggle ────────────────────────────────────────────────────
function setupAvailability(): void {
    const container = document.getElementById('availability-btns');
    if (!container) return;

    container.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const status = (btn as HTMLElement).dataset['status'];
            if (!status) return;

            try {
                await fetch(`${API}/availability`, {
                    method: 'PATCH',
                    headers: headers(),
                    body: JSON.stringify({ status }),
                });

                updateAvailabilityUI(status);
            } catch { /* ignore */ }
        });
    });
}

function updateAvailabilityUI(status: string): void {
    const container = document.getElementById('availability-btns');
    if (!container) return;

    container.querySelectorAll('button').forEach((btn) => {
        const s = (btn as HTMLElement).dataset['status'];
        if (s === status) {
            const colors: Record<string, string> = {
                available: 'border-green-200 bg-green-50 text-green-700',
                busy: 'border-amber-200 bg-amber-50 text-amber-700',
                offline: 'border-slate-200 bg-slate-50 text-slate-500',
            };
            btn.className = `flex-1 px-2 py-1.5 text-[10px] font-bold rounded-lg border ${colors[s] ?? 'border-slate-200 text-slate-500'}`;
        } else {
            btn.className = 'flex-1 px-2 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 text-slate-500';
        }
    });

    const badge = document.getElementById('availability-badge');
    if (badge) {
        const badgeStyles: Record<string, string> = {
            available: 'bg-green-100 text-green-700',
            busy: 'bg-amber-100 text-amber-700',
            offline: 'bg-slate-100 text-slate-500',
        };
        badge.className = `px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${badgeStyles[status] ?? 'bg-slate-100 text-slate-500'}`;
        badge.textContent = status;
    }
}

// ─── KPIs ───────────────────────────────────────────────────────────────────
async function loadStats(): Promise<void> {
    try {
        const res = await fetch(`${API}/stats`, { headers: headers() });
        if (!res.ok) return;
        const json = await res.json() as { data: Stats };
        const s = json.data;

        setText('kpi-active', String(s.active_jobs));
        setText('kpi-completed', String(s.completed_jobs));
        setText('kpi-earnings', `$${(s.total_earnings / 100).toLocaleString()}`);
        setText('kpi-rating', s.average_rating ? `${s.average_rating.toFixed(1)} ★` : '—');
        setText('pending-count', String(s.pending_requests));
    } catch { /* fail silently for KPIs */ }
}

// ─── Active Jobs Overview (Dashboard) ───────────────────────────────────────
async function loadActiveJobs(): Promise<void> {
    const tbody = document.getElementById('active-jobs-body');
    if (!tbody) return;

    try {
        const [reqRes, assRes] = await Promise.all([
            fetch(`${API}/requests`, { headers: headers() }),
            fetch(`${API}/assignments?status=in_progress`, { headers: headers() }),
        ]);

        const requests = reqRes.ok ? ((await reqRes.json()) as { data: ServiceReq[] }).data : [];
        const assignments = assRes.ok ? ((await assRes.json()) as { data: Assignment[] }).data : [];

        if (requests.length === 0 && assignments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-sun-dim" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">No active work</p>
                <p class="text-xs mt-1">Check Available Jobs for new opportunities</p>
            </td></tr>`;
            return;
        }

        let html = '';
        for (const a of assignments) {
            html += `<tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(a.project_title)}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tradeColor(a.trade_required)}">${esc(a.trade_required)}</span></td>
                <td class="px-5 py-3 text-xs text-slate-500">Contractor: ${esc(a.contractor_name)}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(a.status)}">${esc(a.status)}</span></td>
            </tr>`;
        }
        tbody.innerHTML = html || `<tr><td colspan="4" class="px-5 py-4 text-center text-slate-400 text-sm">No active work</td></tr>`;
    } catch {
        tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-4 text-center text-red-400 text-sm">Failed to load</td></tr>`;
    }
}

// ─── Service Requests (Thumbtack) ───────────────────────────────────────────
async function loadRequests(): Promise<void> {
    const container = document.getElementById('requests-list');
    if (!container) return;

    try {
        const res = await fetch(`${API}/requests`, { headers: headers() });
        if (!res.ok) throw new Error('Failed');
        const json = await res.json() as { data: ServiceReq[] };
        const requests = json.data;

        if (requests.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <i class="ph ph-magnifying-glass" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">No requests matching your trade</p>
                <p class="text-xs mt-1">New requests will appear here automatically</p>
            </div>`;
            return;
        }

        container.innerHTML = requests.map((r) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-medium">${esc(r.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${urgencyColor(r.urgency)}">${esc(r.urgency)}</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-1">${esc(r.description ?? 'No description')}</p>
                        <div class="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-slate-400">
                            <span><i class="ph ph-user" aria-hidden="true"></i> ${esc(r.homeowner_name)}</span>
                            ${r.address_text ? `<span><i class="ph ph-map-pin" aria-hidden="true"></i> ${esc(r.address_text)}</span>` : ''}
                            ${r.budget_max ? `<span><i class="ph ph-coins" aria-hidden="true"></i> Budget: $${(r.budget_max / 100).toLocaleString()}</span>` : ''}
                            <span><i class="ph ph-clock" aria-hidden="true"></i> ${timeAgo(r.created_at)}</span>
                        </div>
                    </div>
                    <button class="accept-req-btn px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition-colors shrink-0"
                            data-request="${esc(r.request_id)}">
                        Accept Job
                    </button>
                </div>
            </div>
        `).join('');

        // Attach accept handlers
        container.querySelectorAll('.accept-req-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const requestId = (btn as HTMLElement).dataset['request'];
                if (!requestId) return;
                const b = btn as HTMLButtonElement;
                b.disabled = true;
                b.textContent = 'Accepting...';

                try {
                    const res2 = await fetch(`${API}/requests/${requestId}/accept`, {
                        method: 'POST', headers: headers(),
                    });
                    if (!res2.ok) {
                        const err = await res2.json() as { error: string };
                        throw new Error(err.error);
                    }
                    b.textContent = '✓ Accepted';
                    b.className = 'px-4 py-2 bg-green-100 text-green-700 text-xs font-bold rounded-lg shrink-0';
                    loadStats();
                } catch (err) {
                    b.textContent = err instanceof Error ? err.message : 'Failed';
                    b.className = 'px-4 py-2 bg-red-100 text-red-600 text-xs font-bold rounded-lg shrink-0';
                }
            });
        });
    } catch {
        container.innerHTML = `<div class="p-5 text-center text-red-400 text-sm">Failed to load requests</div>`;
    }
}

// ─── Contractor Assignments ─────────────────────────────────────────────────
async function loadAssignments(): Promise<void> {
    const tbody = document.getElementById('assignments-body');
    if (!tbody) return;

    try {
        const res = await fetch(`${API}/assignments`, { headers: headers() });
        if (!res.ok) throw new Error('Failed');
        const json = await res.json() as { data: Assignment[] };
        const assignments = json.data;

        if (assignments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-clipboard-text" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">No contractor assignments</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = assignments.map((a) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3">
                    <p class="font-medium">${esc(a.project_title)}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">by ${esc(a.contractor_name)}</p>
                </td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tradeColor(a.trade_required)}">${esc(a.trade_required)}</span></td>
                <td class="px-5 py-3 text-xs text-slate-500 max-w-[200px] truncate">${esc(a.scope_description)}</td>
                <td class="px-5 py-3 font-mono text-sm">$${(a.agreed_rate / 100).toLocaleString()}/${a.rate_type}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(a.status)}">${esc(a.status)}</span></td>
                <td class="px-5 py-3">
                    ${a.status === 'pending' ? `
                        <div class="flex gap-1.5">
                            <button class="respond-btn px-2.5 py-1 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700" data-id="${esc(a.assignment_id)}" data-accept="true">Accept</button>
                            <button class="respond-btn px-2.5 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-lg hover:bg-red-200" data-id="${esc(a.assignment_id)}" data-accept="false">Decline</button>
                        </div>
                    ` : '—'}
                </td>
            </tr>
        `).join('');

        // Attach respond handlers
        tbody.querySelectorAll('.respond-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = (btn as HTMLElement).dataset['id'];
                const accept = (btn as HTMLElement).dataset['accept'] === 'true';
                if (!id) return;

                try {
                    await fetch(`${API}/assignments/${id}/respond`, {
                        method: 'POST',
                        headers: headers(),
                        body: JSON.stringify({ accept }),
                    });
                    loadAssignments();
                    loadStats();
                } catch { /* retry silently */ }
            });
        });
    } catch {
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-4 text-center text-red-400 text-sm">Failed to load</td></tr>`;
    }
}

// ─── Earnings ───────────────────────────────────────────────────────────────
async function loadEarnings(): Promise<void> {
    const tbody = document.getElementById('earnings-body');
    if (!tbody) return;

    try {
        const res = await fetch(`${API}/earnings`, { headers: headers() });
        if (!res.ok) throw new Error('Failed');
        const json = await res.json() as { data: Earning[] };
        const earnings = json.data;

        if (earnings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-coins" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">No earnings yet</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = earnings.map((e) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(e.title)}</td>
                <td class="px-5 py-3 text-xs"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${e.source_type === 'assignment' ? 'bg-blue-100 text-blue-600' : 'bg-teal-100 text-teal-600'}">${e.source_type === 'assignment' ? 'Contractor' : 'Direct'}</span></td>
                <td class="px-5 py-3 font-mono text-sm text-smoky-jade">$${(e.amount / 100).toLocaleString()}</td>
                <td class="px-5 py-3 text-xs text-slate-400">${e.completed_at ? new Date(e.completed_at).toLocaleDateString() : '—'}</td>
            </tr>
        `).join('');
    } catch {
        tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-4 text-center text-red-400 text-sm">Failed to load</td></tr>`;
    }
}

// ─── Profile ────────────────────────────────────────────────────────────────
async function loadProfile(): Promise<void> {
    const container = document.getElementById('profile-content');
    if (!container) return;

    try {
        const res = await fetch(`${API}/profile`, { headers: headers() });
        if (!res.ok) throw new Error('Failed');
        const json = await res.json() as { data: Profile };
        const p = json.data;

        updateAvailabilityUI(p.availability);
        setText('trade-badge', p.trade ? tradeArabicLabel(p.trade) : '—');

        container.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p class="text-[10px] font-bold text-slate-400 uppercase">Name</p><p class="font-medium mt-0.5">${esc(p.full_name)}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase">Primary Trade</p><p class="font-medium mt-0.5"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${tradeColor(p.trade ?? '')}">${esc(p.trade ?? '—')}</span></p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase">Experience</p><p class="font-medium mt-0.5">${p.years_experience ?? '—'} years</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase">Hourly Rate</p><p class="font-medium mt-0.5">${p.hourly_rate ? `$${(p.hourly_rate / 100).toFixed(2)}/hr` : '—'}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase">Daily Rate</p><p class="font-medium mt-0.5">${p.daily_rate ? `$${(p.daily_rate / 100).toFixed(2)}/day` : '—'}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase">Dynamic Score</p><p class="font-medium mt-0.5">${p.dynamic_score}/100</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase">Jobs Completed</p><p class="font-medium mt-0.5">${p.completed_jobs_count}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase">Rating</p><p class="font-medium mt-0.5">${p.average_rating ? `${p.average_rating} ★` : 'No ratings yet'}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase">Availability</p><p class="font-medium mt-0.5"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${availabilityBadge(p.availability)}">${esc(p.availability)}</span></p></div>
            </div>
        `;
    } catch {
        container.innerHTML = `<p class="text-red-400 text-sm text-center">Failed to load profile</p>`;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function esc(str: string): string {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
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

function tradeArabicLabel(trade: string): string {
    const labels: Record<string, string> = {
        tiling: 'بلاط', painting: 'دهان', plumbing: 'سباكة',
        electrical: 'كهرباء', carpentry: 'نجارة', welding: 'لحام',
        masonry: 'بناء حجر', plastering: 'قصارة', hvac: 'تكييف', general: 'أعمال عامة',
    };
    return labels[trade] ?? trade;
}

function urgencyColor(u: string): string {
    return u === 'emergency' ? 'bg-red-100 text-red-700'
        : u === 'urgent' ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-600';
}

function statusColor(s: string): string {
    const c: Record<string, string> = {
        pending: 'bg-amber-100 text-amber-700',
        accepted: 'bg-blue-100 text-blue-700',
        in_progress: 'bg-teal-100 text-teal-700',
        completed: 'bg-green-100 text-green-700',
        declined: 'bg-red-100 text-red-600',
        cancelled: 'bg-slate-100 text-slate-500',
    };
    return c[s] ?? 'bg-slate-100 text-slate-600';
}

function availabilityBadge(s: string): string {
    return s === 'available' ? 'bg-green-100 text-green-700'
        : s === 'busy' ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-500';
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

// ─── Expose for global ─────────────────────────────────────────────────────
(window as unknown as Record<string, unknown>)['tradespersonPortal'] = {
    switchTab,
    loadStats,
};
