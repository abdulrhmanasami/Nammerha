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
import { renderErrorWithRetry } from '../utils/error-retry';
import { escapeHtml } from '../utils/xss';
import { formatCents, relativeTimeAgo } from '../utils/format';
import { t } from '../utils/i18n';
// TICK-W4-003 FIX: Auth guard — was missing on this admin page.
import { requireAuth } from '../utils/auth-guard';

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
        tbody.innerHTML = `
        <div class="bg-white py-8 text-center w-full nm-table-empty dark:bg-dark-surface">
            <div class="size-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3 text-slate-400 nm-empty-icon dark:bg-dark-elevated dark:text-slate-500">
                <i class="ph ph-receipt nm-icon-24" aria-hidden="true"></i>
            </div>
            <p class="font-bold text-slate-700 text-sm mt-2 dark:text-slate-300">${escapeHtml(t('rev_no_tiers', 'No tiers configured'))}</p>
        </div>`;
        return;
    }

    tbody.innerHTML = tiers.map((tier) => {
        const min = formatCents(tier.min_revenue_cents);
        const max = tier.max_revenue_cents !== null ? formatCents(tier.max_revenue_cents) : '∞';
        const statusClass = tier.is_active
            ? 'text-smoky-jade bg-smoky-jade/10'
            : 'text-slate-400 bg-slate-100';
        const statusText = tier.is_active
            ? escapeHtml(t('rev_active', 'Active'))
            : escapeHtml(t('rev_inactive', 'Inactive'));

        return `
            <div class="p-4 hover:bg-slate-50/50 transition-colors group">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${escapeHtml(tier.tier_name)}</h3>
                            <span class="text-3xs font-bold ${statusClass} px-2 py-0.5 rounded-full uppercase tracking-wider">${statusText}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                            <p class="text-xs text-slate-600 dark:text-slate-400"><span class="text-slate-400 me-1 uppercase text-3xs font-bold tracking-wider dark:text-slate-500" data-i18n="th_revenue_range">Range</span> <span class="font-mono text-emerald-600 font-bold">${min} – ${max}</span></p>
                            <p class="text-xs text-slate-600 dark:text-slate-400"><span class="text-slate-400 me-1 uppercase text-3xs font-bold tracking-wider dark:text-slate-500" data-i18n="th_rate_bps">Rate (bps)</span> <span class="font-mono font-bold">${tier.commission_rate_bps}</span></p>
                            <p class="text-xs text-slate-600 dark:text-slate-400"><span class="text-slate-400 me-1 uppercase text-3xs font-bold tracking-wider dark:text-slate-500" data-i18n="th_rate_pct">Rate (%)</span> <span class="font-bold text-trust-blue">${bpsToPercent(tier.commission_rate_bps)}</span></p>
                        </div>
                    </div>
                </div>
            </div>`;
    }).join('');
}

function renderRecentCommissions(commissions: CommissionEntry[]): void {
    const list = document.getElementById('recent-commissions-list');
    if (!list) { return; }

    if (commissions.length === 0) {
        list.innerHTML = `<div class="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">${escapeHtml(t('rev_no_commissions', 'No commissions recorded yet'))}</div>`;
        return;
    }

    list.innerHTML = commissions.slice(0, 8).map((c) => `
        <div class="px-5 py-3 flex items-center gap-4">
            <div class="size-8 rounded-full bg-smoky-jade/10 flex items-center justify-center shrink-0">
                <i class="ph ph-receipt text-smoky-jade text-sm dark:text-emerald-400" aria-hidden="true"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">${escapeHtml(t('rev_po_label', 'PO'))} ${escapeHtml(c.po_id)} — ${formatCents(c.commission_amount_cents)}</p>
                <p class="text-3xs text-slate-400 mt-0.5 dark:text-slate-500">${escapeHtml(t('rev_rate_label', 'Rate'))}: ${bpsToPercent(c.rate_bps)} • ${escapeHtml(t('rev_po_label', 'PO'))}: ${formatCents(c.po_amount_cents)}</p>
            </div>
            <span class="text-3xs text-slate-400 shrink-0 dark:text-slate-500">${relativeTimeAgo(c.created_at)}</span>
        </div>`).join('');
}

export function renderRecentTips(tips: TipEntry[]): void {
    const list = document.getElementById('recent-tips-list');
    if (!list) { return; }

    if (tips.length === 0) {
        list.innerHTML = `<div class="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">${escapeHtml(t('rev_no_tips', 'No tips recorded yet'))}</div>`;
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
                <p class="text-sm font-medium truncate">${escapeHtml(t('rev_donation_label', 'Donation'))} ${escapeHtml(tip.donation_reference)} — ${formatCents(tip.tip_amount_cents)}${pctLabel}</p>
                <p class="text-3xs text-slate-400 mt-0.5 dark:text-slate-500">${escapeHtml(t('rev_donor_label', 'Donor'))}: ${escapeHtml(tip.donor_id.substring(0, 8))}…</p>
            </div>
            <span class="text-3xs text-slate-400 shrink-0 dark:text-slate-500">${relativeTimeAgo(tip.created_at)}</span>
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
        if (tbody) { renderErrorWithRetry(tbody, loadDashboard, undefined, undefined, err); }
        const commList = document.getElementById('recent-commissions-list');
        if (commList) { renderErrorWithRetry(commList, loadDashboard, undefined, undefined, err); }
    }

    // Update timestamp
    if (timestampEl) {
        timestampEl.textContent = new Date().toLocaleTimeString();
    }
}

// ─── Initialization ─────────────────────────────────────────────────────────
// FIX-01: Removed duplicate sidebar toggle — nav.js handles this globally.

function initRevenueDashboard(): void {
    // TICK-W4-003 FIX: Guard all protected content behind auth check.
    if (!requireAuth()) { return; }
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
