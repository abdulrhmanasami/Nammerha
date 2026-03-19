// ============================================================================
// Nammerha — Pull-to-Refresh (Native-App Feel)
// P1-MOB-001 FIX: Touch gesture handler for pull-to-refresh on mobile
// P1-MOB-002 FIX: Haptic feedback via centralized haptic utility
// ============================================================================

import { haptic } from './haptic';

const THRESHOLD_PX = 60;
const MAX_PULL_PX  = 120;

let indicator: HTMLElement | null = null;
let startY = 0;
let currentY = 0;
let pulling = false;
let hapticFired = false; // PLT-AUD-C002 FIX: Single haptic per gesture

function createIndicator(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'pull-refresh-indicator';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="pull-refresh-spinner"><i class="ph ph-arrow-counter-clockwise text-xl" ></i></div>`;
    document.body.prepend(el);
    return el;
}

function getScrollTop(): number {
    return document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop;
}

function handleTouchStart(e: TouchEvent): void {
    if (getScrollTop() > 5) {
        return;
    }
    startY = e.touches[0]?.clientY ?? 0;
    pulling = true;
}

function handleTouchMove(e: TouchEvent): void {
    if (!pulling) {
        return;
    }
    currentY = e.touches[0]?.clientY ?? 0;
    const distance = Math.min(currentY - startY, MAX_PULL_PX);

    if (distance < 0) {
        pulling = false;
        return;
    }

    if (!indicator) {
        indicator = createIndicator();
    }
    // DEF-UX-004 FIX: CSS custom properties replace inline style.transform/opacity.
    // Previous: indicator.style.transform + indicator.style.opacity — violated P1-SST-001.
    // Standard: CSS Single Source of Truth, Custom Property-driven animation.
    indicator.style.setProperty('--pull-y', `${distance}px`);
    indicator.style.setProperty('--pull-opacity', String(Math.min(distance / THRESHOLD_PX, 1)));
    indicator.classList.toggle('pull-refresh-ready', distance >= THRESHOLD_PX);

    if (distance >= THRESHOLD_PX && !hapticFired) {
        // PLT-AUD-C002 FIX: Single haptic pulse at threshold (was firing every frame)
        hapticFired = true;
        haptic.light();
    }
}

/**
 * P0-PTR-001 FIX: Custom event dispatched when pull-to-refresh completes.
 * Pages should listen to this and refresh their data, NOT the whole page.
 * Falls back to location.reload() if no listener calls preventDefault().
 *
 * Usage in page modules:
 *   import { REFRESH_EVENT } from '../utils/pull-refresh';
 *   document.addEventListener(REFRESH_EVENT, (e) => {
 *       e.preventDefault(); // Signal "I'm handling this"
 *       refreshDashboardData();
 *   });
 */
export const REFRESH_EVENT = 'nammerha:pull-refresh';

function resetIndicator(): void {
    if (indicator) {
        indicator.classList.remove('pull-refresh-loading');
        indicator.style.setProperty('--pull-y', '0px');
        indicator.style.setProperty('--pull-opacity', '0');
    }
}

function handleTouchEnd(): void {
    if (!pulling) {
        return;
    }
    pulling = false;
    const distance = currentY - startY;

    if (indicator) {
        if (distance >= THRESHOLD_PX) {
            indicator.classList.add('pull-refresh-loading');

            // P0-PTR-001 FIX: Dispatch custom event — pages handle their own data refresh.
            // On 2G Syria, location.reload() takes 5-15s. Native apps refresh data, not the page.
            const event = new CustomEvent(REFRESH_EVENT, { cancelable: true });
            const handled = !document.dispatchEvent(event);

            if (handled) {
                // Page handled the refresh — reset indicator after one spin cycle
                setTimeout(resetIndicator, 600);
            } else {
                // No listener — fallback to full reload (backwards-compatible)
                const spinner = indicator.querySelector('.pull-refresh-spinner');
                if (spinner) {
                    spinner.addEventListener('animationiteration', () => location.reload(), { once: true });
                } else {
                    setTimeout(() => location.reload(), 600);
                }
            }
        } else {
            // DEF-UX-004 FIX: CSS custom properties for reset state.
            indicator.style.setProperty('--pull-y', '0px');
            indicator.style.setProperty('--pull-opacity', '0');
        }
    }
    startY = 0;
    currentY = 0;
    hapticFired = false; // PLT-AUD-C002 FIX: Reset for next gesture
}

/**
 * Initialize pull-to-refresh gesture on the current page.
 * Safe to call multiple times — only attaches once.
 */
export function initPullToRefresh(): void {
    if (!('ontouchstart' in window)) {
        return;
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove',  handleTouchMove,  { passive: true });
    document.addEventListener('touchend',   handleTouchEnd,   { passive: true });
}

