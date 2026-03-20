/**
 * admin-fintech.ts — FinTech & Enterprise Admin Dashboard Controller
 *
 * Loads escrow fee summary, fee configs, and enterprise organizations.
 * Per profitability study Phase 3: FinTech & TaaS.
 *
 * BONUS-02: Migrated from broken raw fetch() + localStorage.getItem('authToken')
 * to centralized API client (httpOnly cookies, CSRF, 30s timeout, error reporting).
 * Deleted: duplicate centsToUsd(), bpsToPercent(), t(), fetchJson(), getAuthHeaders().
 * Added:  centralized imports, escapeHtml() on dynamic content.
 */
import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { enterpriseAdmin } from '../api';
import type { FeeConfig, EnterpriseOrg, EscrowFeeSummary } from '../api';
import { reportError } from '../error-reporter';
import { escapeHtml } from '../utils/xss';
import { formatCents } from '../utils/format';
import { t } from '../utils/i18n';
// W5-001 FIX: Import shared error-retry utility for user-facing error states.
import { renderTableErrorWithRetry } from '../utils/error-retry';

// ─── Helpers ────────────────────────────────────────────────────────────────

function bpsToPercent(bps: number): string {
    return `${(bps / 100).toFixed(2)}%`;
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadFeeSummary(): Promise<void> {
    try {
        const res = await enterpriseAdmin.getFeeSummary();
        if (!res.success || !res.data) { return; }
        const summary: EscrowFeeSummary = res.data;

        const totalEl = document.getElementById('kpi-escrow-fees');
        const mtdEl = document.getElementById('kpi-mtd-fees');

        if (totalEl) { totalEl.textContent = formatCents(summary.total_fee_revenue); }
        if (mtdEl) { mtdEl.textContent = formatCents(summary.mtd_fee_revenue); }
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[fintech] Fee summary load failed'), {
            component: 'admin-fintech', action: 'load_fee_summary',
        });
        // W5-001 FIX: Show user-facing error state on KPI cards.
        const totalEl = document.getElementById('kpi-escrow-fees');
        const mtdEl = document.getElementById('kpi-mtd-fees');
        if (totalEl) { totalEl.textContent = '—'; }
        if (mtdEl) { mtdEl.textContent = '—'; }
    }
}

async function loadFeeConfigs(): Promise<void> {
    const body = document.getElementById('fee-config-body');
    if (!body) { return; }

    try {
        const res = await enterpriseAdmin.getFeeConfigs();
        if (!res.success || !res.data) { return; }
        const configs: FeeConfig[] = Array.isArray(res.data) ? res.data : [];

        if (configs.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-300">${t('fintech_no_configs', 'No fee configurations')}</td></tr>`;
            return;
        }

        body.innerHTML = configs.map(c => `
            <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td class="py-3 px-4 font-medium">${escapeHtml(c.fee_name)}</td>
                <td class="py-3 px-4">
                    <span class="inline-flex items-center bg-smoky-jade/10 text-smoky-jade text-xs font-bold px-2 py-0.5 rounded-full">
                        ${bpsToPercent(c.fee_rate_bps)}
                    </span>
                </td>
                <td class="py-3 px-4 text-slate-600">${formatCents(c.min_fee_cents)}</td>
                <td class="py-3 px-4 text-slate-600">${c.max_fee_cents ? formatCents(c.max_fee_cents) : '—'}</td>
                <td class="py-3 px-4">
                    <span class="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded-full">${escapeHtml(c.applies_to)}</span>
                </td>
                <td class="py-3 px-4">
                    <span class="inline-flex items-center gap-1 text-xs font-semibold ${c.is_active ? 'text-smoky-jade' : 'text-slate-400'}">
                        <span class="w-2 h-2 rounded-full ${c.is_active ? 'bg-smoky-jade' : 'bg-slate-300'}"></span>
                        ${c.is_active ? t('fintech_active', 'Active') : t('fintech_inactive', 'Inactive')}
                    </span>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[fintech] Fee configs load failed'), {
            component: 'admin-fintech', action: 'load_fee_configs',
        });
        // W5-001 FIX: Show error-retry UI in fee configs table.
        if (body) { renderTableErrorWithRetry(body, () => loadFeeConfigs(), 6); }
    }
}

async function loadOrganizations(): Promise<void> {
    const body = document.getElementById('orgs-body');
    const countEl = document.getElementById('kpi-enterprise-orgs');
    if (!body) { return; }

    try {
        const res = await enterpriseAdmin.getOrganizations();
        if (!res.success || !res.data) { return; }
        const orgs: EnterpriseOrg[] = Array.isArray(res.data) ? res.data : [];

        if (countEl) {
            countEl.textContent = String(orgs.filter(o => o.is_active).length);
        }

        if (orgs.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-300">${t('fintech_no_orgs', 'No organizations yet')}</td></tr>`;
            return;
        }

        body.innerHTML = orgs.map(o => `
            <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td class="py-3 px-4 font-medium">${escapeHtml(o.org_name)}</td>
                <td class="py-3 px-4">
                    <span class="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded-full">${escapeHtml(o.org_type)}</span>
                </td>
                <td class="py-3 px-4">
                    <span class="text-xs font-bold uppercase ${
                        o.tier === 'enterprise' ? 'text-trust-blue' :
                        o.tier === 'pro' ? 'text-smoky-jade' : 'text-slate-500'
                    }">${escapeHtml(o.tier)}</span>
                </td>
                <td class="py-3 px-4 text-slate-500 text-xs">${escapeHtml(o.contact_email)}</td>
                <td class="py-3 px-4">
                    <span class="inline-flex items-center gap-1 text-xs font-semibold ${o.is_active ? 'text-smoky-jade' : 'text-slate-400'}">
                        <span class="w-2 h-2 rounded-full ${o.is_active ? 'bg-smoky-jade' : 'bg-slate-300'}"></span>
                        ${o.is_active ? t('fintech_active', 'Active') : t('fintech_inactive', 'Inactive')}
                    </span>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[fintech] Organizations load failed'), {
            component: 'admin-fintech', action: 'load_organizations',
        });
        // W5-001 FIX: Show error-retry UI in organizations table.
        if (body) { renderTableErrorWithRetry(body, () => loadOrganizations(), 5); }
    }
}

// ─── Initialization ─────────────────────────────────────────────────────────

function initFintech(): void {
    loadFeeSummary();
    loadFeeConfigs();
    loadOrganizations();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFintech);
} else {
    initFintech();
}
