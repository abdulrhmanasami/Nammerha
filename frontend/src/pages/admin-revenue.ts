/**
 * admin-revenue.ts — Revenue Dashboard Controller
 *
 * Fetches and renders monetization data from /api/revenue/admin/* endpoints.
 * Per profitability study Phase 1: Market Liquidity & E-commerce Revenue.
 *
 * FIX-01: Complete rewrite — migrated from broken raw fetch() + localStorage
 * to centralized API client (httpOnly cookies, CSRF, 30s timeout, error reporting).
 * Deleted: duplicate centsToUsd(), relativeTime(), fetchJson(), sidebar toggle.
 * Added:  escapeHtml() on all dynamic content, i18n t() on all user-facing strings.
 */
import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { revenueAdmin } from '../api';
import type { CommissionTier, CommissionEntry, TipEntry, RevenueAdminSummary } from '../api';
import { reportError, reportWarning } from '../error-reporter';
import { escapeHtml } from '../utils/xss';
import { formatCents, relativeTimeAgo } from '../utils/format';
import { t } from '../utils/i18n';

// ─── Formatters (non-duplicated helpers) ────────────────────────────────────

function bpsToPercent(bps: number): string {
    return `${(bps / 100).toFixed(1)}%`;
}

// ─── Renderers ──────────────────────────────────────────────────────────────

function renderKpis(summary: RevenueAdminSummary): void {
    const totalRevenue = summary.total_commission_cents + summary.total_tip_cents;

    const totalEl = document.getElementById('kpi-total-revenue');
    const commEl = document.getElementById('kpi-commissions');
    const commCountEl = document.getElementById('kpi-commission-count');
    const tipEl = document.getElementById('kpi-tips');
    const tipCountEl = document.getElementById('kpi-tip-count');
    const avgTipEl = document.getElementById('kpi-avg-tip');
    const avgTipPctEl = document.getElementById('kpi-avg-tip-pct');

    if (totalEl) { totalEl.textContent = formatCents(totalRevenue); }
    if (commEl) { commEl.textContent = formatCents(summary.total_commission_cents); }
    if (commCountEl) { commCountEl.textContent = String(summary.commission_count); }
    if (tipEl) { tipEl.textContent = formatCents(summary.total_tip_cents); }
    if (tipCountEl) { tipCountEl.textContent = String(summary.tip_count); }
    if (avgTipEl) { avgTipEl.textContent = formatCents(summary.avg_tip_cents); }
    if (avgTipPctEl) { avgTipPctEl.textContent = `≈ ${(summary.avg_tip_percentage ?? 0).toFixed(1)}%`; }
}

function renderTiers(tiers: CommissionTier[]): void {
    const tbody = document.getElementById('tier-table-body');
    if (!tbody) { return; }

    if (tiers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-slate-400">${t('rev_no_tiers', 'No tiers configured')}</td></tr>`;
        return;
    }

    tbody.innerHTML = tiers.map((tier) => {
        const min = formatCents(tier.min_revenue_cents);
        const max = tier.max_revenue_cents !== null ? formatCents(tier.max_revenue_cents) : '∞';
        const statusClass = tier.is_active
            ? 'text-smoky-jade bg-smoky-jade/10'
            : 'text-slate-400 bg-slate-100';
        const statusText = tier.is_active
            ? t('rev_active', 'Active')
            : t('rev_inactive', 'Inactive');

        return `
            <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td class="px-5 py-3 font-semibold">${escapeHtml(tier.tier_name)}</td>
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
    if (!list) { return; }

    if (commissions.length === 0) {
        list.innerHTML = `<div class="px-5 py-8 text-center text-sm text-slate-400">${t('rev_no_commissions', 'No commissions recorded yet')}</div>`;
        return;
    }

    list.innerHTML = commissions.slice(0, 8).map((c) => `
        <div class="px-5 py-3 flex items-center gap-4">
            <div class="size-8 rounded-full bg-smoky-jade/10 flex items-center justify-center shrink-0">
                <i class="ph ph-receipt text-smoky-jade text-sm" aria-hidden="true"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">${t('rev_po_label', 'PO')} ${escapeHtml(c.po_id)} — ${formatCents(c.commission_amount_cents)}</p>
                <p class="text-3xs text-slate-400 mt-0.5">${t('rev_rate_label', 'Rate')}: ${bpsToPercent(c.rate_bps)} • ${t('rev_po_label', 'PO')}: ${formatCents(c.po_amount_cents)}</p>
            </div>
            <span class="text-3xs text-slate-400 shrink-0">${relativeTimeAgo(c.created_at)}</span>
        </div>`).join('');
}

export function renderRecentTips(tips: TipEntry[]): void {
    const list = document.getElementById('recent-tips-list');
    if (!list) { return; }

    if (tips.length === 0) {
        list.innerHTML = `<div class="px-5 py-8 text-center text-sm text-slate-400">${t('rev_no_tips', 'No tips recorded yet')}</div>`;
        return;
    }

    list.innerHTML = tips.slice(0, 8).map((tip) => {
        const pctLabel = tip.tip_percentage !== null ? ` (${tip.tip_percentage}%)` : '';
        return `
        <div class="px-5 py-3 flex items-center gap-4">
            <div class="size-8 rounded-full bg-warm-earth/10 flex items-center justify-center shrink-0">
                <i class="ph ph-heart text-warm-earth text-sm" aria-hidden="true"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">${t('rev_donation_label', 'Donation')} ${escapeHtml(tip.donation_reference)} — ${formatCents(tip.tip_amount_cents)}${pctLabel}</p>
                <p class="text-3xs text-slate-400 mt-0.5">${t('rev_donor_label', 'Donor')}: ${escapeHtml(tip.donor_id.substring(0, 8))}…</p>
            </div>
            <span class="text-3xs text-slate-400 shrink-0">${relativeTimeAgo(tip.created_at)}</span>
        </div>`;
    }).join('');
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadDashboard(): Promise<void> {
    const timestampEl = document.getElementById('rev-last-updated');

    try {
        // FIX-01: Uses centralized API client with httpOnly cookies, CSRF, 30s timeout
        // PLT-AUD-P001 FIX: Was Promise.all — one timeout killed the entire revenue dashboard.
        // Promise.allSettled renders each section independently on partial failure.
        // Standard: Resilient Data Loading, Syria 2G tolerance.
        const [summarySettled, tiersSettled, commissionsSettled] = await Promise.allSettled([
            revenueAdmin.getSummary(),
            revenueAdmin.getTiers(),
            revenueAdmin.getCommissions(8),
        ]);

        if (summarySettled.status === 'fulfilled' && summarySettled.value.success && summarySettled.value.data) {
            renderKpis(summarySettled.value.data);
        } else if (summarySettled.status === 'rejected') {
            reportWarning('[Revenue] Summary API failed', { error: String(summarySettled.reason) });
            const kpiIds = ['kpi-total-revenue', 'kpi-commissions', 'kpi-commission-count', 'kpi-tips', 'kpi-tip-count', 'kpi-avg-tip', 'kpi-avg-tip-pct'];
            kpiIds.forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = '—'; } });
        }

        if (tiersSettled.status === 'fulfilled' && tiersSettled.value.success && tiersSettled.value.data) {
            renderTiers(Array.isArray(tiersSettled.value.data) ? tiersSettled.value.data : []);
        } else if (tiersSettled.status === 'rejected') {
            reportWarning('[Revenue] Tiers API failed', { error: String(tiersSettled.reason) });
        }

        if (commissionsSettled.status === 'fulfilled' && commissionsSettled.value.success && commissionsSettled.value.data && 'rows' in commissionsSettled.value.data) {
            renderRecentCommissions(commissionsSettled.value.data.rows);
        } else if (commissionsSettled.status === 'rejected') {
            reportWarning('[Revenue] Commissions API failed', { error: String(commissionsSettled.reason) });
        }
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[revenue] Dashboard load failed'), {
            component: 'admin-revenue',
            action: 'load_dashboard',
        });
        // W5-002 FIX: Show user-facing error state across all dashboard sections.
        // Previous: Silent failure — KPI cards and tables stayed in initial state forever.
        // Standard: Nielsen #1 (Visibility of System Status), Error Recovery UX.
        const kpiIds = ['kpi-total-revenue', 'kpi-commissions', 'kpi-commission-count', 'kpi-tips', 'kpi-tip-count', 'kpi-avg-tip', 'kpi-avg-tip-pct'];
        kpiIds.forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = '—'; } });
        const tbody = document.getElementById('tier-table-body');
        if (tbody) { tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-red-400">${t('failed_to_load', 'Failed to load')}</td></tr>`; }
        const commList = document.getElementById('recent-commissions-list');
        if (commList) { commList.innerHTML = `<div class="px-5 py-8 text-center text-sm text-red-400">${t('failed_to_load', 'Failed to load')}</div>`; }
    }

    // Update timestamp
    if (timestampEl) {
        timestampEl.textContent = new Date().toLocaleTimeString();
    }
}

// ─── Initialization ─────────────────────────────────────────────────────────
// FIX-01: Removed duplicate sidebar toggle — nav.js handles this globally.

function initRevenueDashboard(): void {
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
