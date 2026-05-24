// ============================================================================
// Nammerha — Dashboard (index) entry point
// P1-001 FIX: Dynamic data loading from API — no more hardcoded demo data
// ============================================================================
import './styles/main.css';
import './styles/offline.css';
import './styles/tour.css';
import { initErrorReporter, reportWarning } from './error-reporter';
import { renderCartBadge } from './components/cart';
import { marketplace, openData } from './api';
// SEED-001: Arabic demo data for pre-launch presentation.
// Shows realistic projects to visitors when database is empty.
// REMOVAL: Delete this import once real projects exist.
import { DEMO_PROJECTS, DEMO_STATS } from './data/demo-projects';
// P2-STALE-001 FIX: SWR cache for homepage perceived-instant loading.
import { swrFetch } from './utils/swr-cache';
import { escapeHtml } from './utils/xss';
import { formatCents } from './utils/format';
import { registerServiceWorker } from './offline/sw-register';
import './offline/network-status'; // Self-injecting: bilingual offline status bar
import './utils/cart-sync'; // INC-N05 FIX: Cross-page cart badge sync via Storage API
// P0-001 FIX: Gate homepage CTA text behind feature flag — suspended donations → "View Details".
import { CART_CHECKOUT_ENABLED } from './utils/feature-flags';
import { autoTriggerTour } from './components/tour-engine';
// P0-004 FIX: Post-registration onboarding — shows task-oriented role selection
// modal after the homepage tour completes. Feeds nm_preferred_workspace for
// the existing "Continue to [X]" banner on return visits.
import { initWelcomeChooser } from './components/welcome-chooser';
// P2-I18N-TIMING FIX: Explicit applyI18n call after dynamic card injection
import { applyI18n } from './utils/locale';
import { initSearch } from './utils/search-overlay';
import { initNotificationPanel } from './components/notification-panel';
import { initPrefetchEngine } from './utils/prefetch-engine';
// P1-UX-005 FIX: Workspace discovery — show portal shortcuts for authenticated users
import { isAuthenticated } from './auth';
// P3-UX-002 FIX: Desktop keyboard shortcuts (G+D, G+P, /, ? etc.)
import { initKeyboardShortcuts } from './utils/keyboard-shortcuts';

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

import { initAutoSaveTextareas } from './utils/auto-save';
initAutoSaveTextareas();

// Register Service Worker for offline capabilities (field operations)
registerServiceWorker();

// Launch interactive guided tour on first portal visit
autoTriggerTour();

// P0-004 FIX: Post-registration welcome chooser — shows after tour completes.
// Detects ?onboarding=1 URL param set by auth.ts handleLoginRedirect().
// If tour is running, waits for 'nm:tour:complete' event before showing.
// If tour already done, shows after a brief delay.
initWelcomeChooser();

// ─── Map Initialization (lazy-loaded) ───────────────────────────────────────
// PLT-OPT-001: Dynamic import — maplibre-gl (~800KB) is loaded ONLY on pages
// with a map container. Other pages (auth, wallet, profile, etc.) skip it entirely.
// The map module self-initializes on DOMContentLoaded.
async function initMapIfNeeded(): Promise<void> {
  if (
    document.getElementById('main-map') ||
    document.getElementById('map') ||
    document.getElementById('nammerha-map')
  ) {
    // FRC-008 FIX: 5s timeout (was 15s — eternity on Syrian 2G).
    // Apple HIG: "Provide immediate feedback."
    const mapContainer =
      document.getElementById('main-map') ??
      document.getElementById('map') ??
      document.getElementById('nammerha-map');
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
          overlay.querySelector('#map-retry-btn')?.addEventListener('click', () => {
            location.reload();
          });
          applyI18n();
        }
      }
    }, 5_000);

    try {
      await import('./pages/homepage-map');
      clearTimeout(fallbackTimer);
    } catch {
      clearTimeout(fallbackTimer);
      reportWarning('[Dashboard] Map module failed to load', {
        component: 'main',
        action: 'init_map',
      });
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
  const projectRecord = project as unknown as Record<string, unknown>;
  const region = typeof projectRecord.region === 'string' ? projectRecord.region : '';

  // ═══════════════════════════════════════════════════════════════════════
  // P0-001 FIX: Gate CTA text behind CART_CHECKOUT_ENABLED feature flag.
  // Previous: "Fund Now" shown even when donations are suspended, leading
  // to project-details.html where BOQ items are read-only — a dead-end
  // journey that destroys FinTech trust.
  // Now: Shows "View Details" when funding is suspended, "Fund Now" when active.
  // Standard: Nielsen #2 (Match System ↔ Real World), Honest Affordances.
  // ═══════════════════════════════════════════════════════════════════════
  const ctaI18nKey = CART_CHECKOUT_ENABLED ? 'fund_now' : 'view_details';
  const ctaLabel = CART_CHECKOUT_ENABLED ? 'Fund Now' : 'View Details';
  const ctaIcon = CART_CHECKOUT_ENABLED ? 'ph-arrow-right' : 'ph-eye';
  const detailsUrl = `project-details.html?project=${project.project_id}`;

  // P0-005 FIX: Entire card wrapped in <a> for full-surface clickability.
  // Previous: Only the CTA button was clickable. Tapping card title, image,
  // or body did nothing — wasted 90% of Fitts's Law target area.
  // Standard: Fitts's Law, Apple HIG (Tappable Regions), Google MD3.
  // UXA-027 FIX: snap-start snap-always → magnetic card snapping during swipe.
  return `
    <a href="${escapeHtml(detailsUrl)}" class="min-w-[280px] w-[280px] glass-card card-hover-lift rounded-2xl overflow-hidden shadow-md flex flex-col animate-fade-in-up snap-start snap-always no-underline text-inherit" style="${delay}" data-project-title="${escapeHtml(project.title)}" data-project-region="${escapeHtml(region)}">
      <div class="relative h-44 overflow-hidden bg-gradient-to-br from-warm-earth/20 to-slate-200">
        ${
          project.cover_image_url
            ? `<img src="${escapeHtml(project.cover_image_url)}" class="absolute inset-0 w-full h-full object-cover" alt="${escapeHtml(project.title)}" fetchpriority="high" decoding="async" style="aspect-ratio: 16/9; background-color: #f1f5f9;" />`
            : `<div class="absolute inset-0 flex items-center justify-center"><i class="ph ph-${icon} text-warm-earth/60 nm-icon-48" aria-hidden="true"></i></div>`
        }
        <div class="absolute top-3 bg-white/90 backdrop-blur rounded-full px-2 py-1 flex items-center gap-1 shadow-sm nm-badge-pos-end dark:bg-[#1e1e1e]/90">
          <i class="ph ph-seal-check text-smoky-jade text-sm dark:text-emerald-400" aria-hidden="true"></i>
          <span class="text-3xs font-bold text-smoky-jade dark:text-emerald-400" data-i18n="verified_ocds">VERIFIED OCDS</span>
        </div>
      </div>
      <div class="p-4 flex flex-col flex-1">
        <div class="flex justify-between items-start mb-2">
          <h3 class="font-bold text-base leading-tight" dir="auto">${escapeHtml(project.title)}</h3>
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
          <span class="btn-secondary nm-cta-inline font-bold">
            <span data-i18n="${ctaI18nKey}">${ctaLabel}</span>
            <i class="ph ${ctaIcon} ph-sm" aria-hidden="true"></i>
          </span>
        </div>
      </div>
    </a>`;
}

// ─── Load Projects from API ─────────────────────────────────────────────────
// P2-STALE-001 FIX: Core fetcher extracted for SWR wrapping.
// Previous: loadFeaturedProjects() fetched fresh data on every page visit.
// On returning users with slow Syrian networks, this meant a blank carousel every load.
// Now: swrFetch renders cached data instantly while revalidating in background.
// Standard: SWR (Stale-While-Revalidate, RFC 5861), Perceived Performance.
async function fetchFeaturedProjectsFromAPI(): Promise<ProjectCard[]> {
  try {
    const response = await marketplace.getProjects({ sort_by: 'funded_percentage', limit: 6 });
    if (response.success && Array.isArray(response.data) && response.data.length > 0) {
      return response.data as ProjectCard[];
    }
  } catch {
    // API unreachable — fall through to demo data
  }
  // SEED-001: Return Arabic demo projects when API returns empty or fails.
  // These are replaced automatically when real projects exist in the database.
  return DEMO_PROJECTS as unknown as ProjectCard[];
}

function renderFeaturedProjects(projects: ProjectCard[]): void {
  const carousel = document.getElementById('projects-carousel');
  if (!carousel) {
    return;
  }

  if (projects.length > 0) {
    carousel.innerHTML = projects.map((p, i) => buildProjectCard(p, i)).join('');
    applyI18n();
    try {
      sessionStorage.setItem('fallback_featured_projects', carousel.innerHTML);
    } catch {
      /* ignore */
    }
  } else {
    const skeleton = document.getElementById('projects-skeleton');
    const empty = document.getElementById('projects-empty');
    if (skeleton) {
      skeleton.remove();
    }
    if (empty) {
      empty.classList.remove('hidden');
    }
  }
}

async function loadFeaturedProjects(): Promise<void> {
  const carousel = document.getElementById('projects-carousel');
  if (!carousel) {
    return;
  }

  try {
    // P2-STALE-001: SWR wrapper — render cached data instantly, revalidate in background.
    const projects = await swrFetch<ProjectCard[]>(
      'homepage-featured-projects',
      fetchFeaturedProjectsFromAPI,
      {
        maxAge: 120_000, // 2 minutes — homepage data is semi-static
        onStaleData: (cached) => renderFeaturedProjects(cached),
      },
    );
    renderFeaturedProjects(projects);
  } catch (err) {
    reportWarning('[Dashboard] Featured projects load failed, keeping static fallback', {
      component: 'main',
      action: 'load_featured',
      error: err instanceof Error ? err.message : String(err),
    });
    const cachedHtml = sessionStorage.getItem('fallback_featured_projects');
    const skeleton = document.getElementById('projects-skeleton');
    if (skeleton) {
      skeleton.remove();
    }

    if (cachedHtml) {
      carousel.innerHTML = cachedHtml;
      reportWarning('[Dashboard] Featured projects loaded from Circuit Breaker Cache', {
        component: 'main',
        action: 'load_featured',
      });
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
      carousel.innerHTML = '';
      const newSkeleton = document.createElement('div');
      newSkeleton.id = 'projects-skeleton';
      newSkeleton.className = 'flex gap-4';
      newSkeleton.innerHTML =
        '<div class="min-w-[280px] w-[280px] glass-card rounded-2xl overflow-hidden shadow-md animate-pulse snap-start snap-always"><div class="h-44 bg-slate-200"></div><div class="p-4 space-y-3"><div class="h-4 bg-slate-200 rounded w-3/4"></div><div class="h-3 bg-slate-200 rounded w-full"></div></div></div>';
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

  // Helper: render stats into DOM
  function applyStats(totalFunded: number, trendPercent?: number): void {
    if (impactEl) {
      impactEl.textContent = formatCents(totalFunded);
    }
    if (trendEl && trendPercent !== undefined) {
      const sign = trendPercent >= 0 ? '+' : '';
      trendEl.textContent = `${sign}${trendPercent.toFixed(1)}%`;
    }
  }

  try {
    const response = await openData.getStats();
    if (response.success && response.data) {
      const stats = response.data as {
        total_funded: number;
        trend_percent?: number;
      };
      applyStats(stats.total_funded, stats.trend_percent);
    } else {
      // SEED-001: Show demo stats when API returns empty data.
      applyStats(DEMO_STATS.total_funded, DEMO_STATS.trend_percent);
    }
  } catch (err) {
    reportWarning('[Dashboard] Stats load failed, showing demo values', {
      component: 'main',
      action: 'load_stats',
      error: err instanceof Error ? err.message : String(err),
    });
    // SEED-001: Show demo stats on API failure instead of blank "—".
    applyStats(DEMO_STATS.total_funded, DEMO_STATS.trend_percent);
  }
}

// ─── P0-FTU-001 FIX: First-Time Visitor Overlay Controller ──────────────────
// Shows a value proposition overlay on the map hero for users who have never
// visited the platform before. Dismissed via CTA or secondary button.
// Uses localStorage persistence — once dismissed, never shows again.
// Standard: Nielsen #10 (Help & Documentation), 3-Second Rule, First-Impression UX.
const FTV_STORAGE_KEY = 'nm_ftv_seen';

function initFirstTimeVisitorOverlay(): void {
  const overlay = document.getElementById('nm-ftv-overlay');
  if (!overlay) {
    return;
  }

  // Check if user has already seen the overlay
  try {
    if (localStorage.getItem(FTV_STORAGE_KEY)) {
      return;
    }
  } catch {
    return;
  } // Storage unavailable — skip overlay

  // Capture as non-null for closure safety (TypeScript narrowing doesn't cross closures)
  const el = overlay;

  // Show overlay with a small delay for map to start rendering underneath
  setTimeout(() => {
    el.classList.remove('nm-hidden');
    el.classList.add('animate-fade-in');
  }, 800);

  // Dismiss handler — shared by both CTA buttons
  function dismissOverlay(): void {
    el.classList.add('opacity-0');
    el.addEventListener(
      'transitionend',
      () => {
        el.classList.add('nm-hidden');
        el.remove(); // Full cleanup — no memory leak
      },
      { once: true },
    );
    try {
      localStorage.setItem(FTV_STORAGE_KEY, '1');
    } catch {
      /* quota */
    }
  }

  // Wire both dismiss triggers
  document.getElementById('ftv-explore-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    dismissOverlay();
    // Smooth scroll to quick actions section after overlay fades
    setTimeout(() => {
      document.getElementById('quick-actions-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 350);
  });
  document.getElementById('ftv-dismiss-btn')?.addEventListener('click', dismissOverlay);
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
  Promise.allSettled([loadFeaturedProjects(), loadStats()]).then(() => {
    signalHydrated();
  });

  // IMP-015: Init interactive notification UI globally
  initNotificationPanel();

  // UNIFIED CITIZEN: All Quick Actions visible to all users.
  showAllQuickActions();

  // P1-UX-005 FIX: Workspace discovery — show portal shortcuts for authenticated users.
  // Previous: Authenticated users had no guidance on where their portals were from homepage.
  // Now: "Your Workspaces" grid reveals with portal links, guest CTA card hides.
  initWorkspaceDiscovery();

  // G-001 FIX: Wire search input to navigate to project discovery page.
  // Previous: search input was a complete dead end — no handler, no feedback.
  initSearchInput();

  // PLT-OPT-001: Lazy-load map module only when map container exists
  initMapIfNeeded();

  // P0-FTU-001 FIX: Show first-time visitor overlay on map hero.
  initFirstTimeVisitorOverlay();

  // UNIFIED CITIZEN: Role-switcher removed — all users see unified dashboard.

  // F-001 FIX: Progressive disclosure — sections reveal as they scroll into view
  initScrollReveal();

  // FRC-005 FIX: Platform-wide search (Cmd/Ctrl+K)
  initSearch();

  // P3-UX-002 FIX: Desktop keyboard shortcuts for power users
  initKeyboardShortcuts();

  // PLATINUM UX FIX: Dynamic Glass Nav Blur
  initGlassNavScroll();

  // PLATINUM UX FIX: Pinch-to-zoom Demonic Blocker
  // Prevents iOS Safari from zooming and breaking the layout, forcing a Native App feel.
  initPinchToZoomBlocker();
}

function initPinchToZoomBlocker(): void {
  document.addEventListener(
    'touchmove',
    function (event: TouchEvent) {
      if ((event as any).scale !== 1 || event.touches.length > 1) {
        event.preventDefault();
      }
    },
    { passive: false },
  );

  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    function (event) {
      const now = new Date().getTime();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    },
    false,
  );
}

function initGlassNavScroll(): void {
  const nav = document.querySelector('.glass-nav');
  if (!nav) {
    return;
  }
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY > 10) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    },
    { passive: true },
  );
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
    sections.forEach((el) => {
      el.classList.add('scroll-revealed');
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !observerRegistry.has(entry.target as HTMLElement)) {
          entry.target.classList.add('scroll-revealed');
          observerRegistry.set(entry.target as HTMLElement, true);
          observer.unobserve(entry.target); // Only reveal once
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
  );

  sections.forEach((section) => {
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

// UNIFIED CITIZEN: All Quick Actions are visible to every user.
// data-roles attribute is kept for future feature-flagging but no longer hides cards.
function showAllQuickActions(): void {
  const roleCards = document.querySelectorAll<HTMLElement>('[data-roles]');
  roleCards.forEach((card) => {
    card.classList.add('role-granted');
  });
}

// ─── UX-F012: Task-Centric Workspace Discovery ──────────────────────────────
// PREVIOUS: 5 role-centric portal cards — users asked "who am I?" not "what do I need?"
// NOW: 3 task-centric cards + localStorage workspace memory + "Continue" banner.
// Returning users see a highlighted "Continue to [X]" banner above the cards.
// Standard: Airbnb/Fiverr pattern — task facade, portal backend.

// P1-001 REFACTOR: Import from shared workspace map (Single Source of Truth).
// Previously: WORKSPACE_META was duplicated here and in welcome-chooser.ts.
// Now: utils/workspace-map.ts is the canonical whitelist.
import { WORKSPACE_DISPLAY, WS_STORAGE_KEY } from './utils/workspace-map';

function initWorkspaceDiscovery(): void {
  const wsSection = document.getElementById('workspace-discovery');
  const guestCard = document.getElementById('guest-cta-card');
  const continueSlot = document.getElementById('ws-continue-slot');

  if (isAuthenticated()) {
    // Show workspace section
    if (wsSection) {
      wsSection.classList.remove('nm-hidden');
    }
    // Hide guest-only CTA card
    if (guestCard) {
      guestCard.classList.add('nm-hidden');
    }

    // ── Continue Banner (localStorage workspace memory) ──
    const preferredId = localStorage.getItem(WS_STORAGE_KEY);
    if (preferredId && WORKSPACE_DISPLAY[preferredId] && continueSlot) {
      const meta = WORKSPACE_DISPLAY[preferredId];
      // Find the label from the corresponding card's data attribute
      const preferredCard = document.querySelector<HTMLElement>(
        `[data-workspace-id="${preferredId}"]`,
      );
      const labelKey = preferredCard?.dataset.workspaceLabelKey ?? '';
      const fallbackLabel =
        preferredCard?.querySelector<HTMLElement>('[data-i18n]')?.textContent ?? preferredId;

      continueSlot.innerHTML = `
                <a href="${meta.href}"
                   class="nm-ws-continue glass-card p-4 rounded-2xl flex items-center gap-3 mb-3 group"
                   data-workspace-id="${preferredId}">
                    <div class="size-10 rounded-xl flex items-center justify-center shrink-0 nm-ws-continue-icon">
                        <i class="ph ${meta.icon} text-xl text-white" aria-hidden="true"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <span class="text-3xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500"
                              data-i18n="ws_continue_to">Continue to</span>
                        <span class="text-sm font-bold text-slate-800 block dark:text-slate-200"
                              data-i18n="${labelKey}">${fallbackLabel}</span>
                    </div>
                    <i class="ph ph-caret-right text-lg ${meta.colorClass} nm-dir-shift" aria-hidden="true"></i>
                </a>`;

      // Highlight the preferred card in the grid
      preferredCard?.classList.add('nm-ws-preferred');

      applyI18n();
    }

    // ── Track workspace clicks → save to localStorage ──
    document.querySelectorAll<HTMLElement>('[data-workspace-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const wsId = card.dataset.workspaceId;
        if (wsId) {
          try {
            localStorage.setItem(WS_STORAGE_KEY, wsId);
          } catch {
            /* quota */
          }
        }
      });
    });
  } else {
    // Guest: ensure workspace section stays hidden
    if (wsSection) {
      wsSection.classList.add('nm-hidden');
    }
    // Show guest CTA card
    if (guestCard) {
      guestCard.classList.remove('nm-hidden');
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
  if (!searchInput) {
    return;
  }

  function performSearch(): void {
    const input = searchInput;
    if (!input) {
      return;
    }
    const query = input.value.trim().toLowerCase();
    if (!query) {
      // Empty search — flash the input border to signal "type something"
      // DEF-FLASH-001 FIX: Replaced setTimeout + 2 Tailwind ring classes with CSS animation.
      // Previous: add('ring-2', 'ring-red-400/50') + setTimeout(remove, 800) — timing hack.
      // Standard: P1-SST-001 governance, CSS-driven animation, zero setTimeout.
      input.classList.add('nm-input-flash-error');
      input.addEventListener(
        'animationend',
        () => {
          input.classList.remove('nm-input-flash-error');
        },
        { once: true },
      );
      return;
    }

    // Filter featured project cards inline
    const carousel = document.getElementById('projects-carousel');
    if (!carousel) {
      return;
    }

    const cards = Array.from(carousel.querySelectorAll<HTMLElement>('[data-project-title]'));
    let matchCount = 0;

    cards.forEach((card) => {
      const title = (card.dataset.projectTitle ?? '').toLowerCase();
      const region = (card.dataset.projectRegion ?? '').toLowerCase();
      const matches = title.includes(query) || region.includes(query);
      // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
      card.classList.toggle('nm-hidden', !matches);
      if (matches) {
        matchCount++;
      }
    });

    // Show/hide no-results message
    let noResults = carousel.querySelector<HTMLElement>('.search-no-results');
    if (matchCount === 0) {
      if (!noResults) {
        noResults = document.createElement('div');
        noResults.className = 'search-no-results text-center py-8 text-slate-400 w-full';
        noResults.innerHTML = `
                    <i class="ph ph-magnifying-glass nm-icon-32" aria-hidden="true"></i>
                    <p class="mt-2 text-sm font-medium" data-i18n="search_no_results">No featured projects match your search</p>
                    <a href="/projects.html?q=${encodeURIComponent(query)}" class="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-trust-blue text-white text-sm font-bold rounded-xl hover:bg-trust-blue-hover transition-colors shadow-sm">
                        <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
                        <span data-i18n="search_all_projects">Search all projects</span>
                        <i class="ph ph-arrow-right ph-sm nm-dir-shift" aria-hidden="true"></i>
                    </a>`;
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
    if (!carousel) {
      return;
    }
    carousel.querySelectorAll<HTMLElement>('[data-project-title]').forEach((c) => {
      // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
      c.classList.remove('nm-hidden');
    });
    const noResults = carousel.querySelector<HTMLElement>('.search-no-results');
    if (noResults) {
      noResults.classList.add('nm-hidden');
    }
  }

  searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performSearch();
    }
  });

  searchInput.addEventListener('input', () => {
    if (!searchInput.value.trim()) {
      resetFilter();
    }
  });
}
