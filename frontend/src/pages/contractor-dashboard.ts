import '../styles/main.css';
import { escapeHtml as esc } from '../utils/xss';
import { phaseColor, bidColor } from '../utils/status-colors';
import { engineer } from '../api';

/* ═══════════════════════════════════════════════════════════════════════════
   Engineer Dashboard — Project Execution & Bidding Engine
   PLT-RE-001 FIX: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id, CSRF) is handled by the canonical request()
   wrapper — including 30s AbortController timeout for Syria's network conditions.
   ═══════════════════════════════════════════════════════════════════════════ */

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
        tabProjects.classList.add('bg-trust-blue/10', 'text-trust-blue');
        tabProjects.classList.remove('text-slate-600');
        tabBids?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
        tabBids?.classList.add('text-slate-600');
        if (sectionProjects) { sectionProjects.style.display = ''; }
        if (sectionBids) { sectionBids.style.display = 'none'; }
    });

    tabBids?.addEventListener('click', () => {
        tabBids.classList.add('bg-trust-blue/10', 'text-trust-blue');
        tabBids.classList.remove('text-slate-600');
        tabProjects?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
        tabProjects?.classList.add('text-slate-600');
        if (sectionBids) { sectionBids.style.display = ''; }
        if (sectionProjects) { sectionProjects.style.display = 'none'; }
        loadBids();
    });
}

// ─── Load KPIs from engineer.getStats() ─────────────────────────────────────
async function loadKPIs(): Promise<void> {
    try {
        const res = await engineer.getStats();
        if (!res.data) { return; }
        const data = res.data as unknown as Record<string, number>;

        setKPI('assigned-projects', data['assigned_projects'] ?? 0);
        setKPI('proofs-pending', data['proofs_pending'] ?? 0);
        setKPI('proofs-verified', data['proofs_verified'] ?? 0);
        setKPI('escrow-released', data['escrow_released'] ?? 0, '$');

        // Badge counts
        const projectCount = document.getElementById('project-count');
        if (projectCount) { projectCount.textContent = String(data['assigned_projects'] ?? 0); }
        const proofPending = document.getElementById('proof-pending');
        if (proofPending) { proofPending.textContent = String(data['proofs_pending'] ?? 0); }
    } catch {
        // Silent degradation — error captured by centralized reporter via api.ts
    }
}

// ─── Load Project Timeline from engineer.getProjects() ──────────────────────
async function loadProjectTimeline(): Promise<void> {
    const tbody = document.getElementById('project-timeline-body');
    if (!tbody) { return; }

    try {
        const res = await engineer.getProjects();
        const projects = (res.data ?? []) as unknown as Array<Record<string, string | number>>;

        if (projects.length === 0) {
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
    } catch {
        // Silent degradation — error captured by centralized reporter
    }
}

// ─── Load My Bids from engineer.getBids() ───────────────────────────────────
async function loadBids(): Promise<void> {
    const container = document.getElementById('bids-body');
    if (!container) { return; }

    try {
        const res = await engineer.getBids();
        const bids = (res.data ?? []) as unknown as Array<Record<string, string | number | null>>;

        if (bids.length === 0) {
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
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${bidColor(String(b['status'] ?? ''))}">
                        ${esc(String(b['status'] ?? ''))}
                    </span>
                </td>
                <td class="px-5 py-3 text-slate-500 text-xs">${formatDate(String(b['submitted_at'] ?? ''))}</td>
            </tr>
        `).join('');

        applyI18n();
    } catch {
        // Silent degradation — error captured by centralized reporter
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

function formatDate(iso: string): string {
    if (!iso) { return '—'; }
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
        });
    } catch {
        return '—';
    }
}

function applyI18n(): void {
    if (typeof (window as unknown as Record<string, unknown>)['applyI18n'] === 'function') {
        ((window as unknown as Record<string, unknown>)['applyI18n'] as () => void)();
    }
}
