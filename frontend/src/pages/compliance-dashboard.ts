import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { compliance } from '../api';
import { t } from '../utils/i18n';
import { formatCents } from '../utils/format';
import { getLocale } from '../utils/locale';
import { showToast } from '../utils/toast';
// TICK-033: Import shared type-safe i18n apply utility.
import { tryApplyI18n } from '../utils/i18n-apply';

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
    initTimestamp();
    loadKPIs();
    loadComplianceMetrics();
    loadEscrowReviewQueue();
});

/* ─── Live Timestamp ─── */
function initTimestamp(): void {
    const el = document.getElementById('live-timestamp');
    if (!el) { return; }

    const update = (): void => {
        const now = new Date();
        el.textContent = now.toLocaleString(getLocale(), {
            weekday: 'short', month: 'short', day: 'numeric',
            year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };
    update();
    // W9-001 FIX: Store interval ID and clear on page unload to prevent
    // ghost intervals from accumulating during SPA-like navigation.
    const intervalId = setInterval(update, 1000);
    window.addEventListener('beforeunload', () => clearInterval(intervalId));
}

/* ─── Load KPIs ─── */
async function loadKPIs(): Promise<void> {
    try {
        const res = await compliance.getDashboardStats();
        if (!res.data) { return; }
        const data = res.data as unknown as Record<string, number>;

        setKPI('total-audited', data['total_audited'] ?? 0, '$');
        setKPI('pending-reviews', data['pending_reviews'] ?? 0);
        setKPI('approved-releases', data['approved_releases'] ?? 0);
        setKPI('flagged-issues', data['flagged_issues'] ?? 0);

        // Badge count
        const reviewCount = document.getElementById('review-count');
        if (reviewCount) { reviewCount.textContent = String(data['pending_reviews'] ?? 0); }
    } catch (err) { reportWarning('[ComplianceDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // W8-001 FIX: Show user-facing error state on KPI cards.
        ['total-audited', 'pending-reviews', 'approved-releases', 'flagged-issues'].forEach(name => {
            const el = document.querySelector<HTMLElement>(`[data-kpi="${name}"]`);
            if (el) { el.textContent = '—'; }
        });
    }
}

/* ─── Load OCDS Compliance Metrics ─── */
async function loadComplianceMetrics(): Promise<void> {
    try {
        const res = await compliance.getMetrics();
        if (!res.data) { return; }
        const data = res.data as unknown as Record<string, number | string>;

        // OCDS compliance bar
        const ocdsBar = document.getElementById('ocds-bar');
        const ocdsPercent = document.getElementById('ocds-percent');
        const complianceRate = Number(data['ocds_compliance_rate'] ?? 0);
        if (ocdsBar) { ocdsBar.style.setProperty('--progress', `${complianceRate}%`); }
        if (ocdsPercent) { ocdsPercent.textContent = `${complianceRate}%`; }

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
            auditIntegrity.appendChild(document.createTextNode(esc(String(data['audit_integrity'] ?? t('compliance_intact', 'Intact')))));
        }

        // Spatial accuracy
        const spatialAccuracy = document.getElementById('spatial-accuracy');
        if (spatialAccuracy) {
            spatialAccuracy.textContent = `${data['spatial_accuracy'] ?? 0}%`;
        }
    } catch (err) { reportWarning('[ComplianceDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // W8-001 FIX: Show user-facing error state on OCDS metrics.
        const ocdsPercent = document.getElementById('ocds-percent');
        if (ocdsPercent) { ocdsPercent.textContent = '—'; }
    }
}

/* ─── Load Escrow Review Queue ─── */
async function loadEscrowReviewQueue(): Promise<void> {
    const tbody = document.getElementById('escrow-review-body');
    if (!tbody) { return; }

    try {
        const res = await compliance.getEscrowReviews();
        const reviews = (res.data ?? []) as unknown as Array<Record<string, string | number | boolean>>;

        if (reviews.length === 0) {
            tbody.innerHTML = `<tr class="border-t border-slate-100">
                <td colspan="7" class="px-5 py-8 text-center text-slate-400">
                    <i class="ph ph-check-circle text-2xl" aria-hidden="true"></i>
                    <p class="mt-2 text-xs">${esc(t('compliance_all_reviewed', 'All escrow releases reviewed'))}</p>
                </td>
            </tr>`;
            return;
        }

        tbody.innerHTML = reviews.map((r) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-5 py-3 font-mono text-xs">${esc(String(r['reference'] ?? ''))}</td>
                <td class="px-5 py-3 font-medium">${esc(String(r['project_title'] ?? ''))}</td>
                <td class="px-5 py-3 font-mono">${formatCents(Number(r['amount'] ?? 0))}</td>
                <td class="px-5 py-3 text-slate-500">${esc(String(r['donor_name'] ?? t('compliance_anonymous', 'Anonymous')))}</td>
                <td class="px-5 py-3">
                    ${r['has_spatial_proof']
                ? `<span class="text-3xs font-bold text-smoky-jade bg-smoky-jade/10 px-2 py-0.5 rounded-full">${esc(t('compliance_verified', 'Verified'))}</span>`
                : `<span class="text-3xs font-bold text-warning-yellow bg-warning-yellow/10 px-2 py-0.5 rounded-full">${esc(t('compliance_pending', 'Pending'))}</span>`}
                </td>
                <td class="px-5 py-3 text-slate-500 text-xs">${esc(String(r['submitted_at'] ?? '—'))}</td>
                <td class="px-5 py-3 flex gap-2">
                    <button type="button" class="text-xs font-semibold text-smoky-jade hover:underline" data-action="approve" data-ref="${esc(String(r['reference'] ?? ''))}">${esc(t('compliance_approve', 'Approve'))}</button>
                    <button type="button" class="text-xs font-semibold text-danger-red hover:underline" data-action="flag" data-ref="${esc(String(r['reference'] ?? ''))}">${esc(t('compliance_flag', 'Flag'))}</button>
                </td>
            </tr>
        `).join('');

        // TICK-034: Event delegation for review action buttons.
        // Previous: querySelectorAll('[data-action]').forEach() attached O(N) listeners.
        // Now: Single delegated listener on tbody — O(1).
        // W2-009 FIX: Added delegation guard — loadData() is called on DOMContentLoaded
        // AND could be called on refresh. Without the guard, each call stacks a new listener.
        if (!tbody.dataset.delegated) {
            tbody.dataset.delegated = '1';
            tbody.addEventListener('click', (e: MouseEvent) => {
                const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
                if (!btn) { return; }
                const action = btn.dataset['action'] as 'approve' | 'flag';
                const ref = btn.dataset['ref'] ?? '';
                if (action && ref) { handleReviewAction(action, ref); }
            });
        }

        tryApplyI18n();
    } catch (err) { reportWarning('[ComplianceDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // W8-001 FIX: Show user-facing error in escrow review table.
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-8 text-center text-sm text-red-400">${esc(t('failed_to_load', 'Failed to load'))}</td></tr>`;
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
    if (actionsInFlight.has(reference)) { return; }
    actionsInFlight.add(reference);

    // Visual feedback: disable the clicked button and show spinner
    const actionBtn = document.querySelector<HTMLButtonElement>(
        `[data-action="${action}"][data-ref="${reference}"]`
    );
    const originalHTML = actionBtn?.innerHTML ?? '';
    if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.innerHTML = `<i class="ph ph-spinner-gap animate-spin text-xs" aria-hidden="true"></i>`;
    }

    try {
        const res = action === 'approve'
            ? await compliance.approveReview(reference)
            : await compliance.flagReview(reference);

        if (res.success) {
            await loadEscrowReviewQueue();
            await loadKPIs();
        }
    } catch (err) { reportWarning('[ComplianceDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // W8-001 FIX: Show user-facing error toast for review action.
        showToast(t('compliance_action_failed', 'Action failed — please try again'), 'error');
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
    if (!el) { return; }

    const duration = 1200;
    const start = performance.now();
    const locale = getLocale();
    const tick = (now: number): void => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(value * eased);
        // LB-004 FIX: Use Intl.NumberFormat instead of hardcoded $ prefix
        el.textContent = prefix === '$'
            ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(current)
            : current.toLocaleString(locale);
        if (progress < 1) { requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
}

// TICK-033: Local applyI18n() removed — replaced by shared tryApplyI18n() import.
