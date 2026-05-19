// ============================================================================
// Nammerha — Portal Context Switcher (Self-Injecting Component)
// P0-UXA-004 FIX: Solves the #1 architectural UX blocker — fragmented portal
// navigation. In the Universal Access paradigm, users have ALL roles but are
// trapped in whichever portal they opened. This component injects cross-portal
// navigation links into every portal's sidebar.
//
// Pattern: Self-Injecting Component (documented in KI: Nammerha Unified Frontend)
// Progressive Enhancement: Existing sidebar HTML is preserved as fallback.
// If this module fails to load (JS error, 2G timeout), the basic sidebar works.
// ============================================================================

import { t } from '../utils/i18n';
import { navigateWithTransition } from '../utils/view-transition';
// SYS-004 FIX: Dialog polyfill for older Android WebViews (Syria).
import { polyfillDialog } from '../utils/dialog-polyfill';

// ─── Portal Registry ────────────────────────────────────────────────────────
// Single source of truth for all user-facing portals.
// Icons use Phosphor class names. Accent colors use CSS custom property names.
interface PortalEntry {
  /** Unique portal identifier — matches `data-portal` attribute on <body> */
  id: string;
  /** Absolute path to the portal HTML page */
  path: string;
  /** Phosphor icon class (without `ph` prefix) e.g., 'ph-house' */
  icon: string;
  /** i18n translation key for the portal label */
  labelKey: string;
  /** Fallback label (English) if i18n engine hasn't loaded */
  labelFallback: string;
  /** Description key for subtitle */
  descKey: string;
  /** Fallback description */
  descFallback: string;
  /** CSS custom property for accent color (e.g., '--trust-blue') */
  accentVar: string;
  /** Hex fallback for the accent color */
  accentFallback: string;
}

const PORTAL_REGISTRY: readonly PortalEntry[] = [
  {
    id: 'homeowner',
    path: '/homeowner-portal.html',
    icon: 'ph-house',
    labelKey: 'ws_homeowner',
    labelFallback: 'My Home',
    descKey: 'ws_homeowner_desc',
    descFallback: 'Projects & service requests',
    accentVar: '--trust-blue',
    accentFallback: '#1558D6',
  },
  {
    id: 'contractor',
    path: '/contractor-portal.html',
    icon: 'ph-hard-hat',
    labelKey: 'ws_contractor',
    labelFallback: 'Contractor',
    descKey: 'ws_contractor_desc',
    descFallback: 'Bids & project management',
    accentVar: '--warm-earth',
    accentFallback: '#D59F80',
  },
  {
    id: 'engineer',
    path: '/engineer-portal.html',
    icon: 'ph-ruler',
    labelKey: 'ws_engineer',
    labelFallback: 'Engineer',
    descKey: 'ws_engineer_desc',
    descFallback: 'BOQ & field captures',
    accentVar: '--smoky-jade',
    accentFallback: '#0A6E55',
  },
  {
    id: 'tradesperson',
    path: '/tradesperson-portal.html',
    icon: 'ph-wrench',
    labelKey: 'ws_tradesperson',
    labelFallback: 'Tradesperson',
    descKey: 'ws_tradesperson_desc',
    descFallback: 'Jobs & earnings',
    accentVar: '--smoky-jade',
    accentFallback: '#0A6E55',
  },
  {
    id: 'supplier',
    path: '/supplier-dashboard.html',
    icon: 'ph-storefront',
    labelKey: 'ws_supplier',
    labelFallback: 'Supplier',
    descKey: 'ws_supplier_desc',
    descFallback: 'Material catalog & orders',
    accentVar: '--warning-yellow',
    accentFallback: '#FCC934',
  },
] as const;

// ─── Detect Current Portal ──────────────────────────────────────────────────
function detectCurrentPortal(): string | null {
  // Primary: explicit data-portal attribute on <body>
  const bodyAttr = document.body.dataset['portal'];
  if (bodyAttr) {
    return bodyAttr;
  }

  // Fallback: infer from URL pathname
  const path = window.location.pathname;
  for (const portal of PORTAL_REGISTRY) {
    if (path.endsWith(portal.path) || path.endsWith(portal.path.replace('/', ''))) {
      return portal.id;
    }
  }

  return null;
}

// ─── Resolve CSS Custom Property ────────────────────────────────────────────
function resolveColor(cssVar: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return value || fallback;
}

// ─── Prefetch Other Portals ─────────────────────────────────────────────────
// Injects <link rel="prefetch"> for other portals during browser idle time.
// Per HTML spec, prefetch is LOW priority — browsers on slow connections (2G)
// will skip these automatically. Zero bandwidth risk.
function prefetchPortals(currentPortalId: string): void {
  for (const portal of PORTAL_REGISTRY) {
    if (portal.id === currentPortalId) {
      continue;
    }

    // Skip if already prefetched
    if (document.querySelector(`link[rel="prefetch"][href="${portal.path}"]`)) {
      continue;
    }

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = portal.path;
    // as='document' tells the browser this is a full page navigation target
    link.setAttribute('as', 'document');
    document.head.appendChild(link);
  }
}

// ─── Render Context Switcher HTML ───────────────────────────────────────────
function renderContextSwitcher(currentPortalId: string): string {
  const links = PORTAL_REGISTRY.filter((p) => p.id !== currentPortalId)
    .map((portal) => {
      const color = resolveColor(portal.accentVar, portal.accentFallback);
      return `
            <a href="${portal.path}"
               class="nm-ctx-link"
               data-portal-target="${portal.id}"
               aria-label="${t(portal.labelKey, portal.labelFallback)}">
                <span class="nm-ctx-icon" style="--portal-accent:${color}">
                    <i class="ph ${portal.icon}" aria-hidden="true"></i>
                </span>
                <span class="nm-ctx-label">
                    <span class="nm-ctx-name" data-i18n="${portal.labelKey}">${portal.labelFallback}</span>
                    <span class="nm-ctx-desc" data-i18n="${portal.descKey}">${portal.descFallback}</span>
                </span>
            </a>`;
    })
    .join('');

  return `
    <div class="nm-ctx-switcher" role="navigation" aria-label="${t('ctx_switch_portals', 'تبديل البوابات')}">
        <p class="nm-ctx-header" data-i18n="ctx_other_workspaces">${t('ctx_other_workspaces', 'مساحات عمل أخرى')}</p>
        <div class="nm-ctx-list">
            ${links}
        </div>
    </div>`;
}

// ─── Wire Click Handlers (View Transitions) ─────────────────────────────────
function wireTransitionClicks(container: Element): void {
  const links = container.querySelectorAll<HTMLAnchorElement>('.nm-ctx-link');
  for (const link of links) {
    link.addEventListener('click', (e: Event) => {
      e.preventDefault();
      const href = (e.currentTarget as HTMLAnchorElement).getAttribute('href');
      if (href) {
        navigateWithTransition(href);
      }
    });
  }
}

// ─── Hub FAB + Bottom Sheet (Phase 2) ───────────────────────────────────────
// P0-UXA-004 Phase 2: Floating Action Button that opens a portal picker
// bottom sheet. Provides an additional mobile-friendly path to switch portals
// without needing to open the sidebar hamburger menu.
// Uses native <dialog> for built-in focus trap, ESC dismiss, and accessibility.

function renderHubSheet(currentPortalId: string): string {
  const cards = PORTAL_REGISTRY.map((portal) => {
    const isCurrent = portal.id === currentPortalId;
    const color = resolveColor(portal.accentVar, portal.accentFallback);
    const tag = isCurrent ? 'div' : 'a';
    const href = isCurrent ? '' : ` href="${portal.path}"`;
    const currentBadge = isCurrent
      ? `<span class="nm-hub-badge" data-i18n="ctx_current">${t('ctx_current', 'الحالي')}</span>`
      : '';

    return `
        <${tag}${href}
           class="nm-hub-card${isCurrent ? ' nm-hub-card--current' : ''}"
           ${isCurrent ? '' : `data-portal-target="${portal.id}"`}
           style="--hub-accent:${color}">
            <span class="nm-hub-card-icon" style="background:${color}15;color:${color}">
                <i class="ph ${portal.icon}" aria-hidden="true"></i>
            </span>
            <span class="nm-hub-card-name" data-i18n="${portal.labelKey}">${portal.labelFallback}</span>
            <span class="nm-hub-card-desc" data-i18n="${portal.descKey}">${portal.descFallback}</span>
            ${currentBadge}
        </${tag}>`;
  }).join('');

  return `
    <div class="nm-hub-grabber" aria-hidden="true"></div>
    <div class="nm-hub-header">
        <h2 class="nm-hub-title" data-i18n="ctx_workspaces">${t('ctx_workspaces', 'مساحات العمل')}</h2>
        <button type="button" class="nm-hub-close" aria-label="${t('common_close', 'إغلاق')}">
            <i class="ph ph-x" aria-hidden="true"></i>
        </button>
    </div>
    <div class="nm-hub-grid">
        ${cards}
    </div>`;
}

/**
 * F-004 FIX: Mount Hub FAB (Floating Action Button) for mobile portal switching.
 * Exported as a standalone function so non-portal pages (wallet, profile, project-details)
 * can also offer portal navigation without needing a dashboard sidebar.
 *
 * When `currentPortalId` is empty, no card gets the "active" highlight style —
 * all portals show as equal navigation targets.
 *
 * @param currentPortalId - The active portal ID (empty string for non-portal pages)
 */
export function mountHubFAB(currentPortalId: string): void {
  // Don't double-mount
  if (document.getElementById('nm-hub-fab')) {
    return;
  }

  // ── P1-003 FIX: First-Use Detection ──
  // Check if user has ever interacted with the FAB before.
  // If not, we'll add a pulse animation to draw attention.
  const FAB_USED_KEY = 'nm_hub_fab_used';
  let isFirstUse = false;
  try {
    isFirstUse = localStorage.getItem(FAB_USED_KEY) !== '1';
  } catch {
    /* noop */
  }

  // ── Create FAB Button ──
  const fab = document.createElement('button');
  fab.id = 'nm-hub-fab';
  fab.type = 'button';
  fab.className = 'nm-hub-fab';
  // P1-003 FIX: Add pulse class on first use — draws attention with
  // expanding ring animation (3 cycles, then stops). Removed on first click.
  if (isFirstUse) {
    fab.classList.add('nm-hub-fab--pulse');
  }
  fab.setAttribute('aria-label', t('ctx_switch_portals', 'تبديل البوابات'));
  fab.setAttribute('data-haptic', 'tap');
  fab.innerHTML = '<i class="ph ph-squares-four" aria-hidden="true"></i>';
  document.body.appendChild(fab);

  // ── Create Dialog (Bottom Sheet) ──
  const dialog = document.createElement('dialog');
  dialog.id = 'nm-hub-sheet';
  dialog.className = 'nm-hub-sheet';
  dialog.innerHTML = renderHubSheet(currentPortalId);
  document.body.appendChild(dialog);

  // ── Wire FAB Click → Open Sheet ──
  fab.addEventListener('click', () => {
    // P1-003 FIX: On first click, stop the pulse and mark as used.
    if (fab.classList.contains('nm-hub-fab--pulse')) {
      fab.classList.remove('nm-hub-fab--pulse');
      try {
        localStorage.setItem(FAB_USED_KEY, '1');
      } catch {
        /* quota */
      }
    }

    if (!dialog.open) {
      // SYS-004: Polyfill for older browsers before calling showModal().
      polyfillDialog(dialog);
      dialog.showModal();
      // Trigger entrance animation
      requestAnimationFrame(() => {
        dialog.classList.add('nm-hub-sheet--open');
      });
    }
  });

  // ── Wire Close Button ──
  const closeBtn = dialog.querySelector('.nm-hub-close');
  closeBtn?.addEventListener('click', () => closeSheet());

  // ── Wire Backdrop Click ──
  dialog.addEventListener('click', (e: MouseEvent) => {
    if (e.target === dialog) {
      closeSheet();
    }
  });

  // ── Wire Portal Links (View Transitions) ──
  const portalLinks = dialog.querySelectorAll<HTMLAnchorElement>('a[data-portal-target]');
  for (const link of portalLinks) {
    link.addEventListener('click', (e: Event) => {
      e.preventDefault();
      const href = (e.currentTarget as HTMLAnchorElement).getAttribute('href');
      if (href) {
        closeSheet();
        // Small delay for close animation before navigating
        setTimeout(() => navigateWithTransition(href), 150);
      }
    });
  }

  // ── Close Sheet Helper ──
  function closeSheet(): void {
    dialog.classList.remove('nm-hub-sheet--open');
    // Wait for exit animation before actually closing
    setTimeout(() => {
      if (dialog.open) {
        dialog.close();
      }
    }, 200);
  }

  // ── Swipe-to-Dismiss (Touch Gesture) ──
  let touchStartY = 0;
  let touchDeltaY = 0;
  const sheetContent = dialog;

  sheetContent.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) {
        return;
      }
      touchStartY = touch.clientY;
      touchDeltaY = 0;
    },
    { passive: true },
  );

  sheetContent.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) {
        return;
      }
      touchDeltaY = touch.clientY - touchStartY;
      // Only allow downward swipe for dismiss
      if (touchDeltaY > 0) {
        // Visual feedback: translate the sheet down as user swipes
        const inner = dialog.querySelector('.nm-hub-grid');
        if (inner) {
          (inner as HTMLElement).style.transform =
            `translateY(${Math.min(touchDeltaY * 0.5, 100)}px)`;
        }
      }
    },
    { passive: true },
  );

  sheetContent.addEventListener(
    'touchend',
    () => {
      const inner = dialog.querySelector('.nm-hub-grid');
      if (inner) {
        (inner as HTMLElement).style.transform = '';
      }
      // If user swiped down more than 80px, dismiss
      if (touchDeltaY > 80) {
        closeSheet();
      }
      touchDeltaY = 0;
    },
    { passive: true },
  );
}

// ─── Mount (Public API) ─────────────────────────────────────────────────────
/**
 * Mount the context switcher into the current portal's sidebar,
 * AND the Hub FAB (floating action button) for mobile portal switching.
 * Call this inside DOMContentLoaded after auth guard passes.
 *
 * Progressive Enhancement:
 * - Detects the current portal from `data-portal` on <body> or URL
 * - Injects context switcher between sidebar header and tab navigation
 * - Injects Hub FAB at bottom-start corner for quick mobile switching
 * - Prefetches other portal pages during idle time
 * - Wires View Transitions API for smooth cross-portal navigation
 *
 * If detection fails (e.g., not on a portal page), silently returns.
 */
export function mountContextSwitcher(): void {
  const currentPortalId = detectCurrentPortal();
  if (!currentPortalId) {
    return;
  }

  const sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) {
    return;
  }

  // Find injection point: between the logo/header div and the nav/tablist
  // The sidebar structure is:
  //   <div class="p-4 border-b ...">  ← Logo + portal name (HEADER)
  //   <nav class="flex-1 ...">         ← Tab navigation
  // We inject BETWEEN these two.
  const sidebarHeader = sidebar.querySelector(':scope > div:first-child');
  const tabNav = sidebar.querySelector(':scope > nav');

  if (!sidebarHeader || !tabNav) {
    return;
  }

  // Create the context switcher container
  const switcher = document.createElement('div');
  switcher.innerHTML = renderContextSwitcher(currentPortalId);

  // Insert between header and nav
  sidebar.insertBefore(switcher.firstElementChild!, tabNav);

  // Wire View Transition click handlers
  const mountedSwitcher = sidebar.querySelector('.nm-ctx-switcher');
  if (mountedSwitcher) {
    wireTransitionClicks(mountedSwitcher);
  }

  // Phase 2: Mount Hub FAB for mobile portal switching
  mountHubFAB(currentPortalId);

  // Prefetch other portals during idle (low priority, skipped on 2G)
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
      () => prefetchPortals(currentPortalId),
    );
  } else {
    // Fallback: prefetch after 2s delay
    setTimeout(() => prefetchPortals(currentPortalId), 2000);
  }
}
