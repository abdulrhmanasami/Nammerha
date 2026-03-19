/**
 * project-details.ts — Dynamic Project Data Controller
 *
 * GAP-01 FIX: Replaced hardcoded HTML content with API-driven rendering.
 * Fetches project metadata + BOQ items from API in parallel,
 * then populates the skeleton template in project-details.html.
 *
 * Data sources:
 *   - openData.getProjectCard(id) → hero (title, status, location, image)
 *   - marketplace.getProjectBOQ(id) → BOQ items with categories
 *
 * URL params supported: ?project=ID or ?id=ID (map marker compat)
 */
import '../styles/main.css';
import { CartStore, renderCartBadge, flyToCart } from '../components/cart';
import { t } from '../utils/i18n';
import { escapeHtml as esc } from '../utils/xss';
import { openData, marketplace } from '../api';
import { formatCents } from '../utils/format';
import { applyI18n } from '../utils/locale';
import { initBreadcrumb } from '../utils/breadcrumb';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
import { showToast } from '../utils/toast';
// UX-004 FIX: Haptic feedback for native-app tactile response
import { haptic } from '../utils/haptic';
// GAP-N03 FIX: Global search overlay on inner pages
import { initSearch } from '../utils/search-overlay';
initPullToRefresh();
initBackToTop();
autoTriggerTour();
initSearch();

// ─── Data Interfaces ────────────────────────────────────────────────────────
interface ProjectData {
    project_id: string;
    title: string;
    damage_type: string;
    status?: string;
    funded_amount: number;
    total_budget: number;
    funded_percentage: number;
    cover_image_url?: string;
    address_text?: string;
    region?: string;
    gps_lat?: number;
    gps_lng?: number;
}

interface BOQItem {
    item_id: string;
    material_name: string;
    material_category?: string;
    unit: string;
    unit_price: number;
    required_quantity: number;
    funded_amount?: number;
    total_cost?: number;
    funded_percentage?: number;
    image_url?: string;
}

// ─── Category Icon Mapping ──────────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, { icon: string; color: string }> = {
    structural:  { icon: 'house-line',  color: 'warm-earth' },
    foundation:  { icon: 'house-line',  color: 'warm-earth' },
    electrical:  { icon: 'lightning',   color: 'trust-blue' },
    plumbing:    { icon: 'drop',        color: 'warm-earth' },
    finishing:   { icon: 'window',      color: 'smoky-jade' },
    roofing:     { icon: 'warehouse',   color: 'trust-blue' },
    insulation:  { icon: 'thermometer', color: 'smoky-jade' },
    default:     { icon: 'package',     color: 'warm-earth' },
};

function getCategoryMeta(category: string): { icon: string; color: string } {
    const key = (category.toLowerCase().split(/[\s/]+/)[0]) ?? 'default';
    const result = CATEGORY_ICONS[key];
    return result !== undefined ? result : { icon: 'package', color: 'warm-earth' };
}

// ─── Extract Project ID from URL ────────────────────────────────────────────
function getProjectIdFromURL(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('project') ?? params.get('id') ?? null;
}

// ─── Hero Rendering ─────────────────────────────────────────────────────────
function renderHero(project: ProjectData): void {
    const skeleton = document.getElementById('hero-skeleton');
    const content = document.getElementById('hero-content');
    const title = document.getElementById('hero-title');
    const status = document.getElementById('hero-status');
    const location = document.getElementById('hero-location');
    const imgContainer = document.getElementById('hero-image-container');

    if (!content || !title || !status || !location) { return; }

    // Populate content
    title.textContent = project.title;
    status.textContent = project.status
        ? project.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : t('in_progress', 'In Progress');
    location.textContent = project.address_text ?? project.region ?? '';

    // Cover image
    if (project.cover_image_url && imgContainer) {
        imgContainer.innerHTML = `<img src="${esc(project.cover_image_url)}" class="absolute inset-0 w-full h-full object-cover" alt="${esc(project.title)}" loading="eager" />`;
    }

    // Document title
    document.title = `${project.title} — Nammerha`;

    // Transition: skeleton → content
    if (skeleton) { skeleton.classList.add('hidden'); }
    content.classList.remove('hidden');
}

// ─── Progress Rendering ─────────────────────────────────────────────────────
function renderProgress(project: ProjectData): void {
    const pctText = document.getElementById('funding-percentage-text');
    const progressBar = document.getElementById('funding-progress-bar');
    const fundedText = document.getElementById('funded-amount-text');
    const totalText = document.getElementById('total-budget-text');
    const progressTrack = progressBar?.parentElement;

    const pct = Math.min(100, project.funded_percentage ?? 0);

    if (pctText) {
        pctText.textContent = `${Math.round(pct)}% ${t('raised_suffix', 'Raised')}`;
    }
    if (progressBar) {
        progressBar.style.setProperty('--progress', `${pct}%`);
    }
    if (progressTrack) {
        progressTrack.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
    if (fundedText) {
        fundedText.textContent = formatCents(project.funded_amount);
    }
    if (totalText) {
        totalText.textContent = `${t('of_total', 'of')} ${formatCents(project.total_budget)}`;
    }
}

// ─── BOQ Card Template ──────────────────────────────────────────────────────
function buildBOQCard(item: BOQItem, projectId: string): string {
    const totalCost = item.total_cost ?? (item.unit_price * item.required_quantity);
    const funded = item.funded_amount ?? 0;
    const pct = totalCost > 0 ? Math.min(100, Math.round((funded / totalCost) * 100)) : 0;
    const isFullyFunded = pct >= 100;
    const meta = getCategoryMeta(item.material_category ?? 'default');
    const unitPriceDollars = item.unit_price >= 100
        ? (item.unit_price / 100).toFixed(2) // API returns cents
        : item.unit_price.toFixed(2);        // Already dollars

    const wrapperClass = isFullyFunded ? 'mb-4 opacity-75' : 'mb-4';
    const cardClass = isFullyFunded
        ? 'glass-card rounded-xl overflow-hidden flex flex-col shadow-sm border border-slate-200/50 grayscale-[0.3]'
        : 'glass-card rounded-xl overflow-hidden flex flex-col shadow-sm border border-slate-200/50';

    const buttonHtml = isFullyFunded
        ? `<button class="w-full bg-slate-200 text-slate-500 font-bold py-3 rounded-lg flex items-center justify-center gap-2 cursor-not-allowed" disabled>
             <i class="ph ph-check-circle text-xl"  aria-hidden="true"></i>
             <span data-i18n="funding_complete">${esc(t('funding_complete', 'Funding Complete'))}</span>
           </button>`
        : `<button class="btn-primary !text-sm !py-3 add-to-cart-btn"
             data-item-id="${esc(item.item_id)}"
             data-item-name="${esc(item.material_name)}"
             data-item-price="${totalCost}"
             data-item-unit-price="${unitPriceDollars}"
             data-item-category="${esc(item.material_category ?? '')}"
             data-item-project="${esc(projectId)}"
             data-item-icon="ph-${meta.icon}">
             <i class="ph ph-shopping-cart-simple text-xl"  aria-hidden="true"></i>
             <span data-i18n="add_to_cart">${esc(t('add_to_cart', 'Add to Cart'))}</span>
           </button>`;

    const badgeHtml = isFullyFunded
        ? `<span class="bg-slate-200 text-slate-600 text-3xs font-bold px-2 py-0.5 rounded-full" data-i18n="fully_funded">${esc(t('fully_funded', 'Fully Funded'))}</span>`
        : `<span class="badge-verified">${pct}% ${t('funded_suffix', 'Funded')}</span>`;

    const progressFillClass = isFullyFunded ? 'h-full bg-slate-400 w-full rounded-full' : 'progress-fill';

    return `
    <div class="${wrapperClass}">
      <div class="${cardClass}">
        <div class="h-24 w-full bg-gradient-to-br from-${meta.color}/10 to-slate-200 flex items-center justify-center">
          ${item.image_url
            ? `<img src="${esc(item.image_url)}" class="w-full h-full object-cover" alt="${esc(item.material_name)}" loading="lazy" />`
            : `<i class="ph ph-${meta.icon} text-${meta.color}/40 nm-icon-48"  aria-hidden="true"></i>`}
        </div>
        <div class="p-4">
          <div class="flex justify-between items-start mb-2">
            <div>
              <h4 class="text-lg font-bold">${esc(item.material_name)}</h4>
              <p class="text-sm text-slate-500 font-medium">${t('unit_label', 'Unit')}: $${unitPriceDollars} / ${esc(item.unit)}</p>
            </div>
            ${badgeHtml}
          </div>
          <div class="progress-track mb-4">
            <div class="${progressFillClass} nm-progress-bar" style="--progress: ${pct}%"></div>
          </div>
          ${buttonHtml}
        </div>
      </div>
    </div>`;
}

// ─── Category Header Template ───────────────────────────────────────────────
function buildCategoryHeader(category: string): string {
    const meta = getCategoryMeta(category);
    return `
    <div class="flex items-center gap-2 mb-3">
      <div class="size-6 rounded bg-${meta.color}/10 flex items-center justify-center">
        <i class="ph ph-${meta.icon} text-${meta.color} text-sm"  aria-hidden="true"></i>
      </div>
      <h4 class="text-xs font-bold uppercase tracking-widest text-slate-400">${esc(category)}</h4>
      <div class="flex-1 h-px bg-slate-100"></div>
    </div>`;
}

// ─── BOQ Rendering ──────────────────────────────────────────────────────────
function renderBOQ(items: BOQItem[], projectId: string): void {
    const skeleton = document.getElementById('boq-skeleton');
    const container = document.getElementById('boq-container');
    const empty = document.getElementById('boq-empty');

    if (!container) { return; }

    if (items.length === 0) {
        if (skeleton) { skeleton.classList.add('hidden'); }
        if (empty) { empty.classList.remove('hidden'); }
        return;
    }

    // Group items by material_category (F-008: category grouping)
    const groups = new Map<string, BOQItem[]>();
    for (const item of items) {
        const cat = item.material_category ?? t('uncategorized', 'Uncategorized');
        if (!groups.has(cat)) { groups.set(cat, []); }
        groups.get(cat)!.push(item);
    }

    // Render grouped HTML
    let html = '';
    for (const [category, categoryItems] of groups) {
        html += buildCategoryHeader(category);
        html += categoryItems.map(item => buildBOQCard(item, projectId)).join('');
    }

    container.innerHTML = html;

    // Transition: skeleton → content
    if (skeleton) { skeleton.classList.add('hidden'); }
    container.classList.remove('hidden');

    // Re-apply i18n to dynamic content
    applyI18n();
}

// ─── Error State ────────────────────────────────────────────────────────────
function showError(): void {
    const heroSkeleton = document.getElementById('hero-skeleton');
    const boqSkeleton = document.getElementById('boq-skeleton');
    const boqError = document.getElementById('boq-error');

    if (heroSkeleton) { heroSkeleton.classList.add('hidden'); }
    if (boqSkeleton) { boqSkeleton.classList.add('hidden'); }
    if (boqError) { boqError.classList.remove('hidden'); }
}

// ─── Cart Interactivity (unchanged from original) ───────────────────────────
function initCartButtons(): void {
    const cartBadge = document.getElementById('header-cart-badge');
    const cartBtn = document.getElementById('header-cart-btn');

    renderCartBadge(cartBadge);

    // Delegate click events for dynamically-rendered BOQ buttons
    const boqContainer = document.getElementById('boq-container');
    if (boqContainer) {
        boqContainer.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.add-to-cart-btn');
            if (!btn || btn.disabled) { return; }

            const itemId = btn.dataset.itemId;
            const itemName = btn.dataset.itemName;
            const unitPrice = parseFloat(btn.dataset.itemUnitPrice ?? '0');
            const category = btn.dataset.itemCategory ?? '';
            const projectId = btn.dataset.itemProject ?? '';
            const iconClass = btn.dataset.itemIcon ?? 'ph-package';

            if (!itemId || !itemName) { return; }

            CartStore.addItem({
                id: itemId,
                name: itemName,
                unitPrice,
                category,
                projectId,
                iconClass,
            });

            haptic.medium(); // UX-004: Add-to-cart confirmation feedback

            const iconEl = btn.querySelector<HTMLElement>('i.ph');
            if (iconEl && cartBtn) {
                flyToCart(iconEl, cartBtn, () => renderCartBadge(cartBadge));
            } else {
                renderCartBadge(cartBadge);
            }

            markAsAdded(btn);
        });
    }

    // Mark items already in cart after render
    setTimeout(() => {
        const addButtons = document.querySelectorAll<HTMLButtonElement>('.add-to-cart-btn');
        addButtons.forEach((btn) => {
            const itemId = btn.dataset.itemId;
            if (itemId && CartStore.hasItem(itemId)) {
                markAsAdded(btn);
            }
        });
    }, 0);

    // Listen for cross-tab/cross-page cart updates
    window.addEventListener('cart:updated', () => renderCartBadge(cartBadge));
}

function markAsAdded(btn: HTMLButtonElement): void {
    btn.classList.add('btn-added');
    btn.innerHTML = `
    <i class="ph ph-check-circle text-xl"  aria-hidden="true"></i>
    ${esc(t('project_added_to_cart', 'Added to Cart'))}`;
    btn.disabled = true;
}

// ─── Main Data Loader ───────────────────────────────────────────────────────
async function loadProjectData(): Promise<void> {
    const projectId = getProjectIdFromURL();

    if (!projectId) {
        showError();
        return;
    }

    try {
        // Parallel fetch: project metadata + BOQ items
        const [projectRes, boqRes] = await Promise.allSettled([
            openData.getProjectCard(projectId),
            marketplace.getProjectBOQ(projectId),
        ]);

        // Render project hero + progress
        if (projectRes.status === 'fulfilled' && projectRes.value.success && projectRes.value.data) {
            const project = projectRes.value.data as ProjectData;
            renderHero(project);
            renderProgress(project);
        } else {
            // If project metadata fails, show error
            showError();
            return;
        }

        // Render BOQ items
        if (boqRes.status === 'fulfilled' && boqRes.value.success && Array.isArray(boqRes.value.data)) {
            renderBOQ(boqRes.value.data as BOQItem[], projectId);
        } else {
            // BOQ can fail independently — show empty state
            renderBOQ([], projectId);
        }

        // Wire up cart buttons AFTER rendering
        initCartButtons();

    } catch {
        showError();
    }
}

// ─── GAP-06 FIX: Transparency Tracker Toggle ────────────────────────────────
function initTransparencyToggle(): void {
    const toggle = document.getElementById('transparency-toggle');
    const detail = document.getElementById('transparency-detail');
    const chevron = document.getElementById('transparency-chevron');
    if (!toggle || !detail) { return; }

    toggle.addEventListener('click', () => {
        const isExpanded = !detail.classList.contains('hidden');
        detail.classList.toggle('hidden');
        toggle.setAttribute('aria-expanded', String(!isExpanded));
        // DEF-REM-002 FIX: CSS class toggle replaces inline style.transform.
        // Previous: chevron.style.transform = 'rotate(180deg)' — violated P1-SST-001.
        if (chevron) {
            chevron.classList.toggle('nm-chevron-rotated', !isExpanded);
        }
    });
}

// ─── GAP-09 FIX: WhatsApp Notification CTA ──────────────────────────────────
function initWhatsAppCTA(): void {
    if (sessionStorage.getItem('nmr_whatsapp_dismissed')) { return; }

    const main = document.querySelector('main');
    if (!main) { return; }

    const ctaBanner = document.createElement('div');
    ctaBanner.id = 'whatsapp-cta';
    ctaBanner.className = 'fixed bottom-36 start-4 end-4 z-30 max-w-md mx-auto animate-fade-in-up';
    ctaBanner.innerHTML = `
        <div class="bg-[#25D366] text-white p-4 rounded-xl shadow-2xl flex items-center gap-3">
            <div class="size-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                <i class="ph ph-whatsapp-logo text-2xl"  aria-hidden="true"></i>
            </div>
            <div class="flex-1">
                <p class="text-sm font-bold" data-i18n="whatsapp_cta_title">${esc(t('whatsapp_cta_title', 'Get Updates via WhatsApp'))}</p>
                <p class="text-xs text-white/80" data-i18n="whatsapp_cta_desc">${esc(t('whatsapp_cta_desc', 'Instant notifications about your project progress'))}</p>
            </div>
            <button type="button" id="whatsapp-dismiss" class="text-white/70 hover:text-white shrink-0" aria-label="Dismiss">
                <i class="ph ph-x text-lg"  aria-hidden="true"></i>
            </button>
        </div>`;
    document.body.appendChild(ctaBanner);

    document.getElementById('whatsapp-dismiss')?.addEventListener('click', () => {
        ctaBanner.remove();
        sessionStorage.setItem('nmr_whatsapp_dismissed', '1');
    });
}

// ─── CONF-CSP-01 FIX: BOQ Retry Button ─────────────────────────────────────
// Previous: inline onclick="location.reload()" — blocked by CSP script-src 'self'.
// Now: wired via addEventListener for CSP compliance.
function initRetryButton(): void {
    const btn = document.getElementById('boq-retry-btn');
    if (!btn) { return; }
    btn.addEventListener('click', () => { location.reload(); });
}

// ─── Initialize ─────────────────────────────────────────────────────────────
function init(): void {
    initBreadcrumb(); // GAP-007: Breadcrumb navigation
    initShareButton(); // GAP-005: Web Share API
    initRetryButton(); // CONF-CSP-01: CSP-safe retry handler
    loadProjectData();
    initTransparencyToggle();
    initWhatsAppCTA();
}

// ─── GAP-005 FIX: Web Share API with Clipboard Fallback ─────────────────────
function initShareButton(): void {
    const btn = document.getElementById('share-project-btn');
    if (!btn) { return; }

    btn.addEventListener('click', async () => {
        haptic.light(); // UX-004: Share action feedback
        const title = document.title;
        const url = window.location.href;
        const text = t('share_project_text', 'Help rebuild Syria — support this project on Nammerha');

        // Prefer native Web Share API (available on mobile browsers)
        if (navigator.share) {
            try {
                await navigator.share({ title, text, url });
            } catch (err: unknown) {
                // User cancelled share — not an error
                if (err instanceof DOMException && err.name === 'AbortError') { return; }
            }
            return;
        }

        // Desktop fallback: copy URL to clipboard
        try {
            await navigator.clipboard.writeText(url);
            showToast(t('link_copied', 'Link copied to clipboard'), 'success');
        } catch {
            // Final fallback: prompt with URL
            window.prompt(t('copy_link_prompt', 'Copy this link:'), url);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
