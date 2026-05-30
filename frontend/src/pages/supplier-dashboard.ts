import '../styles/main.css';
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { renderErrorWithRetry } from '../utils/error-retry';
import { supplierStatusColor as statusColor } from '../utils/status-colors';
import { requireAuth } from '../utils/auth-guard';
import { initBreadcrumb } from '../utils/breadcrumb';
import { supplier } from '../api';
import { t } from '../utils/i18n';
import { showSimpleBanner } from '../utils/banner';
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';
// P3-003 FIX: Skeleton timeout guard
import { guardSkeleton } from '../utils/skeleton-guard';
// TICK-024: Haptic feedback for native-app tactile response
import { haptic } from '../utils/haptic';
// SYS-004 FIX: Dialog polyfill for older Android WebViews (Syria).
import { polyfillDialog } from '../utils/dialog-polyfill';
// P1-013 FIX: Auto-detect required fields and add asterisk markers to labels.
import '../utils/required-markers';
// P1-UX-002 FIX: Standardized empty state component
import { renderEmptyState } from '../utils/empty-state';
// P1-UX-003 FIX: Service Worker registration on all portal pages
import { bootstrapPortal } from '../utils/portal-bootstrap';
// P1-UX-001 FIX: SWR cache for perceived-instant tab switching
import { swrFetch } from '../utils/swr-cache';
// P0-UXA-004 FIX: Cross-portal navigation via shared context switcher
import { mountContextSwitcher } from '../components/portal-context';
// P2-UXA-002 FIX: Live KPI timestamp
import { markKPIFetched, showStaleIndicator } from '../utils/live-kpi-timestamp';
// P2-UXA-004 + P3-UXA-003 FIX: Tab state preservation
import { saveScrollPosition, restoreScrollPosition, saveLastTab } from '../utils/tab-state';
// P1-UXA-002 FIX: Progressive rendering — prevents DOM jank with 1000+ records
import { renderProgressive } from '../utils/progressive-render';
// P2-ANIM-001 FIX: Centralized animation stagger constant
import { staggerDelay } from '../constants/animation';
// F3 FIX: Shared KPI animation — replaces local setKPI() duplicate
import { animateKPI } from '../utils/kpi-animation';
// PLT-AUD-I001+I002+I003 FIX: Centralized locale, currency formatting, and i18n
import { getLocale, applyI18n } from '../utils/locale';
import { formatCents } from '../utils/format';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
// CRIT-UX-003 FIX: Tour Replay FAB — help button to restart onboarding
import { mountTourReplayFAB } from '../components/tour-replay-fab';
import { addTrackedTimer } from '../utils/tracked-timers';
initPullToRefresh();
initBackToTop();
autoTriggerTour();
mountTourReplayFAB();

/* ═══════════════════════════════════════════════════════════════════════════
   Supplier Dashboard — Material Supply & Revenue Engine
   PLT-FE-001 FIX: All API calls delegated to centralized api.ts client.
   Auth (JWT, dev-mode X-User-Id, CSRF) is handled by the canonical request()
   wrapper — including 30s AbortController timeout for Syria's network conditions.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Types (local rendering shapes) ─────────────────────────────────────────
interface SupplierOrder {
  po_id: string;
  po_number: string;
  material_name: string;
  material_category: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  status: string;
  project_title?: string;
  generated_at: string;
}

interface CatalogItem {
  catalog_id: string;
  material_name: string;
  material_category: string;
  description: string | null;
  unit: string;
  unit_price_guide: number;
  min_order_qty: number;
  lead_time_days: number;
  is_active: boolean;
}

// F4 AUDIT FIX: Translate PO status strings for Arabic parity.
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    generated: t('supplier_status_pending', 'بانتظار الاستلام'),
    sent_to_supplier: t('supplier_status_sent', 'مُرسَل'),
    acknowledged: t('supplier_status_acknowledged', 'تم الاستلام'),
    shipped: t('supplier_status_shipped', 'في الطريق'),
    delivered: t('supplier_status_delivered', 'تم التسليم'),
    cancelled: t('supplier_status_cancelled', 'ملغى'),
  };
  return map[status] ?? status;
}

// PLT-AUD-E001: Guards prevent duplicate event delegation on re-render.
const delegationWired = { orders: false, catalog: false } as Record<string, boolean>;

// ─── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // BLOCKER-1 FIX: Guard all protected content behind auth check.
  if (!requireAuth()) {
    return;
  }
  bootstrapPortal();
  mountContextSwitcher();
  initBreadcrumb();

  initTimestamp();
  loadKPIs();
  loadOrders();
  setupTabs();
  setupCatalogModal();

  // P3-003 FIX: Guard skeleton loaders with timeout fallback
  guardSkeleton({
    container: 'main-content',
    onRetry: () => {
      loadKPIs();
      loadOrders();
    },
  });
});

// ─── Live Timestamp ─────────────────────────────────────────────────────────
function initTimestamp(): void {
  const el = document.getElementById('live-timestamp');
  if (!el) {
    return;
  }

  const update = (): void => {
    const now = new Date();
    // PLT-AUD-I001 FIX: Use centralized getLocale() (was inline duplication)
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
  // PLT-AUD-G004 FIX: Store interval ID and clear on unload (was leaking ghost intervals)
  const intervalId = addTrackedTimer(setInterval(update, 1000));
  window.addEventListener('pagehide', () => clearInterval(intervalId));
}
// P1-003 FIX: Hash-based tab routing
const SUPPLIER_TABS = ['orders', 'catalog'] as const;
type SupplierTab = (typeof SUPPLIER_TABS)[number];
const supplierHashRouter = createHashRouter(SUPPLIER_TABS, 'orders');

// ─── Tab Switching ──────────────────────────────────────────────────────────
function setupTabs(): void {
  const tabOrders = document.getElementById('tab-orders');
  const tabCatalog = document.getElementById('tab-catalog');

  tabOrders?.addEventListener('click', () => switchSupplierTab('orders'));
  tabCatalog?.addEventListener('click', () => switchSupplierTab('catalog'));

  // P1-003 FIX: Activate from URL hash
  const initial = supplierHashRouter.getInitialTab();
  switchSupplierTab(initial);
  supplierHashRouter.onHashChange(switchSupplierTab);

  // P1-MOB-003 FIX: Swipe gestures for native-app tab navigation
  initSwipeTabs({
    containerSelector: '.dashboard-main',
    tabs: SUPPLIER_TABS as unknown as readonly string[],
    onSwitch: switchSupplierTab as (tab: string) => void,
    getCurrentTab: () => supplierHashRouter.getInitialTab(),
  });
}

function switchSupplierTab(tab: SupplierTab): void {
  // P2-UXA-004 FIX: Save scroll position of outgoing tab
  const currentHash = supplierHashRouter.getInitialTab();
  if (currentHash !== tab) {
    saveScrollPosition(currentHash);
  }
  saveLastTab(tab);
  supplierHashRouter.setActiveTab(tab);
  const tabOrders = document.getElementById('tab-orders');
  const tabCatalog = document.getElementById('tab-catalog');
  const sectionOrders = document.getElementById('section-orders');
  const sectionCatalog = document.getElementById('section-catalog');

  if (tab === 'orders') {
    tabOrders?.classList.add('bg-trust-blue/10', 'text-trust-blue');
    tabOrders?.classList.remove('text-slate-600');
    tabCatalog?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
    tabCatalog?.classList.add('text-slate-600');
    // LB-002 FIX: WCAG 4.1.2 — update aria-selected for screen reader parity
    tabOrders?.setAttribute('aria-selected', 'true');
    tabCatalog?.setAttribute('aria-selected', 'false');
    // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
    if (sectionOrders) {
      sectionOrders.classList.remove('nm-hidden');
    }
    if (sectionCatalog) {
      sectionCatalog.classList.add('nm-hidden');
    }
    // F2 FIX: Focus management on tab switch — screen reader parity.
    // PREVIOUS: No focus management at all. Screen reader users stranded.
    // Standard: WCAG 2.4.3 (Focus Order), parity with homeowner/engineer portals.
    if (sectionOrders) {
      sectionOrders.setAttribute('tabindex', '-1');
      sectionOrders.focus({ preventScroll: true });
      requestAnimationFrame(() => sectionOrders.removeAttribute('tabindex'));
    }
  } else {
    tabCatalog?.classList.add('bg-trust-blue/10', 'text-trust-blue');
    tabCatalog?.classList.remove('text-slate-600');
    tabOrders?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
    tabOrders?.classList.add('text-slate-600');
    // LB-002 FIX: WCAG 4.1.2 — update aria-selected for screen reader parity
    tabCatalog?.setAttribute('aria-selected', 'true');
    tabOrders?.setAttribute('aria-selected', 'false');
    // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
    if (sectionCatalog) {
      sectionCatalog.classList.remove('nm-hidden');
    }
    if (sectionOrders) {
      sectionOrders.classList.add('nm-hidden');
    }
    // F2 FIX: Focus management on tab switch — screen reader parity.
    if (sectionCatalog) {
      sectionCatalog.setAttribute('tabindex', '-1');
      sectionCatalog.focus({ preventScroll: true });
      requestAnimationFrame(() => sectionCatalog.removeAttribute('tabindex'));
    }
    loadCatalog();
  }

  // P2-UXA-004 FIX: Restore scroll position
  restoreScrollPosition(tab);
}

// ─── Load KPIs ──────────────────────────────────────────────────────────────
async function loadKPIs(): Promise<void> {
  try {
    const res = await swrFetch('sup-stats', () => supplier.getStats(), {
      maxAge: 120_000, // 2 minutes
      onStaleData: () => {
        showStaleIndicator();
      },
    });
    if (!res.data) {
      return;
    }
    const data = res.data;

    // F3 FIX: Use shared animateKPI() instead of local setKPI().
    // PREVIOUS: Local setKPI() (40 lines) was a copy of animateKPI().
    // All other portals already use the shared version.
    // Standard: DRY Principle, Visual Consistency.
    animateKPI('kpi-pending-bids', data.pending_orders ?? 0);
    animateKPI('kpi-won-contracts', data.won_contracts ?? 0);
    animateKPI('kpi-in-transit', data.in_transit ?? 0);
    animateKPI('kpi-total-revenue', data.total_revenue ?? 0, { prefix: '$', isCents: true });

    // Badge count
    const bidCount = document.getElementById('bid-count');
    if (bidCount) {
      bidCount.textContent = String(data.pending_orders ?? 0);
    }
    // SYS-002 FIX: Removed pending_orders → #notif-count write.
    // PREVIOUS: pending_orders (role-specific stat) was written to the header
    // notification bell badge — conflating supplier PO counts with unread
    // notifications. Badge oscillated between notification-panel.ts poll
    // (real unread count) and this write (pending_orders) every 60s.
    // NOW: notification-panel.ts is the sole owner of #notif-count.
    // Standard: SRP (Single Responsibility), Nielsen #1 (System Status).

    // P2-UXA-002 FIX: Live KPI timestamp
    markKPIFetched();
  } catch (err) {
    reportWarning('[SupplierDashboard] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // W10-001 FIX: Show em-dash on KPI failure — visible error signal.
    ['kpi-pending-bids', 'kpi-won-contracts', 'kpi-in-transit', 'kpi-total-revenue'].forEach(
      (id) => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = '—';
        }
      },
    );
  }
}

// ─── Load Purchase Orders ───────────────────────────────────────────────────
async function loadOrders(): Promise<void> {
  const tbody = document.getElementById('material-requests-body');
  if (!tbody) {
    return;
  }

  try {
    const res = await supplier.getOrders();
    const items = (res.data ?? []) as unknown as SupplierOrder[];

    // P1-UXA-002 FIX: Progressive rendering for supplier orders
    renderProgressive({
      items: items,
      containerEl: tbody,
      pageSize: 20,
      renderItem: (item, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow relative dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex justify-between items-start mb-2">
                    <span class="font-mono text-3xs text-slate-500 font-bold dark:text-slate-400">${esc(item.po_number)}</span>
                    <span class="text-3xs font-bold px-2 py-0.5 rounded-full uppercase ${statusColor(item.status)}">${esc(statusLabel(item.status))}</span>
                </div>
                <h3 class="font-bold text-sm text-slate-900 mb-1 dark:text-slate-100">${esc(item.material_name)}</h3>
                <p class="text-xs text-slate-500 mb-4 flex items-center gap-1.5 dark:text-slate-400"><i class="ph ph-buildings text-sm" aria-hidden="true"></i> ${esc(item.project_title ?? t('supplier_no_project', 'لا يوجد مشروع مرتبط'))}</p>
                
                <div class="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-dark-border">
                    <div>
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500">${esc(t('common_qty', 'الكمية'))}</p>
                        <p class="font-semibold text-sm text-slate-700 dark:text-slate-300">${esc(String(item.quantity))} <span class="text-xs font-normal text-slate-500 dark:text-slate-400">${esc(item.unit)}</span></p>
                    </div>
                    <div class="text-end">
                        <p class="text-3xs font-bold text-slate-400 uppercase tracking-wider mb-0.5 dark:text-slate-500">${esc(t('common_amount', 'المبلغ'))}</p>
                        <p class="font-mono font-bold text-smoky-jade text-sm dark:text-emerald-400">${formatCents(item.amount)}</p>
                    </div>
                </div>
                
                <div class="mt-4 flex justify-end gap-2 border-t border-slate-50 pt-3">
                    ${renderActions(item)}
                </div>
            </div>`,
      emptyState: () =>
        renderEmptyState({
          icon: 'package',
          title: t('supplier_no_orders', 'لا توجد طلبات'),
          subtitle: t('common_no_data_desc', 'لا توجد بيانات للعرض حالياً'),
        }),
    });

    // TICK-019: Event delegation for PO action buttons.
    // PLT-AUD-E001 FIX: Delegation wired ONCE — guard prevents stacking on re-render.
    if (!delegationWired.orders) {
      delegationWired.orders = true;
      tbody.addEventListener('click', async (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
        if (!btn) {
          return;
        }
        const poId = btn.getAttribute('data-po-id');
        const action = btn.getAttribute('data-action');
        if (!poId || !action) {
          return;
        }
        haptic.light(); // TICK-024: Haptic on PO action
        await updatePOStatus(poId, action as 'acknowledged' | 'shipped' | 'delivered');
      });
    }

    applyI18n();
  } catch (err) {
    reportWarning('[SupplierDashboard] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // GAP-2026-001 FIX: Show inline error with retry button (was silent — left spinner running)
    renderErrorWithRetry(tbody, loadOrders, undefined, undefined, err);
  }
}

// ─── Load My Catalog ────────────────────────────────────────────────────────
async function loadCatalog(): Promise<void> {
  const container = document.getElementById('catalog-grid');
  if (!container) {
    return;
  }

  try {
    const res = await supplier.getCatalog();
    const items = (res.data ?? []) as unknown as CatalogItem[];

    // P1-UXA-002 FIX: Progressive rendering for supplier catalog
    renderProgressive({
      items: items,
      containerEl: container,
      pageSize: 20,
      renderItem: (item, i) => `
            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow ${!item.is_active ? 'opacity-50' : ''} dark:bg-dark-surface dark:border-dark-border animate-fade-in-up" style="animation-delay:${staggerDelay(i)}">
                <div class="flex justify-between items-start mb-3">
                    <span class="text-3xs font-bold px-2 py-0.5 rounded-full bg-warm-earth/10 text-warm-earth uppercase">${esc(item.material_category)}</span>
                    ${
                      item.is_active
                        ? '<span class="size-2 rounded-full bg-smoky-jade"></span>'
                        : `<span class="text-3xs text-slate-400 dark:text-slate-500">${esc(t('supplier_inactive', 'غير نشط'))}</span>`
                    }
                </div>
                <h3 class="font-bold text-sm mb-2">${esc(item.material_name)}</h3>
                <div class="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <p><span class="font-semibold text-slate-700 dark:text-slate-300">${esc(t('supplier_guide_price', 'السعر التوجيهي ($)'))}:</span> ${formatCents(item.unit_price_guide)} / ${esc(item.unit)}</p>
                    <p><span class="font-semibold text-slate-700 dark:text-slate-300">${esc(t('supplier_min_order', 'الحد الأدنى للطلب'))}:</span> ${esc(String(item.min_order_qty))} ${esc(item.unit)}</p>
                    <p><span class="font-semibold text-slate-700 dark:text-slate-300">${esc(t('supplier_lead_time', 'مدة التسليم (أيام)'))}:</span> ${esc(String(item.lead_time_days))} ${esc(t('supplier_days', 'أيام'))}</p>
                </div>
                ${
                  item.is_active
                    ? `
                <button type="button" class="mt-3 text-3xs font-bold text-red-500 hover:underline" data-deactivate="${item.catalog_id}">
                    <i class="ph ph-trash" aria-hidden="true"></i> ${esc(t('supplier_remove', 'حذف'))}
                </button>`
                    : ''
                }
            </div>`,
      emptyState: () =>
        renderEmptyState({
          icon: 'storefront',
          title: t('supplier_catalog_empty', 'الكاتالوج فارغ'),
          subtitle: t('supplier_catalog_hint', 'أضف مواد لتظهر في البحث'),
          fullSpan: true,
        }),
    });

    // TICK-020: Event delegation for deactivate buttons.
    // PLT-AUD-E001 FIX: Delegation wired ONCE — guard prevents stacking on re-render.
    if (!delegationWired.catalog) {
      delegationWired.catalog = true;
      container.addEventListener('click', async (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-deactivate]');
        if (!btn) {
          return;
        }
        const id = btn.getAttribute('data-deactivate');
        if (!id) {
          return;
        }
        haptic.light(); // TICK-024: Haptic on catalog deactivate
        await deactivateItem(id);
      });
    }
  } catch (err) {
    reportWarning('[SupplierDashboard] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // GAP-2026-001 FIX: Show inline error with retry button (was silent — left spinner running)
    renderErrorWithRetry(container, loadCatalog, undefined, undefined, err);
  }
}

// ─── Update PO Status ───────────────────────────────────────────────────────
// PLT-AUD-F001 FIX: Added btn-loading state to prevent double-tap on slow 3G
async function updatePOStatus(
  poId: string,
  status: 'acknowledged' | 'shipped' | 'delivered',
): Promise<void> {
  // F-001: Disable the triggering button during async operation
  const btn = document.querySelector<HTMLButtonElement>(`[data-po-id="${poId}"]`);
  if (btn) {
    btn.classList.add('btn-loading');
    btn.disabled = true;
  }
  try {
    const res = await supplier.updateOrderStatus(poId, status);

    if (!res.success) {
      showBanner('error', res.error ?? t('supplier_update_failed', 'فشل التحديث'));
      return;
    }

    showBanner('success', t('supplier_status_updated', 'تم تحديث الحالة'));
    await loadOrders();
    await loadKPIs();
  } catch (err) {
    reportWarning('[SupplierDashboard] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    showBanner('error', t('supplier_network_error', 'خطأ في الشبكة'));
  } finally {
    if (btn) {
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  }
}

// ─── Catalog Modal ──────────────────────────────────────────────────────────
// INC-A01 FIX: Migrated from manual display:none toggling to native <dialog> API.
// Native <dialog> provides: built-in focus trap, Escape key dismissal (automatic),
// ::backdrop pseudo-element, and proper ARIA semantics.
function setupCatalogModal(): void {
  const openBtn = document.getElementById('btn-add-material');
  const modal = document.getElementById('modal-add-material') as HTMLDialogElement | null;
  const cancelBtn = document.getElementById('modal-cancel');
  const form = document.getElementById('form-add-material') as HTMLFormElement | null;

  // INC-A02 FIX: Wire data-add-first-material button (replaced inline onclick handler).
  // Standard: CSP Level 2 — no inline event handlers.
  const addFirstBtn = document.querySelector<HTMLButtonElement>('[data-add-first-material]');
  addFirstBtn?.addEventListener('click', () => {
    openBtn?.click();
  });

  function closeModal(): void {
    if (modal?.open) {
      modal.close();
    }
  }

  openBtn?.addEventListener('click', () => {
    if (modal && !modal.open) {
      // SYS-004: Polyfill for older browsers before calling showModal().
      polyfillDialog(modal);
      modal.showModal();
    }
  });

  cancelBtn?.addEventListener('click', closeModal);
  // I1 FIX: Wire the bottom Cancel button too.
  document.getElementById('modal-cancel-alt')?.addEventListener('click', closeModal);

  // Native <dialog> handles Escape key automatically — no manual keydown listener needed.
  // G-005 FIX retained: backdrop click dismissal (::backdrop doesn't auto-close).
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');

    // P1-012 FIX (Wave 2): Input validation before submission.
    // PREVIOUS: Form submitted whatever FormData contained — no validation.
    // material_name could be empty, unit_price_guide could be 0 or negative,
    // min_order_qty could be 0. Every other form on the platform has validation.
    // NOW: Comprehensive guard rails matching homeowner service request form pattern.
    // Standard: FinTech Input Validation, Nielsen #5 (Error Prevention).
    const materialName = ((fd.get('material_name') as string) || '').trim();
    const unitPriceRaw = Number(fd.get('unit_price_guide'));
    const minOrderQty = Number(fd.get('min_order_qty')) || 0;

    if (!materialName) {
      showBanner('error', t('supplier_name_required', 'يرجى إدخال اسم المادة'));
      return;
    }
    if (materialName.length > 200) {
      showBanner('error', t('supplier_name_too_long', 'اسم المادة يجب ألا يتجاوز ٢٠٠ حرف'));
      return;
    }
    if (!unitPriceRaw || unitPriceRaw <= 0) {
      showBanner('error', t('supplier_price_required', 'يرجى إدخال سعر وحدة صالح'));
      return;
    }
    if (unitPriceRaw > 10_000_000) {
      showBanner('error', t('supplier_price_too_high', 'سعر الوحدة يجب ألا يتجاوز ١٠٬٠٠٠٬٠٠٠$'));
      return;
    }
    if (minOrderQty < 1) {
      showBanner('error', t('supplier_qty_required', 'الحد الأدنى للطلب يجب أن يكون ١ على الأقل'));
      return;
    }
    if (minOrderQty > 100_000) {
      showBanner('error', t('supplier_qty_too_high', 'الحد الأدنى للطلب يجب ألا يتجاوز ١٠٠٬٠٠٠'));
      return;
    }

    // F-011 FIX + P2-014 FIX (Wave 2): Use btn-loading AND disabled.
    // PREVIOUS (F-011): btn-loading alone — pointer-events:none blocks mouse but
    // button is still focusable via keyboard Tab+Enter, allowing double-submit.
    // NOW: Both visual (btn-loading) and semantic (disabled) guards.
    // Standard: WCAG 2.1.1 (Keyboard), FinTech Double-Submit Prevention.
    if (submitBtn) {
      submitBtn.classList.add('btn-loading');
      submitBtn.disabled = true;
    }

    try {
      const res = await supplier.addCatalogItem({
        material_name: materialName,
        material_category: fd.get('material_category') as string,
        unit: fd.get('unit') as string,
        unit_price_guide: Math.round(unitPriceRaw * 100), // dollars→cents
        min_order_qty: minOrderQty || 1,
        lead_time_days: Number(fd.get('lead_time_days')) || 7,
        description: (fd.get('description') as string) || undefined,
      });

      if (!res.success) {
        showBanner('error', res.error ?? t('supplier_add_failed', 'فشلت الإضافة'));
        return;
      }

      closeModal();
      form.reset();
      showBanner('success', t('supplier_material_added', 'تمت إضافة المادة'));
      await loadCatalog();
      await loadKPIs();
    } catch (err) {
      reportWarning('[SupplierDashboard] Operation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      showBanner('error', t('supplier_network_error', 'خطأ في الشبكة'));
    } finally {
      if (submitBtn) {
        submitBtn.classList.remove('btn-loading');
        submitBtn.disabled = false;
      }
    }
  });
}

// ─── Deactivate Catalog Item ────────────────────────────────────────────────
// PLT-AUD-F002 FIX: Added inline confirmation before destructive removal
async function deactivateItem(catalogId: string): Promise<void> {
  const dialog = document.createElement('dialog');
  // Using standard Tailwind backdrop pseudo-class for native modal dimming
  dialog.className =
    'nm-dialog p-0 w-[90%] max-w-sm rounded-2xl border-0 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm open:animate-fade-in-up';
  dialog.innerHTML = `
        <div class="p-6">
            <div class="size-12 rounded-full bg-red-50 flex items-center justify-center mb-4 text-red-600 dark:bg-red-500/10">
                <i class="ph ph-warning-circle text-2xl" aria-hidden="true"></i>
            </div>
            <h3 class="text-lg font-bold text-slate-900 mb-2 dark:text-slate-100">${esc(t('supplier_confirm_remove', 'هل تريد حذف هذه المادة؟'))}</h3>
            <p class="text-sm text-slate-500 mb-6 dark:text-slate-400">${esc(t('supplier_remove_desc', 'هل أنت متأكد من حذف هذه المادة من كتالوجك؟'))}</p>
            <div class="flex gap-3">
                <button type="button" class="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors dark:text-slate-300" id="dialog-cancel">${esc(t('common_cancel', 'إلغاء'))}</button>
                <button type="button" class="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors" id="dialog-confirm">${esc(t('supplier_remove_btn', 'حذف المادة'))}</button>
            </div>
        </div>
    `;
  document.body.appendChild(dialog);

  dialog.querySelector('#dialog-cancel')?.addEventListener('click', () => {
    dialog.close();
  });

  dialog.querySelector('#dialog-confirm')?.addEventListener('click', async () => {
    dialog.close();
    await executeDeactivation(catalogId);
  });

  dialog.addEventListener('close', () => dialog.remove());
  // SYS-004: Polyfill for older browsers before calling showModal().
  polyfillDialog(dialog);
  dialog.showModal();
}

async function executeDeactivation(catalogId: string): Promise<void> {
  try {
    const res = await supplier.deactivateItem(catalogId);

    if (!res.success) {
      showBanner('error', t('supplier_remove_failed', 'فشل الحذف'));
      return;
    }

    showBanner('success', t('supplier_material_removed', 'تم حذف المادة'));
    await loadCatalog();
  } catch (err) {
    reportWarning('[SupplierDashboard] Operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    showBanner('error', t('supplier_network_error', 'خطأ في الشبكة'));
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────
// F3 FIX: Local setKPI() REMOVED — replaced by shared animateKPI() from utils/kpi-animation.ts.
// Previous: 40-line local duplicate of the exact same animation logic.
// All other portals (contractor, tradesperson, engineer) already use animateKPI().
// Standard: DRY Principle.

function renderActions(item: SupplierOrder): string {
  // Touch-friendly Native App buttons (Minimum 44x44 CSS hit area equivalent)
  switch (item.status) {
    case 'generated':
    case 'sent_to_supplier':
      return `<button type="button" class="px-4 py-2 bg-trust-blue text-white text-xs font-bold rounded-lg hover:bg-trust-blue/90 transition-colors w-full sm:w-auto inline-flex items-center justify-center gap-2" data-action="acknowledged" data-po-id="${item.po_id}">
                <i class="ph ph-check-circle" aria-hidden="true"></i> ${esc(t('supplier_acknowledge', 'قبول الطلب'))}
            </button>`;
    case 'acknowledged':
      // Using warm-earth for logistics/shipping semantic
      return `<button type="button" class="px-4 py-2 bg-warm-earth text-white text-xs font-bold rounded-lg hover:bg-warm-earth/90 transition-colors w-full sm:w-auto inline-flex items-center justify-center gap-2" data-action="shipped" data-po-id="${item.po_id}">
                <i class="ph ph-truck" aria-hidden="true"></i> ${esc(t('supplier_mark_shipped', 'وضع علامة شُحن'))}
            </button>`;
    case 'shipped':
      return `<button type="button" class="px-4 py-2 bg-smoky-jade text-white text-xs font-bold rounded-lg hover:bg-smoky-jade/90 transition-colors w-full sm:w-auto inline-flex items-center justify-center gap-2" data-action="delivered" data-po-id="${item.po_id}">
                <i class="ph ph-package" aria-hidden="true"></i> ${esc(t('supplier_mark_delivered', 'وضع علامة تم التسليم'))}
            </button>`;
    default:
      return '<span class="text-3xs text-slate-400 font-bold px-2 py-1 flex-1 text-end dark:text-slate-500">—</span>';
  }
}

// P2-AUD-002 FIX: Shared banner utility replaces local duplicate
function showBanner(type: 'error' | 'success', message: string): void {
  showSimpleBanner('dashboard-banner', type, message);
}

// PLT-AUD-I003 FIX: applyI18n is now imported from utils/locale (was manual window check)
