import '../styles/main.css';
import { tradesperson } from '../api';
import { formatCents, relativeTimeAgo } from '../utils/format';

/* ═══════════════════════════════════════════════════════════════════════════
   Tradesperson Portal — Dashboard, Requests, Assignments, Earnings, Profile
   P2-FE-004: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id) is handled by the canonical request() wrapper.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ──────────────────────────────────────────────────────────────────
type TabName = 'dashboard' | 'requests' | 'assignments' | 'earnings' | 'profile';

// LOW-AUD-001 FIX: Module-level constant instead of duplicating in setupTabs() and switchTab()
const ALL_TABS: TabName[] = ['dashboard', 'requests', 'assignments', 'earnings', 'profile'];

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
    for (const tab of ALL_TABS) {
        const el = document.getElementById(`tab-${tab}`);
        if (!el) continue;
        el.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(tab);
        });
    }
}

function switchTab(tab: TabName): void {
    for (const t of ALL_TABS) {
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
                await tradesperson.updateAvailability(status as 'available' | 'busy' | 'offline');
                updateAvailabilityUI(status);
            } catch (err) {
                console.error('[Tradesperson] Availability update failed:', err);
            }
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
        const res = await tradesperson.getStats();
        if (!res.data) return;
        const s = res.data;

        setText('kpi-active', String(s.active_jobs));
        setText('kpi-completed', String(s.completed_jobs));
        setText('kpi-earnings', formatCents(s.total_earnings));
        setText('kpi-rating', s.average_rating ? `${s.average_rating.toFixed(1)} ★` : '—');
        setText('pending-count', String(s.pending_requests));
    } catch (err) {
        console.warn('[Tradesperson] Stats load failed, showing defaults:', err);
    }
}

// ─── Active Jobs Overview (Dashboard) ───────────────────────────────────────
async function loadActiveJobs(): Promise<void> {
    const tbody = document.getElementById('active-jobs-body');
    if (!tbody) return;

    try {
        const [reqRes, assRes] = await Promise.all([
            tradesperson.getRequests(),
            tradesperson.getAssignments('in_progress'),
        ]);

        const requests = reqRes.data ?? [];
        const assignments = assRes.data ?? [];

        if (requests.length === 0 && assignments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-sun-dim" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium" data-i18n="tp_no_active_work">No active work</p>
                <p class="text-xs mt-1" data-i18n="tp_check_available">Check Available Jobs for new opportunities</p>
            </td></tr>`;
            return;
        }

        let html = '';

        // P1-FE-001 FIX: Render direct requests (Thumbtack mode) — previously dropped
        for (const r of requests) {
            html += `<tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(r.title)}</td>
                <td class="px-5 py-3">${tradeLabel(r.trade_needed)}</td>
                <td class="px-5 py-3 text-xs text-slate-500"><span data-i18n="tp_homeowner">Homeowner</span>: ${esc(r.homeowner_name)}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-100 text-teal-700" data-i18n="tp_direct">direct</span></td>
            </tr>`;
        }

        // Render contractor assignments (Subcontractor mode)
        for (const a of assignments) {
            html += `<tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(a.project_title)}</td>
                <td class="px-5 py-3">${tradeLabel(a.trade_required)}</td>
                <td class="px-5 py-3 text-xs text-slate-500"><span data-i18n="tp_contractor">Contractor</span>: ${esc(a.contractor_name)}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(a.status)}">${esc(a.status)}</span></td>
            </tr>`;
        }
        tbody.innerHTML = html || `<tr><td colspan="4" class="px-5 py-4 text-center text-slate-400 text-sm" data-i18n="tp_no_active_work">No active work</td></tr>`;
    } catch (err) {
        console.error('[Tradesperson] Active jobs load failed:', err);
        tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-4 text-center text-red-400 text-sm" data-i18n="tp_failed_to_load">Failed to load</td></tr>`;
    }
}

// ─── Service Requests (Thumbtack) ───────────────────────────────────────────
async function loadRequests(): Promise<void> {
    const container = document.getElementById('requests-list');
    if (!container) return;

    try {
        const res = await tradesperson.getRequests();
        const requests = res.data ?? [];

        if (requests.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <i class="ph ph-magnifying-glass" style="font-size:32px" aria-hidden="true"></i>
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
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${urgencyColor(r.urgency)}">${esc(r.urgency)}</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-1">${esc(r.description ?? 'No description')}</p>
                        <div class="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-slate-400">
                            <span><i class="ph ph-user" aria-hidden="true"></i> ${esc(r.homeowner_name)}</span>
                            ${r.address_text ? `<span><i class="ph ph-map-pin" aria-hidden="true"></i> ${esc(r.address_text)}</span>` : ''}
                            ${r.budget_max ? `<span><i class="ph ph-coins" aria-hidden="true"></i> <span data-i18n="tp_budget">Budget</span>: ${formatCents(r.budget_max)}</span>` : ''}
                            <span><i class="ph ph-clock" aria-hidden="true"></i> ${relativeTimeAgo(r.created_at)}</span>
                        </div>
                    </div>
                    <button class="accept-req-btn px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition-colors shrink-0"
                            data-request="${esc(r.request_id)}" data-i18n="tp_accept_job">
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
                b.setAttribute('data-i18n', 'tp_accepting');

                try {
                    const res2 = await tradesperson.acceptRequest(requestId);
                    if (!res2.success) {
                        throw new Error(res2.error ?? 'Failed');
                    }
                    b.textContent = '✓ Accepted';
                    b.setAttribute('data-i18n', 'tp_accepted');
                    b.className = 'px-4 py-2 bg-green-100 text-green-700 text-xs font-bold rounded-lg shrink-0';
                    loadStats();
                } catch (err) {
                    b.textContent = err instanceof Error ? err.message : 'Failed';
                    b.removeAttribute('data-i18n');
                    b.className = 'px-4 py-2 bg-red-100 text-red-600 text-xs font-bold rounded-lg shrink-0';
                }
            });
        });
    } catch (err) {
        console.error('[Tradesperson] Requests load failed:', err);
        container.innerHTML = `<div class="p-5 text-center text-red-400 text-sm" data-i18n="tp_failed_to_load">Failed to load requests</div>`;
    }
}

// ─── Contractor Assignments ─────────────────────────────────────────────────
async function loadAssignments(): Promise<void> {
    const tbody = document.getElementById('assignments-body');
    if (!tbody) return;

    try {
        const res = await tradesperson.getAssignments();
        const assignments = res.data ?? [];

        if (assignments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-clipboard-text" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium" data-i18n="tp_no_assignments">No contractor assignments</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = assignments.map((a) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3">
                    <p class="font-medium">${esc(a.project_title)}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5"><span data-i18n="tp_contractor">Contractor</span>: ${esc(a.contractor_name)}</p>
                </td>
                <td class="px-5 py-3">${tradeLabel(a.trade_required)}</td>
                <td class="px-5 py-3 text-xs text-slate-500 max-w-[200px] truncate">${esc(a.scope_description)}</td>
                <td class="px-5 py-3 font-mono text-sm">${formatCents(a.agreed_rate)}/${a.rate_type}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(a.status)}">${esc(a.status)}</span></td>
                <td class="px-5 py-3">
                    ${a.status === 'pending' ? `
                        <div class="flex gap-1.5">
                            <button class="respond-btn px-2.5 py-1 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700" data-id="${esc(a.assignment_id)}" data-accept="true" data-i18n="Accept">Accept</button>
                            <button class="respond-btn px-2.5 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-lg hover:bg-red-200" data-id="${esc(a.assignment_id)}" data-accept="false" data-i18n="Decline">Decline</button>
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
                    await tradesperson.respondToAssignment(id, accept);
                    loadAssignments();
                    loadStats();
                } catch (err) {
                    console.error('[Tradesperson] Assignment response failed:', err);
                }
            });
        });
    } catch (err) {
        console.error('[Tradesperson] Assignments load failed:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-4 text-center text-red-400 text-sm" data-i18n="tp_failed_to_load">Failed to load</td></tr>`;
    }
}

// ─── Earnings ───────────────────────────────────────────────────────────────
async function loadEarnings(): Promise<void> {
    const tbody = document.getElementById('earnings-body');
    if (!tbody) return;

    try {
        const res = await tradesperson.getEarnings();
        const earnings = res.data ?? [];

        if (earnings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-coins" style="font-size:32px" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium" data-i18n="tp_no_earnings">No earnings yet</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = earnings.map((e) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(e.title)}</td>
                <td class="px-5 py-3 text-xs"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${e.source_type === 'assignment' ? 'bg-blue-100 text-blue-600' : 'bg-teal-100 text-teal-600'}" data-i18n="${e.source_type === 'assignment' ? 'tp_contractor_type' : 'tp_direct_type'}">${e.source_type === 'assignment' ? 'Contractor' : 'Direct'}</span></td>
                <td class="px-5 py-3 font-mono text-sm text-smoky-jade">${formatCents(e.amount)}</td>
                <td class="px-5 py-3 text-xs text-slate-400">${e.completed_at ? new Date(e.completed_at).toLocaleDateString() : '—'}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('[Tradesperson] Earnings load failed:', err);
        tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-4 text-center text-red-400 text-sm" data-i18n="tp_failed_to_load">Failed to load</td></tr>`;
    }
}

// ─── Profile ────────────────────────────────────────────────────────────────
async function loadProfile(): Promise<void> {
    const container = document.getElementById('profile-content');
    if (!container) return;

    try {
        const res = await tradesperson.getProfile();
        if (!res.data) throw new Error('Profile not found');
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
                <div><p class="text-[10px] font-bold text-slate-400 uppercase" data-i18n="Name">Name</p><p class="font-medium mt-0.5">${esc(p.full_name)}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase" data-i18n="Primary Trade">Primary Trade</p><p class="font-medium mt-0.5">${tradeLabel(p.trade ?? '')}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase" data-i18n="Experience">Experience</p><p class="font-medium mt-0.5">${p.years_experience ?? '—'} years</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase" data-i18n="Hourly Rate">Hourly Rate</p><p class="font-medium mt-0.5">${p.hourly_rate ? `${formatCents(p.hourly_rate)}/hr` : '—'}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase" data-i18n="Daily Rate">Daily Rate</p><p class="font-medium mt-0.5">${p.daily_rate ? `${formatCents(p.daily_rate)}/day` : '—'}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase" data-i18n="Dynamic Score">Dynamic Score</p><p class="font-medium mt-0.5">${p.dynamic_score}/100</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase" data-i18n="Jobs Completed">Jobs Completed</p><p class="font-medium mt-0.5">${p.completed_jobs_count}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase" data-i18n="Rating">Rating</p><p class="font-medium mt-0.5">${p.average_rating ? `${p.average_rating} ★` : '<span data-i18n="tp_no_ratings">No ratings yet</span>'}</p></div>
                <div><p class="text-[10px] font-bold text-slate-400 uppercase" data-i18n="Availability">Availability</p><p class="font-medium mt-0.5"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${availabilityBadge(p.availability)}">${esc(p.availability)}</span></p></div>
            </div>
        `;
    } catch (err) {
        console.error('[Tradesperson] Profile load failed:', err);
        container.innerHTML = `<p class="text-red-400 text-sm text-center" data-i18n="tp_failed_profile">Failed to load profile</p>`;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/**
 * MED-AUD-001 FIX: XSS-safe escaping for BOTH text content AND attribute contexts.
 * The original implementation (textContent → innerHTML trick) only escapes < > & —
 * it does NOT escape quote characters, so injecting into HTML attributes like
 * data-id="${esc(val)}" would allow breakout if val contains a double quote.
 *
 * This version explicitly maps all dangerous characters for both contexts.
 */
function esc(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/`/g, '&#x60;');
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

/**
 * P2-FE-003 FIX: Locale-agnostic trade label.
 * Returns a <span> with data-i18n attribute so the i18n engine's
 * MutationObserver auto-translates it to the current locale.
 * Replaces the old hardcoded-Arabic tradeArabicLabel() function.
 */
function tradeLabel(trade: string): string {
    if (!trade) { return '—'; }
    const colorClass = tradeColor(trade);
    // English trade name as default text; data-i18n="trade_xxx" triggers i18n engine
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colorClass}" data-i18n="trade_${trade}">${esc(trade)}</span>`;
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

// NMR-AUD-305: timeAgo() removed — replaced by relativeTimeAgo() from '../utils/format'

// ─── Expose for global ─────────────────────────────────────────────────────
(window as unknown as Record<string, unknown>)['tradespersonPortal'] = {
    switchTab,
    loadStats,
};
