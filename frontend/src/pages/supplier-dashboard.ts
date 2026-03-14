import '../styles/main.css';
import { reportWarning } from '../error-reporter';
import { escapeHtml as esc } from '../utils/xss';
import { supplierStatusColor as statusColor } from '../utils/status-colors';
import { supplier } from '../api';
import { t } from '../utils/i18n';

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
        const lang = document.documentElement.lang || 'en';
        const locale = lang === 'ar' ? 'ar-SY' : lang === 'tr' ? 'tr-TR' : 'en-US';
        el.textContent = now.toLocaleString(locale, {
            weekday: 'short', month: 'short', day: 'numeric',
            year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };
    update();
    setInterval(update, 1000);
}

// ─── Tab Switching ──────────────────────────────────────────────────────────
function setupTabs(): void {
    const tabOrders = document.getElementById('tab-orders');
    const tabCatalog = document.getElementById('tab-catalog');
    const sectionOrders = document.getElementById('section-orders');
    const sectionCatalog = document.getElementById('section-catalog');

    tabOrders?.addEventListener('click', () => {

        tabOrders.classList.add('bg-trust-blue/10', 'text-trust-blue');
        tabOrders.classList.remove('text-slate-600');
        tabCatalog?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
        tabCatalog?.classList.add('text-slate-600');
        if (sectionOrders) { sectionOrders.style.display = ''; }
        if (sectionCatalog) { sectionCatalog.style.display = 'none'; }
    });

    tabCatalog?.addEventListener('click', () => {

        tabCatalog.classList.add('bg-trust-blue/10', 'text-trust-blue');
        tabCatalog.classList.remove('text-slate-600');
        tabOrders?.classList.remove('bg-trust-blue/10', 'text-trust-blue');
        tabOrders?.classList.add('text-slate-600');
        if (sectionCatalog) { sectionCatalog.style.display = ''; }
        if (sectionOrders) { sectionOrders.style.display = 'none'; }
        loadCatalog();
    });
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
        // Silent degradation — KPIs retain HTML defaults
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
                    <i class="ph ph-package" style="font-size:24px" aria-hidden="true"></i>
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
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(item.status)}">
                        ${esc(item.status)}
                    </span>
                </td>
                <td class="px-5 py-3">${renderActions(item)}</td>
            </tr>
        `).join('');

        // Wire action buttons
        tbody.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const poId = btn.getAttribute('data-po-id');
                const action = btn.getAttribute('data-action');
                if (!poId || !action) { return; }
                await updatePOStatus(poId, action as 'acknowledged' | 'shipped' | 'delivered');
            });
        });

        applyI18n();
    } catch (err) { reportWarning('[SupplierDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // Silent — error captured by centralized reporter
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
                    <i class="ph ph-storefront" style="font-size:32px" aria-hidden="true"></i>
                    <p class="mt-3 text-sm">${esc(t('supplier_catalog_empty', 'Your catalog is empty'))}</p>
                    <p class="text-xs mt-1">${esc(t('supplier_catalog_hint', 'Add your first material to start receiving purchase orders'))}</p>
                </div>`;
            return;
        }

        container.innerHTML = items.map((item) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow ${!item.is_active ? 'opacity-50' : ''}">
                <div class="flex justify-between items-start mb-3">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warm-earth/10 text-warm-earth uppercase">${esc(item.material_category)}</span>
                    ${item.is_active
                ? '<span class="size-2 rounded-full bg-smoky-jade"></span>'
                : `<span class="text-[9px] text-slate-400">${esc(t('supplier_inactive', 'Inactive'))}</span>`}
                </div>
                <h3 class="font-bold text-sm mb-2">${esc(item.material_name)}</h3>
                <div class="space-y-1 text-xs text-slate-500">
                    <p><span class="font-semibold text-slate-700">${esc(t('supplier_guide_price', 'Guide Price'))}:</span> $${(item.unit_price_guide / 100).toLocaleString()} / ${esc(item.unit)}</p>
                    <p><span class="font-semibold text-slate-700">${esc(t('supplier_min_order', 'Min Order'))}:</span> ${item.min_order_qty} ${esc(item.unit)}</p>
                    <p><span class="font-semibold text-slate-700">${esc(t('supplier_lead_time', 'Lead Time'))}:</span> ${item.lead_time_days} ${t('supplier_days', 'days')}</p>
                </div>
                ${item.is_active ? `
                <button class="mt-3 text-[10px] font-bold text-red-500 hover:underline" data-deactivate="${item.catalog_id}">
                    <i class="ph ph-trash" aria-hidden="true"></i> ${t('supplier_remove', 'Remove')}
                </button>` : ''}
            </div>
        `).join('');

        // Wire deactivate buttons
        container.querySelectorAll('[data-deactivate]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-deactivate');
                if (!id) { return; }
                await deactivateItem(id);
            });
        });
    } catch (err) { reportWarning('[SupplierDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
        // Silent — error captured by centralized reporter
    }
}

// ─── Update PO Status ───────────────────────────────────────────────────────
async function updatePOStatus(poId: string, status: 'acknowledged' | 'shipped' | 'delivered'): Promise<void> {
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
    }
}

// ─── Catalog Modal ──────────────────────────────────────────────────────────
function setupCatalogModal(): void {
    const openBtn = document.getElementById('btn-add-material');
    const modal = document.getElementById('modal-add-material');
    const cancelBtn = document.getElementById('modal-cancel');
    const form = document.getElementById('form-add-material') as HTMLFormElement | null;

    openBtn?.addEventListener('click', () => {
        if (modal) { modal.style.display = 'flex'; }
    });

    cancelBtn?.addEventListener('click', () => {
        if (modal) { modal.style.display = 'none'; }
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);

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

            if (modal) { modal.style.display = 'none'; }
            form.reset();
            showBanner('success', t('supplier_material_added', 'Material added to your catalog'));
            await loadCatalog();
            await loadKPIs();
        } catch (err) { reportWarning('[SupplierDashboard] Operation failed', { error: err instanceof Error ? err.message : String(err) });
            showBanner('error', t('supplier_network_error', 'Network error. Please try again.'));
        }
    });
}

// ─── Deactivate Catalog Item ────────────────────────────────────────────────
async function deactivateItem(catalogId: string): Promise<void> {
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
function setKPI(name: string, value: number, prefix = ''): void {
    const el = document.querySelector<HTMLElement>(`[data-kpi="${name}"]`);
    if (!el) { return; }

    const duration = 1200;
    const start = performance.now();
    const tick = (now: number): void => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = prefix === '$'
            ? Math.round((value / 100) * eased) // cents → dollars
            : Math.round(value * eased);
        el.textContent = prefix === '$'
            ? `$${current.toLocaleString()}`
            : current.toLocaleString();
        if (progress < 1) { requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
}



function renderActions(item: SupplierOrder): string {
    switch (item.status) {
        case 'generated':
        case 'sent_to_supplier':
            return `<button class="text-xs font-semibold text-trust-blue hover:underline" data-action="acknowledged" data-po-id="${item.po_id}">
                <i class="ph ph-check-circle" aria-hidden="true"></i> ${t('supplier_acknowledge', 'Acknowledge')}
            </button>`;
        case 'acknowledged':
            return `<button class="text-xs font-semibold text-purple-600 hover:underline" data-action="shipped" data-po-id="${item.po_id}">
                <i class="ph ph-truck" aria-hidden="true"></i> ${t('supplier_mark_shipped', 'Mark Shipped')}
            </button>`;
        case 'shipped':
            return `<button class="text-xs font-semibold text-smoky-jade hover:underline" data-action="delivered" data-po-id="${item.po_id}">
                <i class="ph ph-package" aria-hidden="true"></i> ${t('supplier_mark_delivered', 'Mark Delivered')}
            </button>`;
        default:
            return '<span class="text-[10px] text-slate-400">—</span>';
    }
}

function showBanner(type: 'error' | 'success', message: string): void {
    const banner = document.getElementById('dashboard-banner');
    if (!banner) { return; }
    banner.className = `px-4 py-3 rounded-lg text-sm font-medium mb-4 ${type === 'error' ? 'bg-red-50 text-red-700' : 'bg-smoky-jade/10 text-smoky-jade'
        }`;
    banner.textContent = message;
    banner.style.display = '';
    setTimeout(() => { banner.style.display = 'none'; }, 5000);
}

function applyI18n(): void {
    if (typeof (window as unknown as Record<string, unknown>)['applyI18n'] === 'function') {
        ((window as unknown as Record<string, unknown>)['applyI18n'] as () => void)();
    }
}
