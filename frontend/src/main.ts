// ============================================================================
// Nammerha — Dashboard (index) entry point
// P1-001 FIX: Dynamic data loading from API — no more hardcoded demo data
// ============================================================================
import './styles/main.css';
import './styles/offline.css';
import './styles/tour.css';
import { initErrorReporter, reportWarning } from './error-reporter';
import { getCurrentUser } from './auth';
import { renderCartBadge } from './components/cart';
// P2-PERF-ROLE FIX: Role-switcher is now lazy-imported below, only when needed
import { marketplace, openData } from './api';
import { escapeHtml } from './utils/xss';
import { formatCents } from './utils/format';
import { registerServiceWorker } from './offline/sw-register';
import './offline/network-status';  // Self-injecting: bilingual offline status bar
import './utils/cart-sync';          // INC-N05 FIX: Cross-page cart badge sync via Storage API
import { autoTriggerTour } from './components/tour-engine';
// P2-I18N-TIMING FIX: Explicit applyI18n call after dynamic card injection
import { applyI18n } from './utils/locale';
import { initSearch } from './utils/search-overlay';
import { initNotificationPanel } from './components/notification-panel';
import { initPrefetchEngine } from './utils/prefetch-engine';

import { signalHydrated } from './utils/hydration';
// GAP-O2 PLATINUM FIX: Real User Monitoring — captures Core Web Vitals
// (LCP, FID, CLS, TTFB, INP) from actual Syrian field devices.
import { initRUM } from './utils/rum';

// PLT-AUDIT-007: Initialize error reporter EARLY — before any other module
// code runs — to capture initialization errors from downstream imports.
initErrorReporter();
initPrefetchEngine();
// GAP-O2: Initialize RUM after error reporter (non-blocking, production-only)
initRUM();


// Register Service Worker for offline capabilities (field operations)
registerServiceWorker();

// Launch interactive guided tour on first portal visit
autoTriggerTour();

// ─── Map Initialization (lazy-loaded) ───────────────────────────────────────
// PLT-OPT-001: Dynamic import — maplibre-gl (~800KB) is loaded ONLY on pages
// with a map container. Other pages (auth, wallet, profile, etc.) skip it entirely.
// The map module self-initializes on DOMContentLoaded.
async function initMapIfNeeded(): Promise<void> {
    if (document.getElementById('main-map') || document.getElementById('map') || document.getElementById('nammerha-map')) {
        // FRC-008 FIX: 5s timeout (was 15s — eternity on Syrian 2G).
        // Apple HIG: "Provide immediate feedback."
        const mapContainer = document.getElementById('main-map') ?? document.getElementById('map') ?? document.getElementById('nammerha-map');
        const fallbackTimer = setTimeout(() => {
            if (mapContainer && !mapContainer.querySelector('canvas')) {
                // Map didn't render within 5s — show fallback
                const overlay = mapContainer.closest('.relative')?.querySelector('.glass-card');
                if (overlay) {
                    // NMR-MAIN-001 FIX: Replaced inline onclick="location.reload()" with
                    // addEventListener for CSP compliance (script-src 'self').
                    // Previous: inline handler — blocked by CSP, making retry button dead.
                    // Standard: CONF-CSP-01 pattern, WHATWG CSP Level 3.
                    overlay.innerHTML = `
                        <div class="flex flex-col items-center gap-3 text-center p-4">
                            <i class="ph ph-map-trifold text-slate-400 nm-icon-40 dark:text-slate-500" aria-hidden="true"></i>
                            <p class="text-sm font-bold text-slate-600 dark:text-slate-400" data-i18n="map_unavailable">Map unavailable</p>
                            <p class="text-xs text-slate-400 dark:text-slate-500" data-i18n="map_network_issue">Network issues prevented the map from loading</p>
                            <button type="button" id="map-retry-btn" class="btn-secondary nm-btn-compact">
                                <i class="ph ph-arrow-clockwise" aria-hidden="true"></i>
                                <span data-i18n="common_retry">Retry</span>
                            </button>
                        </div>`;
                    overlay.querySelector('#map-retry-btn')?.addEventListener('click', () => { location.reload(); });
                    applyI18n();
                }
            }
        }, 5_000);

        try {
            await import('./pages/homepage-map');
            clearTimeout(fallbackTimer);
        } catch {
            clearTimeout(fallbackTimer);
            reportWarning('[Dashboard] Map module failed to load', { component: 'main', action: 'init_map' });
        }
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

// HIGH-001 FIX: formatCents() consolidated — single source of truth in utils/format.ts.
// Previously had an inline copy here (L53-63) that duplicated the canonical implementation.

function buildProjectCard(project: ProjectCard, index: number): string {
    const pct = Math.min(100, project.funded_percentage ?? 0);
    const damageIcons: Record<string, string> = {
        structural: 'house-line',
        plumbing: 'drop',
        electrical: 'lightning',
        mixed: 'wrench',
    };
    const icon = damageIcons[project.damage_type] ?? 'building-office';
    const delay = `--anim-delay:${index * 0.1}s`;

    // PLATINUM UX FIX: Strict typeguarding replaces unsafe `as unknown` hack
    const region = typeof (project as any).region === 'string' ? (project as any).region : '';
    
    // UXA-027 FIX: snap-start snap-always → magnetic card snapping during swipe.
    return `
    <div class="min-w-[280px] w-[280px] glass-card card-hover-lift rounded-2xl overflow-hidden shadow-md flex flex-col animate-fade-in-up snap-start snap-always" style="${delay}" data-project-title="${escapeHtml(project.title)}" data-project-region="${escapeHtml(region)}">
      <div class="relative h-44 overflow-hidden bg-gradient-to-br from-warm-earth/20 to-slate-200">
        ${project.cover_image_url
            ? `<img src="${escapeHtml(project.cover_image_url)}" class="absolute inset-0 w-full h-full object-cover" alt="${escapeHtml(project.title)}" fetchpriority="high" decoding="async" style="aspect-ratio: 16/9; background-color: #f1f5f9;" />`
            : `<div class="absolute inset-0 flex items-center justify-center"><i class="ph ph-${icon} text-warm-earth/60 nm-icon-48" aria-hidden="true"></i></div>`}
        <div class="absolute top-3 bg-white/90 backdrop-blur rounded-full px-2 py-1 flex items-center gap-1 shadow-sm nm-badge-pos-end dark:bg-[#1e1e1e]/90">
          <i class="ph ph-seal-check text-smoky-jade text-sm dark:text-emerald-400" aria-hidden="true"></i>
          <span class="text-3xs font-bold text-smoky-jade dark:text-emerald-400" data-i18n="verified_ocds">VERIFIED OCDS</span>
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
            <span class="absolute inset-0 flex items-center justify-center text-3xs font-extrabold text-smoky-jade dark:text-emerald-400">${Math.round(pct)}%</span>
          </div>
        </div>
        <div class="flex justify-between items-center mt-auto pt-3 border-t border-slate-100 dark:border-dark-border">
          <div>
            <p class="text-3xs text-slate-400 font-bold uppercase dark:text-slate-500" data-i18n="card_funded">Funded</p>
            <p class="text-sm font-bold text-trust-blue">${formatCents(project.funded_amount)}</p>
          </div>
          <!-- FRC-N04 FIX: Fund Now CTA upgraded from text-xs (12px) to text-sm (14px) font-bold.
               This is the primary revenue-critical action on a crowdfunding platform — needs prominence.
               Standard: Fitts's Law, Nielsen Heuristic #6 (Recognition). -->
          <a href="project-details.html?project=${project.project_id}" class="btn-secondary nm-cta-inline font-bold">
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
            // P2-I18N-TIMING FIX: Explicitly translate dynamic card content now,
            // don't rely solely on MutationObserver which may have timing gaps.
            applyI18n();
            // Store fallback in case of future network interruption
            try { sessionStorage.setItem('fallback_featured_projects', carousel.innerHTML); } catch (e) { /* ignore */ }
        } else {
            // NMR-AUD-H002 FIX: Show empty state instead of infinite skeleton.
            // Previous code kept the skeleton visible when API returned empty data.
            const skeleton = document.getElementById('projects-skeleton');
            const empty = document.getElementById('projects-empty');
            if (skeleton) { skeleton.remove(); }
            if (empty) { empty.classList.remove('hidden'); }
        }
    } catch (err) {
        reportWarning('[Dashboard] Featured projects load failed, keeping static fallback', { component: 'main', action: 'load_featured', error: err instanceof Error ? err.message : String(err) });
        // UXA-013 FIX: Show user-visible error state instead of infinite skeleton pulse.
        // PLATINUM UX FIX: Circuit Breaker - Render cached HTML if exists gracefully
        const cachedHtml = sessionStorage.getItem('fallback_featured_projects');
        const skeleton = document.getElementById('projects-skeleton');
        if (skeleton) { skeleton.remove(); }
        
        if (cachedHtml) {
            carousel.innerHTML = cachedHtml;
            reportWarning('[Dashboard] Featured projects loaded from Circuit Breaker Cache', { component: 'main', action: 'load_featured' });
            return;
        }

        carousel.innerHTML = `
            <div class="w-full py-8 text-center snap-start">
                <i class="ph ph-cloud-slash text-slate-300 nm-icon-40" aria-hidden="true"></i>
                <p class="text-slate-400 text-sm mt-2 font-medium dark:text-slate-500" data-i18n="projects_load_failed">Couldn't load projects</p>
                <p class="text-slate-400/60 text-xs mt-1" data-i18n="projects_load_retry_hint">Check your connection and try again</p>
                <button type="button" id="projects-retry-btn" class="btn-secondary nm-btn-compact mt-3">
                    <i class="ph ph-arrow-clockwise" aria-hidden="true"></i>
                    <span data-i18n="common_retry">Retry</span>
                </button>
            </div>`;
        document.getElementById('projects-retry-btn')?.addEventListener('click', () => {
            carousel.innerHTML = ''; // Clear error state
            const newSkeleton = document.createElement('div');
            newSkeleton.id = 'projects-skeleton';
            newSkeleton.className = 'flex gap-4';
            newSkeleton.innerHTML = '<div class="min-w-[280px] w-[280px] glass-card rounded-2xl overflow-hidden shadow-md animate-pulse snap-start snap-always"><div class="h-44 bg-slate-200"></div><div class="p-4 space-y-3"><div class="h-4 bg-slate-200 rounded w-3/4"></div><div class="h-3 bg-slate-200 rounded w-full"></div></div></div>';
            carousel.appendChild(newSkeleton);
            loadFeaturedProjects();
        });
        applyI18n();
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
    // GAP-2601 FIX: Signal hydration to cancel load-guard.js banner.
    // Promise.allSettled ensures we signal even if one API fails.
    Promise.allSettled([
        loadFeaturedProjects(),
        loadStats(),
    ]).then(() => {
        signalHydrated();
    });
    
    // IMP-015: Init interactive notification UI globally
    initNotificationPanel();

    // P2-UX-001 FIX: Hide role-restricted Quick Actions for non-matching users
    filterQuickActionsByRole();

    // G-001 FIX: Wire search input to navigate to project discovery page.
    // Previous: search input was a complete dead end — no handler, no feedback.
    initSearchInput();

    // PLT-OPT-001: Lazy-load map module only when map container exists
    initMapIfNeeded();

    // P2-PERF-ROLE FIX: Lazy-load role-switcher only for authenticated users with mount point
    if (document.getElementById('role-switcher-mount') && getCurrentUser()) {
        import('./components/role-switcher').catch(() => { /* Non-critical — silent degrade */ });
    }

    // F-001 FIX: Progressive disclosure — sections reveal as they scroll into view
    initScrollReveal();

    // FRC-005 FIX: Platform-wide search (Cmd/Ctrl+K)
    initSearch();
    
    // PLATINUM UX FIX: Dynamic Glass Nav Blur
    initGlassNavScroll();
}

function initGlassNavScroll(): void {
    const nav = document.querySelector('.glass-nav');
    if (!nav) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    }, { passive: true });
}

// ─── F-001 FIX: Progressive Disclosure via Scroll Reveal ─────────────────────
// Previous: all homepage content rendered at once (3-4 scrolls of content).
// Now: sections start invisible and smoothly reveal as they enter the viewport.
// PLATINUM UX FIX: WeakMap garbage collection prevents Memory Leaks.
// TDZ-FIX: Declaration moved BEFORE initDashboard() call to avoid
// ReferenceError when document.readyState !== 'loading' (synchronous init).
const observerRegistry = new WeakMap<HTMLElement, boolean>();

function initScrollReveal(): void {
    const sections = document.querySelectorAll<HTMLElement>('.scroll-reveal');
    if (sections.length === 0 || !('IntersectionObserver' in window)) {
        // Graceful degradation: show everything if IntersectionObserver not supported
        sections.forEach(el => { el.classList.add('scroll-revealed'); });
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !observerRegistry.has(entry.target as HTMLElement)) {
                entry.target.classList.add('scroll-revealed');
                observerRegistry.set(entry.target as HTMLElement, true);
                observer.unobserve(entry.target); // Only reveal once
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    sections.forEach(section => {
        if (!observerRegistry.has(section)) {
            observer.observe(section);
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

// ─── P2-UX-001: Role-Aware Quick Actions ─────────────────────────────────────
// Quick Action cards with `data-roles` are hidden when the authenticated user
// doesn't hold any of the specified roles. Unauthenticated users see all cards.
// P1-ROLE-271 FIX: Uses CSS class toggle (.role-granted) instead of inline
// style.display. CSS [data-roles] { display: none !important } is the canonical
// hide. .role-granted overrides it with display: flex !important.
// Previous: inline style.display = 'none' fought CSS !important — desync.
function filterQuickActionsByRole(): void {
    const user = getCurrentUser();
    // If not authenticated, show everything — user hasn't identified their role
    if (!user) { return; }

    const roleCards = document.querySelectorAll<HTMLElement>('[data-roles]');
    roleCards.forEach(card => {
        const allowedRoles = (card.dataset.roles ?? '').split(',').map(r => r.trim());
        const userHasRole = user.roles.some(r => allowedRoles.includes(r));
        if (userHasRole) {
            card.classList.add('role-granted');
        }
        // Non-matching roles stay hidden via CSS [data-roles] { display: none !important }
    });

    // P2-UX-001 FIX: Rebalance grid — if odd number visible, last item spans full width
    const grid = document.getElementById('quick-actions-grid');
    if (grid) {
        const visible = Array.from(grid.children).filter(
            (el) => (el as HTMLElement).classList.contains('role-granted')
        );
        if (visible.length % 2 === 1 && visible.length > 0) {
            (visible[visible.length - 1] as HTMLElement).classList.add('col-span-2');
        }
    }
}

// ─── PLT-AUD-G003 FIX: Homepage Search Input ────────────────────────────────
// Previous: search redirected to project-details.html?q= which is a single-project
// detail page that ignores the ?q= parameter — a COMPLETE dead end.
// Now: performs client-side filtering of the featured projects carousel inline,
// keeping users on the homepage with immediate visual feedback.
function initSearchInput(): void {
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    if (!searchInput) { return; }

    function performSearch(): void {
        const input = searchInput;
        if (!input) { return; }
        const query = input.value.trim().toLowerCase();
        if (!query) {
            // Empty search — flash the input border to signal "type something"
            // DEF-FLASH-001 FIX: Replaced setTimeout + 2 Tailwind ring classes with CSS animation.
            // Previous: add('ring-2', 'ring-red-400/50') + setTimeout(remove, 800) — timing hack.
            // Standard: P1-SST-001 governance, CSS-driven animation, zero setTimeout.
            input.classList.add('nm-input-flash-error');
            input.addEventListener('animationend', () => {
                input.classList.remove('nm-input-flash-error');
            }, { once: true });
            return;
        }

        // Filter featured project cards inline
        const carousel = document.getElementById('projects-carousel');
        if (!carousel) { return; }

        const cards = Array.from(carousel.querySelectorAll<HTMLElement>('[data-project-title]'));
        let matchCount = 0;

        cards.forEach((card) => {
            const title = (card.dataset.projectTitle ?? '').toLowerCase();
            const region = (card.dataset.projectRegion ?? '').toLowerCase();
            const matches = title.includes(query) || region.includes(query);
            // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
            card.classList.toggle('nm-hidden', !matches);
            if (matches) { matchCount++; }
        });

        // Show/hide no-results message
        let noResults = carousel.querySelector<HTMLElement>('.search-no-results');
        if (matchCount === 0) {
            if (!noResults) {
                noResults = document.createElement('div');
                noResults.className = 'search-no-results text-center py-8 text-slate-400 w-full';
                noResults.innerHTML = `
                    <i class="ph ph-magnifying-glass nm-icon-32" aria-hidden="true"></i>
                    <p class="mt-2 text-sm font-medium" data-i18n="search_no_results">No projects match your search</p>`;
                carousel.appendChild(noResults);
            }
            noResults.classList.remove('nm-hidden');
        } else if (noResults) {
            noResults.classList.add('nm-hidden');
        }

        // Scroll to carousel section
        const section = carousel.closest('section') ?? carousel.parentElement;
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Clear search filter when input is emptied
    function resetFilter(): void {
        const carousel = document.getElementById('projects-carousel');
        if (!carousel) { return; }
        carousel.querySelectorAll<HTMLElement>('[data-project-title]').forEach((c) => {
            // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
            c.classList.remove('nm-hidden');
        });
        const noResults = carousel.querySelector<HTMLElement>('.search-no-results');
        if (noResults) { noResults.classList.add('nm-hidden'); }
    }

    searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch();
        }
    });

    searchInput.addEventListener('input', () => {
        if (!searchInput.value.trim()) { resetFilter(); }
    });
}
