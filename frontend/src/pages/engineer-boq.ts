import '../styles/main.css';
import { reportError } from '../error-reporter';
import { projects, epaOracle, marketplace } from '../api';
import { escapeHtml as esc } from '../utils/xss';
import { formatCents } from '../utils/format';
import { t } from '../utils/i18n';

// ============================================================================
// Nammerha — Engineer BOQ Builder Page Engine
// P0-001 FIX: Complete implementation replacing empty stub
// ============================================================================

interface BOQItem {
    material_name: string;
    material_category: string;
    unit: string;
    unit_price: number; // cents
    required_quantity: number;
    oracle_price: number | null;
    description: string;
    image_url: string;
    preferred_supplier_id: string;
}

interface PageState {
    projectId: string | null;
    items: BOQItem[];
    isPublishing: boolean;
}

const state: PageState = {
    projectId: null,
    items: [],
    isPublishing: false,
};

// ─── DOM References ─────────────────────────────────────────────────────────
const materialSearch = document.getElementById('material-search') as HTMLInputElement | null;
const itemsContainer = document.querySelector('.flex.flex-col.gap-3.px-4.pb-32') as HTMLElement | null;
const publishBtn = document.getElementById('publish-btn') as HTMLButtonElement | null;
const itemCountBadge = document.querySelector('.badge-primary') as HTMLElement | null;
const totalEstimate = document.querySelector('.text-xl.font-extrabold') as HTMLElement | null;

// ─── Parse Project ID from URL ──────────────────────────────────────────────
function getProjectId(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('project');
}

// HIGH-001 FIX: formatCents() consolidated — imported from utils/format.ts.

// ─── Calculate Total ────────────────────────────────────────────────────────
function calculateTotal(): number {
    return state.items.reduce((sum, item) => {
        return sum + (item.unit_price * item.required_quantity);
    }, 0);
}

// ─── Update Footer Summary ──────────────────────────────────────────────────
function updateSummary(): void {
    if (itemCountBadge) {
        itemCountBadge.textContent = `${state.items.length} ${t('boq_items', state.items.length !== 1 ? 'Items' : 'Item')}`;
    }
    if (totalEstimate) {
        totalEstimate.textContent = formatCents(calculateTotal());
    }
}

// ─── Render Item Card ───────────────────────────────────────────────────────
function renderItem(item: BOQItem, index: number): string {
    const iconMap: Record<string, string> = {
        cement: 'package',
        steel: 'ruler',
        doors: 'door',
        wiring: 'lightning',
        plumbing: 'drop',
    };
    const icon = iconMap[item.material_category] ?? 'cube';
    const totalCostCents = item.unit_price * item.required_quantity;
    const oracleDisplay = item.oracle_price
        ? `${t('boq_oracle', 'Oracle')}: ${formatCents(item.oracle_price)}/${item.unit}`
        : t('boq_no_oracle_price', 'No oracle price');

    return `
    <div class="flex gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100 animate-fade-in-up" data-index="${index}">
      <div class="bg-gradient-to-br from-warm-earth/20 to-slate-200 rounded-lg size-20 shrink-0 flex items-center justify-center">
        <i class="ph ph-${esc(icon)} text-warm-earth" style="font-size:30px" aria-hidden="true"></i>
      </div>
      <div class="flex flex-1 flex-col justify-between">
        <div>
          <p class="text-base font-bold leading-tight">${esc(item.material_name)}</p>
          <p class="text-slate-500 text-xs mt-1 flex items-center gap-1">
            <i class="ph ph-chart-bar text-trust-blue ph-sm" aria-hidden="true"></i>
            ${esc(oracleDisplay)}
          </p>
        </div>
        <div class="flex items-center justify-between mt-2">
          <div class="flex flex-col">
            <p class="text-slate-400 text-[10px] uppercase font-bold tracking-tighter">${t('boq_estimated', 'Estimated')}</p>
            <p class="text-trust-blue text-base font-bold">${esc(formatCents(totalCostCents))}</p>
          </div>
          <div class="flex items-center gap-3 bg-slate-100 rounded-lg p-1">
            <button class="qty-minus flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-900 shadow-sm" data-index="${index}">
              <i class="ph ph-minus ph-sm" aria-hidden="true"></i>
            </button>
            <span class="text-sm font-bold w-8 text-center">${item.required_quantity}</span>
            <button class="qty-plus flex h-7 w-7 items-center justify-center rounded-md bg-trust-blue text-white shadow-sm" data-index="${index}">
              <i class="ph ph-plus ph-sm" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

// ─── Render All Items ───────────────────────────────────────────────────────
function renderAllItems(): void {
    if (!itemsContainer) { return; }
    if (state.items.length === 0) {
        itemsContainer.innerHTML = `
        <div class="text-center py-16">
          <i class="ph ph-clipboard-text text-slate-300" style="font-size:64px" aria-hidden="true"></i>
          <p class="text-slate-500 font-bold mt-4">${t('boq_no_materials', 'No materials added yet')}</p>
          <p class="text-slate-400 text-sm mt-1">${t('boq_search_hint', 'Search for materials above to build your BOQ')}</p>
        </div>`;
        return;
    }

    itemsContainer.innerHTML = state.items.map((item, i) => renderItem(item, i)).join('');
    bindQuantityControls();
    updateSummary();
}

// ─── Bind Quantity +/- Buttons ──────────────────────────────────────────────
function bindQuantityControls(): void {
    document.querySelectorAll('.qty-plus').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = parseInt((btn as HTMLElement).dataset.index ?? '0', 10);
            if (state.items[idx]) {
                state.items[idx].required_quantity += 1;
                renderAllItems();
            }
        });
    });

    document.querySelectorAll('.qty-minus').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = parseInt((btn as HTMLElement).dataset.index ?? '0', 10);
            if (state.items[idx] && state.items[idx].required_quantity > 1) {
                state.items[idx].required_quantity -= 1;
                renderAllItems();
            } else if (state.items[idx] && state.items[idx].required_quantity === 1) {
                state.items.splice(idx, 1);
                renderAllItems();
            }
        });
    });
}

// ─── Load Existing BOQ from API (if project specified) ──────────────────────
async function loadExistingBOQ(): Promise<void> {
    if (!state.projectId) { return; }
    try {
        const response = await marketplace.getProjectBOQ(state.projectId);
        if (response.success && Array.isArray(response.data)) {
            state.items = (response.data as Array<{
                material_name: string;
                material_category: string;
                unit: string;
                unit_price: number;
                required_quantity: number;
                oracle_reference_price: number | null;
                description: string;
                image_url: string;
            }>).map((item) => ({
                material_name: item.material_name,
                material_category: item.material_category ?? 'general',
                unit: item.unit,
                unit_price: item.unit_price,
                required_quantity: item.required_quantity,
                oracle_price: item.oracle_reference_price,
                description: item.description ?? '',
                image_url: item.image_url ?? '',
                preferred_supplier_id: '',
            }));
            renderAllItems();
        }
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[BOQ] Failed to load existing items'), { component: 'engineer_boq', action: 'load_existing' });
    }
}

// ─── Material Search (Oracle Integration) ───────────────────────────────────
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

materialSearch?.addEventListener('input', () => {
    if (searchTimeout) { clearTimeout(searchTimeout); }
    searchTimeout = setTimeout(async () => {
        const query = materialSearch.value.trim();
        if (query.length < 2) { return; }

        try {
            const response = await epaOracle.getPrices(query);
            if (response.success && Array.isArray(response.data) && response.data.length > 0) {
                const oracleItem = response.data[0] as {
                    material_name: string;
                    material_category: string;
                    unit: string;
                    current_price: number;
                    base_price: number;
                };

                // Check if already added
                const exists = state.items.some(
                    (i) => i.material_name.toLowerCase() === oracleItem.material_name.toLowerCase()
                );
                if (!exists) {
                    state.items.push({
                        material_name: oracleItem.material_name,
                        material_category: oracleItem.material_category ?? 'general',
                        unit: oracleItem.unit,
                        unit_price: oracleItem.current_price,
                        required_quantity: 1,
                        oracle_price: oracleItem.current_price,
                        description: '',
                        image_url: '',
                        preferred_supplier_id: '',
                    });
                    renderAllItems();
                    materialSearch.value = '';
                }
            }
        } catch (err) {
            reportError(err instanceof Error ? err : new Error('[BOQ] Oracle search failed'), { component: 'engineer_boq', action: 'oracle_search' });
        }
    }, 400);
});

// ─── Publish to Marketplace ─────────────────────────────────────────────────
publishBtn?.addEventListener('click', async () => {
    if (state.isPublishing || !state.projectId || state.items.length === 0) { return; }

    state.isPublishing = true;
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.innerHTML = `<i class="ph ph-spinner ph-lg animate-spin" aria-hidden="true"></i> ${t('boq_publishing', 'Publishing...')}`;
    }

    try {
        // Submit each BOQ item to backend
        for (const item of state.items) {
            await projects.addBOQItem(state.projectId, {
                material_name: item.material_name,
                material_category: item.material_category,
                unit: item.unit,
                unit_price: item.unit_price,
                required_quantity: item.required_quantity,
                image_url: item.image_url || undefined,
                preferred_supplier_id: item.preferred_supplier_id,
            });
        }

        // Publish project to marketplace
        await projects.publish(state.projectId);

        if (publishBtn) {
            publishBtn.innerHTML = `<i class="ph ph-check-circle" aria-hidden="true"></i> ${t('boq_published', 'Published!')}`;
            publishBtn.classList.remove('btn-primary');
            publishBtn.classList.add('btn-jade');
        }

        setTimeout(() => {
            window.location.href = `/project-details.html?project=${state.projectId}`;
        }, 1200);
    } catch (err) {
        const message = err instanceof Error ? err.message : t('boq_publish_failed', 'Failed to publish');
        // HIGH-002 FIX: Replace alert() with inline error banner
        const errDiv = document.createElement('div');
        errDiv.className = 'fixed bottom-20 left-4 right-4 rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 shadow-lg z-50 animate-fade-in-up';
        errDiv.innerHTML = `<i class="ph ph-warning-circle" aria-hidden="true"></i> ${esc(message)}`;
        document.body.appendChild(errDiv);
        setTimeout(() => errDiv.remove(), 5000);
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.innerHTML = `<i class="ph ph-upload" aria-hidden="true"></i> ${t('boq_publish_to_marketplace', 'Publish to Marketplace')}`;
        }
    } finally {
        state.isPublishing = false;
    }
});

// ─── Initialize ─────────────────────────────────────────────────────────────
function init(): void {
    state.projectId = getProjectId();
    if (state.projectId) {
        loadExistingBOQ();
    } else {
        renderAllItems();
    }
    updateSummary();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
