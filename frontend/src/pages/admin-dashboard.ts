import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { admin, openData } from '../api';
import { getLocale, applyI18n } from '../utils/locale';
import { relativeTimeAgo } from '../utils/format';
import { renderErrorWithRetry } from '../utils/error-retry';
import { renderProgressive } from '../utils/progressive-render';
import { requireAuth } from '../utils/auth-guard';

/* ═══════════════════════════════════════════════════════════════════════════
   Admin Dashboard — Platform Command Center
   P0-003 FIX: Replaced all hardcoded HTML data with API-driven rendering.
   KPIs, projects table, and audit trail are now populated dynamically.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // BLOCKER-1 FIX: Guard all protected content behind auth check.
    if (!requireAuth()) { return; }

    initTimestamp();
    loadKPIs();
    loadProjects();
    loadAuditTrail();
});


// ─── Live Timestamp ─────────────────────────────────────────────────────────
function initTimestamp(): void {
    const el = document.getElementById('live-timestamp');
    if (!el) { return; }

    const update = (): void => {
        const now = new Date();
        // PLAT-AUD-005 FIX: Use centralized getLocale() instead of inline detection.
        el.textContent = now.toLocaleString(getLocale(), {
            weekday: 'short', month: 'short', day: 'numeric',
            year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };
    update();
    // M-002 FIX: Store interval ID and clear on page unload to prevent
    // ghost intervals from accumulating during SPA-like navigation.
    const intervalId = setInterval(update, 1000);
    window.addEventListener('beforeunload', () => clearInterval(intervalId));
}

// ─── Load KPIs from APIs ────────────────────────────────────────────────────
// P0-003 FIX: KPIs are now fetched from openData.getStats() and
// admin.getPendingVerifications(), replacing hardcoded values.
async function loadKPIs(): Promise<void> {
    try {
        // PLT-AUD-P001 FIX: Was Promise.all — one timeout killed both KPI sources.
        // Promise.allSettled ensures partial data renders even if one API fails.
        // Standard: Resilient Data Loading, Syria 2G tolerance.
        const [statsSettled, pendingSettled] = await Promise.allSettled([
            openData.getStats(),
            admin.getPendingVerifications({ limit: 1 }),
        ]);

        const stats = statsSettled.status === 'fulfilled'
            ? statsSettled.value.data as Record<string, number> | undefined
            : undefined;
        const pendingData = pendingSettled.status === 'fulfilled'
            ? pendingSettled.value.data as Record<string, unknown> | undefined
            : undefined;

        // Log individual failures without killing the dashboard
        if (statsSettled.status === 'rejected') {
            reportWarning('[AdminDashboard] Stats API failed', { error: String(statsSettled.reason) });
        }
        if (pendingSettled.status === 'rejected') {
            reportWarning('[AdminDashboard] Pending API failed', { error: String(pendingSettled.reason) });
        }

        if (stats) {
            animateKPI('kpi-total-funded', stats['total_funded'] ?? 0, '$');
            animateKPI('kpi-active-projects', stats['active_projects'] ?? 0);
            animateKPI('kpi-engineers', stats['registered_engineers'] ?? 0);

            /* GAP-ADM-005 FIX: KPI trend badge showed "—" forever.
               Now calculates from stats.trend_funded (percentage change).
               Falls back to "New" if trend data is unavailable.
               Standard: Nielsen #1 (Visibility of system status). */
            const trendEl = document.getElementById('kpi-impact-trend');
            if (trendEl) {
                const trendValue = stats['trend_funded'] as number | undefined;
                if (trendValue !== undefined && trendValue !== null) {
                    const sign = trendValue >= 0 ? '+' : '';
                    trendEl.textContent = `${sign}${trendValue.toFixed(1)}%`;
                } else {
                    trendEl.textContent = 'New';
                    trendEl.setAttribute('data-i18n', 'badge_new');
                }
            }

            // Update notification count badge with pending count
            const notifCount = document.getElementById('notif-count');
            if (notifCount) {
                const pending = (stats['kyc_pending'] as number | undefined) ?? 0;
                notifCount.textContent = String(pending);
                // P2-SST-002 FIX: CSS class toggle replaces inline style.display.
                notifCount.classList.toggle('nm-hidden', pending === 0);
            }
        }

        // Pending verifications count
        const pendingCount = (pendingData as { total?: number } | undefined)?.total ?? 0;
        animateKPI('kpi-pending', pendingCount);

        // Update escrow pending badge
        const escrowBadge = document.getElementById('escrow-pending-count');
        if (escrowBadge) {
            /* FRIC-ADM-002 FIX: Was hardcoded English "{count} Pending".
               Now uses i18n-safe numeric-only format. The word "Pending" is
               already in the parent context (card title).
               Standard: i18n Completeness, WCAG 3.1.1. */
            escrowBadge.textContent = `${pendingCount}`;
            escrowBadge.setAttribute('data-i18n-count', String(pendingCount));
        }

        /* FRIC-ADM-003 FIX: Sidebar badges (#sidebar-escrow-count, #sidebar-kyc-count)
           were showing "—" forever because loadKPIs() only updated the quick-action badge.
           Now both sidebar badges are in sync with API data.
           Standard: Nielsen #1 (System Status Visibility). */
        const sidebarEscrow = document.getElementById('sidebar-escrow-count');
        if (sidebarEscrow) {
            sidebarEscrow.textContent = pendingCount > 0 ? String(pendingCount) : '';
            sidebarEscrow.setAttribute('data-count', String(pendingCount));
        }

        // KYC count from stats API
        const kycPending = (stats?.['kyc_pending'] as number | undefined) ?? 0;
        const sidebarKyc = document.getElementById('sidebar-kyc-count');
        if (sidebarKyc) {
            sidebarKyc.textContent = kycPending > 0 ? String(kycPending) : '';
            sidebarKyc.setAttribute('data-count', String(kycPending));
        }
    } catch (err) {
        reportWarning('[AdminDashboard] KPI load failed', {
            component: 'admin-dashboard', action: 'load_kpis',
            error: err instanceof Error ? err.message : String(err),
        });
        // W9-002 FIX: Show em-dash on KPI failure — visible error signal.
        ['kpi-total-funded', 'kpi-active-projects', 'kpi-engineers', 'kpi-pending'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = '—'; }
        });
    }
}

// ─── Load Projects Table ────────────────────────────────────────────────────
// P0-003 FIX: Projects table is now populated from openData.getProjectListings()
async function loadProjects(): Promise<void> {
    const tbody = document.getElementById('projects-body');
    if (!tbody) { return; }

    try {
        const res = await openData.getProjectListings({ limit: 10 });
        const projects = (res.data ?? []) as unknown as Array<Record<string, string | number | null>>;

        const locale = getLocale();
        const currFmt = new Intl.NumberFormat(locale, {
            style: 'currency', currency: 'USD', minimumFractionDigits: 0,
        });

        // P1-UXA-002 FIX: Progressive rendering for admin projects table
        renderProgressive({
            items: projects,
            containerEl: tbody,
            pageSize: 20,
            renderItem: (p) => {
                const progress = Math.min(100, Math.max(0, Number(p['funding_progress'] ?? p['progress'] ?? 0)));
                const progressColor = progress >= 75 ? 'bg-smoky-jade' : progress >= 40 ? 'bg-trust-blue' : 'bg-warning-yellow';
                const textColor = progress >= 75 ? 'text-smoky-jade' : progress >= 40 ? 'text-trust-blue' : 'text-warning-yellow';
                const statusI18nKey = progress >= 100 ? 'status_fully_funded' : progress > 0 ? 'status_in_progress' : 'status_under_review';
                const statusLabel = progress >= 100 ? 'Fully Funded' : progress > 0 ? 'In Progress' : 'Under Review';
                const statusBg = progress >= 100
                    ? 'text-trust-blue bg-trust-blue/10'
                    : progress > 0
                        ? 'text-smoky-jade bg-smoky-jade/10'
                        : 'text-warning-yellow bg-warning-yellow/10';
                const costRaw = Number(p['total_estimated_cost'] ?? p['budget'] ?? 0);
                const cost = costRaw > 1000 ? currFmt.format(costRaw / 100) : currFmt.format(costRaw);
                const engineer = p['engineer_name'] ?? p['assigned_engineer'];

                return `
            <div class="p-4 hover:bg-slate-50/50 cursor-pointer transition-colors group project-card" data-project-id="${esc(String(p['ocds_id'] ?? p['project_id'] ?? ''))}">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-xs text-trust-blue font-bold">${esc(String(p['ocds_id'] ?? p['project_id'] ?? ''))}</span>
                            <span class="text-xs font-bold px-2 py-0.5 rounded-full ${statusBg}" data-i18n="${statusI18nKey}">${esc(statusLabel)}</span>
                        </div>
                        <h3 class="font-bold text-sm text-slate-900 mt-1 dark:text-slate-100">${esc(String(p['title'] ?? ''))}</h3>
                        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                            <p class="text-xs text-slate-600 dark:text-slate-400"><i class="ph ph-map-pin text-slate-400 me-1 dark:text-slate-500" aria-hidden="true"></i> ${esc(String(p['region'] ?? p['location'] ?? ''))}</p>
                            <p class="text-xs ${engineer ? 'text-slate-600' : 'text-slate-500 italic'}"><i class="ph ph-hard-hat text-slate-400 me-1 dark:text-slate-500" aria-hidden="true"></i> ${engineer ? esc(String(engineer)) : '<span data-i18n="admin_pending_assignment">— Pending</span>'}</p>
                            <p class="text-xs text-slate-600 font-bold dark:text-slate-400"><i class="ph ph-currency-dollar text-slate-400 me-1 dark:text-slate-500" aria-hidden="true"></i> ${cost}</p>
                        </div>
                    </div>
                    <div class="w-full md:w-32 shrink-0">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-3xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500" data-i18n="th_progress">Progress</span>
                            <span class="text-xs ${textColor} font-bold">${esc(String(progress))}%</span>
                        </div>
                        <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div class="${progressColor} h-full nm-progress-bar" style="--progress:${progress}%"></div></div>
                    </div>
                    <div class="hidden md:flex shrink-0">
                        <i class="ph ph-caret-left text-slate-300 group-hover:text-trust-blue transition-colors text-lg" aria-hidden="true"></i>
                    </div>
                </div>
            </div>`;
            },
            emptyState: () => `
            <div class="bg-white py-12 text-center w-full nm-table-empty dark:bg-dark-surface">
                <div class="size-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 text-slate-400 nm-empty-icon dark:bg-dark-elevated dark:text-slate-500">
                    <i class="ph ph-buildings nm-icon-32" aria-hidden="true"></i>
                </div>
                <p class="font-bold text-slate-700 text-sm mt-2 nm-empty-title dark:text-slate-300" data-i18n="admin_no_projects">No projects found</p>
            </div>`,
        });

        applyI18n();

        /* GAP-ADM-001 FIX: Project table rows had cursor-pointer but no click handler.
           Uses event delegation for performance — single listener on tbody.
           Navigates to project-details.html with the project ID.
           Standard: Nielsen #2 (Match real world), Fitts' Law. */
        initClickableRows(tbody);
    } catch (err) {
        reportWarning('[AdminDashboard] Projects load failed', {
            component: 'admin-dashboard', action: 'load_projects',
            error: err instanceof Error ? err.message : String(err),
        });
        renderErrorWithRetry(tbody, loadProjects, undefined, undefined, err);
    }
}

/* GAP-ADM-001 FIX: Project cards rely on event delegation on container.
   Reads the project OCDS ID from data-project-id and navigates to project-details.
   Standard: Nielsen #2 (Match between system and real world), Fitts' Law. */
function initClickableRows(tbody: HTMLElement): void {
    tbody.addEventListener('click', (e: MouseEvent) => {
        const card = (e.target as HTMLElement).closest('.project-card');
        if (!card) { return; }
        const projectId = card.getAttribute('data-project-id');
        if (projectId) {
            window.location.href = `project-details.html?id=${encodeURIComponent(projectId)}`;
        }
    });
}

// ─── Load Audit Trail ───────────────────────────────────────────────────────
// P0-003 FIX: Audit trail is now populated from admin.getPendingVerifications()
// which returns recent verification actions. Each entry renders with appropriate
// icon, description, and relative timestamp.
async function loadAuditTrail(): Promise<void> {
    const container = document.getElementById('audit-trail');
    if (!container) { return; }

    try {
        const res = await admin.getPendingVerifications({ limit: 5 });
        const items = (res.data as unknown as { items?: Array<Record<string, string | number | null>> })?.items
            ?? (Array.isArray(res.data) ? res.data as Array<Record<string, string | number | null>> : []);

        // P1-UXA-002 FIX: Progressive rendering for audit trail
        renderProgressive({
            items: items,
            containerEl: container,
            pageSize: 20,
            renderItem: (item) => {
                const actionType = String(item['action'] ?? item['type'] ?? 'verification');
                const { icon, iconBg, iconColor } = auditIcon(actionType);
                const description = String(item['description'] ?? item['title'] ?? item['action_description'] ?? 'Verification pending');
                const detail = String(item['detail'] ?? item['admin'] ?? '');
                const timestamp = item['created_at'] ?? item['timestamp'];

                return `
            <div class="px-5 py-3 flex items-center gap-4">
                <div class="size-8 rounded-full ${iconBg} flex items-center justify-center shrink-0">
                    <i class="ph ${icon} ${iconColor} text-sm" aria-hidden="true"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">${esc(description)}</p>
                    ${detail ? `<p class="text-3xs text-slate-400 mt-0.5 dark:text-slate-500">${esc(detail)}</p>` : ''}
                </div>
                <span class="text-3xs text-slate-400 shrink-0 dark:text-slate-500">${timestamp ? relativeTimeAgo(String(timestamp)) : '—'}</span>
            </div>`;
            },
            emptyState: () => `<div class="px-5 py-8 text-center text-slate-400 dark:text-slate-500">
                <i class="ph ph-note-blank text-2xl" aria-hidden="true"></i>
                <p class="mt-2 text-xs" data-i18n="admin_no_audit">No recent audit entries</p>
            </div>`,
        });

        applyI18n();
    } catch (err) {
        reportWarning('[AdminDashboard] Audit trail load failed', {
            component: 'admin-dashboard', action: 'load_audit',
            error: err instanceof Error ? err.message : String(err),
        });
        renderErrorWithRetry(container, loadAuditTrail, 'failed_to_load', 'Failed to load audit trail', err);
    }
}

// ─── Audit Icon Resolver ────────────────────────────────────────────────────
function auditIcon(action: string): { icon: string; iconBg: string; iconColor: string } {
    const map: Record<string, { icon: string; iconBg: string; iconColor: string }> = {
        'escrow_release': { icon: 'ph-check-circle', iconBg: 'bg-smoky-jade/10', iconColor: 'text-smoky-jade' },
        'release':        { icon: 'ph-check-circle', iconBg: 'bg-smoky-jade/10', iconColor: 'text-smoky-jade' },
        'epa_adjustment': { icon: 'ph-gavel',        iconBg: 'bg-trust-blue/10', iconColor: 'text-trust-blue' },
        'assignment':     { icon: 'ph-user-plus',    iconBg: 'bg-warm-earth/10', iconColor: 'text-warm-earth' },
        'discrepancy':    { icon: 'ph-flag',          iconBg: 'bg-rose-50',       iconColor: 'text-rose-500' },
        'flag':           { icon: 'ph-flag',          iconBg: 'bg-rose-50',       iconColor: 'text-rose-500' },
        'verification':   { icon: 'ph-eye',           iconBg: 'bg-trust-blue/10', iconColor: 'text-trust-blue' },
    };
    return map[action] ?? { icon: 'ph-clock', iconBg: 'bg-slate-100', iconColor: 'text-slate-500' };
}

// ─── KPI Animation ──────────────────────────────────────────────────────────
function animateKPI(id: string, value: number, prefix = ''): void {
    const el = document.getElementById(id);
    if (!el) { return; }

    // Update data-kpi for any external consumers
    el.setAttribute('data-kpi', String(value));

    const duration = 1200;
    const start = performance.now();
    const locale = getLocale();

    const tick = (now: number): void => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        if (prefix === '$') {
            const current = Math.round((value / 100) * eased);
            el.textContent = new Intl.NumberFormat(locale, {
                style: 'currency', currency: 'USD', minimumFractionDigits: 0,
            }).format(current);
        } else {
            const current = Math.round(value * eased);
            el.textContent = current.toLocaleString(locale);
        }
        if (progress < 1) { requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
}

// ─── Utilities (imported) ───────────────────────────────────────────────────
// PLAT-AUD-005 FIX: formatDate, applyI18n imported from utils/locale.
// relativeTimeAgo imported from utils/format.
// renderErrorWithRetry from utils/error-retry.
