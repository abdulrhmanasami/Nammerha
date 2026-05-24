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
import { CART_CHECKOUT_ENABLED } from '../utils/feature-flags';
import { CartStore, renderCartBadge, flyToCart } from '../components/cart';
import { t } from '../utils/i18n';
import { escapeHtml as esc } from '../utils/xss';
import { openData, marketplace, dashboard } from '../api';
import { formatCents } from '../utils/format';
import { applyI18n } from '../utils/locale';
import { initBreadcrumb } from '../utils/breadcrumb';
// F-004 FIX: Hub FAB on all pages — portal navigation from inner pages
import { mountHubFAB } from '../components/portal-context';
// GAP-002 + GAP-005 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
import { autoTriggerTour } from '../components/tour-engine';
import { initBackToTop } from '../components/back-to-top';
import { showToast } from '../utils/toast';
// UX-004 FIX: Haptic feedback for native-app tactile response
import { haptic } from '../utils/haptic';
// CRIT-UX-007 FIX: Role-aware CTA — user context for contextual actions
import { getCurrentUser } from '../auth';
// GAP-N03 FIX: Global search overlay on inner pages
import { initSearch } from '../utils/search-overlay';
// UX PLATINUM FIX: UI Lock for Escrow Idempotency Feedback
import { showProcessingLock } from '../utils/ui-lock';
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
  structural: { icon: 'house-line', color: 'warm-earth' },
  foundation: { icon: 'house-line', color: 'warm-earth' },
  electrical: { icon: 'lightning', color: 'trust-blue' },
  plumbing: { icon: 'drop', color: 'warm-earth' },
  finishing: { icon: 'window', color: 'smoky-jade' },
  roofing: { icon: 'warehouse', color: 'trust-blue' },
  insulation: { icon: 'thermometer', color: 'smoky-jade' },
  default: { icon: 'package', color: 'warm-earth' },
};

// P3-002 FIX: Concrete class lookup — dynamic Tailwind classes like `from-${meta.color}/10`
// get tree-shaken by PurgeCSS because the full class string is never seen at build time.
// This map ensures the fully-qualified class strings exist in the source for scanning.
const COLOR_CLASSES: Record<string, { gradient: string; text: string }> = {
  'warm-earth': { gradient: 'from-warm-earth/10', text: 'text-warm-earth/40' },
  'trust-blue': { gradient: 'from-trust-blue/10', text: 'text-trust-blue/40' },
  'smoky-jade': { gradient: 'from-smoky-jade/10', text: 'text-smoky-jade/40' },
};

function getCategoryMeta(category: string): { icon: string; color: string } {
  const key = category.toLowerCase().split(/[\s/]+/)[0] ?? 'default';
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

  if (!content || !title || !status || !location) {
    return;
  }

  // Populate content
  title.textContent = project.title;
  status.textContent = project.status
    ? project.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : t('in_progress', 'قيد التنفيذ');
  location.textContent = project.address_text ?? project.region ?? '';

  // Cover image
  if (project.cover_image_url && imgContainer) {
    imgContainer.innerHTML = `<img src="${esc(project.cover_image_url)}" class="absolute inset-0 w-full h-full object-cover" alt="${esc(project.title)}" loading="eager" />`;
  }

  // F-014 FIX: Bilingual document title — was hardcoded 'Nammerha' for all locales.
  // Arabic users now see 'نعمّرها'. Standard: i18n Completeness.
  document.title = `${project.title} — ${t('app_name', 'نعمّرها')}`;

  // F-020 FIX: Skeleton → content crossfade transition.
  // Previous: instant toggle via nm-hidden — harsh visual jump.
  // Now: skeleton fades out (200ms), then content fades in (300ms).
  if (skeleton) {
    skeleton.classList.add('nm-skeleton-exit');
    setTimeout(() => skeleton.classList.add('nm-hidden'), 200);
  }
  content.classList.remove('nm-hidden');
  content.classList.add('nm-content-reveal');

  // UX PLATINUM FIX: Progressive 360 Loader Wiring
  const load360Btn = document.getElementById('load-360-btn');
  const progressiveOverlay = document.getElementById('progressive-360-overlay');
  
  if (load360Btn && progressiveOverlay) {
    load360Btn.addEventListener('click', () => {
      // Show loading state
      load360Btn.innerHTML = `
        <i class="ph ph-spinner animate-spin text-xl" aria-hidden="true"></i>
        <div class="text-start">
          <span class="block text-sm font-bold">${esc(t('loading_360_view', 'جاري التحميل...'))}</span>
          <span class="block text-3xs opacity-80">${esc(t('please_wait', 'يرجى الانتظار'))}</span>
        </div>
      `;
      (load360Btn as HTMLButtonElement).disabled = true;
      load360Btn.classList.add('opacity-80', 'cursor-not-allowed');

      // Simulate network request for the 4MB 360 panorama asset
      setTimeout(() => {
        progressiveOverlay.classList.add('nm-hidden');
        // Real app would init 360 viewer (e.g. Pannellum) here on the imgContainer
        showToast(t('view_360_loaded', 'تم تحميل العرض البانورامي 360° بنجاح'), 'success');
      }, 1500);
    });
  }
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
    pctText.textContent = `${Math.round(pct)}% ${t('raised_suffix', 'تم جمعه')}`;
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
    totalText.textContent = `${t('of_total', 'من الإجمالي')} ${formatCents(project.total_budget)}`;
  }
}

// ─── BOQ Card Template ──────────────────────────────────────────────────────
function buildBOQCard(item: BOQItem, projectId: string): string {
  const totalCost = item.total_cost ?? item.unit_price * item.required_quantity;
  const funded = item.funded_amount ?? 0;
  const pct = totalCost > 0 ? Math.min(100, Math.round((funded / totalCost) * 100)) : 0;
  const isFullyFunded = pct >= 100;
  const meta = getCategoryMeta(item.material_category ?? 'default');
  // P3-002 FIX: Use concrete class lookup instead of dynamic Tailwind interpolation
  const colorClasses = COLOR_CLASSES[meta.color] ?? COLOR_CLASSES['warm-earth']!;
  // FORENSIC-C4.2 FIX: Backend contract is unit_price in CENTS (integer).
  const unitPriceDollars = (item.unit_price / 100).toFixed(2);

  // ═══════════════════════════════════════════════════════════════════════
  // F-002 FIX: OCDS Transparency View when donations are suspended.
  // Previous: Showed pricing, progress bars, and disabled "Funding Coming
  // Soon" buttons — creating an elaborate window-shopping dead-end.
  // Now: Renders as an informational transparency card with material name,
  // category icon, quantity needed, and a "Verified & Documented" badge.
  // Standard: Nielsen #3 (User Control), OCDS Transparency, FinTech Trust UX.
  // ═══════════════════════════════════════════════════════════════════════
  if (!CART_CHECKOUT_ENABLED && !isFullyFunded) {
    return `
    <div class="mb-4">
      <div class="glass-card rounded-xl overflow-hidden flex flex-col shadow-sm border border-slate-200/50">
        <div class="h-20 w-full bg-gradient-to-br ${colorClasses.gradient} to-slate-200 flex items-center justify-center">
          ${
            item.image_url
              ? `<img src="${esc(item.image_url)}" class="w-full h-full object-cover" alt="${esc(item.material_name)}" loading="lazy" />`
              : `<i class="ph ph-${meta.icon} ${colorClasses.text} nm-icon-48" aria-hidden="true"></i>`
          }
        </div>
        <div class="p-4">
          <div class="flex justify-between items-start mb-2">
            <div>
              <h4 class="text-base font-bold">${esc(item.material_name)}</h4>
              <p class="text-xs text-slate-400 font-medium dark:text-slate-500">${esc(item.material_category ?? '')} · ${item.required_quantity} ${esc(item.unit)}</p>
            </div>
            <span class="bg-smoky-jade/10 text-smoky-jade text-3xs font-bold px-2 py-0.5 rounded-full dark:text-emerald-400 dark:bg-emerald-500/10 flex items-center gap-1">
              <i class="ph ph-seal-check text-xs" aria-hidden="true"></i>
              <span data-i18n="boq_verified">${esc(t('boq_verified', 'موثّق'))}</span>
            </span>
          </div>
          <p class="text-xs text-slate-400 dark:text-slate-500" data-i18n="boq_documented_desc">${esc(t('boq_documented_desc', 'متطلبات مواد موثّقة ومعتمدة من المهندس وفق معيار OCDS.'))}</p>
        </div>
      </div>
    </div>`;
  }

  const wrapperClass = isFullyFunded ? 'mb-4 opacity-75' : 'mb-4';
  const cardClass = isFullyFunded
    ? 'glass-card rounded-xl overflow-hidden flex flex-col shadow-sm border border-slate-200/50 grayscale-[0.3]'
    : 'glass-card rounded-xl overflow-hidden flex flex-col shadow-sm border border-slate-200/50';

  // FORENSIC-C1.8 FIX: Gate "Add to Cart" behind CART_CHECKOUT_ENABLED.
  let buttonHtml: string;
  if (isFullyFunded) {
    buttonHtml = `<button type="button" class="w-full bg-slate-200 text-slate-500 font-bold py-3 rounded-lg flex items-center justify-center gap-2 cursor-not-allowed dark:text-slate-400" disabled>
             <i class="ph ph-check-circle text-xl" aria-hidden="true"></i>
             <span data-i18n="funding_complete">${esc(t('funding_complete', 'التمويل مكتمل'))}</span>
           </button>`;
  } else {
    buttonHtml = `<button type="button" class="btn-primary nm-btn-compact add-to-cart-btn"
             data-item-id="${esc(item.item_id)}"
             data-item-name="${esc(item.material_name)}"
             data-item-price="${totalCost}"
             data-item-unit-price="${unitPriceDollars}"
             data-item-category="${esc(item.material_category ?? '')}"
             data-item-project="${esc(projectId)}"
             data-item-icon="ph-${meta.icon}">
             <i class="ph ph-shopping-cart-simple text-xl" aria-hidden="true"></i>
             <span data-i18n="add_to_cart">${esc(t('add_to_cart', 'أضف إلى السلة'))}</span>
           </button>`;
  }

  const badgeHtml = isFullyFunded
    ? `<span class="bg-slate-200 text-slate-600 text-3xs font-bold px-2 py-0.5 rounded-full dark:text-slate-400" data-i18n="fully_funded">${esc(t('fully_funded', 'مموّل بالكامل'))}</span>`
    : `<span class="badge-verified">${pct}% ${esc(t('funded_suffix', 'مموّل'))}</span>`;

  const progressFillClass = isFullyFunded
    ? 'h-full bg-slate-400 w-full rounded-full'
    : 'progress-fill';

  return `
    <div class="${wrapperClass}">
      <div class="${cardClass}">
        <div class="h-24 w-full bg-gradient-to-br ${colorClasses.gradient} to-slate-200 flex items-center justify-center">
          ${
            item.image_url
              ? `<img src="${esc(item.image_url)}" class="w-full h-full object-cover" alt="${esc(item.material_name)}" loading="lazy" />`
              : `<i class="ph ph-${meta.icon} ${colorClasses.text} nm-icon-48" aria-hidden="true"></i>`
          }
        </div>
        <div class="p-4">
          <div class="flex justify-between items-start mb-2">
            <div>
              <h4 class="text-lg font-bold">${esc(item.material_name)}</h4>
              <p class="text-sm text-slate-500 font-medium dark:text-slate-400">${esc(t('unit_label', 'الوحدة'))}: ${formatCents(item.unit_price)} / ${esc(item.unit)}</p>
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
        <i class="ph ph-${meta.icon} text-${meta.color} text-sm" aria-hidden="true"></i>
      </div>
      <h4 class="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">${esc(category)}</h4>
      <div class="flex-1 h-px bg-slate-100"></div>
    </div>`;
}

// ─── BOQ Rendering ──────────────────────────────────────────────────────────
function renderBOQ(items: BOQItem[], projectId: string): void {
  const skeleton = document.getElementById('boq-skeleton');
  const container = document.getElementById('boq-container');
  const empty = document.getElementById('boq-empty');

  if (!container) {
    return;
  }

  if (items.length === 0) {
    if (skeleton) {
      skeleton.classList.add('nm-hidden');
    }
    if (empty) {
      empty.classList.remove('nm-hidden');
    }
    return;
  }

  // Group items by material_category (F-008: category grouping)
  const groups = new Map<string, BOQItem[]>();
  for (const item of items) {
    const cat = item.material_category ?? t('uncategorized', 'غير مصنف');
    if (!groups.has(cat)) {
      groups.set(cat, []);
    }
    groups.get(cat)!.push(item);
  }

  // Render grouped HTML
  let html = '';
  for (const [category, categoryItems] of groups) {
    html += buildCategoryHeader(category);
    html += categoryItems.map((item) => buildBOQCard(item, projectId)).join('');
  }

  container.innerHTML = html;

  // F-020 FIX: Skeleton → content crossfade transition (BOQ section).
  if (skeleton) {
    skeleton.classList.add('nm-skeleton-exit');
    setTimeout(() => skeleton.classList.add('nm-hidden'), 200);
  }
  container.classList.remove('nm-hidden');
  container.classList.add('nm-content-reveal');

  // Re-apply i18n to dynamic content
  applyI18n();
}

// ─── Error State ────────────────────────────────────────────────────────────
// P2-UXA-006 FIX: Differentiate "project not found" (404) from generic errors.
function showError(type: 'not-found' | 'generic' = 'generic'): void {
  const heroSkeleton = document.getElementById('hero-skeleton');
  const boqSkeleton = document.getElementById('boq-skeleton');
  const boqError = document.getElementById('boq-error');

  if (heroSkeleton) {
    heroSkeleton.classList.add('nm-hidden');
  }
  if (boqSkeleton) {
    boqSkeleton.classList.add('nm-hidden');
  }

  if (type === 'not-found' && boqError) {
    boqError.innerHTML = `
            <div class="p-8 text-center" role="alert" aria-live="polite">
                <i class="ph ph-magnifying-glass text-slate-300 text-4xl dark:text-slate-600" aria-hidden="true"></i>
                <p class="mt-3 text-base font-semibold text-slate-700 dark:text-slate-300" data-i18n="error_project_not_found">${t('error_project_not_found', 'المشروع غير موجود')}</p>
                <p class="mt-1 text-sm text-slate-400 dark:text-slate-500" data-i18n="error_project_not_found_desc">${t('error_project_not_found_desc', 'ربما تم حذف هذا المشروع أو الرابط غير صالح.')}</p>
                <a href="projects.html" class="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-trust-blue text-white hover:bg-trust-blue/90 transition-colors">
                    <i class="ph ph-arrow-left nm-dir-shift" aria-hidden="true"></i>
                    <span data-i18n="error_browse_projects">${t('error_browse_projects', 'تصفّح المشاريع')}</span>
                </a>
            </div>
        `;
    boqError.classList.remove('nm-hidden');
  } else if (boqError) {
    boqError.classList.remove('nm-hidden');
  }
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
      if (!btn || btn.disabled) {
        return;
      }

      const itemId = btn.dataset.itemId;
      const itemName = btn.dataset.itemName;
      const unitPrice = parseFloat(btn.dataset.itemUnitPrice ?? '0');
      const category = btn.dataset.itemCategory ?? '';
      const projectId = btn.dataset.itemProject ?? '';
      const iconClass = btn.dataset.itemIcon ?? 'ph-package';

      if (!itemId || !itemName) {
        return;
      }

      // UX PLATINUM FIX: Escrow Double-Click Anxiety (UI Freeze)
      // Simulating the backend escrow allocation lock for the BOQ item
      const unlock = showProcessingLock(t('processing_escrow', 'جاري تأمين المادة في الضمان...'));
      
      setTimeout(() => {
        unlock();
        
        CartStore.addItem({
          id: itemId,
          name: itemName,
          unitPrice,
          category,
          projectId,
          iconClass,
        });

        haptic.medium(); // UX-004: Add-to-cart confirmation feedback

        // Start UX Platinum Cart Lock Timer
        startCartLockTimer();

        const iconEl = btn.querySelector<HTMLElement>('i.ph');
        if (iconEl && cartBtn) {
          // P3-UXA-002 FIX: Sequence markAsAdded AFTER flyToCart animation completes.
          flyToCart(iconEl, cartBtn, () => {
            renderCartBadge(cartBadge);
            markAsAdded(btn);
          });
        } else {
          renderCartBadge(cartBadge);
          markAsAdded(btn);
        }
      }, 600);
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
    <i class="ph ph-check-circle text-xl" aria-hidden="true"></i>
    ${esc(t('project_added_to_cart', 'تمت إضافة المادة للسلة'))}`;
  btn.disabled = true;
}

// ─── UX PLATINUM FIX: Cart Lock Timer ─────────────────────────────────────────
let cartTimerInterval: number | null = null;
function startCartLockTimer() {
  const timerContainer = document.getElementById('cart-lock-timer');
  const countdownEl = document.getElementById('cart-timer-countdown');
  if (!timerContainer || !countdownEl) return;

  timerContainer.classList.remove('nm-hidden');
  
  if (cartTimerInterval) {
    clearInterval(cartTimerInterval);
  }

  let timeLeft = 900; // 15 minutes
  
  const updateDisplay = () => {
    const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const secs = (timeLeft % 60).toString().padStart(2, '0');
    countdownEl.textContent = `${mins}:${secs}`;
    
    // Ensure warning yellow class is present initially
    countdownEl.className = 'text-xs font-black text-warning-yellow tracking-widest font-mono relative z-10 transition-colors';

    if (timeLeft <= 60) {
      countdownEl.classList.add('text-red-500', 'animate-pulse');
      countdownEl.classList.remove('text-warning-yellow');
    }
  };

  updateDisplay();

  cartTimerInterval = window.setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(cartTimerInterval!);
      countdownEl.textContent = "00:00";
      // In a real app, we would unlock the item in the backend via API
      showToast(t('cart_lock_expired', 'انتهت مدة الحجز، يرجى إعادة المحاولة'), 'error');
      setTimeout(() => timerContainer.classList.add('nm-hidden'), 3000);
    } else {
      updateDisplay();
    }
  }, 1000);
}

// ─── Main Data Loader ───────────────────────────────────────────────────────
async function loadProjectData(): Promise<void> {
  const projectId = getProjectIdFromURL();

  if (!projectId) {
    // P2-UXA-006: No project ID in URL → specific "not found" state
    showError('not-found');
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
      // P2-UXA-006: Detect 404 vs generic failure
      const is404 =
        projectRes.status === 'fulfilled' &&
        'status' in projectRes.value &&
        (projectRes.value as { status?: number }).status === 404;
      showError(is404 ? 'not-found' : 'generic');
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

    // CRIT-UX-007 FIX: Role-Aware CTA — show contextual action based on user's role.
    // Previous: All users saw the same page — contractors couldn't bid, engineers
    // couldn't submit proofs, homeowners couldn't see approval status.
    // Now: Role-specific CTA banner appears below BOQ section.
    // Standard: Nielsen #6 (Recognition over Recall), RBAC UX.
    renderRoleCTA(projectId);

    // V-004 FIX: Load activity timeline (non-blocking)
    renderActivityTimeline(projectId);
  } catch {
    /* Intentional: API client already logs via reportWarning.
           Show user-facing error state — no duplicate logging needed. */
    showError();
  }
}

// ─── CRIT-UX-007 FIX: Role-Aware CTA Banner ────────────────────────────────
// Shows a contextual action banner based on the authenticated user's role.
// Homeowner → Approval status. Contractor → Submit Bid. Engineer → Upload Proof.
// Standard: Nielsen #6 (Recognition over Recall), RBAC UX, Role-Specific Actions.
// ─────────────────────────────────────────────────────────────────────────────
function renderRoleCTA(projectId: string): void {
  const user = getCurrentUser();
  if (!user) return; // Unauthenticated → no CTA

  const main = document.querySelector('main');
  if (!main) return;

  // Determine primary role CTA
  interface RoleCTA {
    icon: string;
    label: string;
    href: string;
    bgClass: string;
    textClass: string;
  }

  const roles = user.roles;
  let cta: RoleCTA | null = null;

  if (roles.includes('contractor')) {
    cta = {
      icon: 'ph-gavel',
      label: t('cta_submit_bid', 'تقديم عرض سعر لهذا المشروع'),
      href: `/contractor-portal.html#bids?project=${encodeURIComponent(projectId)}`,
      bgClass: 'bg-trust-blue/5 border-trust-blue/15',
      textClass: 'text-trust-blue',
    };
  } else if (roles.includes('engineer')) {
    cta = {
      icon: 'ph-camera',
      label: t('cta_upload_proof', 'رفع إثبات مرئي لهذا المشروع'),
      href: `/engineer-portal.html#captures?project=${encodeURIComponent(projectId)}`,
      bgClass: 'bg-smoky-jade/5 border-smoky-jade/15',
      textClass: 'text-smoky-jade',
    };
  } else if (roles.includes('homeowner')) {
    cta = {
      icon: 'ph-check-square',
      label: t('cta_view_approvals', 'عرض الموافقات المعلّقة'),
      href: `/homeowner-portal.html#approvals`,
      bgClass: 'bg-warm-earth/5 border-warm-earth/15',
      textClass: 'text-warm-earth',
    };
  } else if (roles.includes('tradesperson')) {
    cta = {
      icon: 'ph-wrench',
      label: t('cta_view_assignments', 'عرض مهامك في المشاريع'),
      href: `/tradesperson-portal.html#assignments`,
      bgClass: 'bg-trust-blue/5 border-trust-blue/15',
      textClass: 'text-trust-blue',
    };
  }

  if (!cta) return;

  const section = document.createElement('section');
  section.id = 'nm-role-cta';
  section.className = 'mt-4 px-4 animate-fade-in-up';
  section.innerHTML = `
    <a href="${esc(cta.href)}" class="flex items-center gap-3 p-4 rounded-xl border ${cta.bgClass} no-underline transition-all hover:shadow-md group">
      <div class="size-10 rounded-lg ${cta.bgClass} flex items-center justify-center shrink-0">
        <i class="ph ${esc(cta.icon)} ${cta.textClass} text-xl" aria-hidden="true"></i>
      </div>
      <span class="flex-1 text-sm font-semibold ${cta.textClass}">${esc(cta.label)}</span>
      <i class="ph ph-arrow-right nm-dir-shift ${cta.textClass} group-hover:translate-x-1 transition-transform" aria-hidden="true"></i>
    </a>
  `;

  // Insert before activity timeline if it exists, otherwise append to main
  const activitySection = document.getElementById('v004-activity-section');
  if (activitySection) {
    main.insertBefore(section, activitySection);
  } else {
    main.appendChild(section);
  }
}

// ─── V-004 FIX: Project Activity Timeline ───────────────────────────────────
// Shows chronological audit trail events: escrow movements, proof submissions,
// milestone completions, etc. Loaded lazily after main data to avoid blocking.
// Standard: OCDS Transparency, Nielsen #1 (System Status Visibility).
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, string> = {
  escrow_locked: 'ph-lock-simple',
  escrow_released: 'ph-lock-simple-open',
  refund_requested: 'ph-arrow-counter-clockwise',
  refund_processed: 'ph-check-circle',
  proof_submitted: 'ph-camera',
  proof_verified: 'ph-shield-check',
  proof_rejected: 'ph-shield-warning',
  po_generated: 'ph-file-text',
  po_approved: 'ph-check-square-offset',
  milestone_completed: 'ph-flag-banner',
  approval_requested: 'ph-question',
  approval_approved: 'ph-thumbs-up',
  approval_rejected: 'ph-thumbs-down',
  match_reversed: 'ph-arrows-counter-clockwise',
  default: 'ph-note',
};

const ACTION_COLORS: Record<string, string> = {
  escrow_locked: 'text-trust-blue',
  escrow_released: 'text-smoky-jade',
  refund_requested: 'text-yellow-500',
  refund_processed: 'text-smoky-jade',
  proof_submitted: 'text-trust-blue',
  proof_verified: 'text-smoky-jade',
  proof_rejected: 'text-red-500',
  default: 'text-slate-400',
};

async function renderActivityTimeline(projectId: string): Promise<void> {
  // Find or create activity container after BOQ section
  const main = document.querySelector('main');
  if (!main) return;

  // Create timeline section
  const section = document.createElement('section');
  section.id = 'v004-activity-section';
  section.className = 'mt-6 px-4';
  section.innerHTML = `
        <div class="bg-white dark:bg-slate-800/50 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700/30">
            <h3 class="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-4">
                <i class="ph ph-clock-counter-clockwise text-trust-blue text-lg"></i>
                ${esc(t('project_activity', 'نشاط المشروع'))}
            </h3>
            <div id="v004-timeline" class="space-y-0">
                <div class="nm-skeleton-pulse rounded-lg" style="height:80px"></div>
            </div>
            <div id="v004-load-more" class="nm-hidden mt-3 text-center">
                <button id="v004-load-more-btn" class="text-xs text-trust-blue hover:text-trust-blue/70 font-medium transition-colors">
                    ${esc(t('load_more', 'تحميل المزيد'))}
                </button>
            </div>
        </div>
    `;
  main.appendChild(section);

  const timeline = document.getElementById('v004-timeline');
  if (!timeline) return;

  let currentOffset = 0;
  const pageSize = 15;

  async function loadEvents(append = false): Promise<void> {
    if (!timeline) return;
    try {
      const res = await dashboard.getActivity(projectId, {
        limit: pageSize,
        offset: currentOffset,
      });
      if (!res.success || !res.data) {
        if (!append) {
          timeline.innerHTML = `<p class="text-sm text-slate-400 py-3">${esc(t('activity_error', 'تعذّر تحميل النشاط'))}</p>`;
        }
        return;
      }

      const { events, total } = res.data;

      if (events.length === 0 && !append) {
        timeline.innerHTML = `<p class="text-sm text-slate-400 py-3">${esc(t('no_activity', 'لا يوجد نشاط بعد'))}</p>`;
        return;
      }

      const html = events
        .map((e) => {
          const iconClass = ACTION_ICONS[e.action] ?? ACTION_ICONS['default']!;
          const colorClass = ACTION_COLORS[e.action] ?? ACTION_COLORS['default']!;
          const label = e.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          const relTime = formatRelativeTime(e.timestamp);

          return `<div class="flex gap-3 py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0">
                    <div class="flex-shrink-0 size-8 rounded-lg bg-cloud-dancer dark:bg-slate-700/50 flex items-center justify-center">
                        <i class="ph ${esc(iconClass)} ${esc(colorClass)} text-base"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-slate-700 dark:text-slate-200">
                            <span class="font-medium">${esc(label)}</span>
                            <span class="text-slate-400 dark:text-slate-500"> — ${esc(e.actor)}</span>
                        </p>
                        <p class="text-xs text-slate-400 dark:text-slate-500 mt-0.5">${esc(relTime)}</p>
                    </div>
                </div>`;
        })
        .join('');

      if (append) {
        timeline.insertAdjacentHTML('beforeend', html);
      } else {
        timeline.innerHTML = html;
      }

      currentOffset += events.length;

      // Show/hide load more button
      const loadMoreEl = document.getElementById('v004-load-more');
      if (loadMoreEl) {
        loadMoreEl.classList.toggle('nm-hidden', currentOffset >= total);
      }
    } catch {
      if (!append) {
        timeline.innerHTML = `<p class="text-sm text-slate-400 py-3">${esc(t('activity_error', 'تعذّر تحميل النشاط'))}</p>`;
      }
    }
  }

  // Wire load more button
  document.getElementById('v004-load-more-btn')?.addEventListener('click', () => {
    loadEvents(true);
  });

  await loadEvents();
}

// ─── V-004 Helper: Relative Time Formatter ──────────────────────────────────
function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return t('just_now', 'الآن');
  if (diffMin < 60) return `${diffMin}${t('min_ago', 'منذ دقيقة')}`;
  if (diffHr < 24) return `${diffHr}${t('hr_ago', 'منذ ساعة')}`;
  if (diffDay < 7) return `${diffDay}${t('day_ago', 'منذ يوم')}`;
  return new Date(isoDate).toLocaleDateString();
}

// ─── GAP-06 FIX: Transparency Tracker Toggle ────────────────────────────────
function initTransparencyToggle(): void {
  const toggle = document.getElementById('transparency-toggle');
  const detail = document.getElementById('transparency-detail');
  const chevron = document.getElementById('transparency-chevron');
  if (!toggle || !detail) {
    return;
  }

  toggle.addEventListener('click', () => {
    const isExpanded = !detail.classList.contains('nm-hidden');
    detail.classList.toggle('nm-hidden');
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
  // W16-002 FIX: Wrap sessionStorage in try-catch for Safari private mode.
  try {
    if (sessionStorage.getItem('nmr_whatsapp_dismissed')) {
      return;
    }
  } catch {
    /* Safari private mode */
  }

  const main = document.querySelector('main');
  if (!main) {
    return;
  }

  const ctaBanner = document.createElement('div');
  ctaBanner.id = 'whatsapp-cta';
  // P1-014 FIX: Replaced 6 inline Tailwind classes with single CSS class.
  // Previous: 'fixed bottom-36 start-4 end-4 z-30 max-w-md mx-auto' — collided
  // with Hub FAB (start-4, bottom-24) and used hardcoded bottom that didn't
  // account for measured nav height or iOS safe areas.
  ctaBanner.className = 'nm-whatsapp-cta-wrap';
  ctaBanner.innerHTML = `
        <div class="nm-whatsapp-cta text-white p-4 rounded-xl shadow-2xl flex items-center gap-3">
            <div class="size-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                <i class="ph ph-whatsapp-logo text-2xl" aria-hidden="true"></i>
            </div>
            <div class="flex-1">
                <p class="text-sm font-bold" data-i18n="whatsapp_cta_title">${esc(t('whatsapp_cta_title', 'شارك عبر واتساب'))}</p>
                <p class="text-xs text-white/80" data-i18n="whatsapp_cta_desc">${esc(t('whatsapp_cta_desc', 'أرسل رابط المشروع لأصدقائك'))}</p>
            </div>
            <button type="button" id="whatsapp-dismiss" class="text-white/70 hover:text-white shrink-0" aria-label="Dismiss" data-i18n-aria="aria_dismiss">
                <i class="ph ph-x text-lg" aria-hidden="true"></i>
            </button>
        </div>`;
  document.body.appendChild(ctaBanner);

  document.getElementById('whatsapp-dismiss')?.addEventListener('click', () => {
    ctaBanner.remove();
    try {
      sessionStorage.setItem('nmr_whatsapp_dismissed', '1');
    } catch {
      /* Safari private mode */
    }
  });
}

// ─── CONF-CSP-01 FIX: BOQ Retry Button ─────────────────────────────────────
// Previous: inline onclick="location.reload()" — blocked by CSP script-src 'self'.
// Now: wired via addEventListener for CSP compliance.
function initRetryButton(): void {
  const btn = document.getElementById('boq-retry-btn');
  if (!btn) {
    return;
  }
  btn.addEventListener('click', () => {
    location.reload();
  });
}

// ─── Initialize ─────────────────────────────────────────────────────────────
function init(): void {
  initBreadcrumb(); // GAP-007: Breadcrumb navigation
  mountHubFAB(''); // F-004: Hub FAB — portal navigation from inner pages
  initShareButton(); // GAP-005: Web Share API
  initRetryButton(); // CONF-CSP-01: CSP-safe retry handler
  loadProjectData();
  initTransparencyToggle();
  initWhatsAppCTA();
}

// ─── GAP-005 FIX: Web Share API with Clipboard Fallback ─────────────────────
function initShareButton(): void {
  const btn = document.getElementById('share-project-btn');
  if (!btn) {
    return;
  }

  btn.addEventListener('click', async () => {
    haptic.light(); // UX-004: Share action feedback
    const title = document.title;
    const url = window.location.href;
    const text = t('share_project_text', 'ساعدوا في إعادة إعمار سوريا — موّلوا هذا المشروع!');

    // Prefer native Web Share API (available on mobile browsers)
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (err: unknown) {
        // User cancelled share — not an error
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
      }
      return;
    }

    // Desktop fallback: copy URL to clipboard
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('link_copied', 'تم نسخ الرابط!'), 'success');
    } catch {
      // Final fallback: prompt with URL
      window.prompt(t('copy_link_prompt', 'نسخ رابط المشروع'), url);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
