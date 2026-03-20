import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { admin, openData } from '../api';
import { getLocale, applyI18n } from '../utils/locale';
import { relativeTimeAgo } from '../utils/format';
import { renderTableErrorWithRetry, renderErrorWithRetry } from '../utils/error-retry';

/* ═══════════════════════════════════════════════════════════════════════════
   Admin Dashboard — Platform Command Center
   P0-003 FIX: Replaced all hardcoded HTML data with API-driven rendering.
   KPIs, projects table, and audit trail are now populated dynamically.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTimestamp();
    initNotificationBell();
    loadKPIs();
    loadProjects();
    loadAuditTrail();
});

/* GAP-ADM-003 FIX: Notification bell scroll handler.
   Bell button has data-scroll-target="section-audit-trail".
   Clicks smooth-scroll to the target element.
   Standard: Nielsen #4 (Consistency). */
function initNotificationBell(): void {
    const bell = document.getElementById('notification-bell');
    if (!bell) { return; }
    bell.addEventListener('click', () => {
        const targetId = bell.getAttribute('data-scroll-target');
        if (!targetId) { return; }
        const target = document.getElementById(targetId);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

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
        const [statsRes, pendingRes] = await Promise.all([
            openData.getStats(),
            admin.getPendingVerifications({ limit: 1 }),
        ]);

        const stats = statsRes.data as Record<string, number> | undefined;
        const pendingData = pendingRes.data as Record<string, unknown> | undefined;

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

        if (projects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-buildings text-2xl"  aria-hidden="true"></i>
                <p class="mt-2 text-xs" data-i18n="admin_no_projects">No projects found</p>
            </td></tr>`;
            applyI18n();
            return;
        }

        const locale = getLocale();
        const currFmt = new Intl.NumberFormat(locale, {
            style: 'currency', currency: 'USD', minimumFractionDigits: 0,
        });

        tbody.innerHTML = projects.map((p) => {
            const progress = Math.min(100, Math.max(0, Number(p['funding_progress'] ?? p['progress'] ?? 0)));
            const progressColor = progress >= 75 ? 'bg-smoky-jade' : progress >= 40 ? 'bg-trust-blue' : 'bg-warning-yellow';
            const textColor = progress >= 75 ? 'text-smoky-jade' : progress >= 40 ? 'text-trust-blue' : 'text-warning-yellow';
            /* FRIC-ADM-002 FIX: Status labels were hardcoded English ("Fully Funded", "In Progress", etc.).
               Now uses data-i18n attributes so the i18n engine can translate them.
               Standard: i18n Completeness, WCAG 3.1.1. */
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
            <tr class="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors">
                <td class="px-5 py-3 font-mono text-xs text-trust-blue font-bold">${esc(String(p['ocds_id'] ?? p['project_id'] ?? ''))}</td>
                <td class="px-5 py-3 font-medium">${esc(String(p['title'] ?? ''))}</td>
                <td class="px-5 py-3 text-slate-500">${esc(String(p['region'] ?? p['location'] ?? ''))}</td>
                <td class="px-5 py-3 ${engineer ? 'text-slate-600' : 'text-slate-500 italic'}">${engineer ? esc(String(engineer)) : '<span data-i18n="admin_pending_assignment">— Pending</span>'}</td>
                <td class="px-5 py-3 font-bold">${cost}</td>
                <td class="px-5 py-3">
                    <div class="flex items-center gap-2">
                        <div class="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden"><div class="${progressColor} h-full nm-progress-bar" style="--progress:${progress}%"></div></div>
                        <span class="text-xs ${textColor} font-bold">${progress}%</span>
                    </div>
                </td>
                <td class="px-5 py-3"><span class="text-xs font-bold px-2 py-0.5 rounded-full ${statusBg}" data-i18n="${statusI18nKey}">${esc(statusLabel)}</span></td>
            </tr>`;
        }).join('');

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
        renderTableErrorWithRetry(tbody, loadProjects, 7);
    }
}

/* GAP-ADM-001 FIX: Project table rows had cursor-pointer but no click handler.
   Uses event delegation on tbody for O(1) listener count regardless of row count.
   Reads the project OCDS ID from the first <td> and navigates to project-details.
   Standard: Nielsen #2 (Match between system and real world), Fitts' Law. */
function initClickableRows(tbody: HTMLElement): void {
    tbody.addEventListener('click', (e: MouseEvent) => {
        const row = (e.target as HTMLElement).closest('tr');
        if (!row) { return; }
        const firstTd = row.querySelector('td');
        if (!firstTd) { return; }
        const projectId = firstTd.textContent?.trim();
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

        if (items.length === 0) {
            container.innerHTML = `<div class="px-5 py-8 text-center text-slate-400">
                <i class="ph ph-note-blank text-2xl"  aria-hidden="true"></i>
                <p class="mt-2 text-xs" data-i18n="admin_no_audit">No recent audit entries</p>
            </div>`;
            applyI18n();
            return;
        }

        container.innerHTML = items.map((item) => {
            const actionType = String(item['action'] ?? item['type'] ?? 'verification');
            const { icon, iconBg, iconColor } = auditIcon(actionType);
            const description = String(item['description'] ?? item['title'] ?? item['action_description'] ?? 'Verification pending');
            const detail = String(item['detail'] ?? item['admin'] ?? '');
            const timestamp = item['created_at'] ?? item['timestamp'];

            return `
            <div class="px-5 py-3 flex items-center gap-4">
                <div class="size-8 rounded-full ${iconBg} flex items-center justify-center shrink-0">
                    <i class="ph ${icon} ${iconColor} text-sm"  aria-hidden="true"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">${esc(description)}</p>
                    ${detail ? `<p class="text-3xs text-slate-400 mt-0.5">${esc(detail)}</p>` : ''}
                </div>
                <span class="text-3xs text-slate-400 shrink-0">${timestamp ? relativeTimeAgo(String(timestamp)) : '—'}</span>
            </div>`;
        }).join('');

        applyI18n();
    } catch (err) {
        reportWarning('[AdminDashboard] Audit trail load failed', {
            component: 'admin-dashboard', action: 'load_audit',
            error: err instanceof Error ? err.message : String(err),
        });
        renderErrorWithRetry(container, loadAuditTrail, 'failed_to_load', 'Failed to load audit trail');
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
// renderTableErrorWithRetry, renderErrorWithRetry from utils/error-retry.
