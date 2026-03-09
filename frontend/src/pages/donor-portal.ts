import '../styles/main.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Donor Portal — Impact Dashboard, Marketplace, Donations, Impact, Proofs
   Wires to: /api/donor/*
   ═══════════════════════════════════════════════════════════════════════════ */

const API = '/api/donor';

function getToken(): string {
    return localStorage.getItem('nammerha_token') ?? '';
}

const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
});

// ─── Types ──────────────────────────────────────────────────────────────────
interface Stats {
    total_donated: number;
    projects_supported: number;
    items_funded: number;
    escrow_locked: number;
    escrow_released: number;
    impact_score: number;
}

interface Donation {
    escrow_id: string;
    project_title: string;
    material_name: string;
    amount_locked: number;
    status: string;
    locked_at: string;
}

interface FundedProject {
    project_id: string;
    title: string;
    damage_type: string;
    region: string | null;
    status: string;
    my_total_donated: number;
    funded_percentage: number;
    items_i_funded: number;
}

interface MarketProject {
    project_id: string;
    title: string;
    damage_type: string;
    region: string | null;
    total_cost: number;
    total_funded: number;
    funded_percentage: number;
    items_count: number;
}

interface Proof {
    proof_id: string;
    project_title: string;
    material_name: string;
    photo_url: string | null;
    gps_lat: number | null;
    gps_lng: number | null;
    verified_by: string | null;
    verified_at: string | null;
    description: string | null;
}

type TabName = 'dashboard' | 'marketplace' | 'donations' | 'impact' | 'proofs';

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    loadStats();
    loadFundedProjects();
});

// ─── Tab Navigation ─────────────────────────────────────────────────────────
function setupTabs(): void {
    const tabs: TabName[] = ['dashboard', 'marketplace', 'donations', 'impact', 'proofs'];

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
    const allTabs: TabName[] = ['dashboard', 'marketplace', 'donations', 'impact', 'proofs'];

    for (const t of allTabs) {
        const el = document.getElementById(`tab-${t}`);
        if (!el) { continue; }
        el.className = t === tab
            ? 'flex items-center gap-3 px-3 py-2 bg-emerald-600/10 text-emerald-700 rounded-lg cursor-pointer'
            : 'flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer';

        const section = document.getElementById(`section-${t}`);
        if (section) { section.style.display = t === tab ? '' : 'none'; }
    }

    if (tab === 'marketplace') { loadMarketplace(); }
    if (tab === 'donations') { loadDonations(); }
    if (tab === 'impact') { loadImpact(); }
    if (tab === 'proofs') { loadProofs(); }
}

// ─── KPIs ───────────────────────────────────────────────────────────────────
async function loadStats(): Promise<void> {
    try {
        const res = await fetch(`${API}/stats`, { headers: headers() });
        if (!res.ok) { return; }
        const json = await res.json() as { data: Stats };
        const s = json.data;

        setText('kpi-donated', `$${(s.total_donated / 100).toLocaleString()}`);
        setText('kpi-projects', String(s.projects_supported));
        setText('kpi-items', String(s.items_funded));
        setText('kpi-score', `${s.impact_score}%`);
        setText('kpi-locked', `$${(s.escrow_locked / 100).toLocaleString()}`);
        setText('kpi-released', `$${(s.escrow_released / 100).toLocaleString()}`);
    } catch (err) {
        console.warn('[Donor] Stats load failed, showing defaults:', err);
    }
}

// ─── Dashboard — Funded Projects ────────────────────────────────────────────
async function loadFundedProjects(): Promise<void> {
    const container = document.getElementById('funded-projects-list');
    if (!container) { return; }

    try {
        const res = await fetch(`${API}/impact`, { headers: headers() });
        if (!res.ok) { throw new Error('Failed'); }
        const json = await res.json() as { data: FundedProject[] };

        if (json.data.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <i class="ph ph-hand-heart" style="font-size:40px" aria-hidden="true"></i>
                <p class="mt-3 text-sm font-medium">No funded projects yet</p>
                <p class="text-xs mt-1">Browse projects and start making an impact</p>
            </div>`;
            return;
        }

        container.innerHTML = json.data.map((p) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-medium">${esc(p.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-slate-400">
                            <span><i class="ph ph-tag" aria-hidden="true"></i> ${esc(p.damage_type)}</span>
                            ${p.region ? `<span><i class="ph ph-map-pin" aria-hidden="true"></i> ${esc(p.region)}</span>` : ''}
                            <span class="text-emerald-600 font-bold">My contribution: $${(p.my_total_donated / 100).toLocaleString()}</span>
                            <span>${p.items_i_funded} items</span>
                        </div>
                        <!-- Funding Progress Bar -->
                        <div class="mt-3 flex items-center gap-3">
                            <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div class="h-full bg-emerald-500 rounded-full transition-all" style="width:${Math.min(p.funded_percentage, 100)}%"></div>
                            </div>
                            <span class="text-[10px] font-bold text-emerald-600">${p.funded_percentage}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('[Donor] Funded projects load failed:', err);
        container.innerHTML = `<div class="p-5 text-center text-red-400 text-sm">Failed to load</div>`;
    }
}

// ─── Marketplace ────────────────────────────────────────────────────────────
async function loadMarketplace(): Promise<void> {
    const container = document.getElementById('marketplace-list');
    if (!container) { return; }

    try {
        const res = await fetch(`${API}/marketplace`, { headers: headers() });
        if (!res.ok) { throw new Error('Failed'); }
        const json = await res.json() as { data: MarketProject[] };

        if (json.data.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <p class="text-sm font-medium">No projects available at the moment</p>
            </div>`;
            return;
        }

        container.innerHTML = json.data.map((p) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <h4 class="font-medium">${esc(p.title)}</h4>
                        <div class="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                            <span><i class="ph ph-tag" aria-hidden="true"></i> ${esc(p.damage_type)}</span>
                            ${p.region ? `<span><i class="ph ph-map-pin" aria-hidden="true"></i> ${esc(p.region)}</span>` : ''}
                            <span>${p.items_count} items</span>
                        </div>
                        <div class="mt-3 flex items-center gap-3">
                            <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all ${p.funded_percentage >= 100 ? 'bg-green-500' : 'bg-emerald-400'}" style="width:${Math.min(p.funded_percentage, 100)}%"></div>
                            </div>
                            <span class="text-[10px] font-bold ${p.funded_percentage >= 100 ? 'text-green-600' : 'text-emerald-600'}">${p.funded_percentage}%</span>
                        </div>
                        <div class="flex items-center justify-between mt-2">
                            <span class="text-xs text-slate-500">$${(p.total_funded / 100).toLocaleString()} / $${(p.total_cost / 100).toLocaleString()}</span>
                            ${p.funded_percentage < 100 ? `
                                <a href="/donor-basket.html?project=${esc(p.project_id)}" class="px-3 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700">Fund This</a>
                            ` : `<span class="text-[10px] font-bold text-green-600">✓ Fully Funded</span>`}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('[Donor] Marketplace load failed:', err);
        container.innerHTML = `<div class="p-5 text-center text-red-400 text-sm">Failed to load</div>`;
    }
}

// ─── Donation History ───────────────────────────────────────────────────────
async function loadDonations(): Promise<void> {
    const tbody = document.getElementById('donations-body');
    if (!tbody) { return; }

    try {
        const res = await fetch(`${API}/donations`, { headers: headers() });
        if (!res.ok) { throw new Error('Failed'); }
        const json = await res.json() as { data: Donation[] };

        if (json.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-slate-400">
                <p class="text-sm font-medium">No donations yet</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = json.data.map((d) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(d.material_name)}</td>
                <td class="px-5 py-3 text-xs">${esc(d.project_title)}</td>
                <td class="px-5 py-3 font-mono font-bold text-emerald-600">$${(d.amount_locked / 100).toLocaleString()}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${escrowColor(d.status)}">${esc(d.status)}</span></td>
                <td class="px-5 py-3 text-xs text-slate-400">${new Date(d.locked_at).toLocaleDateString()}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('[Donor] Donations load failed:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-4 text-center text-red-400 text-sm">Failed to load</td></tr>`;
    }
}

// ─── Impact ─────────────────────────────────────────────────────────────────
async function loadImpact(): Promise<void> {
    const container = document.getElementById('impact-list');
    if (!container) { return; }

    try {
        const res = await fetch(`${API}/impact`, { headers: headers() });
        if (!res.ok) { throw new Error('Failed'); }
        const json = await res.json() as { data: FundedProject[] };

        if (json.data.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <p class="text-sm font-medium">No impact data yet</p>
            </div>`;
            return;
        }

        container.innerHTML = json.data.map((p) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-center gap-4">
                    <div class="size-12 rounded-lg flex items-center justify-center ${p.status === 'completed' ? 'bg-green-100' : 'bg-emerald-100'}">
                        <i class="ph ${p.status === 'completed' ? 'ph-check-circle text-green-600' : 'ph-buildings text-emerald-600'}" style="font-size:20px" aria-hidden="true"></i>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-medium">${esc(p.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span>
                        </div>
                        <div class="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                            <span>Donated: <strong class="text-emerald-600">$${(p.my_total_donated / 100).toLocaleString()}</strong></span>
                            <span>${p.items_i_funded} items funded</span>
                            <span>Progress: <strong class="${p.funded_percentage >= 100 ? 'text-green-600' : 'text-emerald-600'}">${p.funded_percentage}%</strong></span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('[Donor] Impact data load failed:', err);
        container.innerHTML = `<div class="p-5 text-center text-red-400 text-sm">Failed to load</div>`;
    }
}

// ─── Proofs ─────────────────────────────────────────────────────────────────
async function loadProofs(): Promise<void> {
    const container = document.getElementById('proofs-grid');
    if (!container) { return; }

    try {
        const res = await fetch(`${API}/proofs`, { headers: headers() });
        if (!res.ok) { throw new Error('Failed'); }
        const json = await res.json() as { data: Proof[] };

        if (json.data.length === 0) {
            container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400">
                <i class="ph ph-camera" style="font-size:40px" aria-hidden="true"></i>
                <p class="mt-3 text-sm font-medium">No proofs yet</p>
                <p class="text-xs mt-1">GPS-verified photos appear here after on-site verification</p>
            </div>`;
            return;
        }

        container.innerHTML = json.data.map((proof) => `
            <div class="border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                <div class="aspect-video bg-slate-100 flex items-center justify-center relative">
                    ${proof.photo_url
                ? `<img src="${esc(proof.photo_url)}" alt="Site proof" class="w-full h-full object-cover" />`
                : `<i class="ph ph-image text-slate-300" style="font-size:40px" aria-hidden="true"></i>`
            }
                    ${proof.gps_lat ? `
                        <div class="absolute bottom-2 right-2 bg-black/60 text-white text-[8px] px-2 py-1 rounded-full font-mono">
                            <i class="ph ph-map-pin" aria-hidden="true"></i> ${proof.gps_lat.toFixed(4)}, ${proof.gps_lng?.toFixed(4) ?? ''}
                        </div>
                    ` : ''}
                </div>
                <div class="p-3">
                    <p class="font-medium text-sm">${esc(proof.project_title)}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">${esc(proof.material_name ?? 'N/A')}</p>
                    ${proof.verified_by ? `<p class="text-[10px] text-emerald-600 mt-1"><i class="ph ph-shield-check" aria-hidden="true"></i> ${esc(proof.verified_by)}</p>` : ''}
                    ${proof.verified_at ? `<p class="text-[10px] text-slate-400">${new Date(proof.verified_at).toLocaleDateString()}</p>` : ''}
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('[Donor] Proofs load failed:', err);
        container.innerHTML = `<div class="col-span-full p-5 text-center text-red-400 text-sm">Failed to load</div>`;
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
        pending_assessment: 'bg-amber-100 text-amber-700',
        assessed: 'bg-indigo-100 text-indigo-700',
        published: 'bg-purple-100 text-purple-700',
        in_progress: 'bg-teal-100 text-teal-700',
        completed: 'bg-green-100 text-green-700',
        cancelled: 'bg-red-100 text-red-600',
    };
    return c[s] ?? 'bg-slate-100 text-slate-600';
}

function escrowColor(s: string): string {
    return s === 'released' ? 'bg-green-100 text-green-700'
        : s === 'locked' ? 'bg-emerald-100 text-emerald-700'
            : s === 'refunded' ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-600';
}
