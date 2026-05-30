import { escapeHtml as esc } from '../utils/xss';
// ============================================================================
// Nammerha — Interactive Product Tour Engine
// ============================================================================
// Zero-dependency guided tour system. Highlights UI elements with a spotlight
// overlay and bilingual tooltip popover.
//
// Features:
//   - Spotlight: darkens page, cuts out target element
//   - Tooltip: auto-positioned (top/bottom), step content + navigation
//   - Progress: "Step 3 of 7" bar
//   - Keyboard: Escape to skip, ArrowRight/Left to navigate
//   - Scroll: auto-scrolls target into viewport
//   - Persistence: localStorage tracks completion per tour
//   - Auto-trigger: launches on first visit per portal
// ============================================================================

import { TOUR_DEFINITIONS, type TourDefinition } from './tour-definitions';
// TICK-032: Import shared isRTL from utils/i18n instead of local duplicate.
// Local getLocale() is kept — it returns 'en'|'ar' (bilingual selector),
// different from utils/locale.ts getLocale() which returns a full locale string.
import { isRTL, t } from '../utils/i18n';
import { addTrackedTimer } from '../utils/tracked-timers';


const STORAGE_KEY_PREFIX = 'nammerha-tour-';
const OVERLAY_ID = 'nmr-tour-overlay';
const TOOLTIP_ID = 'nmr-tour-tooltip';
const SPOTLIGHT_PADDING = 8;

function getLocale(): 'en' | 'ar' {
  // LOCALE-001: Default to Arabic — Nammerha's primary audience is Syrian.
  const lang = document.documentElement.lang || 'ar';
  return lang.startsWith('ar') ? 'ar' : 'en';
}

// TICK-032: Local isRtl() removed — now imported as isRTL from ../utils/i18n.

// ─── Tour State ─────────────────────────────────────────────────────────────

interface TourState {
  tour: TourDefinition;
  currentStep: number;
  overlay: HTMLElement;
  tooltip: HTMLElement;
  spotlight: HTMLElement;
}

let activeTour: TourState | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Start a specific tour by ID. If already completed, does nothing unless force=true.
 */
export function startTour(tourId: string, force = false): void {
  const tour = TOUR_DEFINITIONS[tourId];
  if (!tour) {
    return;
  }

  if (!force && isTourCompleted(tourId)) {
    return;
  }

  // Clean up any existing tour
  if (activeTour) {
    cleanupTour();
  }

  const overlay = createOverlay();
  const spotlight = createSpotlight();
  const tooltip = createTooltip();

  overlay.appendChild(spotlight);
  document.body.appendChild(overlay);
  document.body.appendChild(tooltip);

  activeTour = { tour, currentStep: 0, overlay, tooltip, spotlight };

  // Add keyboard listener
  document.addEventListener('keydown', handleKeyboard);

  showStep(0);
}

/**
 * Auto-detect current portal and trigger tour if first visit.
 */
export function autoTriggerTour(): void {
  const path = window.location.pathname;

  let tourId: string | null = null;

  if (path.includes('homeowner-portal') || path.includes('homeowner-report')) {
    tourId = 'homeowner';
  } else if (path.includes('contractor-portal') || path.includes('contractor-dashboard')) {
    tourId = 'contractor';
  } else if (
    path.includes('engineer-portal') ||
    path.includes('engineer-camera') ||
    path.includes('engineer-boq')
  ) {
    tourId = 'engineer';
  } else if (path.includes('supplier-dashboard')) {
    tourId = 'supplier';
  } else if (path.includes('tradesperson-portal')) {
    tourId = 'tradesperson';
  } else if (path.includes('admin-dashboard') || path.includes('admin-kyc')) {
    tourId = 'admin';
  } else if (path.includes('project-details')) {
    // GAP-05 FIX: Project details tour for first-time visitors
    tourId = 'project';
  } else if (path === '/' || path.endsWith('/index.html') || path.endsWith('/index')) {
    tourId = 'homepage';
  }

  if (tourId) {
    // Small delay to let page render
    addTrackedTimer(setTimeout(() => {
      startTour(tourId!);
    }, 1200));
  }
}

// ─── Step Navigation ────────────────────────────────────────────────────────

function showStep(index: number): void {
  if (!activeTour) {
    return;
  }

  const { tour, tooltip, spotlight } = activeTour;
  const steps = tour.steps;

  if (index < 0 || index >= steps.length) {
    completeTour();
    return;
  }

  activeTour.currentStep = index;
  const step = steps[index]!;
  const locale = getLocale();
  const rtl = isRTL();

  // Find target element
  const target = document.querySelector(step.selector) as HTMLElement | null;

  if (target) {
    // Scroll into view
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // F-015 FIX: RTL-aware tooltip position mapping.
    // Tour definitions use 'right'/'left' as inline-end/inline-start semantics.
    // In RTL, 'right' (inline-end) maps to physical 'left', and vice versa.
    // 'top'/'bottom' are block-direction and don't need flipping.
    const resolvedPosition = (() => {
      const pos = step.position;
      if (!pos || !rtl) {return pos;}
      if (pos === 'right') {return 'left';}
      if (pos === 'left') {return 'right';}
      return pos;
    })();

    // Position spotlight
    addTrackedTimer(setTimeout(() => {
      positionSpotlight(spotlight, target);
      positionTooltip(tooltip, target, resolvedPosition);
    }, 350));
  } else {
    // Target not found — hide spotlight, show tooltip centered
    // DEF-UX-008 FIX: CSS class toggle replaces inline style.opacity.
    // Standard: CSS Single Source of Truth.
    spotlight.classList.remove('nmr-tour-spotlight--visible');
    // TICKET-03 FIX: CSS custom properties replace inline style.top/left/transform — P1-SST-001.
    tooltip.style.setProperty('--tip-top', '50%');
    tooltip.style.setProperty('--tip-left', '50%');
    tooltip.style.setProperty('--tip-transform', 'translate(-50%, -50%)');
    tooltip.classList.add('nmr-tour-tooltip--positioned');
  }

  // Render tooltip content
  const title = locale === 'ar' ? step.title_ar : step.title_en;
  const content = locale === 'ar' ? step.content_ar : step.content_en;
  const prevLabel = t('tour_prev', 'السابق');
  const nextLabel = t('tour_next', 'التالي');
  const skipLabel = t('tour_skip', 'تخطي');
  const doneLabel = t('tour_done', 'تم!');
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  // FRIC-2026-F11 FIX: Announce step change to screen readers via aria-live region.
  announceTourStep(index, steps.length, title);
  // Update aria-label with current step context for screen readers.
  tooltip.setAttribute('aria-label', `${t('tour_dialog_label', 'جولة تعريفية')} — ${title}`);

  tooltip.dir = rtl ? 'rtl' : 'ltr';
  tooltip.innerHTML = `
        <div class="nmr-tour-header">
            <span class="nmr-tour-step-count">${esc(index + 1)} / ${esc(steps.length)}</span>
            <button type="button" class="nmr-tour-close" aria-label="Close" data-action="skip"><i class="ph ph-x" aria-hidden="true"></i></button>
        </div>
        <div class="nmr-tour-progress">
            <div class="nmr-tour-progress-bar nm-progress-bar" style="--progress:${esc(((index + 1) / steps.length) * 100)}%"></div>
        </div>
        <h3 class="nmr-tour-title">${esc(title)}</h3>
        <p class="nmr-tour-content">${esc(content)}</p>
        <div class="nmr-tour-actions">
            <button type="button" class="nmr-tour-btn nmr-tour-btn--skip" data-action="skip">${esc(skipLabel)}</button>
            <div class="nmr-tour-nav">
                ${!isFirst ? `<button type="button" class="nmr-tour-btn nmr-tour-btn--prev" data-action="prev">${prevLabel}</button>` : ''}
                <button type="button" class="nmr-tour-btn nmr-tour-btn--next" data-action="${esc(isLast ? 'done' : 'next')}">
                    ${esc(isLast ? doneLabel : nextLabel)}
                </button>
            </div>
        </div>
    `;

  // Wire up button clicks
  tooltip.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = (btn as HTMLElement).dataset['action'];
      switch (action) {
        case 'next':
          showStep(index + 1);
          break;
        case 'prev':
          showStep(index - 1);
          break;
        case 'skip':
          completeTour();
          break;
        case 'done':
          completeTour();
          break;
      }
    });
  });

  // Show overlay + tooltip
  activeTour.overlay.classList.add('nmr-tour-overlay--visible');
  tooltip.classList.add('nmr-tour-tooltip--visible');
}

// ─── Positioning ────────────────────────────────────────────────────────────

function positionSpotlight(spotlight: HTMLElement, target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  // FRIC-2026-F04 FIX: Compute inset-inline-start-aware position.
  // In RTL, inset-inline-start maps to physical `right`. CSS now uses
  // `inset-inline-start: var(--spot-left)` instead of `left:`.
  const rtl = isRTL();
  const vw = window.innerWidth;
  const spotPhysicalLeft = rect.left - SPOTLIGHT_PADDING;
  const spotInlineStart = rtl ? vw - rect.right - SPOTLIGHT_PADDING : spotPhysicalLeft;
  // TICKET-03 FIX: CSS custom properties replace inline style.top/left/width/height — P1-SST-001.
  spotlight.style.setProperty('--spot-top', `${rect.top - SPOTLIGHT_PADDING + window.scrollY}px`);
  spotlight.style.setProperty('--spot-left', `${spotInlineStart}px`);
  spotlight.style.setProperty('--spot-w', `${rect.width + SPOTLIGHT_PADDING * 2}px`);
  spotlight.style.setProperty('--spot-h', `${rect.height + SPOTLIGHT_PADDING * 2}px`);
  // DEF-UX-008 FIX: CSS class toggle replaces inline style.opacity.
  spotlight.classList.add('nmr-tour-spotlight--visible');
}

function positionTooltip(
  tooltip: HTMLElement,
  target: HTMLElement,
  preferredPosition?: 'top' | 'bottom' | 'left' | 'right',
): void {
  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const rtl = isRTL();

  // Reset transform
  // TICKET-03 FIX: CSS custom properties replace inline style.top/left/transform — P1-SST-001.
  tooltip.style.setProperty('--tip-transform', '');
  tooltip.classList.add('nmr-tour-tooltip--positioned');

  // Auto-detect best position if not specified
  const position =
    preferredPosition ?? (rect.bottom + tooltipRect.height + 20 < viewportH ? 'bottom' : 'top');

  const MARGIN = 16;

  // FRIC-2026-F04 FIX: Helper to convert physical left-edge px to logical
  // inset-inline-start px. In RTL, measures from viewport right edge.
  const toInlineStart = (physicalLeft: number): number => {
    return rtl ? viewportW - physicalLeft - tooltipRect.width : physicalLeft;
  };

  // Clamp tooltip within viewport (physical left, then convert)
  const clampedPhysicalLeft = (centerX: number): number => {
    return Math.max(
      MARGIN,
      Math.min(centerX - tooltipRect.width / 2, viewportW - tooltipRect.width - MARGIN),
    );
  };

  switch (position) {
    case 'bottom':
      tooltip.style.setProperty('--tip-top', `${rect.bottom + MARGIN + window.scrollY}px`);
      tooltip.style.setProperty(
        '--tip-left',
        `${toInlineStart(clampedPhysicalLeft(rect.left + rect.width / 2))}px`,
      );
      break;
    case 'top':
      tooltip.style.setProperty(
        '--tip-top',
        `${rect.top - tooltipRect.height - MARGIN + window.scrollY}px`,
      );
      tooltip.style.setProperty(
        '--tip-left',
        `${toInlineStart(clampedPhysicalLeft(rect.left + rect.width / 2))}px`,
      );
      break;
    case 'left':
      tooltip.style.setProperty(
        '--tip-top',
        `${rect.top + rect.height / 2 - tooltipRect.height / 2 + window.scrollY}px`,
      );
      tooltip.style.setProperty(
        '--tip-left',
        `${toInlineStart(rect.left - tooltipRect.width - MARGIN)}px`,
      );
      break;
    case 'right':
      tooltip.style.setProperty(
        '--tip-top',
        `${rect.top + rect.height / 2 - tooltipRect.height / 2 + window.scrollY}px`,
      );
      tooltip.style.setProperty('--tip-left', `${toInlineStart(rect.right + MARGIN)}px`);
      break;
  }
}

// ─── DOM Creation ───────────────────────────────────────────────────────────

function createOverlay(): HTMLElement {
  const el = document.createElement('div');
  el.id = OVERLAY_ID;
  el.className = 'nmr-tour-overlay';
  el.addEventListener('click', (e) => {
    if (e.target === el) {
      completeTour();
    }
  });
  return el;
}

function createSpotlight(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'nmr-tour-spotlight';
  return el;
}

function createTooltip(): HTMLElement {
  const el = document.createElement('div');
  el.id = TOOLTIP_ID;
  el.className = 'nmr-tour-tooltip';
  // FRIC-2026-F11 FIX: WAI-ARIA dialog role + modal trap.
  // Existing: role="dialog" + aria-modal="true".
  // Added: aria-label for screen reader context.
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', t('tour_dialog_label', 'جولة تعريفية'));
  return el;
}

// FRIC-2026-F11 FIX: Visually-hidden live region for screen reader announcements.
// Injected once into DOM; textContent updated on each step change.
let liveRegion: HTMLElement | null = null;
function ensureLiveRegion(): HTMLElement {
  if (liveRegion && document.body.contains(liveRegion)) {return liveRegion;}
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.className = 'sr-only'; // Tailwind visually hidden class
  document.body.appendChild(el);
  liveRegion = el;
  return el;
}
function announceTourStep(stepIndex: number, totalSteps: number, title: string): void {
  const region = ensureLiveRegion();
  region.textContent = `${t('tour_step', 'الخطوة')} ${stepIndex + 1} ${t('tour_of', 'من')} ${totalSteps}: ${title}`;
}

// ─── Keyboard ───────────────────────────────────────────────────────────────

function handleKeyboard(e: KeyboardEvent): void {
  if (!activeTour) {
    return;
  }

  switch (e.key) {
    case 'Escape':
      completeTour();
      break;
    // FRIC-2026-F11 FIX: RTL-aware arrow key navigation.
    // In RTL, ArrowRight = previous (inline-start direction),
    // ArrowLeft = next (inline-end direction).
    case 'ArrowRight':
      showStep(activeTour.currentStep + (isRTL() ? -1 : 1));
      break;
    case 'ArrowLeft':
      showStep(activeTour.currentStep + (isRTL() ? 1 : -1));
      break;
    // FRIC-2026-F11 FIX: Focus trap — Tab cycles within tooltip buttons.
    case 'Tab': {
      e.preventDefault();
      const focusable = activeTour.tooltip.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {break;}
      const arr = Array.from(focusable);
      const activeEl = document.activeElement as HTMLElement | null;
      const currentIdx = activeEl ? arr.indexOf(activeEl) : -1;
      const nextIdx = e.shiftKey
        ? currentIdx <= 0
          ? arr.length - 1
          : currentIdx - 1
        : currentIdx >= arr.length - 1
          ? 0
          : currentIdx + 1;
      arr[nextIdx]?.focus();
      break;
    }
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

function completeTour(): void {
  if (!activeTour) {
    return;
  }

  const tourId = activeTour.tour.id;
  markTourCompleted(tourId);
  cleanupTour();

  // P0-004 FIX: Dispatch tour completion event for downstream components.
  // The welcome-chooser listens for this to show the role-selection modal
  // AFTER the homepage tour finishes (not during — would be overwhelming).
  // CustomEvent.detail carries the tourId for conditional logic.
  document.dispatchEvent(new CustomEvent('nm:tour:complete', { detail: { tourId } }));
}

function cleanupTour(): void {
  if (!activeTour) {
    return;
  }

  document.removeEventListener('keydown', handleKeyboard);

  activeTour.overlay.remove();
  activeTour.tooltip.remove();
  activeTour = null;

  // FRIC-2026-F11 FIX: Remove aria-live region on tour cleanup.
  if (liveRegion && liveRegion.parentNode) {
    liveRegion.remove();
    liveRegion = null;
  }
}

// ─── Persistence ────────────────────────────────────────────────────────────

function isTourCompleted(tourId: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${tourId}`) === 'completed';
  } catch {
    return false;
  }
}

function markTourCompleted(tourId: string): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${tourId}`, 'completed');
  } catch {
    // Storage unavailable — tour will re-trigger next time
  }
}

/**
 * Reset a specific tour (or all tours) so they trigger again.
 */
export function resetTour(tourId?: string): void {
  try {
    if (tourId) {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${tourId}`);
    } else {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(STORAGE_KEY_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    }
  } catch {
    // Ignore
  }
}
