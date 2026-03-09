import '../styles/main.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Engineer Dashboard — Project Execution & Bidding Engine
   Wires to: /api/engineer/stats, /api/engineer/projects, /api/engineer/bids
   ═══════════════════════════════════════════════════════════════════════════ */

const API_BASE = '/api';

// ─── State ──────────────────────────────────────────────────────────────────
let activeTab: 'projects' | 'bids' = 'projects';

// ─── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTimestamp();
    loadKPIs();
    loadProjectTimeline();
    setupTabs();
});

// ─── Live Timestamp ─────────────────────────────────────────────────────────
function initTimestamp(): void {
    const el = document.getElementById('live-timestamp');
    if (!el) { return; }

    const update = (): void => {
        const now = new Date();
        const lang = document.documentElement.lang || 'en';
        const locale = lang === 'ar' ? 'ar-SY' : lang === 'tr' ? 'tr-TR' : 'en-US';
        el.textContent = now.toLocaleString(locale, {
            weekday: 'short', month: 'short', day: 'numeric',
            year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };
    update();
    setInterval(update, 1000);
}

// ─── Tab Switching ──────────────────────────────────────────────────────────
function setupTabs(): void {
    const tabProjects = document.getElementById('tab-projects');
    const tabBids = document.getElementById('tab-bids');
    const sectionProjects = document.getElementById('section-projects');
    const sectionBids = document.getElementById('section-bids');

    tabProjects?.addEventListener('click', () => {
        activeTab = 'projects';
        tabProjects.classList.add('bg-trust-blue/10', 'text-trust-blue');
        tabProjects.classList.remove('text-slate-600');
        tabBids?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
        tabBids?.classList.add('text-slate-600');
        if (sectionProjects) sectionProjects.style.display = '';
        if (sectionBids) sectionBids.style.display = 'none';
    });

    tabBids?.addEventListener('click', () => {
        activeTab = 'bids';
        tabBids.classList.add('bg-trust-blue/10', 'text-trust-blue');
        tabBids.classList.remove('text-slate-600');
        tabProjects?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
        tabProjects?.classList.add('text-slate-600');
        if (sectionBids) sectionBids.style.display = '';
        if (sectionProjects) sectionProjects.style.display = 'none';
        loadBids();
    });
}

// ─── Load KPIs from /api/engineer/stats ─────────────────────────────────────
async function loadKPIs(): Promise<void> {
    try {
        const res = await fetch(`${API_BASE}/engineer/stats`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        if (!res.ok) { return; }
        const json = await res.json() as { data: Record<string, number> };
        const data = json.data;

        setKPI('assigned-projects', data['assigned_projects'] ?? 0);
        setKPI('proofs-pending', data['proofs_pending'] ?? 0);
        setKPI('proofs-verified', data['proofs_verified'] ?? 0);
        setKPI('escrow-released', data['escrow_released'] ?? 0, '$');

        // Badge counts
        const projectCount = document.getElementById('project-count');
        if (projectCount) { projectCount.textContent = String(data['assigned_projects'] ?? 0); }
        const proofPending = document.getElementById('proof-pending');
        if (proofPending) { proofPending.textContent = String(data['proofs_pending'] ?? 0); }
    } catch (err) {
        console.warn('[Engineer] KPI load failed, showing defaults:', err);
    }
}

// ─── Load Project Timeline from /api/engineer/projects ──────────────────────
async function loadProjectTimeline(): Promise<void> {
    const tbody = document.getElementById('project-timeline-body');
    if (!tbody) { return; }

    try {
        const res = await fetch(`${API_BASE}/engineer/projects`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
        const json = await res.json() as { data: Array<Record<string, string | number>> };
        const projects = json.data;

        if (!projects || projects.length === 0) {
            tbody.innerHTML = `<tr class="border-t border-slate-100">
                <td colspan="6" class="px-5 py-8 text-center text-slate-400">
                    <i class="ph ph-buildings" style="font-size:24px" aria-hidden="true"></i>
                    <p class="mt-2 text-xs">No assigned projects yet</p>
                </td>
            </tr>`;
            return;
        }

        tbody.innerHTML = projects.map((p) => {
            const progress = Number(p['progress'] ?? 0);
            const progressColor = progress >= 75 ? 'bg-smoky-jade' : progress >= 40 ? 'bg-trust-blue' : 'bg-warning-yellow';
            return `
            <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(String(p['title'] ?? ''))}</td>
                <td class="px-5 py-3 text-slate-500">${esc(String(p['region'] ?? ''))}</td>
                <td class="px-5 py-3">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${phaseColor(String(p['phase'] ?? ''))}">
                        ${esc(String(p['phase'] ?? ''))}
                    </span>
                </td>
                <td class="px-5 py-3">
                    <div class="flex items-center gap-2">
                        <div class="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full ${progressColor} rounded-full" style="width:${progress}%"></div>
                        </div>
                        <span class="text-[10px] font-bold text-slate-500">${progress}%</span>
                    </div>
                </td>
                <td class="px-5 py-3 text-slate-500 text-xs">${esc(String(p['next_proof_due'] ?? '—'))}</td>
                <td class="px-5 py-3">
                    <a href="engineer-camera.html?project=${esc(String(p['project_id'] ?? ''))}"
                       class="text-xs font-semibold text-trust-blue hover:underline flex items-center gap-1">
                       <i class="ph ph-camera" aria-hidden="true"></i> Upload Proof
                    </a>
                </td>
            </tr>`;
        }).join('');

        applyI18n();
    } catch (err) {
        console.error('[Engineer] Project timeline load failed:', err);
    }
}

// ─── Load My Bids from /api/engineer/bids ───────────────────────────────────
async function loadBids(): Promise<void> {
    const container = document.getElementById('bids-body');
    if (!container) { return; }

    try {
        const res = await fetch(`${API_BASE}/engineer/bids`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
        const json = await res.json() as { data: Array<Record<string, string | number | null>> };
        const bids = json.data;

        if (!bids || bids.length === 0) {
            container.innerHTML = `<tr class="border-t border-slate-100">
                <td colspan="5" class="px-5 py-8 text-center text-slate-400">
                    <i class="ph ph-flag-banner" style="font-size:24px" aria-hidden="true"></i>
                    <p class="mt-2 text-xs">No bids submitted yet</p>
                </td>
            </tr>`;
            return;
        }

        container.innerHTML = bids.map((b) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(String(b['project_title'] ?? ''))}</td>
                <td class="px-5 py-3 font-mono">$${((Number(b['proposed_cost']) || 0) / 100).toLocaleString()}</td>
                <td class="px-5 py-3 text-slate-500">${b['estimated_days']} days</td>
                <td class="px-5 py-3">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${bidStatusColor(String(b['status'] ?? ''))}">
                        ${esc(String(b['status'] ?? ''))}
                    </span>
                </td>
                <td class="px-5 py-3 text-slate-500 text-xs">${formatDate(String(b['submitted_at'] ?? ''))}</td>
            </tr>
        `).join('');

        applyI18n();
    } catch (err) {
        console.error('[Engineer] Bids load failed:', err);
    }
}

// ─── Utilities ──────────────────────────────────────────────────────────────
function setKPI(name: string, value: number, prefix = ''): void {
    const el = document.querySelector<HTMLElement>(`[data-kpi="${name}"]`);
    if (!el) { return; }

    const duration = 1200;
    const start = performance.now();
    const tick = (now: number): void => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = prefix === '$'
            ? Math.round((value / 100) * eased)
            : Math.round(value * eased);
        el.textContent = prefix === '$'
            ? `$${current.toLocaleString()}`
            : current.toLocaleString();
        if (progress < 1) { requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
}

function phaseColor(phase: string): string {
    const map: Record<string, string> = {
        draft: 'bg-slate-100 text-slate-600',
        pending_assessment: 'bg-warning-yellow/10 text-warning-yellow',
        assessed: 'bg-trust-blue/10 text-trust-blue',
        published: 'bg-purple-100 text-purple-700',
        funded: 'bg-smoky-jade/10 text-smoky-jade',
        in_progress: 'bg-trust-blue/10 text-trust-blue',
        completed: 'bg-smoky-jade/10 text-smoky-jade',
    };
    return map[phase] ?? 'bg-slate-100 text-slate-600';
}

function bidStatusColor(status: string): string {
    const map: Record<string, string> = {
        pending: 'bg-warning-yellow/10 text-warning-yellow',
        accepted: 'bg-smoky-jade/10 text-smoky-jade',
        rejected: 'bg-red-100 text-red-700',
        expired: 'bg-slate-100 text-slate-500',
    };
    return map[status] ?? 'bg-slate-100 text-slate-600';
}

function formatDate(iso: string): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
        });
    } catch (err) {
        console.warn('[Engineer] Date format failed:', err);
        return '—';
    }
}

function esc(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getToken(): string {
    return localStorage.getItem('nammerha_token') ?? '';
}

function applyI18n(): void {
    if (typeof (window as Record<string, unknown>)['applyI18n'] === 'function') {
        ((window as Record<string, unknown>)['applyI18n'] as () => void)();
    }
}
