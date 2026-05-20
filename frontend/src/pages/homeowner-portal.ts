import '../styles/main.css';
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { renderErrorWithRetry } from '../utils/error-retry';
import { clearAuth } from '../auth';
import { requireAuth } from '../utils/auth-guard';
import { auth as authApi } from '../api';
import { statusColor, statusLabel, tradeColor, urgencyColor } from '../utils/status-colors';
import { homeowner } from '../api';
import { formatCents, relativeTimeAgo } from '../utils/format';
import { t } from '../utils/i18n';
// CRIT-001 + HIGH-001/002/003/004 FIX: Import shared utilities
import { confirmAction } from '../utils/confirm-action';
import { setLoadingState } from '../utils/loading-state';
// MED-008 FIX: Haptic feedback for native-feel mobile interactions.
// Gracefully degrades to no-op on unsupported devices.
import { haptic } from '../utils/haptic';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
initPullToRefresh();
initBackToTop();
autoTriggerTour();
import { setText } from '../utils/dom';
import { animateKPI } from '../utils/kpi-animation';
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';
// P3-003 FIX: Skeleton timeout guard
import { guardSkeleton } from '../utils/skeleton-guard';
// P0-UX-004 FIX: Auto-save form drafts to prevent data loss on network failure.
import { saveDraft, loadDraft, clearDraft, hasDraft } from '../utils/form-draft';
// P1-UX-003 FIX: Service Worker registration on all portal pages
import { bootstrapPortal } from '../utils/portal-bootstrap';
// P0-UXA-004 FIX: Cross-portal navigation via shared context switcher
import { mountContextSwitcher } from '../components/portal-context';
// P2-UX-004 FIX: Standardized empty state component
import { renderEmptyState } from '../utils/empty-state';
// W5-004 FIX: SWR cache for perceived-instant tab switching
import { swrFetch } from '../utils/swr-cache';
// P2-UXA-002 FIX: Live KPI timestamp — auto-updates "Updated just now" with relative time
import { markKPIFetched, showStaleIndicator } from '../utils/live-kpi-timestamp';
// P2-UXA-004 + P3-UXA-003 FIX: Tab scroll position + last active tab preservation
import { saveScrollPosition, restoreScrollPosition, saveLastTab } from '../utils/tab-state';
// P1-UXA-002 FIX: Progressive rendering — prevents DOM jank with 1000+ records
import { renderProgressive } from '../utils/progressive-render';
// P2-ANIM-001 FIX: Centralized animation stagger constant
import { staggerDelay } from '../constants/animation';
// B7 FIX: Breadcrumb navigation on portal pages for spatial orientation.
// PREVIOUS: Wallet and Profile had breadcrumbs, but portals didn't.
// Users arriving via deep links had no spatial context.
// Standard: WCAG 2.4.8 (Location), Nielsen #7 (Recognition).
import { initBreadcrumb } from '../utils/breadcrumb';

// FIX-005: Banner Pattern Consolidation.
// Previous: Custom showSrBanner() manually created DOM elements, managed timeouts,
// and applied inline CSS classes — the third different error feedback pattern
// on the platform (alongside showStructuredBanner and showToast).
// Now: Uses shared showToast() which already handles positioning, auto-dismiss,
// animation, dark mode, haptic feedback, and screen reader announcements.
// Standard: DRY Principle, Design System Component Unity.
import { showToast } from '../utils/toast';
function showSrBanner(type: 'error' | 'success', message: string): void {
  showToast(message, type);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Homeowner Portal — Dashboard, Projects, Service Requests, Approvals, Escrow
   PLT-FE-001 FIX: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id, CSRF) is handled by the canonical request()
   wrapper — including 30s AbortController timeout for Syria's network conditions.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Types (local rendering shapes) ─────────────────────────────────────────
interface Project {
  project_id: string;
  title: string;
  damage_type: string;
  status: string;
  region: string | null;
  engineer_name: string | null;
  contractor_name: string | null;
  bid_count: number;
  total_boq_cost: number;
  created_at: string;
}

interface Approval {
  approval_id: string;
  project_id: string;
  project_title: string;
  title: string;
  description: string | null;
  engineer_name: string;
  status: string;
  created_at: string;
}

interface EscrowData {
  total_deposited: number;
  total_released: number;
  held_in_escrow: number;
  projects_with_escrow: number;
}

type TabName = 'dashboard' | 'projects' | 'requests' | 'approvals' | 'payments';

// PLT-FE-003 FIX: Module-level constant
const ALL_TABS: TabName[] = ['dashboard', 'projects', 'requests', 'approvals', 'payments'];

// P0-001 FIX (Wave 2): Event delegation guards — prevents exponential listener stacking.
// PREVIOUS: querySelectorAll('.cancel-sr-btn').forEach attached individual listeners on EVERY render.
// Each tab switch added N duplicate listeners. On 10 tab switches, cancel/approve buttons had 10×
// listeners — causing N API calls per single click. CRITICAL for escrow fund integrity.
// NOW: Single delegated listener on the container, wired once. Matches canonical pattern from
// contractor-portal (PLT-AUD-E001), tradesperson-portal, and supplier-dashboard.
// Standard: Event Delegation Pattern, Memory Management, FinTech Zero-Trust.
const delegationWired = { requests: false, approvals: false } as Record<string, boolean>;

// P1-003 FIX: Hash-based tab routing — bookmarkable, deep-linkable
const hashRouter = createHashRouter(ALL_TABS, 'dashboard');

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // BLOCKER-1 FIX: Guard all protected content behind auth check.
  if (!requireAuth()) {
    return;
  }
  bootstrapPortal();
  mountContextSwitcher();
  // B7 FIX: Breadcrumb on homeowner portal
  initBreadcrumb();

  setupTabs();
  setupServiceRequestForm();
  setupToggleDetails(); // CONF-N04 FIX
  const initialTab = hashRouter.getInitialTab();
  switchTab(initialTab);
  hashRouter.onHashChange(switchTab);

  // P3-003 FIX: Guard skeleton loaders with timeout fallback
  guardSkeleton({
    container: 'main-content',
    onRetry: () => switchTab(hashRouter.getInitialTab()),
  });

  // P1-MOB-003 FIX: Swipe gestures for native-app tab navigation
  initSwipeTabs({
    containerSelector: '.dashboard-main',
    tabs: ALL_TABS as unknown as readonly string[],
    onSwitch: switchTab as (tab: string) => void,
    getCurrentTab: () => hashRouter.getInitialTab(),
  });

  // ─── Secure Logout ──────────────────────────────────────────────────
  document.getElementById('portal-logout-btn')?.addEventListener('click', async () => {
    try {
      await authApi.logout();
    } catch {
      /* best-effort */
    }
    clearAuth(true); // P2-W5-002: skipServerLogout — authApi.logout() already called above
    window.location.href = '/auth.html';
  });
});

// ─── CONF-N04 FIX: Toggle Details via addEventListener ──────────────────────
// Previous: inline onclick in HTML — violated CSP script-src 'self'.
// FRC-N06 FIX: After toggling, re-applies i18n to translate new data-i18n spans.
// Standard: CSP Level 2 §4.1, OWASP XSS Prevention Cheat Sheet.
function setupToggleDetails(): void {
  const btn = document.getElementById('sr-toggle-details');
  const wrap = document.getElementById('sr-details-wrap');
  if (!btn || !wrap) {
    return;
  }

  // MED-006 FIX: Preserve the '(4 optional fields)' badge on collapse.
  // Previous: innerHTML replacement destroyed the badge after first toggle cycle.
  // Now: Stores original HTML and restores it on collapse.
  // Standard: Progressive Disclosure Context Preservation.
  const originalBtnHTML = btn.innerHTML;
  let isExpanded = false;

  btn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    // MED-008 FIX: Light haptic on toggle — item selection feedback.
    haptic.light();
    if (isExpanded) {
      wrap.classList.remove('nm-hidden');
      btn.innerHTML =
        '<i class="ph ph-minus-circle" aria-hidden="true"></i> <span data-i18n="ho_fewer_details">Fewer Details</span>';
    } else {
      wrap.classList.add('nm-hidden');
      btn.innerHTML = originalBtnHTML;
    }
    // FRC-N06 FIX: Re-translate the newly injected data-i18n spans
    // so Arabic users don't see English fallback text after toggling.
    import('../utils/locale')
      .then((m) => m.applyI18n())
      .catch(() => {
        /* non-critical */
      });
  });
}

// ─── Tab Navigation ─────────────────────────────────────────────────────────
function setupTabs(): void {
  for (const tab of ALL_TABS) {
    const el = document.getElementById(`tab-${tab}`);
    if (!el) {
      continue;
    }
    el.addEventListener('click', (e) => {
      e.preventDefault();
      // MED-008 FIX: Light haptic on tab switch — item selection.
      haptic.light();
      switchTab(tab);
    });
  }
}

function switchTab(tab: TabName): void {
  // P2-UXA-004 FIX: Save scroll position of the outgoing tab
  const currentHash = hashRouter.getInitialTab();
  if (currentHash !== tab) {
    saveScrollPosition(currentHash);
  }
  // P3-UXA-003 FIX: Persist last active tab for cross-session memory
  saveLastTab(tab);
  // P1-003 FIX: Sync tab to URL hash
  hashRouter.setActiveTab(tab);
  // P2-001 FIX: Renamed loop variable from `t` to `tabId` to prevent
  // shadowing the imported i18n `t()` function (line 9).
  for (const tabId of ALL_TABS) {
    const el = document.getElementById(`tab-${tabId}`);
    if (!el) {
      continue;
    }
    // CRIT-001 FIX: Use design system tokens (bg-trust-blue/10 text-trust-blue).
    // Previous: raw Tailwind bg-blue-600/10 text-blue-700 — broke token governance.
    // Also restores w-full text-start dropped during prior migration — fixes RTL layout.
    // Standard: Design System Token Governance, Nielsen #4 (Consistency).
    el.className =
      tabId === tab
        ? 'flex items-center gap-3 px-3 py-2 bg-trust-blue/10 text-trust-blue rounded-lg cursor-pointer w-full text-start'
        : 'flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer w-full text-start';

    // WCAG: Update aria-selected for screen reader parity
    el.setAttribute('aria-selected', String(tabId === tab));

    // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
    const section = document.getElementById(`section-${tabId}`);
    if (section) {
      section.classList.toggle('nm-hidden', tabId !== tab);
      // P1-UX-006 FIX: Move focus to newly visible section.
      // Previous: Focus stayed on tab button — screen reader users stranded.
      // Standard: WCAG 2.4.3 (Focus Order).
      if (tabId === tab) {
        // UX-REM-I010 FIX: Focus management after tab switch.
        // PREVIOUS: tabindex="-1" was set but never removed. This made
        // the section itself focusable via JS but trapped Tab key users
        // — pressing Tab skipped to the NEXT section, not the first
        // interactive element inside this section.
        // NOW: Set tabindex, focus, then remove it after a microtask so
        // subsequent Tab presses navigate into the section's content.
        // Standard: WCAG 2.4.3 (Focus Order), WAI-ARIA 1.2 (Managing Focus).
        section.setAttribute('tabindex', '-1');
        section.focus({ preventScroll: true });
        // Remove tabindex after focus so Tab continues into children
        requestAnimationFrame(() => section.removeAttribute('tabindex'));
      }
    }
  }

  // UX-REM-I001 FIX: Apply SWR to tab loaders for perceived-instant switching.
  // PREVIOUS: Every tab switch triggered a fresh API call → spinner on every switch.
  // NOW: swrFetch returns stale data instantly, revalidates in background.
  // Dashboard tab excluded — it uses animateKPI which needs fresh data.
  if (tab === 'dashboard') {
    loadStats();
    loadDashboardProjects();
  }
  if (tab === 'projects') {
    void swrFetch('ho-projects', loadProjects, { maxAge: 30_000 });
  }
  if (tab === 'requests') {
    void swrFetch('ho-requests', loadServiceRequests, { maxAge: 30_000 });
  }
  if (tab === 'approvals') {
    loadApprovals();
  }
  if (tab === 'payments') {
    loadEscrow();
  }

  // P2-UXA-004 FIX: Restore scroll position for the incoming tab
  restoreScrollPosition(tab);
}

// ─── KPIs ───────────────────────────────────────────────────────────────────
async function loadStats(): Promise<void> {
  try {
    // W5-004 FIX: SWR cache — homeowner-portal was the only portal without it.
    // P2-UXA-007 FIX: Visual stale indicator while revalidating.
    const res = await swrFetch('ho-stats', () => homeowner.getStats(), {
      maxAge: 120_000, // 2 minutes
      onStaleData: () => {
        showStaleIndicator();
      },
    });
    if (!res.data) {
      return;
    }
    const s = res.data;

    // F-019 FIX: Animated KPI count-up (parity with engineer portal).
    animateKPI('kpi-active', s.active_projects);
    // P2-AUD-KPI-001 FIX: Use total_bids_received (was duplicating pending_approvals)
    animateKPI('kpi-bids', s.total_bids_received);
    animateKPI('kpi-approvals', s.pending_approvals);
    // P2-AUD-KPI-001 FIX: Backend field is total_invested, not total_funded
    animateKPI('kpi-escrow', s.total_invested, { prefix: '$', isCents: true });
    setText('approval-count', String(s.pending_approvals));
    // UX-REM-J006 FIX: Notification bell wired to ACTUAL notification count.
    // PREVIOUS: `notif-count` was synced to `s.pending_approvals` — conflating
    // approvals with notifications. 5 unread notifs + 0 pending approvals = badge shows 0.
    // NOW: Lazy-import notification-panel's refreshBadge (already polls /notifications/unread-count).
    // The badge is managed by notification-panel.ts via its own polling loop.
    // We no longer touch #notif-count here — notification-panel.ts owns it.
    // Standard: Nielsen #1 (Visibility of System Status), SRP (Single Responsibility).

    // P2-UXA-002 FIX: Live KPI timestamp — auto-updates with relative time
    markKPIFetched();
  } catch (err) {
    reportWarning('[HomeownerPortal] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // W10-001 FIX: Show em-dash on KPI failure — visible error signal.
    ['kpi-active', 'kpi-bids', 'kpi-approvals', 'kpi-escrow'].forEach((id) => setText(id, '—'));
  }
}

// ─── Dashboard — Active Projects ────────────────────────────────────────────
async function loadDashboardProjects(): Promise<void> {
  const container = document.getElementById('active-projects-list');
  if (!container) {
    return;
  }

  try {
    const res = await homeowner.getProjects();
    const allProjects = (res.data ?? []) as unknown as Project[];
    const projects = allProjects.filter((p) => !['completed', 'cancelled'].includes(p.status));

    // P1-UXA-002 FIX: Progressive rendering for dashboard active projects
    renderProgressive({
      items: projects,
      containerEl: container,
      pageSize: 20,
      renderItem: (p, i) => `
            <a href="/project-details.html?project=${encodeURIComponent(p.project_id)}" class="block p-5 hover:bg-slate-50/50 transition-colors animate-fade-in-up no-underline text-inherit cursor-pointer group" style="animation-delay:${staggerDelay(i)}">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-medium group-hover:text-trust-blue transition-colors">${esc(p.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${statusColor(p.status)}">${esc(statusLabel(p.status))}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-3 mt-2 text-3xs text-slate-400 dark:text-slate-500">
                            <span><i class="ph ph-tag" aria-hidden="true"></i> ${esc(p.damage_type)}</span>
                            ${p.engineer_name ? `<span><i class="ph ph-hard-hat" aria-hidden="true"></i> ${esc(p.engineer_name)}</span>` : ''}
                            ${p.contractor_name ? `<span><i class="ph ph-crane" aria-hidden="true"></i> ${esc(p.contractor_name)}</span>` : ''}
                            ${p.bid_count > 0 ? `<span class="text-trust-blue font-bold"><i class="ph ph-file-text" aria-hidden="true"></i> ${esc(String(p.bid_count))} ${esc(t('ho_bids', 'العروض'))}</span>` : ''}
                        </div>
                        ${p.total_boq_cost > 0 ? `<p class="text-xs text-slate-500 mt-1 dark:text-slate-400">${esc(t('ho_boq_total', 'إجمالي الكميات'))}: <span class="font-mono font-bold">${formatCents(p.total_boq_cost)}</span></p>` : ''}
                    </div>
                    <i class="ph ph-caret-right text-slate-300 group-hover:text-trust-blue nm-dir-shift shrink-0 dark:text-slate-600" aria-hidden="true"></i>
                </div>
            </a>`,
      // P1-002 FIX: Added actionable CTA button to empty state.
      // Previous: "Report damage to get started" was plain text — no interaction path.
      // New homeowners had to independently discover the report form, causing drop-off.
      // Standard: Nielsen #3 (User Control), Onboarding Funnel Completion.
      emptyState: () =>
        renderEmptyState({
          icon: 'house',
          title: t('ho_no_active_projects', 'لا توجد مشاريع نشطة'),
          subtitle: t('ho_report_to_start', 'أبلغ عن ضرر للبدء'),
          ctaLabel: t('ho_report_damage_cta', 'الإبلاغ عن أضرار'),
          ctaHref: '/homeowner-report.html',
          ctaI18nKey: 'ho_report_damage_cta',
        }),
    });
  } catch (err) {
    reportWarning('[HomeownerPortal] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    renderErrorWithRetry(container, loadDashboardProjects, undefined, undefined, err);
  }

  // B8 FIX: Persistent "Report Damage" CTA on dashboard.
  // PREVIOUS: Empty state had a CTA, but once a project existed it disappeared.
  // Users had to discover homeowner-report.html independently.
  // NOW: Always-visible action button anchored below the projects list.
  // Standard: Nielsen #7 (Flexibility), Primary Action Visibility.
  if (!document.getElementById('ho-report-cta')) {
    const cta = document.createElement('a');
    cta.id = 'ho-report-cta';
    cta.href = '/homeowner-report.html';
    cta.className =
      'flex items-center justify-center gap-2 mt-4 py-3 px-5 rounded-xl bg-trust-blue text-white font-bold text-sm shadow-md hover:bg-trust-blue/90 transition-colors no-underline animate-fade-in-up';
    cta.innerHTML = `<i class="ph ph-plus-circle" aria-hidden="true"></i> <span data-i18n="ho_report_damage_cta">Report New Damage</span>`;
    container.parentElement?.appendChild(cta);
  }
}

// ─── All Projects ───────────────────────────────────────────────────────────
async function loadProjects(): Promise<void> {
  const tbody = document.getElementById('projects-body');
  if (!tbody) {
    return;
  }

  try {
    const res = await homeowner.getProjects();
    const projects = (res.data ?? []) as unknown as Project[];

    // P1-UXA-002 FIX: Progressive rendering for homeowner projects
    renderProgressive({
      items: projects,
      containerEl: tbody,
      pageSize: 20,
      renderItem: (p, i) => `
            <a href="/project-details.html?project=${encodeURIComponent(p.project_id)}" class="block bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative transition-all tracking-tight no-underline text-inherit cursor-pointer group hover:shadow-md hover:border-trust-blue/30 dark:bg-dark-surface dark:border-dark-border dark:hover:border-trust-blue/40 animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h3 class="font-bold text-sm text-slate-900 group-hover:text-trust-blue transition-colors dark:text-slate-100">${esc(p.title)}</h3>
                        <p class="text-3xs text-slate-400 font-mono mt-0.5 dark:text-slate-500">${esc(p.project_id.substring(0, 8))}…</p>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${statusColor(p.status)}">${esc(statusLabel(p.status))}</span>
                </div>
                
                <div class="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4 flex flex-wrap gap-x-4 gap-y-2 mt-3 dark:text-slate-400 dark:bg-dark-elevated dark:border-dark-border">
                    <div class="flex items-center gap-1.5">
                        <i class="ph ph-tag text-slate-400 dark:text-slate-500" aria-hidden="true"></i>
                        <span>${esc(p.damage_type)}</span>
                    </div>
                    <div class="flex items-center gap-1.5 overflow-hidden">
                        <i class="ph ph-hard-hat text-slate-400 shrink-0 dark:text-slate-500" aria-hidden="true"></i>
                        <span class="truncate">${esc(p.engineer_name ?? '—')}</span>
                    </div>
                    <div class="flex items-center gap-1.5 overflow-hidden">
                        <i class="ph ph-crane text-slate-400 shrink-0 dark:text-slate-500" aria-hidden="true"></i>
                        <span class="truncate">${esc(p.contractor_name ?? '—')}</span>
                    </div>
                </div>

                <div class="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-dark-border">
                    <div class="flex items-center gap-2">
                        <span class="text-3xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500" data-i18n="ho_bids">Bids</span>
                        <span class="text-trust-blue font-bold text-xs">${esc(String(p.bid_count))}</span>
                    </div>
                    <i class="ph ph-arrow-right text-slate-300 group-hover:text-trust-blue nm-dir-shift dark:text-slate-600" aria-hidden="true"></i>
                </div>
            </a>`,
      // UX-REM-I009 FIX: Consistent empty state component.
      // PREVIOUS: Inline HTML diverged from renderEmptyState() styling.
      // Standard: DRY, Visual Consistency (Design System Component Unity).
      emptyState: () =>
        renderEmptyState({
          icon: 'house-line',
          title: t('ho_no_projects_yet', 'لا توجد مشاريع بعد'),
        }),
    });
  } catch (err) {
    reportWarning('[HomeownerPortal] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    renderErrorWithRetry(tbody, loadProjects, undefined, undefined, err);
  }
}

// ─── Service Request Form ───────────────────────────────────────────────────
// CRIT-003 FIX: Added trade validation — was submittable with trade_needed: "".
// HIGH-003 FIX: Uses setLoadingState for production-quality spinner feedback.
// MED-001 FIX: All button resets use bg-trust-blue design token (was bg-blue-600).
// P0-UX-004 FIX: Auto-save drafts to sessionStorage to prevent data loss.
// Standard: Nielsen #5 (Error Prevention), Nielsen #1 (System Status Visibility).
const SR_DRAFT_KEY = 'sr_form';

function setupServiceRequestForm(): void {
  const btn = document.getElementById('submit-sr-btn');
  if (!btn) {
    return;
  }

  const tradeEl = document.getElementById('sr-trade') as HTMLSelectElement | null;
  const titleEl = document.getElementById('sr-title') as HTMLInputElement | null;
  const descEl = document.getElementById('sr-description') as HTMLTextAreaElement | null;
  const addressEl = document.getElementById('sr-address') as HTMLInputElement | null;
  const budgetEl = document.getElementById('sr-budget') as HTMLInputElement | null;
  const urgencyEl = document.getElementById('sr-urgency') as HTMLSelectElement | null;

  // ── P0-UX-004: Restore draft on page load ───────────────────────────────
  if (hasDraft(SR_DRAFT_KEY)) {
    const draft = loadDraft<Record<string, string>>(SR_DRAFT_KEY);
    if (draft) {
      if (tradeEl && draft.trade) {
        tradeEl.value = draft.trade;
      }
      if (titleEl && draft.title) {
        titleEl.value = draft.title;
      }
      if (descEl && draft.desc) {
        descEl.value = draft.desc;
      }
      if (addressEl && draft.address) {
        addressEl.value = draft.address;
      }
      if (budgetEl && draft.budget) {
        budgetEl.value = draft.budget;
      }
      if (urgencyEl && draft.urgency) {
        urgencyEl.value = draft.urgency;
      }
      // Show restore notification
      showSrBanner('success', t('ho_draft_restored', '✓ تم استعادة المسودة السابقة'));
    }
  }

  // ── P0-UX-004: Auto-save on input events (debounced 500ms) ──────────────
  function autoSaveDraft(): void {
    saveDraft(SR_DRAFT_KEY, {
      trade: tradeEl?.value ?? '',
      title: titleEl?.value ?? '',
      desc: descEl?.value ?? '',
      address: addressEl?.value ?? '',
      budget: budgetEl?.value ?? '',
      urgency: urgencyEl?.value ?? '',
    });
  }

  [tradeEl, titleEl, descEl, addressEl, budgetEl, urgencyEl].forEach((el) => {
    el?.addEventListener('input', autoSaveDraft);
    el?.addEventListener('change', autoSaveDraft);
  });

  btn.addEventListener('click', async () => {
    const trade = tradeEl?.value;
    const title = titleEl?.value;
    const desc = descEl?.value;
    const address = addressEl?.value;
    const budget = budgetEl?.value;
    const urgency = urgencyEl?.value;

    // P1-UXA-001 FIX: Holistic form validation — show ALL errors at once.
    // Previous: Sequential validation (trade → return → title → return).
    // User fixes one error, submits, gets another. Frustrating 'whack-a-mole' UX.
    // Standard: Nielsen #5 (Error Prevention), NNGroup form validation best practices.
    const errors: string[] = [];
    if (!trade) {
      errors.push(t('ho_sr_trade_required', 'اختيار المهنة مطلوب'));
    }
    if (!title) {
      errors.push(t('ho_sr_title_required', 'العنوان مطلوب'));
    }
    // P2-WEB-004 FIX: Budget field accepts negative/non-numeric values.
    // Previous: `parseInt(budget, 10) * 100` without min/max guard — could send
    // negative cents or NaN to the API.
    // Standard: OWASP Input Validation, FinTech UX (Financial Input Guards).
    if (budget) {
      const budgetNum = parseInt(budget, 10);
      if (isNaN(budgetNum) || budgetNum <= 0) {
        errors.push(t('ho_sr_budget_invalid', 'يجب أن تكون الميزانية رقماً موجباً'));
      } else if (budgetNum > 10_000_000) {
        errors.push(t('ho_sr_budget_too_high', 'الميزانية تتجاوز الحد الأقصى المسموح'));
      }
    }
    if (errors.length > 0) {
      showSrBanner('error', errors.join(' • '));
      return;
    }

    // HIGH-003 FIX: Use shared loading state utility (spinner + disabled + aria-busy).
    const b = btn as HTMLButtonElement;
    const restore = setLoadingState(b, t('ho_submitting', 'جاري الإرسال…'));

    try {
      const res = await homeowner.createServiceRequest({
        trade_needed: trade!,
        title: title!,
        description: desc || undefined,
        address_text: address || undefined,
        urgency: (urgency || 'routine') as 'routine' | 'urgent' | 'emergency',
        budget_max: budget ? parseInt(budget, 10) * 100 : undefined,
      });

      if (!res.success) {
        throw new Error(res.error ?? t('ho_failed', 'فشلت العملية'));
      }

      // Show success state via utility — auto-restores after 600ms
      restore('success');

      // P0-UX-004: Clear draft on successful submit
      clearDraft(SR_DRAFT_KEY);

      // Reset form fields
      if (tradeEl) {
        tradeEl.selectedIndex = 0;
      }
      if (titleEl) {
        titleEl.value = '';
      }
      if (descEl) {
        descEl.value = '';
      }
      if (addressEl) {
        addressEl.value = '';
      }
      if (budgetEl) {
        budgetEl.value = '';
      }

      loadServiceRequests();
      loadStats();
    } catch (err) {
      // Show error state — draft is PRESERVED for retry
      restore('error');
      showSrBanner('error', err instanceof Error ? err.message : t('ho_failed', 'فشلت العملية'));
    }
  });
}

// ─── Service Requests List ──────────────────────────────────────────────────
async function loadServiceRequests(): Promise<void> {
  const tbody = document.getElementById('requests-body');
  if (!tbody) {
    return;
  }

  try {
    const res = await homeowner.getServiceRequests();
    const requests = res.data ?? [];

    // P1-UXA-002 FIX: Progressive rendering for service requests
    renderProgressive({
      items: requests,
      containerEl: tbody,
      pageSize: 20,
      renderItem: (r, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative transition-all dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" data-sr-card="${esc(r.request_id)}" style="animation-delay:${staggerDelay(i)}">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${esc(r.title)}</h3>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${statusColor(r.status)}">${esc(statusLabel(r.status))}</span>
                </div>
                
                <div class="flex flex-wrap gap-2 mt-3 mb-4">
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase border border-slate-200 ${tradeColor(r.trade_needed)} dark:border-dark-border">${esc(r.trade_needed)}</span>
                    <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase border border-slate-200 ${urgencyColor(r.urgency)} dark:border-dark-border">${esc(r.urgency)}</span>
                </div>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-dark-border">
                    <div>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500" data-i18n="ho_matched_to">Matched To</p>
                        <p class="text-xs font-medium text-slate-700 dark:text-slate-300">${esc(r.tradesperson_name ?? '—')}</p>
                        ${
                          r.status === 'matched' && r.tradesperson_name
                            ? `
                            <div class="flex items-center gap-3 mt-2">
                                <span class="inline-flex items-center gap-1 text-3xs font-bold text-trust-blue hover:underline cursor-pointer">
                                    <i class="ph ph-user" aria-hidden="true"></i>
                                    ${esc(t('ho_view_tradesperson', 'عرض الملف الشخصي'))}
                                </span>
                                <span class="text-3xs text-slate-300 dark:text-slate-600">•</span>
                                <span class="inline-flex items-center gap-1 text-3xs font-bold text-smoky-jade">
                                    <i class="ph ph-check-circle" aria-hidden="true"></i>
                                    ${esc(t('ho_matched_status', 'تمت المطابقة'))}
                                </span>
                            </div>
                        `
                            : ''
                        }
                    </div>
                    <div>
                        ${
                          ['open', 'matched'].includes(r.status)
                            ? `
                            <button type="button" class="cancel-sr-btn px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold rounded-lg transition-colors border border-red-100 shadow-sm dark:bg-red-500/10" data-id="${esc(r.request_id)}">
                                ${esc(t('ho_cancel', 'إلغاء'))}
                            </button>
                        `
                            : ''
                        }
                    </div>
                </div>
            </div>`,
      // P2-005 FIX: Use renderEmptyState() for consistency.
      // PREVIOUS: Inline HTML diverged from platform-standard empty component
      // (different padding, icon sizing, dark mode tokens).
      // NOW: Uses renderEmptyState() — same as projects, bids, approvals sections.
      // Standard: DRY, Design System Consistency.
      emptyState: () =>
        renderEmptyState({
          icon: 'wrench',
          title: t('ho_no_requests_yet', 'لا توجد طلبات بعد'),
          subtitle: t('ho_post_first_request', 'قدّم أول طلب إصلاح'),
        }),
    });

    // HIGH-001 FIX + P0-001 FIX (Wave 2): Cancel handlers with event delegation.
    // PREVIOUS: querySelectorAll('.cancel-sr-btn').forEach attached individual listeners
    // on EVERY render cycle — no delegation guard. On 10 tab switches, each button had
    // 10 duplicate listeners causing 10× API calls per click.
    // NOW: Single delegated listener on the container, wired ONCE via guard flag.
    // Standard: Event Delegation, Nielsen #5 (Error Prevention), FinTech Zero-Trust.
    //
    // C7 FIX: OPTIMISTIC UI PATTERN.
    // PREVIOUS: User confirmed → spinner on button → await API (2-5s on 3G) →
    //   restore('success') → loadServiceRequests() (another 2-5s full re-fetch).
    //   Total perceived latency: 4-10 seconds with TWO loading phases.
    // NOW: User confirms → card slides out IMMEDIATELY (0ms perceived latency) →
    //   success toast appears → API fires in background → silent stat refresh.
    //   If API fails → card rolls back into view + error toast.
    // Two-phase exit: slide-out (300ms) → height collapse (300ms) → DOM removal.
    // Standard: Optimistic UI (Google Material Design 3), Nielsen #1 (System Status),
    //   Instagram/Twitter delete pattern, Apple HIG (Responsive Feedback).
    if (!delegationWired.requests) {
      delegationWired.requests = true;
      tbody.addEventListener('click', (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('.cancel-sr-btn');
        if (!btn) {
          return;
        }
        const id = btn.dataset['id'];
        if (!id) {
          return;
        }
        confirmAction({
          title: t('ho_confirm_cancel_title', 'تأكيد الإلغاء'),
          message: t('ho_confirm_cancel_msg', 'هل أنت متأكد من إلغاء هذا الطلب؟'),
          confirmLabel: t('ho_cancel', 'إلغاء'),
          icon: 'x-circle',
          variant: 'danger',
          i18n: {
            title: 'ho_confirm_cancel_title',
            message: 'ho_confirm_cancel_msg',
            confirm: 'ho_cancel',
            cancel: 'common_cancel',
          },
          onConfirm: async () => {
            // ── Phase 0: Find card by data attribute ────────────────
            const card = tbody.querySelector<HTMLElement>(`[data-sr-card="${id}"]`);
            let collapseTimer: ReturnType<typeof setTimeout> | null = null;
            let removeTimer: ReturnType<typeof setTimeout> | null = null;
            let cardRemoved = false;

            // ── Phase 1: OPTIMISTIC — Slide out immediately ────────
            if (card) {
              card.classList.add('nm-card-removing');

              // Phase 2: After slide-out, collapse height to close gap
              collapseTimer = setTimeout(() => {
                card.style.transition =
                  'max-height 0.3s ease, padding 0.3s ease, margin 0.3s ease, border-width 0.3s ease';
                card.style.maxHeight = `${card.scrollHeight}px`;
                void card.offsetHeight; // Force reflow for transition
                card.style.maxHeight = '0';
                card.style.padding = '0';
                card.style.margin = '0';
                card.style.borderWidth = '0';
                card.style.overflow = 'hidden';
              }, 300);

              // Phase 3: Remove from DOM after collapse completes
              removeTimer = setTimeout(() => {
                card.remove();
                cardRemoved = true;
              }, 620);
            }

            // ── Show instant success toast ─────────────────────────
            showToast(t('ho_request_cancelled', 'تم إلغاء طلب الخدمة'), 'success');

            // ── Phase 4: API call in background ────────────────────
            try {
              await homeowner.cancelServiceRequest(id);
              // API succeeded — silently refresh stats
              loadStats();
            } catch (err) {
              // ── ROLLBACK: Restore card on API failure ──────────
              if (collapseTimer) {
                clearTimeout(collapseTimer);
              }
              if (removeTimer) {
                clearTimeout(removeTimer);
              }

              if (card && !cardRemoved) {
                // Card still in DOM — reverse the animation
                card.classList.remove('nm-card-removing');
                card.style.transition = '';
                card.style.maxHeight = '';
                card.style.padding = '';
                card.style.margin = '';
                card.style.borderWidth = '';
                card.style.overflow = '';
              } else {
                // Card already removed from DOM — full re-fetch
                loadServiceRequests();
              }

              showToast(t('ho_cancel_failed', 'فشل الإلغاء. يرجى المحاولة مجدداً.'), 'error');
              reportWarning('[HomeownerPortal] Cancel failed', {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          },
        });
      });
    }
  } catch (err) {
    reportWarning('[HomeownerPortal] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    renderErrorWithRetry(tbody, loadServiceRequests, undefined, undefined, err);
  }
}

// ─── Approvals ──────────────────────────────────────────────────────────────
async function loadApprovals(): Promise<void> {
  const container = document.getElementById('approvals-list');
  if (!container) {
    return;
  }

  try {
    const res = await homeowner.getApprovals();
    const approvals = (res.data ?? []) as unknown as Approval[];

    // P1-UXA-002 FIX: Progressive rendering for approvals list
    renderProgressive({
      items: approvals,
      containerEl: container,
      pageSize: 20,
      renderItem: (a, i) => `
            <div class="p-5 hover:bg-slate-50/50 transition-colors animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-medium">${esc(a.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase ${statusColor(a.status)}">${esc(statusLabel(a.status))}</span>
                        </div>
                        <p class="text-xs text-slate-500 mt-1 dark:text-slate-400">${esc(a.description ?? t('ho_no_description', 'لا يوجد وصف'))}</p>
                        <div class="flex items-center gap-3 mt-2 text-3xs text-slate-400 dark:text-slate-500">
                            <span><i class="ph ph-buildings" aria-hidden="true"></i> ${esc(a.project_title)}</span>
                            <span><i class="ph ph-hard-hat" aria-hidden="true"></i> ${esc(a.engineer_name)}</span>
                            <span><i class="ph ph-clock" aria-hidden="true"></i> ${relativeTimeAgo(a.created_at)}</span>
                        </div>
                        <a href="/project-details.html?id=${esc(a.project_id)}" class="inline-flex items-center gap-1 mt-2 text-3xs font-bold text-trust-blue hover:underline">
                            <i class="ph ph-eye" aria-hidden="true"></i>
                            ${esc(t('ho_view_project_proofs', 'عرض المشروع والإثباتات'))}
                        </a>
                    </div>
                    ${
                      a.status === 'pending'
                        ? `
                        <div class="flex gap-1.5 shrink-0">
                            <button type="button" class="approval-btn px-3 py-1.5 bg-green-600 text-white text-3xs font-bold rounded-lg hover:bg-green-700"
                                    data-id="${esc(a.approval_id)}" data-decision="approved">${esc(t('ho_approve', 'موافقة'))}</button>
                            <button type="button" class="approval-btn px-3 py-1.5 bg-red-100 text-red-600 text-3xs font-bold rounded-lg hover:bg-red-200"
                                    data-id="${esc(a.approval_id)}" data-decision="rejected">${esc(t('ho_reject', 'رفض'))}</button>
                        </div>
                    `
                        : ''
                    }
                </div>
            </div>`,
      emptyState: () =>
        renderEmptyState({
          icon: 'check-square',
          title: t('ho_no_pending_approvals', 'لا توجد موافقات معلقة'),
        }),
    });

    // HIGH-002 + HIGH-004 FIX + P0-001 FIX (Wave 2): Event delegation for approval buttons.
    // PREVIOUS: querySelectorAll('.approval-btn').forEach attached individual listeners
    // on EVERY render cycle — no delegation guard. On re-renders, each button accumulated
    // duplicate listeners, causing multiple simultaneous escrow API calls per click.
    // NOW: Single delegated listener on the container, wired ONCE via guard flag.
    // Standard: Event Delegation, Nielsen #5 (Error Prevention), FinTech Zero-Trust.
    if (!delegationWired.approvals) {
      delegationWired.approvals = true;
      container.addEventListener('click', async (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('.approval-btn');
        if (!btn) {
          return;
        }
        const id = btn.dataset['id'];
        const decision = btn.dataset['decision'] as 'approved' | 'rejected';
        if (!id || !decision) {
          return;
        }

        const executeApproval = async () => {
          const b = btn as HTMLButtonElement;
          const restore = setLoadingState(
            b,
            decision === 'approved'
              ? t('ho_approving', 'جاري الموافقة…')
              : t('ho_rejecting', 'جاري الرفض…'),
          );
          try {
            // UX-REM-F005 FIX + P0-002 FIX (Wave 2): Non-blocking undo with completion tracking.
            // PREVIOUS (UX-REM-F005): setTimeout(5000) BLOCKED async flow.
            // PREVIOUS (Wave 2 audit): API could complete before user clicks Undo.
            // If API succeeds (fast network) then user clicks Undo:
            //   - abortController.abort() = no-op (Promise already resolved)
            //   - undone = true → if(!undone) guard skips restore('success')
            //   - Button stuck in permanent loading state, funds released but UI
            //     shows "Approval cancelled" — FinTech trust crisis.
            // NOW: `apiCompleted` flag tracks whether the API call has finished.
            // If Undo is clicked AFTER API completion, we show "Already processed"
            // toast and refresh the list to reflect the true state.
            // Standard: Optimistic UI with Completion Tracking, Nielsen #1 + #5.
            if (decision === 'approved') {
              const { showToast } = await import('../utils/toast');
              const abortController = new AbortController();
              let undone = false;
              let apiCompleted = false;

              showToast(t('ho_approval_undo', 'جاري تحرير أموال الأمانة...'), 'info', {
                duration: 4500,
                action: {
                  label: t('ho_undo', 'تراجع'),
                  onClick: () => {
                    if (apiCompleted) {
                      // P0-002 FIX: API already completed — cannot undo.
                      // Show honest feedback instead of misleading "cancelled".
                      void import('../utils/toast').then((m) =>
                        m.showToast(
                          t(
                            'ho_approval_already_processed',
                            'تمت معالجة الموافقة مسبقاً. جاري التحديث...',
                          ),
                          'info',
                        ),
                      );
                      loadApprovals();
                      loadStats();
                      return;
                    }
                    undone = true;
                    abortController.abort();
                    restore();
                    void import('../utils/toast').then((m) =>
                      m.showToast(t('ho_approval_cancelled', 'تم إلغاء الموافقة'), 'success'),
                    );
                  },
                },
              });

              // Fire immediately — abort if user clicks Undo before completion
              try {
                await homeowner.respondToApproval(id, decision, { signal: abortController.signal });
                apiCompleted = true;
                if (!undone) {
                  restore('success');
                  loadApprovals();
                  loadStats();
                }
              } catch (abortErr) {
                if (!undone) {
                  restore('error');
                  reportWarning('[HomeownerPortal] Approval failed', {
                    error: abortErr instanceof Error ? abortErr.message : String(abortErr),
                  });
                }
              }
              return;
            }

            await homeowner.respondToApproval(id, decision);
            restore('success');
            loadApprovals();
            loadStats();
          } catch (err) {
            restore('error');
            reportWarning('[HomeownerPortal] Approval failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        };

        // Reject is destructive — requires confirmation
        if (decision === 'rejected') {
          confirmAction({
            title: t('ho_confirm_reject_title', 'تأكيد الرفض'),
            message: t('ho_confirm_reject_msg', 'هل أنت متأكد من رفض هذا العرض؟'),
            confirmLabel: t('ho_reject', 'رفض'),
            icon: 'x-circle',
            variant: 'danger',
            i18n: {
              title: 'ho_confirm_reject_title',
              message: 'ho_confirm_reject_msg',
              confirm: 'ho_reject',
              cancel: 'common_cancel',
            },
            onConfirm: executeApproval,
          });
        } else {
          // P2-UX-006 FIX: Approve ALSO requires confirmation.
          // On a FinTech platform, accidental approval releases escrow funds permanently.
          // Standard: Nielsen #5 (Error Prevention), FIDIC 13.8 (Financial Guard).
          confirmAction({
            title: t('ho_confirm_approve_title', 'الموافقة على المرحلة'),
            message: t(
              'ho_confirm_approve_msg',
              'سيتم تحرير أموال الأمانة لهذه المرحلة. لا يمكن التراجع عن هذا الإجراء.',
            ),
            confirmLabel: t('ho_approve', 'موافقة'),
            icon: 'check-circle',
            variant: 'warning',
            i18n: {
              title: 'ho_confirm_approve_title',
              message: 'ho_confirm_approve_msg',
              confirm: 'ho_approve',
              cancel: 'common_cancel',
            },
            onConfirm: executeApproval,
          });
        }
      });
    }
  } catch (err) {
    reportWarning('[HomeownerPortal] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    renderErrorWithRetry(container, loadApprovals, undefined, undefined, err);
  }
}

// ─── Escrow ─────────────────────────────────────────────────────────────────
async function loadEscrow(): Promise<void> {
  const container = document.getElementById('escrow-content');
  if (!container) {
    return;
  }

  // P2-006 FIX: Show loading skeleton — prevents empty flash on tab switch.
  // PREVIOUS: Container was blank during API call. On 3G networks (Syria),
  // user saw an empty section for 2-5 seconds with no loading indication.
  // NOW: 4-stat skeleton grid matching the escrow KPI layout appears instantly.
  // Standard: Nielsen #1 (System Status Visibility), Skeleton Loading Pattern.
  container.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4" aria-hidden="true">
            ${Array.from(
              { length: 4 },
              (_, i) => `
                <div class="rounded-xl p-4 bg-slate-100 dark:bg-dark-elevated nm-skeleton">
                    <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2 nm-skeleton-pulse" style="animation-delay:${i * 0.1}s"></div>
                    <div class="h-6 bg-slate-200 dark:bg-slate-700 rounded w-2/3 mt-2 nm-skeleton-pulse" style="animation-delay:${i * 0.1 + 0.1}s"></div>
                </div>
            `,
            ).join('')}
        </div>
    `;

  try {
    const res = await homeowner.getEscrow();
    const e = (res.data ?? {}) as unknown as EscrowData;

    container.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="${esc(t('ho_escrow_summary', 'ملخص الأمانة'))}">
                <div class="bg-trust-blue/5 rounded-xl p-4 dark:bg-trust-blue/10">
                    <p class="text-3xs font-bold text-trust-blue/60 uppercase">${esc(t('ho_total_deposited', 'إجمالي المودع'))}</p>
                    <p class="text-xl font-black mt-1 text-trust-blue" aria-label="${esc(t('ho_total_deposited', 'إجمالي المودع'))}: ${formatCents(e.total_deposited ?? 0)}">${formatCents(e.total_deposited ?? 0)}</p>
                </div>
                <div class="bg-smoky-jade/5 rounded-xl p-4 dark:bg-smoky-jade/10">
                    <p class="text-3xs font-bold text-smoky-jade/60 uppercase">${esc(t('ho_released', 'تم الإفراج'))}</p>
                    <p class="text-xl font-black mt-1 text-smoky-jade dark:text-emerald-400" aria-label="${esc(t('ho_released', 'تم الإفراج'))}: ${formatCents(e.total_released ?? 0)}">${formatCents(e.total_released ?? 0)}</p>
                </div>
                <div class="bg-warning-yellow/5 rounded-xl p-4 dark:bg-warning-yellow/10">
                    <p class="text-3xs font-bold text-warning-yellow/60 uppercase" aria-hidden="true">${esc(t('ho_held_in_escrow', 'محتجز في الضمان'))}</p>
                    <p class="text-xl font-black mt-1 text-warning-yellow" data-kpi aria-label="${esc(t('ho_held_in_escrow', 'محتجز في الضمان'))}: ${formatCents(e.held_in_escrow ?? 0)}">${formatCents(e.held_in_escrow ?? 0)}</p>
                </div>
                <div class="bg-slate-50 rounded-xl p-4 dark:bg-dark-elevated">
                    <p class="text-3xs font-bold text-slate-400 uppercase dark:text-slate-500">${esc(t('ho_projects', 'المشاريع'))}</p>
                    <p class="text-xl font-black mt-1" aria-label="${esc(t('ho_projects', 'المشاريع'))}: ${esc(String(e.projects_with_escrow ?? 0))}">${esc(String(e.projects_with_escrow ?? 0))}</p>
                </div>
            </div>
            <p class="text-3xs text-slate-400 dark:text-slate-500 mt-2 text-end" data-i18n="ho_currency_note">${esc(t('ho_currency_note', 'جميع المبالغ بالدولار الأمريكي'))}</p>
            ${
              (e.held_in_escrow ?? 0) > 0
                ? `
                <div class="mt-4 p-4 bg-trust-blue/5 rounded-xl border border-trust-blue/10">
                    <div class="flex items-center gap-2 text-trust-blue">
                        <i class="ph ph-shield-check text-xl" aria-hidden="true"></i>
                        <p class="text-sm font-medium">${esc(t('ho_escrow_guarantee', 'ضمان الأمانة'))}</p>
                    </div>
                </div>
            `
                : ''
            }
            <a href="/wallet.html" class="mt-4 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-trust-blue/15 text-trust-blue text-sm font-bold hover:bg-trust-blue/5 transition-colors">
                <i class="ph ph-arrow-square-out text-base" aria-hidden="true"></i>
                ${esc(t('ho_view_all_transactions', 'عرض جميع المعاملات'))}
            </a>
        `;
  } catch (err) {
    reportWarning('[HomeownerPortal] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    renderErrorWithRetry(container, loadEscrow, undefined, undefined, err);
  }
}

// P4-001 FIX: setText() moved to shared utils/dom.ts
// MED-004 FIX: timeAgo() removed — replaced by relativeTimeAgo() from '../utils/format'
// which uses Intl.RelativeTimeFormat for proper Arabic/RTL rendering.
