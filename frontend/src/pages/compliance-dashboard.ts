import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { reportWarning } from '../error-reporter';
import { renderErrorWithRetry } from '../utils/error-retry';
import { escapeHtml as esc } from '../utils/xss';
import { compliance } from '../api';
import { t } from '../utils/i18n';
import { formatCents } from '../utils/format';
import { getLocale } from '../utils/locale';
import { showToast } from '../utils/toast';
// TICK-033: Import shared type-safe i18n apply utility.
import { tryApplyI18n } from '../utils/i18n-apply';
import { requireAuth } from '../utils/auth-guard';
import { addTrackedTimer } from '../utils/tracked-timers';

/* ═══════════════════════════════════════════════════════════════════════════
   Compliance Dashboard — OCDS Audit & Financial Transparency Engine
   PLT-RE-002 FIX: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id, CSRF) is handled by the canonical request()
   wrapper — including 30s AbortController timeout for Syria's network conditions.
   ═══════════════════════════════════════════════════════════════════════════ */

// TICKET-001 FIX: In-flight guard prevents double-submit on review actions.
// Keyed by reference ID — blocks duplicate clicks while API call is pending.
const actionsInFlight = new Set<string>();

document.addEventListener('DOMContentLoaded', () => {
  // BLOCKER-1 FIX: Guard all protected content behind auth check.
  if (!requireAuth()) {
    return;
  }

  initTimestamp();
  loadKPIs();
  loadComplianceMetrics();
  loadEscrowReviewQueue();
});

/* ─── Live Timestamp ─── */
function initTimestamp(): void {
  const el = document.getElementById('live-timestamp');
  if (!el) {
    return;
  }

  const update = (): void => {
    const now = new Date();
    el.textContent = now.toLocaleString(getLocale(), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };
  update();
  // W9-001 FIX: Store interval ID and clear on page unload to prevent
  // ghost intervals from accumulating during SPA-like navigation.
  const intervalId = addTrackedTimer(setInterval(update, 1000));
  window.addEventListener('pagehide', () => clearInterval(intervalId));
}

/* ─── Load KPIs ─── */
async function loadKPIs(): Promise<void> {
  try {
    const res = await compliance.getDashboardStats();
    if (!res.data) {
      return;
    }
    const data = res.data as unknown as Record<string, number>;

    setKPI('total-audited', data['total_audited'] ?? 0, '$');
    setKPI('pending-reviews', data['pending_reviews'] ?? 0);
    setKPI('approved-releases', data['approved_releases'] ?? 0);
    setKPI('flagged-issues', data['flagged_issues'] ?? 0);

    // Badge count
    const reviewCount = document.getElementById('review-count');
    if (reviewCount) {
      reviewCount.textContent = String(data['pending_reviews'] ?? 0);
    }
  } catch (err) {
    reportWarning('[ComplianceDashboard] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // W8-001 FIX: Show user-facing error state on KPI cards.
    ['total-audited', 'pending-reviews', 'approved-releases', 'flagged-issues'].forEach((name) => {
      const el = document.querySelector<HTMLElement>(`[data-kpi="${name}"]`);
      if (el) {
        el.textContent = '—';
      }
    });
  }
}

/* ─── Load OCDS Compliance Metrics ─── */
async function loadComplianceMetrics(): Promise<void> {
  try {
    const res = await compliance.getMetrics();
    if (!res.data) {
      return;
    }
    const data = res.data as unknown as Record<string, number | string>;

    // OCDS compliance bar
    const ocdsBar = document.getElementById('ocds-bar');
    const ocdsPercent = document.getElementById('ocds-percent');
    const complianceRate = Number(data['ocds_compliance_rate'] ?? 0);
    if (ocdsBar) {
      ocdsBar.style.setProperty('--progress', `${complianceRate}%`);
    }
    if (ocdsPercent) {
      ocdsPercent.textContent = `${complianceRate}%`;
    }

    // Audit trail integrity
    const auditIntegrity = document.getElementById('audit-integrity');
    if (auditIntegrity) {
      // W2-001 FIX: Previous: innerHTML = String(data[...]) — XSS from API response.
      // Now: Safe textContent set with icon added via DOM API, not string interpolation.
      auditIntegrity.textContent = '';
      const icon = document.createElement('i');
      icon.className = 'ph ph-check-circle nm-icon-gap-end text-smoky-jade';
      icon.setAttribute('aria-hidden', 'true');
      auditIntegrity.appendChild(icon);
      auditIntegrity.appendChild(
        document.createTextNode(
          esc(String(data['audit_integrity'] ?? t('compliance_intact', 'سليم'))),
        ),
      );
    }

    // Spatial accuracy
    const spatialAccuracy = document.getElementById('spatial-accuracy');
    if (spatialAccuracy) {
      spatialAccuracy.textContent = `${data['spatial_accuracy'] ?? 0}%`;
    }
  } catch (err) {
    reportWarning('[ComplianceDashboard] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // W8-001 FIX: Show user-facing error state on OCDS metrics.
    const ocdsPercent = document.getElementById('ocds-percent');
    if (ocdsPercent) {
      ocdsPercent.textContent = '—';
    }
  }
}

/* ─── Load Escrow Review Queue ─── */
async function loadEscrowReviewQueue(): Promise<void> {
  const tbody = document.getElementById('escrow-review-body');
  if (!tbody) {
    return;
  }

  try {
    const res = await compliance.getEscrowReviews();
    const reviews = (res.data ?? []) as unknown as Array<Record<string, string | number | boolean>>;

    if (reviews.length === 0) {
      tbody.innerHTML = `
            <div class="bg-white py-12 text-center w-full nm-table-empty dark:bg-dark-surface">
                <div class="size-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-smoky-jade mb-4 nm-empty-icon dark:bg-dark-elevated dark:text-emerald-400">
                    <i class="ph ph-check-circle nm-icon-32" aria-hidden="true"></i>
                </div>
                <p class="font-bold text-slate-700 text-sm mt-2 nm-empty-title dark:text-slate-300">${esc(t('compliance_all_reviewed', 'تمت مراجعة الكل'))}</p>
            </div>`;
      return;
    }

    tbody.innerHTML = reviews
      .map(
        (r) => `
            <div class="p-4 hover:bg-slate-50 transition-colors group border-t border-slate-100 project-card dark:border-dark-border">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-xs text-trust-blue font-bold">${esc(String(r['reference'] ?? ''))}</span>
                            ${
                              r['has_spatial_proof']
                                ? `<span class="text-3xs font-bold text-smoky-jade bg-smoky-jade/10 px-2 py-0.5 rounded-full dark:text-emerald-400">${esc(t('compliance_verified', 'تم التحقق'))}</span>`
                                : `<span class="text-3xs font-bold text-warm-earth bg-warm-earth/10 px-2 py-0.5 rounded-full">${esc(t('compliance_pending', 'معلّق'))}</span>`
                            }
                        </div>
                        <h3 class="font-bold text-sm text-slate-900 mt-1 dark:text-slate-100">${esc(String(r['project_title'] ?? ''))}</h3>
                        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                            <p class="text-xs text-slate-600 font-bold dark:text-slate-400"><i class="ph ph-currency-dollar text-slate-400 me-1 dark:text-slate-500" aria-hidden="true"></i> ${formatCents(Number(r['amount'] ?? 0))}</p>
                            <p class="text-xs text-slate-600 dark:text-slate-400"><i class="ph ph-hand-heart text-slate-400 me-1 dark:text-slate-500" aria-hidden="true"></i> ${esc(String(r['user_name'] ?? t('compliance_anonymous', 'مجهول')))}</p>
                            <p class="text-xs text-slate-500 dark:text-slate-400"><i class="ph ph-clock text-slate-400 me-1 dark:text-slate-500" aria-hidden="true"></i> ${esc(String(r['submitted_at'] ?? '—'))}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <button type="button" class="bg-smoky-jade/10 text-smoky-jade px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-smoky-jade/20 transition-colors flex items-center gap-1 dark:text-emerald-400" data-action="approve" data-ref="${esc(String(r['reference'] ?? ''))}">
                            <i class="ph ph-check" aria-hidden="true"></i> ${esc(t('compliance_approve', 'اعتماد'))}
                        </button>
                        <button type="button" class="bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-colors flex items-center gap-1" data-action="flag" data-ref="${esc(String(r['reference'] ?? ''))}">
                            <i class="ph ph-flag" aria-hidden="true"></i> ${esc(t('compliance_flag', 'إبلاغ'))}
                        </button>
                    </div>
                </div>
            </div>
        `,
      )
      .join('');

    // TICK-034: Event delegation for review action buttons.
    // Previous: querySelectorAll('[data-action]').forEach() attached O(N) listeners.
    // Now: Single delegated listener on tbody — O(1).
    // W2-009 FIX: Added delegation guard — loadData() is called on DOMContentLoaded
    // AND could be called on refresh. Without the guard, each call stacks a new listener.
    if (!tbody.dataset.delegated) {
      tbody.dataset.delegated = '1';
      tbody.addEventListener('click', (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (!btn) {
          return;
        }
        const action = btn.dataset['action'] as 'approve' | 'flag';
        const ref = btn.dataset['ref'] ?? '';
        if (action && ref) {
          handleReviewAction(action, ref);
        }
      });
    }

    tryApplyI18n();
  } catch (err) {
    reportWarning('[ComplianceDashboard] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // W8-001 FIX: Show user-facing error in escrow review table.
    if (tbody) {
      renderErrorWithRetry(tbody, loadEscrowReviewQueue, undefined, undefined, err);
    }
  }
}

/* ─── Review Action Handler ─── */
// TICKET-001 FIX: Double-submit guard + visual feedback on review action buttons.
// Previous: No guard — rapid clicks or network retry could fire duplicate POST
// requests, corrupting escrow audit state.
// Standard: Nielsen #5 (Error Prevention), Idempotent State Mutations.
async function handleReviewAction(action: 'approve' | 'flag', reference: string): Promise<void> {
  // Guard: skip if this reference is already being processed
  if (actionsInFlight.has(reference)) {
    return;
  }
  actionsInFlight.add(reference);

  // Visual feedback: disable the clicked button and show spinner
  const actionBtn = document.querySelector<HTMLButtonElement>(
    `[data-action="${action}"][data-ref="${reference}"]`,
  );
  const originalHTML = actionBtn?.innerHTML ?? '';
  if (actionBtn) {
    actionBtn.disabled = true;
    actionBtn.innerHTML = `<i class="ph ph-spinner-gap animate-spin text-xs" aria-hidden="true"></i>`;
  }

  try {
    const res =
      action === 'approve'
        ? await compliance.approveReview(reference)
        : await compliance.flagReview(reference);

    if (res.success) {
      await loadEscrowReviewQueue();
      await loadKPIs();
    }
  } catch (err) {
    reportWarning('[ComplianceDashboard] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // W8-001 FIX: Show user-facing error toast for review action.
    showToast(t('compliance_action_failed', 'فشل الإجراء'), 'error');
    // Restore button on error (success path reloads the entire table)
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.innerHTML = originalHTML;
    }
  } finally {
    actionsInFlight.delete(reference);
  }
}

/* ─── Utilities ─── */
function setKPI(name: string, value: number, prefix = ''): void {
  const el = document.querySelector<HTMLElement>(`[data-kpi="${name}"]`);
  if (!el) {
    return;
  }

  const duration = 1200;
  const start = performance.now();
  const locale = getLocale();
  const tick = (now: number): void => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(value * eased);
    // LB-004 FIX: Use Intl.NumberFormat instead of hardcoded $ prefix
    el.textContent =
      prefix === '$'
        ? new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
          }).format(current)
        : current.toLocaleString(locale);
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

// TICK-033: Local applyI18n() removed — replaced by shared tryApplyI18n() import.
