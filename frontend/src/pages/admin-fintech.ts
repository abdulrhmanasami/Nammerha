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
import { renderErrorWithRetry } from '../utils/error-retry';
import { renderProgressive } from '../utils/progressive-render';
// TICK-W4-001 FIX: Auth guard — was the only admin page without it.
import { requireAuth } from '../utils/auth-guard';

// ─── Helpers ────────────────────────────────────────────────────────────────

function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadFeeSummary(): Promise<void> {
  try {
    const res = await enterpriseAdmin.getFeeSummary();
    if (!res.success || !res.data) {
      return;
    }
    const summary: EscrowFeeSummary = res.data;

    const totalEl = document.getElementById('kpi-escrow-fees');
    const mtdEl = document.getElementById('kpi-mtd-fees');

    if (totalEl) {
      totalEl.textContent = formatCents(summary.total_fee_revenue);
    }
    if (mtdEl) {
      mtdEl.textContent = formatCents(summary.mtd_fee_revenue);
    }
  } catch (err) {
    reportError(err instanceof Error ? err : new Error('[fintech] Fee summary load failed'), {
      component: 'admin-fintech',
      action: 'load_fee_summary',
    });
    // W5-001 FIX: Show user-facing error state on KPI cards.
    const totalEl = document.getElementById('kpi-escrow-fees');
    const mtdEl = document.getElementById('kpi-mtd-fees');
    if (totalEl) {
      totalEl.textContent = '—';
    }
    if (mtdEl) {
      mtdEl.textContent = '—';
    }
  }
}

async function loadFeeConfigs(): Promise<void> {
  const body = document.getElementById('fee-config-body');
  if (!body) {
    return;
  }

  try {
    const res = await enterpriseAdmin.getFeeConfigs();
    if (!res.success || !res.data) {
      return;
    }
    const configs: FeeConfig[] = Array.isArray(res.data) ? res.data : [];

    // P1-UXA-002 FIX: Progressive rendering for fee configs
    renderProgressive({
      items: configs,
      containerEl: body,
      pageSize: 20,
      renderItem: (c) => `
            <div class="p-4 hover:bg-slate-50/50 transition-colors group">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${escapeHtml(c.fee_name)}</h3>
                            <span class="inline-flex items-center gap-1 text-3xs font-semibold ${c.is_active ? 'text-smoky-jade' : 'text-slate-400'}">
                                <span class="w-2 h-2 rounded-full ${c.is_active ? 'bg-smoky-jade' : 'bg-slate-300'}"></span>
                                ${c.is_active ? escapeHtml(t('fintech_active', 'نشط')) : escapeHtml(t('fintech_inactive', 'غير نشط'))}
                            </span>
                        </div>
                        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                            <p class="text-xs text-slate-600 dark:text-slate-400"><span class="text-slate-400 me-1 uppercase text-3xs font-bold tracking-wider dark:text-slate-500" data-i18n="fintech_fee_rate">Rate</span> <span class="bg-smoky-jade/10 text-smoky-jade text-xs font-bold px-2 py-0.5 rounded-full dark:text-emerald-400">${bpsToPercent(c.fee_rate_bps)}</span></p>
                            <p class="text-xs text-slate-600 dark:text-slate-400"><span class="text-slate-400 me-1 uppercase text-3xs font-bold tracking-wider dark:text-slate-500">Min</span> <span class="font-mono text-emerald-600">${formatCents(c.min_fee_cents)}</span></p>
                            <p class="text-xs text-slate-600 dark:text-slate-400"><span class="text-slate-400 me-1 uppercase text-3xs font-bold tracking-wider dark:text-slate-500">Max</span> <span class="font-mono text-emerald-600">${c.max_fee_cents ? formatCents(c.max_fee_cents) : '—'}</span></p>
                            <p class="text-xs text-slate-600 dark:text-slate-400"><span class="text-slate-400 me-1 uppercase text-3xs font-bold tracking-wider dark:text-slate-500">Applies To</span> <span class="capitalize bg-slate-100 px-2 py-0.5 rounded-full">${escapeHtml(c.applies_to)}</span></p>
                        </div>
                    </div>
                </div>
            </div>`,
      emptyState: () => `
            <div class="bg-white py-12 text-center w-full nm-table-empty dark:bg-dark-surface">
                <div class="size-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 text-slate-400 nm-empty-icon dark:bg-dark-elevated dark:text-slate-500">
                    <i class="ph ph-gear nm-icon-32" aria-hidden="true"></i>
                </div>
                <p class="font-bold text-slate-700 text-sm mt-2 nm-empty-title dark:text-slate-300">${escapeHtml(t('fintech_no_configs', 'لا توجد تهيئات'))}</p>
            </div>`,
    });
  } catch (err) {
    reportError(err instanceof Error ? err : new Error('[fintech] Fee configs load failed'), {
      component: 'admin-fintech',
      action: 'load_fee_configs',
    });
    // W5-001 FIX: Show error-retry UI in fee configs table.
    if (body) {
      renderErrorWithRetry(body, () => loadFeeConfigs(), undefined, undefined, err);
    }
  }
}

async function loadOrganizations(): Promise<void> {
  const body = document.getElementById('orgs-body');
  const countEl = document.getElementById('kpi-enterprise-orgs');
  if (!body) {
    return;
  }

  try {
    const res = await enterpriseAdmin.getOrganizations();
    if (!res.success || !res.data) {
      return;
    }
    const orgs: EnterpriseOrg[] = Array.isArray(res.data) ? res.data : [];

    if (countEl) {
      countEl.textContent = String(orgs.filter((o) => o.is_active).length);
    }

    // P1-UXA-002 FIX: Progressive rendering for organizations
    renderProgressive({
      items: orgs,
      containerEl: body,
      pageSize: 20,
      renderItem: (o) => `
            <div class="p-4 hover:bg-slate-50/50 transition-colors group">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex items-center gap-3">
                        <div class="size-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 dark:bg-dark-elevated dark:border-dark-border">
                            <i class="ph ph-buildings text-slate-400 text-lg dark:text-slate-500" aria-hidden="true"></i>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${escapeHtml(o.org_name)}</h3>
                                <span class="inline-flex items-center gap-1 text-3xs font-semibold ${o.is_active ? 'text-smoky-jade' : 'text-slate-400'}">
                                    <span class="w-2 h-2 rounded-full ${o.is_active ? 'bg-smoky-jade' : 'bg-slate-300'}"></span>
                                </span>
                            </div>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="capitalize text-3xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full dark:text-slate-400">${escapeHtml(o.org_type)}</span>
                                <span class="text-3xs font-bold uppercase ${
                                  o.tier === 'enterprise'
                                    ? 'text-trust-blue'
                                    : o.tier === 'pro'
                                      ? 'text-smoky-jade'
                                      : 'text-slate-500'
                                }">${escapeHtml(o.tier)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="text-end">
                        <p class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(o.contact_email)}</p>
                    </div>
                </div>
            </div>`,
      emptyState: () => `
            <div class="bg-white py-12 text-center w-full nm-table-empty dark:bg-dark-surface">
                <div class="size-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 text-slate-400 nm-empty-icon dark:bg-dark-elevated dark:text-slate-500">
                    <i class="ph ph-buildings nm-icon-32" aria-hidden="true"></i>
                </div>
                <p class="font-bold text-slate-700 text-sm mt-2 nm-empty-title dark:text-slate-300">${escapeHtml(t('fintech_no_orgs', 'لا توجد منظمات'))}</p>
            </div>`,
    });
  } catch (err) {
    reportError(err instanceof Error ? err : new Error('[fintech] Organizations load failed'), {
      component: 'admin-fintech',
      action: 'load_organizations',
    });
    // W5-001 FIX: Show error-retry UI in organizations table.
    if (body) {
      renderErrorWithRetry(body, () => loadOrganizations(), undefined, undefined, err);
    }
  }
}

// ─── Initialization ─────────────────────────────────────────────────────────

function initFintech(): void {
  // TICK-W4-001 FIX: Guard all protected content behind auth check.
  if (!requireAuth()) {
    return;
  }
  loadFeeSummary();
  loadFeeConfigs();
  loadOrganizations();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFintech);
} else {
  initFintech();
}
