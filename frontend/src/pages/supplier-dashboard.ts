import '../styles/main.css';
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { renderErrorWithRetry, renderTableErrorWithRetry } from '../utils/error-retry';
import { supplierStatusColor as statusColor } from '../utils/status-colors';
import { supplier } from '../api';
import { t } from '../utils/i18n';
import { showSimpleBanner } from '../utils/banner';
import { createHashRouter } from '../utils/hash-router';
import { initSwipeTabs } from '../utils/swipe-tabs';
// TICK-024: Haptic feedback for native-app tactile response
import { haptic } from '../utils/haptic';
// PLT-AUD-I001+I002+I003 FIX: Centralized locale, currency formatting, and i18n
import { getLocale, applyI18n } from '../utils/locale';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
initPullToRefresh();
initBackToTop();
autoTriggerTour();

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
    unit: string;
    unit_price_guide: number;
    min_order_qty: number;
    lead_time_days: number;
    is_active: boolean;
}

// PLT-AUD-E001: Guards prevent duplicate event delegation on re-render.
const delegationWired = { orders: false, catalog: false } as Record<string, boolean>;

// ─── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTimestamp();
    loadKPIs();
    loadOrders();
    setupTabs();
    setupCatalogModal();
});

// ─── Live Timestamp ─────────────────────────────────────────────────────────
function initTimestamp(): void {
    const el = document.getElementById('live-timestamp');
    if (!el) { return; }

    const update = (): void => {
        const now = new Date();
        // PLT-AUD-I001 FIX: Use centralized getLocale() (was inline duplication)
        el.textContent = now.toLocaleString(getLocale(), {
            weekday: 'short', month: 'short', day: 'numeric',
            year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };
    update();
    // PLT-AUD-G004 FIX: Store interval ID and clear on unload (was leaking ghost intervals)
    const intervalId = setInterval(update, 1000);
    window.addEventListener('beforeunload', () => clearInterval(intervalId));
}
// P1-003 FIX: Hash-based tab routing
const SUPPLIER_TABS = ['orders', 'catalog'] as const;
type SupplierTab = typeof SUPPLIER_TABS[number];
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
        // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
        if (sectionOrders) { sectionOrders.classList.remove('nm-hidden'); }
        if (sectionCatalog) { sectionCatalog.classList.add('nm-hidden'); }
    } else {
        tabCatalog?.classList.add('bg-trust-blue/10', 'text-trust-blue');
        tabCatalog?.classList.remove('text-slate-600');
        tabOrders?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
        tabOrders?.classList.add('text-slate-600');
        // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
        if (sectionCatalog) { sectionCatalog.classList.remove('nm-hidden'); }
        if (sectionOrders) { sectionOrders.classList.add('nm-hidden'); }
        loadCatalog();
    }
}

// ─── Load KPIs ──────────────────────────────────────────────────────────────
async function loadKPIs(): Promise<void> {
    try {
        const res = await supplier.getStats();
        if (!res.data) { return; }
        const data = res.data;

        setKPI('pending-bids', data.pending_orders ?? 0);
        setKPI('won-contracts', (data as unknown as Record<string, number>)['won_contracts'] ?? 0);
        setKPI('in-transit', (data as unknown as Record<string, number>)['in_transit'] ?? 0);
        setKPI('total-revenue', (data as unknown as Record<string, number>)['total_revenue'] ?? 0, '$');

        // Badge count
        const bidCount = document.getElementById('bid-count');
        if (bidCount) { bidCount.textContent = String(data.pending_orders ?? 0); }
        const notifCount = document.getElementById('notif-count');
        if (notifCount) { notifCount.textContent = String(data.pending_orders ?? 0); }
    } catch (err) { reportWarning('[SupplierDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // W10-001 FIX: Show em-dash on KPI failure — visible error signal.
        ['kpi-pending-bids', 'kpi-won-contracts', 'kpi-in-transit', 'kpi-total-revenue'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = '—'; }
        });
    }
}

// ─── Load Purchase Orders ───────────────────────────────────────────────────
async function loadOrders(): Promise<void> {
    const tbody = document.getElementById('material-requests-body');
    if (!tbody) { return; }

    try {
        const res = await supplier.getOrders();
        const items = (res.data ?? []) as unknown as SupplierOrder[];

        if (!items || items.length === 0) {
            tbody.innerHTML = `<tr class="border-t border-slate-100">
                <td colspan="7" class="px-5 py-8 text-center text-slate-400">
                    <i class="ph ph-package text-2xl" aria-hidden="true"></i>
                    <p class="mt-2 text-xs">${esc(t('supplier_no_orders', 'No purchase orders yet'))}</p>
                </td>
            </tr>`;
            return;
        }

        tbody.innerHTML = items.map((item) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-5 py-3 font-mono text-xs text-slate-500">${esc(item.po_number)}</td>
                <td class="px-5 py-3 font-medium">${esc(item.material_name)}</td>
                <td class="px-5 py-3 text-slate-500">${esc(item.project_title ?? '')}</td>
                <td class="px-5 py-3">${item.quantity} ${esc(item.unit)}</td>
                <td class="px-5 py-3 font-mono">$${(item.amount / 100).toLocaleString()}</td>
                <td class="px-5 py-3">
                    <span class="text-3xs font-bold px-2 py-0.5 rounded-full ${statusColor(item.status)}">
                        ${esc(item.status)}
                    </span>
                </td>
                <td class="px-5 py-3">${renderActions(item)}</td>
            </tr>
        `).join('');

        // TICK-019: Event delegation for PO action buttons.
        // PLT-AUD-E001 FIX: Delegation wired ONCE — guard prevents stacking on re-render.
        if (!delegationWired.orders) {
            delegationWired.orders = true;
            tbody.addEventListener('click', async (e: MouseEvent) => {
                const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
                if (!btn) { return; }
                const poId = btn.getAttribute('data-po-id');
                const action = btn.getAttribute('data-action');
                if (!poId || !action) { return; }
                haptic.light(); // TICK-024: Haptic on PO action
                await updatePOStatus(poId, action as 'acknowledged' | 'shipped' | 'delivered');
            });
        }

        applyI18n();
    } catch (err) { reportWarning('[SupplierDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // GAP-2026-001 FIX: Show inline error with retry button (was silent — left spinner running)
        renderTableErrorWithRetry(tbody, loadOrders, 7);
    }
}

// ─── Load My Catalog ────────────────────────────────────────────────────────
async function loadCatalog(): Promise<void> {
    const container = document.getElementById('catalog-grid');
    if (!container) { return; }

    try {
        const res = await supplier.getCatalog();
        const items = (res.data ?? []) as unknown as CatalogItem[];

        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-slate-400">
                    <i class="ph ph-storefront nm-icon-32" aria-hidden="true"></i>
                    <p class="mt-3 text-sm">${esc(t('supplier_catalog_empty', 'Your catalog is empty'))}</p>
                    <p class="text-xs mt-1">${esc(t('supplier_catalog_hint', 'Add your first material to start receiving purchase orders'))}</p>
                </div>`;
            return;
        }

        container.innerHTML = items.map((item) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow ${!item.is_active ? 'opacity-50' : ''}">
                <div class="flex justify-between items-start mb-3">
                    <span class="text-3xs font-bold px-2 py-0.5 rounded-full bg-warm-earth/10 text-warm-earth uppercase">${esc(item.material_category)}</span>
                    ${item.is_active
                ? '<span class="size-2 rounded-full bg-smoky-jade"></span>'
                : `<span class="text-3xs text-slate-400">${esc(t('supplier_inactive', 'Inactive'))}</span>`}
                </div>
                <h3 class="font-bold text-sm mb-2">${esc(item.material_name)}</h3>
                <div class="space-y-1 text-xs text-slate-500">
                    <p><span class="font-semibold text-slate-700">${esc(t('supplier_guide_price', 'Guide Price'))}:</span> $${(item.unit_price_guide / 100).toLocaleString()} / ${esc(item.unit)}</p>
                    <p><span class="font-semibold text-slate-700">${esc(t('supplier_min_order', 'Min Order'))}:</span> ${item.min_order_qty} ${esc(item.unit)}</p>
                    <p><span class="font-semibold text-slate-700">${esc(t('supplier_lead_time', 'Lead Time'))}:</span> ${item.lead_time_days} ${t('supplier_days', 'days')}</p>
                </div>
                ${item.is_active ? `
                <button type="button" class="mt-3 text-3xs font-bold text-red-500 hover:underline" data-deactivate="${item.catalog_id}">
                    <i class="ph ph-trash" aria-hidden="true"></i> ${t('supplier_remove', 'Remove')}
                </button>` : ''}
            </div>
        `).join('');

        // TICK-020: Event delegation for deactivate buttons.
        // PLT-AUD-E001 FIX: Delegation wired ONCE — guard prevents stacking on re-render.
        if (!delegationWired.catalog) {
            delegationWired.catalog = true;
            container.addEventListener('click', async (e: MouseEvent) => {
                const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-deactivate]');
                if (!btn) { return; }
                const id = btn.getAttribute('data-deactivate');
                if (!id) { return; }
                haptic.light(); // TICK-024: Haptic on catalog deactivate
                await deactivateItem(id);
            });
        }
    } catch (err) { reportWarning('[SupplierDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // GAP-2026-001 FIX: Show inline error with retry button (was silent — left spinner running)
        renderErrorWithRetry(container, loadCatalog);
    }
}

// ─── Update PO Status ───────────────────────────────────────────────────────
// PLT-AUD-F001 FIX: Added btn-loading state to prevent double-tap on slow 3G
async function updatePOStatus(poId: string, status: 'acknowledged' | 'shipped' | 'delivered'): Promise<void> {
    // F-001: Disable the triggering button during async operation
    const btn = document.querySelector<HTMLButtonElement>(`[data-po-id="${poId}"]`);
    if (btn) {
        btn.classList.add('btn-loading');
        btn.disabled = true;
    }
    try {
        const res = await supplier.updateOrderStatus(poId, status);

        if (!res.success) {
            showBanner('error', res.error ?? t('supplier_update_failed', 'Failed to update status'));
            return;
        }

        showBanner('success', t('supplier_status_updated', 'Order status updated successfully'));
        await loadOrders();
        await loadKPIs();
    } catch (err) { reportWarning('[SupplierDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        showBanner('error', t('supplier_network_error', 'Network error. Please try again.'));
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
        if (modal?.open) { modal.close(); }
    }

    openBtn?.addEventListener('click', () => {
        if (modal && !modal.open) { modal.showModal(); }
    });

    cancelBtn?.addEventListener('click', closeModal);

    // Native <dialog> handles Escape key automatically — no manual keydown listener needed.
    // G-005 FIX retained: backdrop click dismissal (::backdrop doesn't auto-close).
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) { closeModal(); }
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (submitBtn) { submitBtn.classList.add('btn-loading'); submitBtn.disabled = true; }

        try {
            const res = await supplier.addCatalogItem({
                material_name: fd.get('material_name') as string,
                material_category: fd.get('material_category') as string,
                unit: fd.get('unit') as string,
                unit_price_guide: Math.round(Number(fd.get('unit_price_guide')) * 100), // dollars→cents
                minimum_order: Number(fd.get('min_order_qty')) || 1,
                lead_time_days: Number(fd.get('lead_time_days')) || 7,
            });

            if (!res.success) {
                showBanner('error', res.error ?? t('supplier_add_failed', 'Failed to add material'));
                return;
            }

            closeModal();
            form.reset();
            showBanner('success', t('supplier_material_added', 'Material added to your catalog'));
            await loadCatalog();
            await loadKPIs();
        } catch (err) { reportWarning('[SupplierDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
            showBanner('error', t('supplier_network_error', 'Network error. Please try again.'));
        } finally {
            if (submitBtn) { submitBtn.classList.remove('btn-loading'); submitBtn.disabled = false; }
        }
    });
}

// ─── Deactivate Catalog Item ────────────────────────────────────────────────
// PLT-AUD-F002 FIX: Added inline confirmation before destructive removal
async function deactivateItem(catalogId: string): Promise<void> {
    // F-002 FIX: Inline confirmation — swap button to "Confirm?" state
    const btn = document.querySelector<HTMLButtonElement>(`[data-deactivate="${catalogId}"]`);
    if (btn && !btn.dataset.confirmed) {
        const originalHTML = btn.innerHTML;
        btn.dataset.confirmed = 'pending';
        btn.innerHTML = `<i class="ph ph-warning" aria-hidden="true"></i> ${t('supplier_confirm_remove', 'Confirm?')}`;
        btn.classList.add('text-red-600', 'font-bold');

        // Auto-revert after 3 seconds if user doesn't confirm
        const revertTimer = setTimeout(() => {
            delete btn.dataset.confirmed;
            btn.innerHTML = originalHTML;
            btn.classList.remove('text-red-600', 'font-bold');
        }, 3000);

        // On second click (confirmation), proceed with deactivation
        btn.addEventListener('click', async function confirmHandler() {
            clearTimeout(revertTimer);
            btn.removeEventListener('click', confirmHandler);
            delete btn.dataset.confirmed;
            await executeDeactivation(catalogId);
        }, { once: true });

        return;
    }

    await executeDeactivation(catalogId);
}

async function executeDeactivation(catalogId: string): Promise<void> {
    try {
        const res = await supplier.deactivateItem(catalogId);

        if (!res.success) {
            showBanner('error', t('supplier_remove_failed', 'Failed to remove item'));
            return;
        }

        showBanner('success', t('supplier_material_removed', 'Material removed from catalog'));
        await loadCatalog();
    } catch (err) { reportWarning('[SupplierDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        showBanner('error', t('supplier_network_error', 'Network error. Please try again.'));
    }
}

// ─── Utilities ──────────────────────────────────────────────────────────────
// LOW-002 FIX: Normalized from querySelector('[data-kpi="${name}"]') to getElementById('kpi-${name}')
// — matches all other portal TS files. Standard: Nielsen #4 (Consistency).
function setKPI(name: string, value: number, prefix = ''): void {
    const el = document.getElementById(`kpi-${name}`);
    if (!el) { return; }

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



function renderActions(item: SupplierOrder): string {
    switch (item.status) {
        case 'generated':
        case 'sent_to_supplier':
            return `<button type="button" class="text-xs font-semibold text-trust-blue hover:underline" data-action="acknowledged" data-po-id="${item.po_id}">
                <i class="ph ph-check-circle" aria-hidden="true"></i> ${t('supplier_acknowledge', 'Acknowledge')}
            </button>`;
        case 'acknowledged':
            return `<button type="button" class="text-xs font-semibold text-purple-600 hover:underline" data-action="shipped" data-po-id="${item.po_id}">
                <i class="ph ph-truck" aria-hidden="true"></i> ${t('supplier_mark_shipped', 'Mark Shipped')}
            </button>`;
        case 'shipped':
            return `<button type="button" class="text-xs font-semibold text-smoky-jade hover:underline" data-action="delivered" data-po-id="${item.po_id}">
                <i class="ph ph-package" aria-hidden="true"></i> ${t('supplier_mark_delivered', 'Mark Delivered')}
            </button>`;
        default:
            return '<span class="text-3xs text-slate-400">—</span>';
    }
}

// P2-AUD-002 FIX: Shared banner utility replaces local duplicate
function showBanner(type: 'error' | 'success', message: string): void {
    showSimpleBanner('dashboard-banner', type, message);
}

// PLT-AUD-I003 FIX: applyI18n is now imported from utils/locale (was manual window check)
