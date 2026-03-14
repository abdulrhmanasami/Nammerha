import '../styles/main.css';
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { statusColor, escrowColor } from '../utils/status-colors';
import { donor } from '../api';
import { t } from '../utils/i18n';

/* ═══════════════════════════════════════════════════════════════════════════
   Donor Portal — Impact Dashboard, Marketplace, Donations, Impact, Proofs
   PLT-FE-001 FIX: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id, CSRF) is handled by the canonical request()
   wrapper — including 30s AbortController timeout for Syria's network conditions.
   ═══════════════════════════════════════════════════════════════════════════ */

type TabName = 'dashboard' | 'marketplace' | 'donations' | 'impact' | 'proofs';

// PLT-FE-003 FIX: Module-level constant instead of duplicating in setupTabs()/switchTab()
const ALL_TABS: TabName[] = ['dashboard', 'marketplace', 'donations', 'impact', 'proofs'];

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    loadStats();
    loadFundedProjects();
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
    for (const t of ALL_TABS) {
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
        const res = await donor.getStats();
        if (!res.data) { return; }
        const s = res.data;

        setText('kpi-donated', `$${(s.total_donated / 100).toLocaleString()}`);
        setText('kpi-projects', String(s.projects_supported));
        setText('kpi-items', String(s.items_funded));
        setText('kpi-score', `${s.impact_score}%`);
        setText('kpi-locked', `$${(s.escrow_locked / 100).toLocaleString()}`);
        setText('kpi-released', `$${(s.escrow_released / 100).toLocaleString()}`);
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // PLT-FE-002: Silently degrade — KPIs retain default HTML values.
        // Error is already captured by the centralized error-reporter via window.onerror.
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
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <i class="ph ph-hand-heart" style="font-size:40px" aria-hidden="true"></i>
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
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(p.status)}">${esc(p.status.replace(/_/g, ' '))}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-slate-400">
                            <span><i class="ph ph-tag" aria-hidden="true"></i> ${esc(p.damage_type)}</span>
                            ${p.region ? `<span><i class="ph ph-map-pin" aria-hidden="true"></i> ${esc(p.region)}</span>` : ''}
                            <span class="text-emerald-600 font-bold">${esc(t('donor_my_contribution', 'My contribution'))}: $${(p.my_total_donated / 100).toLocaleString()}</span>
                            <span>${p.items_i_funded} ${esc(t('donor_items_label', 'items'))}</span>
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
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        container.innerHTML = `<div class="p-5 text-center text-red-400 text-sm" data-i18n="failed_to_load">Failed to load</div>`;
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
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <p class="text-sm font-medium">${esc(t('donor_no_marketplace_projects', 'No projects available at the moment'))}</p>
            </div>`;
            return;
        }

        container.innerHTML = projects.map((p) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <h4 class="font-medium">${esc(p.title)}</h4>
                        <div class="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                            <span><i class="ph ph-tag" aria-hidden="true"></i> ${esc(p.damage_type)}</span>
                            ${p.region ? `<span><i class="ph ph-map-pin" aria-hidden="true"></i> ${esc(p.region)}</span>` : ''}
                            <span>${p.items_count} ${esc(t('donor_items_label', 'items'))}</span>
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
                                <a href="/donor-basket.html?project=${esc(p.project_id)}" class="px-3 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700">${esc(t('donor_fund_this', 'Fund This'))}</a>
                            ` : `<span class="text-[10px] font-bold text-green-600" data-i18n="fully_funded">✓ Fully Funded</span>`}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        container.innerHTML = `<div class="p-5 text-center text-red-400 text-sm" data-i18n="failed_to_load">Failed to load</div>`;
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
            tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-slate-400">
                <p class="text-sm font-medium">${esc(t('donor_no_donations', 'No donations yet'))}</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = donations.map((d) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-medium">${esc(d.material_name)}</td>
                <td class="px-5 py-3 text-xs">${esc(d.project_title)}</td>
                <td class="px-5 py-3 font-mono font-bold text-emerald-600">$${(d.amount_locked / 100).toLocaleString()}</td>
                <td class="px-5 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${escrowColor(d.status)}">${esc(d.status)}</span></td>
                <td class="px-5 py-3 text-xs text-slate-400">${new Date(d.locked_at).toLocaleDateString()}</td>
            </tr>
        `).join('');
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-4 text-center text-red-400 text-sm" data-i18n="failed_to_load">Failed to load</td></tr>`;
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
            container.innerHTML = `<div class="p-8 text-center text-slate-400">
                <p class="text-sm font-medium">${esc(t('donor_no_impact', 'No impact data yet'))}</p>
            </div>`;
            return;
        }

        container.innerHTML = projects.map((p) => `
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
                            <span>${esc(t('donor_donated_label', 'Donated'))}: <strong class="text-emerald-600">$${(p.my_total_donated / 100).toLocaleString()}</strong></span>
                            <span>${p.items_i_funded} ${esc(t('donor_items_funded', 'items funded'))}</span>
                            <span>${esc(t('donor_progress_label', 'Progress'))}: <strong class="${p.funded_percentage >= 100 ? 'text-green-600' : 'text-emerald-600'}">${p.funded_percentage}%</strong></span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        container.innerHTML = `<div class="p-5 text-center text-red-400 text-sm" data-i18n="failed_to_load">Failed to load</div>`;
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
            container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400">
                <i class="ph ph-camera" style="font-size:40px" aria-hidden="true"></i>
                <p class="mt-3 text-sm font-medium">${esc(t('donor_no_proofs', 'No proofs yet'))}</p>
                <p class="text-xs mt-1">${esc(t('donor_proofs_hint', 'GPS-verified photos appear here after on-site verification'))}</p>
            </div>`;
            return;
        }

        container.innerHTML = proofs.map((proof) => `
            <div class="border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                <div class="aspect-video bg-slate-100 flex items-center justify-center relative">
                    ${proof.photo_url
                ? `<img src="${esc(proof.photo_url)}" alt="${esc(t('donor_site_proof', 'Site proof'))}" class="w-full h-full object-cover" />`
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
    } catch (err) { reportWarning('[DonorPortal] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        container.innerHTML = `<div class="col-span-full p-5 text-center text-red-400 text-sm" data-i18n="failed_to_load">Failed to load</div>`;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) { el.textContent = text; }
}


