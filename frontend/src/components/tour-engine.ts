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
import { isRTL } from '../utils/i18n';

const STORAGE_KEY_PREFIX = 'nammerha-tour-';
const OVERLAY_ID         = 'nmr-tour-overlay';
const TOOLTIP_ID         = 'nmr-tour-tooltip';
const SPOTLIGHT_PADDING  = 8;

function getLocale(): 'en' | 'ar' {
    const lang = document.documentElement.lang || 'en';
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
    } else if (path.includes('engineer-camera') || path.includes('engineer-boq')) {
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
        setTimeout(() => {
            startTour(tourId!);
        }, 1200);
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

        // Position spotlight
        setTimeout(() => {
            positionSpotlight(spotlight, target);
            positionTooltip(tooltip, target, step.position);
        }, 350);
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
    const prevLabel = locale === 'ar' ? 'السابق' : 'Previous';
    const nextLabel = locale === 'ar' ? 'التالي' : 'Next';
    const skipLabel = locale === 'ar' ? 'تخطي' : 'Skip';
    const doneLabel = locale === 'ar' ? 'تم!' : 'Done!';
    const isFirst = index === 0;
    const isLast = index === steps.length - 1;

    tooltip.dir = rtl ? 'rtl' : 'ltr';
    tooltip.innerHTML = `
        <div class="nmr-tour-header">
            <span class="nmr-tour-step-count">${index + 1} / ${steps.length}</span>
            <button type="button" class="nmr-tour-close" aria-label="Close" data-action="skip"><i class="ph ph-x" aria-hidden="true"></i></button>
        </div>
        <div class="nmr-tour-progress">
            <div class="nmr-tour-progress-bar nm-progress-bar" style="--progress:${((index + 1) / steps.length) * 100}%"></div>
        </div>
        <h3 class="nmr-tour-title">${title}</h3>
        <p class="nmr-tour-content">${content}</p>
        <div class="nmr-tour-actions">
            <button type="button" class="nmr-tour-btn nmr-tour-btn--skip" data-action="skip">${skipLabel}</button>
            <div class="nmr-tour-nav">
                ${!isFirst ? `<button type="button" class="nmr-tour-btn nmr-tour-btn--prev" data-action="prev">${prevLabel}</button>` : ''}
                <button type="button" class="nmr-tour-btn nmr-tour-btn--next" data-action="${isLast ? 'done' : 'next'}">
                    ${isLast ? doneLabel : nextLabel}
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
    // TICKET-03 FIX: CSS custom properties replace inline style.top/left/width/height — P1-SST-001.
    spotlight.style.setProperty('--spot-top', `${rect.top - SPOTLIGHT_PADDING + window.scrollY}px`);
    spotlight.style.setProperty('--spot-left', `${rect.left - SPOTLIGHT_PADDING}px`);
    spotlight.style.setProperty('--spot-w', `${rect.width + SPOTLIGHT_PADDING * 2}px`);
    spotlight.style.setProperty('--spot-h', `${rect.height + SPOTLIGHT_PADDING * 2}px`);
    // DEF-UX-008 FIX: CSS class toggle replaces inline style.opacity.
    spotlight.classList.add('nmr-tour-spotlight--visible');
}

function positionTooltip(
    tooltip: HTMLElement,
    target: HTMLElement,
    preferredPosition?: 'top' | 'bottom' | 'left' | 'right'
): void {
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    // Reset transform
    // TICKET-03 FIX: CSS custom properties replace inline style.top/left/transform — P1-SST-001.
    tooltip.style.setProperty('--tip-transform', '');
    tooltip.classList.add('nmr-tour-tooltip--positioned');

    // Auto-detect best position if not specified
    const position = preferredPosition ?? (rect.bottom + tooltipRect.height + 20 < viewportH ? 'bottom' : 'top');

    const MARGIN = 16;

    switch (position) {
        case 'bottom':
            tooltip.style.setProperty('--tip-top', `${rect.bottom + MARGIN + window.scrollY}px`);
            tooltip.style.setProperty('--tip-left', `${Math.max(MARGIN, Math.min(rect.left + rect.width / 2 - tooltipRect.width / 2, viewportW - tooltipRect.width - MARGIN))}px`);
            break;
        case 'top':
            tooltip.style.setProperty('--tip-top', `${rect.top - tooltipRect.height - MARGIN + window.scrollY}px`);
            tooltip.style.setProperty('--tip-left', `${Math.max(MARGIN, Math.min(rect.left + rect.width / 2 - tooltipRect.width / 2, viewportW - tooltipRect.width - MARGIN))}px`);
            break;
        case 'left':
            tooltip.style.setProperty('--tip-top', `${rect.top + rect.height / 2 - tooltipRect.height / 2 + window.scrollY}px`);
            tooltip.style.setProperty('--tip-left', `${rect.left - tooltipRect.width - MARGIN}px`);
            break;
        case 'right':
            tooltip.style.setProperty('--tip-top', `${rect.top + rect.height / 2 - tooltipRect.height / 2 + window.scrollY}px`);
            tooltip.style.setProperty('--tip-left', `${rect.right + MARGIN}px`);
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
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    return el;
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
        case 'ArrowRight':
            showStep(activeTour.currentStep + 1);
            break;
        case 'ArrowLeft':
            showStep(activeTour.currentStep - 1);
            break;
    }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

function completeTour(): void {
    if (!activeTour) {
        return;
    }

    markTourCompleted(activeTour.tour.id);
    cleanupTour();
}

function cleanupTour(): void {
    if (!activeTour) {
        return;
    }

    document.removeEventListener('keydown', handleKeyboard);

    activeTour.overlay.remove();
    activeTour.tooltip.remove();
    activeTour = null;
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
