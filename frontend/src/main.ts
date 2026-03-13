// ============================================================================
// Nammerha — Dashboard (index) entry point
// P1-001 FIX: Dynamic data loading from API — no more hardcoded demo data
// ============================================================================
import './styles/main.css';
import { initErrorReporter, reportWarning } from './error-reporter';
import { renderCartBadge } from './components/cart';
import { marketplace, openData } from './api';
import { escapeHtml } from './utils/xss';

// PLT-AUDIT-007: Initialize error reporter EARLY — before any other module
// code runs — to capture initialization errors from downstream imports.
initErrorReporter();

// ─── Map Initialization (lazy-loaded) ───────────────────────────────────────
// PLT-OPT-001: Dynamic import — maplibre-gl (~800KB) is loaded ONLY on pages
// with a map container. Other pages (auth, wallet, profile, etc.) skip it entirely.
// The map module self-initializes on DOMContentLoaded.
async function initMapIfNeeded(): Promise<void> {
    if (document.getElementById('main-map') || document.getElementById('map') || document.getElementById('nammerha-map')) {
        await import('./pages/homepage-map');
    }
}

// ─── Project Card Template ──────────────────────────────────────────────────
interface ProjectCard {
    project_id: string;
    title: string;
    damage_type: string;
    funded_amount: number;
    total_budget: number;
    funded_percentage: number;
    cover_image_url?: string;
    ocds_id?: string;
    compliance_level?: string;
}

// LOW-AUD-003 FIX: Locale-aware currency formatting.
// NMR-PLT-004 FIX: Use active page locale instead of hardcoded 'en-US'.
// The i18n engine sets document.documentElement.lang on page load.
function formatCents(cents: number | null | undefined, currency = 'USD'): string {
    // MOB-002 FIX: Guard against null/undefined/NaN — API can return null for unfunded projects
    const safeCents = Number(cents) || 0;
    const locale = document.documentElement.lang || 'en-US';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(safeCents / 100);
}

function buildProjectCard(project: ProjectCard, index: number): string {
    const pct = Math.min(100, project.funded_percentage ?? 0);
    const damageIcons: Record<string, string> = {
        structural: 'house-line',
        plumbing: 'drop',
        electrical: 'lightning',
        mixed: 'wrench',
    };
    const icon = damageIcons[project.damage_type] ?? 'building-office';
    const delay = `animation-delay:${index * 0.1}s`;

    return `
    <div class="min-w-[280px] w-[280px] glass-card card-hover-lift rounded-2xl overflow-hidden shadow-md flex flex-col animate-fade-in-up" style="${delay}">
      <div class="relative h-44 overflow-hidden bg-gradient-to-br from-warm-earth/20 to-slate-200">
        ${project.cover_image_url
            ? `<img src="${escapeHtml(project.cover_image_url)}" class="absolute inset-0 w-full h-full object-cover" alt="${escapeHtml(project.title)}" loading="lazy" />`
            : `<div class="absolute inset-0 flex items-center justify-center"><i class="ph ph-${icon} text-warm-earth/60" style="font-size:48px" aria-hidden="true"></i></div>`}
        <div class="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-full px-2 py-1 flex items-center gap-1 shadow-sm">
          <i class="ph ph-seal-check text-smoky-jade" style="font-size:14px" aria-hidden="true"></i>
          <span class="text-[10px] font-bold text-smoky-jade" data-i18n="verified_ocds">VERIFIED OCDS</span>
        </div>
      </div>
      <div class="p-4 flex flex-col flex-1">
        <div class="flex justify-between items-start mb-2">
          <h3 class="font-bold text-base leading-tight">${escapeHtml(project.title)}</h3>
          <div class="relative size-10 shrink-0">
            <svg class="size-full -rotate-90" viewBox="0 0 36 36">
              <circle class="stroke-slate-200" cx="18" cy="18" r="16" fill="none" stroke-width="3"></circle>
              <circle class="stroke-smoky-jade" cx="18" cy="18" r="16" fill="none" stroke-width="3"
                stroke-dasharray="${(pct / 100) * 100.53} ${100.53 - (pct / 100) * 100.53}" stroke-linecap="round"></circle>
            </svg>
            <span class="absolute inset-0 flex items-center justify-center text-[9px] font-extrabold text-smoky-jade">${Math.round(pct)}%</span>
          </div>
        </div>
        <div class="flex justify-between items-center mt-auto pt-3 border-t border-slate-100">
          <div>
            <p class="text-[10px] text-slate-400 font-bold uppercase" data-i18n="card_funded">Funded</p>
            <p class="text-sm font-bold text-trust-blue">${formatCents(project.funded_amount)}</p>
          </div>
          <a href="project-details.html?project=${project.project_id}" class="btn-secondary !w-auto !px-4 !py-2 !text-xs">
            <span data-i18n="fund_now">Fund Now</span>
            <i class="ph ph-arrow-right ph-sm" aria-hidden="true"></i>
          </a>
        </div>
      </div>
    </div>`;
}

// ─── Load Projects from API ─────────────────────────────────────────────────
async function loadFeaturedProjects(): Promise<void> {
    const carousel = document.getElementById('projects-carousel');
    if (!carousel) { return; }

    try {
        const response = await marketplace.getProjects({ sort_by: 'funded_percentage', limit: 6 });
        if (response.success && Array.isArray(response.data) && response.data.length > 0) {
            carousel.innerHTML = (response.data as ProjectCard[])
                .map((p, i) => buildProjectCard(p, i))
                .join('');
        }
        // If API returns empty or fails, keep the static HTML fallback
    } catch (err) {
        reportWarning('[Dashboard] Featured projects load failed, keeping static fallback', { component: 'main', action: 'load_featured', error: err instanceof Error ? err.message : String(err) });
    }
}

// ─── Load Stats from API ────────────────────────────────────────────────────
async function loadStats(): Promise<void> {
    const impactEl = document.getElementById('total-impact-value');
    const trendEl = document.getElementById('impact-trend');

    try {
        const response = await openData.getStats();
        if (response.success && response.data) {
            const stats = response.data as {
                total_funded: number;
                trend_percent?: number;
            };
            if (impactEl) {
                impactEl.textContent = formatCents(stats.total_funded);
            }
            if (trendEl && stats.trend_percent !== undefined) {
                const sign = stats.trend_percent >= 0 ? '+' : '';
                trendEl.textContent = `${sign}${stats.trend_percent.toFixed(1)}%`;
            }
        }
    } catch (err) {
        reportWarning('[Dashboard] Stats load failed, keeping default values', { component: 'main', action: 'load_stats', error: err instanceof Error ? err.message : String(err) });
    }
}

// ─── Initialize ─────────────────────────────────────────────────────────────
function initDashboard(): void {
    // Render cart badge count in navbar
    const cartBadge = document.getElementById('nav-cart-badge');
    renderCartBadge(cartBadge);

    // Listen for cart updates from other pages
    window.addEventListener('cart:updated', () => {
        renderCartBadge(cartBadge);
    });

    // P1-001: Load dynamic data from API
    loadFeaturedProjects();
    loadStats();

    // PLT-OPT-001: Lazy-load map module only when map container exists
    initMapIfNeeded();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

