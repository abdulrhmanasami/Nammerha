/**
 * admin-fintech.ts — FinTech & Enterprise Admin Dashboard Controller
 *
 * Loads escrow fee summary, fee configs, and enterprise organizations.
 * Per profitability study Phase 3: FinTech & TaaS.
 */
import '../styles/main.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FeeConfig {
    config_id: string;
    fee_name: string;
    fee_rate_bps: number;
    min_fee_cents: number;
    max_fee_cents: number | null;
    applies_to: string;
    is_active: boolean;
}

interface FeeSummary {
    total_fees_count: number;
    total_fee_revenue: number;
    mtd_fee_revenue: number;
    average_fee_cents: number;
    average_fee_rate_bps: number;
}

interface EnterpriseOrg {
    org_id: string;
    org_name: string;
    org_type: string;
    contact_email: string;
    tier: string;
    is_active: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function centsToUsd(cents: number): string {
    return `$${(cents / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function bpsToPercent(bps: number): string {
    return `${(bps / 100).toFixed(2)}%`;
}

function getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('authToken');
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? ''}`,
    };
}

/** Resolve an i18n key via the platform's NammerhaI18n engine, fallback to English */
function t(key: string, fallback: string): string {
    const w = window as unknown as { NammerhaI18n?: { t: (k: string) => string | undefined } };
    return w.NammerhaI18n?.t(key) ?? fallback;
}

async function fetchJson<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(url, { headers: getAuthHeaders() });
        const body = await res.json() as { success: boolean; data: T };
        return body.success ? body.data : null;
    } catch {
        return null;
    }
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadFeeSummary(): Promise<void> {
    const summary = await fetchJson<FeeSummary>('/api/enterprise/admin/fees/summary');
    if (!summary) {
        return;
    }

    const totalEl = document.getElementById('kpi-escrow-fees');
    const mtdEl = document.getElementById('kpi-mtd-fees');

    if (totalEl) {
        totalEl.textContent = centsToUsd(summary.total_fee_revenue);
    }
    if (mtdEl) {
        mtdEl.textContent = centsToUsd(summary.mtd_fee_revenue);
    }
}

async function loadFeeConfigs(): Promise<void> {
    const configs = await fetchJson<FeeConfig[]>('/api/enterprise/admin/fees/config');
    const body = document.getElementById('fee-config-body');
    if (!body || !configs) {
        return;
    }

    if (configs.length === 0) {
        body.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-300">${t('fintech_no_configs', 'No fee configurations')}</td></tr>`;
        return;
    }

    body.innerHTML = configs.map(c => `
        <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
            <td class="py-3 px-4 font-medium">${c.fee_name}</td>
            <td class="py-3 px-4">
                <span class="inline-flex items-center bg-smoky-jade/10 text-smoky-jade text-xs font-bold px-2 py-0.5 rounded-full">
                    ${bpsToPercent(c.fee_rate_bps)}
                </span>
            </td>
            <td class="py-3 px-4 text-slate-600">${centsToUsd(c.min_fee_cents)}</td>
            <td class="py-3 px-4 text-slate-600">${c.max_fee_cents ? centsToUsd(c.max_fee_cents) : '—'}</td>
            <td class="py-3 px-4">
                <span class="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded-full">${c.applies_to}</span>
            </td>
            <td class="py-3 px-4">
                <span class="inline-flex items-center gap-1 text-xs font-semibold ${c.is_active ? 'text-smoky-jade' : 'text-slate-400'}">
                    <span class="w-2 h-2 rounded-full ${c.is_active ? 'bg-smoky-jade' : 'bg-slate-300'}"></span>
                    ${c.is_active ? t('fintech_active', 'Active') : t('fintech_inactive', 'Inactive')}
                </span>
            </td>
        </tr>
    `).join('');
}

async function loadOrganizations(): Promise<void> {
    const orgs = await fetchJson<EnterpriseOrg[]>('/api/enterprise/admin/organizations');
    const body = document.getElementById('orgs-body');
    const countEl = document.getElementById('kpi-enterprise-orgs');
    if (!body || !orgs) {
        return;
    }

    if (countEl) {
        countEl.textContent = String(orgs.filter(o => o.is_active).length);
    }

    if (orgs.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-300">${t('fintech_no_orgs', 'No organizations yet')}</td></tr>`;
        return;
    }

    body.innerHTML = orgs.map(o => `
        <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
            <td class="py-3 px-4 font-medium">${o.org_name}</td>
            <td class="py-3 px-4">
                <span class="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded-full">${o.org_type}</span>
            </td>
            <td class="py-3 px-4">
                <span class="text-xs font-bold uppercase ${
                    o.tier === 'enterprise' ? 'text-trust-blue' :
                    o.tier === 'pro' ? 'text-smoky-jade' : 'text-slate-500'
                }">${o.tier}</span>
            </td>
            <td class="py-3 px-4 text-slate-500 text-xs">${o.contact_email}</td>
            <td class="py-3 px-4">
                <span class="inline-flex items-center gap-1 text-xs font-semibold ${o.is_active ? 'text-smoky-jade' : 'text-slate-400'}">
                    <span class="w-2 h-2 rounded-full ${o.is_active ? 'bg-smoky-jade' : 'bg-slate-300'}"></span>
                    ${o.is_active ? t('fintech_active', 'Active') : t('fintech_inactive', 'Inactive')}
                </span>
            </td>
        </tr>
    `).join('');
}

// ─── Initialization ─────────────────────────────────────────────────────────

function initFintech(): void {
    // Load data in parallel
    loadFeeSummary();
    loadFeeConfigs();
    loadOrganizations();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFintech);
} else {
    initFintech();
}
