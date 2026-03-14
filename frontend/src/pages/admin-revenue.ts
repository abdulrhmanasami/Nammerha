/**
 * admin-revenue.ts — Revenue Dashboard Controller
 *
 * Fetches and renders monetization data from /api/revenue/admin/* endpoints.
 * Per profitability study Phase 1: Market Liquidity & E-commerce Revenue.
 */
import '../styles/main.css';

// ─── Types ──────────────────────────────────────────────────────────────────
interface RevenueSummary {
    total_commission_cents: number;
    total_tip_cents: number;
    commission_count: number;
    tip_count: number;
    avg_tip_cents: number;
    avg_tip_percentage: number;
}

interface CommissionTier {
    tier_id: string;
    tier_name: string;
    min_revenue_cents: number;
    max_revenue_cents: number | null;
    commission_rate_bps: number;
    is_active: boolean;
}

interface CommissionEntry {
    commission_id: string;
    supplier_id: string;
    po_id: string;
    po_amount_cents: number;
    commission_amount_cents: number;
    rate_bps: number;
    created_at: string;
}

interface TipEntry {
    tip_id: string;
    donor_id: string;
    donation_reference: string;
    tip_amount_cents: number;
    tip_percentage: number | null;
    created_at: string;
}

// ─── API Helpers ────────────────────────────────────────────────────────────
const API_BASE = '/api/revenue/admin';

async function fetchJson<T>(url: string): Promise<T | null> {
    try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
            console.error(`[revenue] HTTP ${res.status} from ${url}`);
            return null;
        }
        const body = (await res.json()) as { success: boolean; data: T };
        return body.success ? body.data : null;
    } catch (err) {
        console.error(`[revenue] Fetch error:`, err);
        return null;
    }
}

// ─── Formatters ─────────────────────────────────────────────────────────────
function centsToUsd(cents: number): string {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function bpsToPercent(bps: number): string {
    return `${(bps / 100).toFixed(1)}%`;
}

function relativeTime(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// ─── Renderers ──────────────────────────────────────────────────────────────
function renderKpis(summary: RevenueSummary): void {
    const totalRevenue = summary.total_commission_cents + summary.total_tip_cents;

    const totalEl = document.getElementById('kpi-total-revenue');
    const commEl = document.getElementById('kpi-commissions');
    const commCountEl = document.getElementById('kpi-commission-count');
    const tipEl = document.getElementById('kpi-tips');
    const tipCountEl = document.getElementById('kpi-tip-count');
    const avgTipEl = document.getElementById('kpi-avg-tip');
    const avgTipPctEl = document.getElementById('kpi-avg-tip-pct');

    if (totalEl) {
        totalEl.textContent = centsToUsd(totalRevenue);
    }
    if (commEl) {
        commEl.textContent = centsToUsd(summary.total_commission_cents);
    }
    if (commCountEl) {
        commCountEl.textContent = String(summary.commission_count);
    }
    if (tipEl) {
        tipEl.textContent = centsToUsd(summary.total_tip_cents);
    }
    if (tipCountEl) {
        tipCountEl.textContent = String(summary.tip_count);
    }
    if (avgTipEl) {
        avgTipEl.textContent = centsToUsd(summary.avg_tip_cents);
    }
    if (avgTipPctEl) {
        avgTipPctEl.textContent = `≈ ${(summary.avg_tip_percentage ?? 0).toFixed(1)}%`;
    }
}

function renderTiers(tiers: CommissionTier[]): void {
    const tbody = document.getElementById('tier-table-body');
    if (!tbody) return;

    if (tiers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-slate-400">No tiers configured</td></tr>';
        return;
    }

    tbody.innerHTML = tiers.map((tier) => {
        const min = centsToUsd(tier.min_revenue_cents);
        const max = tier.max_revenue_cents !== null ? centsToUsd(tier.max_revenue_cents) : '∞';
        const statusClass = tier.is_active
            ? 'text-smoky-jade bg-smoky-jade/10'
            : 'text-slate-400 bg-slate-100';
        const statusText = tier.is_active ? 'Active' : 'Inactive';

        return `
            <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-semibold">${tier.tier_name}</td>
                <td class="px-5 py-3 text-slate-600 font-mono text-xs">${min} – ${max}</td>
                <td class="px-5 py-3 font-bold font-mono">${tier.commission_rate_bps}</td>
                <td class="px-5 py-3 font-bold text-trust-blue">${bpsToPercent(tier.commission_rate_bps)}</td>
                <td class="px-5 py-3">
                    <span class="text-xs font-bold ${statusClass} px-2 py-0.5 rounded-full">${statusText}</span>
                </td>
            </tr>`;
    }).join('');
}

function renderRecentCommissions(commissions: CommissionEntry[]): void {
    const list = document.getElementById('recent-commissions-list');
    if (!list) {
        return;
    }

    if (commissions.length === 0) {
        list.innerHTML = '<div class="px-5 py-8 text-center text-sm text-slate-400">No commissions recorded yet</div>';
        return;
    }

    list.innerHTML = commissions.slice(0, 8).map((c) => `
        <div class="px-5 py-3 flex items-center gap-4">
            <div class="size-8 rounded-full bg-smoky-jade/10 flex items-center justify-center shrink-0">
                <i class="ph ph-receipt text-smoky-jade" style="font-size:14px" aria-hidden="true"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">PO ${c.po_id} — ${centsToUsd(c.commission_amount_cents)}</p>
                <p class="text-[10px] text-slate-400 mt-0.5">Rate: ${bpsToPercent(c.rate_bps)} • PO: ${centsToUsd(c.po_amount_cents)}</p>
            </div>
            <span class="text-[10px] text-slate-400 shrink-0">${relativeTime(c.created_at)}</span>
        </div>`).join('');
}

// Exported for use when /api/revenue/admin/tips endpoint returns individual records
export function renderRecentTips(tips: TipEntry[]): void {
    const list = document.getElementById('recent-tips-list');
    if (!list) {
        return;
    }

    if (tips.length === 0) {
        list.innerHTML = '<div class="px-5 py-8 text-center text-sm text-slate-400">No tips recorded yet</div>';
        return;
    }

    list.innerHTML = tips.slice(0, 8).map((tip) => {
        const pctLabel = tip.tip_percentage !== null ? ` (${tip.tip_percentage}%)` : '';
        return `
        <div class="px-5 py-3 flex items-center gap-4">
            <div class="size-8 rounded-full bg-warm-earth/10 flex items-center justify-center shrink-0">
                <i class="ph ph-heart text-warm-earth" style="font-size:14px" aria-hidden="true"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">Donation ${tip.donation_reference} — ${centsToUsd(tip.tip_amount_cents)}${pctLabel}</p>
                <p class="text-[10px] text-slate-400 mt-0.5">Donor: ${tip.donor_id.substring(0, 8)}…</p>
            </div>
            <span class="text-[10px] text-slate-400 shrink-0">${relativeTime(tip.created_at)}</span>
        </div>`;
    }).join('');
}

// ─── Data Loading ───────────────────────────────────────────────────────────
async function loadDashboard(): Promise<void> {
    const timestampEl = document.getElementById('rev-last-updated');

    // Parallel fetch all data
    const [summary, tiers, commissions] = await Promise.all([
        fetchJson<RevenueSummary>(`${API_BASE}/summary`),
        fetchJson<CommissionTier[]>(`${API_BASE}/config`),
        fetchJson<{ rows: CommissionEntry[]; total: number }>(`${API_BASE}/commissions?limit=8`),
    ]);

    // Render KPIs
    if (summary) {
        renderKpis(summary);
    }

    // Render tiers
    if (tiers) {
        renderTiers(tiers);
    }

    // Render recent commissions
    if (commissions && 'rows' in commissions) {
        renderRecentCommissions(commissions.rows);
    }

    // Note: tips are already displayed in the KPI section via summary.
    // renderRecentTips would require a separate /api/revenue/admin/tips endpoint
    // which returns individual tip records. For now the KPI summary is sufficient.

    // Update timestamp
    if (timestampEl) {
        timestampEl.textContent = new Date().toLocaleTimeString();
    }
}

// ─── Initialization ─────────────────────────────────────────────────────────
function initRevenueDashboard(): void {
    // Setup sidebar toggle (shared with other admin pages)
    const sidebar = document.querySelector('.dashboard-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const toggle = document.querySelector('.sidebar-toggle');

    function openSidebar(): void {
        sidebar?.classList.add('sidebar-open');
        overlay?.classList.add('active');
    }
    function closeSidebar(): void {
        sidebar?.classList.remove('sidebar-open');
        overlay?.classList.remove('active');
    }

    toggle?.addEventListener('click', () => {
        if (sidebar?.classList.contains('sidebar-open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });
    overlay?.addEventListener('click', closeSidebar);

    // Refresh button
    const refreshBtn = document.getElementById('rev-refresh-btn');
    refreshBtn?.addEventListener('click', () => {
        loadDashboard();
    });

    // Initial load
    loadDashboard();
}

// DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRevenueDashboard);
} else {
    initRevenueDashboard();
}
