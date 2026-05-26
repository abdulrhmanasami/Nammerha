// ============================================================================
// Nammerha — Pull-to-Refresh (Native-App Feel)
// P1-MOB-001 FIX: Touch gesture handler for pull-to-refresh on mobile
// P1-MOB-002 FIX: Haptic feedback via centralized haptic utility
// ============================================================================

import { haptic } from './haptic';

const THRESHOLD_PX = 60;
const MAX_PULL_PX = 120;

let indicator: HTMLElement | null = null;
let startX = 0;
let startY = 0;
let currentY = 0;
let pulling = false;
let hapticFired = false; // PLT-AUD-C002 FIX: Single haptic per gesture
let isHorizontalLock = false; // PLATINUM FIX: Diagonal Swipe Trap Guard
let resetTimer: ReturnType<typeof setTimeout> | null = null; // Platinum UX: Gesture Race Condition Guard

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

  // 🚨 Gesture Race Condition Guard
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
    resetIndicator();
    // Force restore original icon instantly
    const icon = indicator?.querySelector<HTMLElement>('.pull-refresh-spinner i');
    if (icon) {
      icon.classList.remove('ph-check-circle');
      icon.classList.add('ph-arrow-counter-clockwise');
    }
  }

  startX = e.touches[0]?.clientX ?? 0;
  startY = e.touches[0]?.clientY ?? 0;
  pulling = true;
  isHorizontalLock = false;
}

function handleTouchMove(e: TouchEvent): void {
  if (!pulling) {
    return;
  }
  const currentX = e.touches[0]?.clientX ?? 0;
  currentY = e.touches[0]?.clientY ?? 0;

  const deltaY = currentY - startY;
  const deltaX = Math.abs(currentX - startX);

  // PLATINUM FIX: Trigonometric Lock to prevent Diagonal Swipe Trap
  // If movement is heavily horizontal, lock out the pull-to-refresh to preserve native horizontal scroll.
  if (!isHorizontalLock && Math.abs(deltaY) < 10 && deltaX > 5) {
    isHorizontalLock = true;
  }

  if (isHorizontalLock) {
    pulling = false;
    return;
  }

  const distance = Math.min(deltaY, MAX_PULL_PX);

  if (distance < 0) {
    pulling = false;
    return;
  }

  // P0-003 FIX: Prevent Chrome Android's built-in pull-to-refresh from competing
  // with the custom spinner. Only called when ACTIVELY pulling (distance > 0),
  // preserving normal scroll performance for all other touch interactions.
  // Standard: Web API spec — preventDefault() requires non-passive listener.
  if (distance > 0) {
    e.preventDefault();
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
 *   import { REFRESH_EVENT, type PullRefreshEventDetail } from '../utils/pull-refresh';
 *   document.addEventListener(REFRESH_EVENT, (e) => {
 *       const ev = e as CustomEvent<PullRefreshEventDetail>;
 *       ev.preventDefault(); // Signal "I'm handling this"
 *       ev.detail.wait = refreshDashboardData(); // pass the promise!
 *   });
 */
export const REFRESH_EVENT = 'nammerha:pull-refresh';

export interface PullRefreshEventDetail {
  wait?: Promise<any>;
}

function resetIndicator(): void {
  if (indicator) {
    indicator.classList.remove('pull-refresh-loading', 'pull-refresh-complete');
    indicator.style.setProperty('--pull-y', '0px');
    indicator.style.setProperty('--pull-opacity', '0');
  }
}

/**
 * C10 FIX: Show completion feedback before hiding the pull-refresh indicator.
 * PREVIOUS: Spinner silently disappeared after 600ms — no visual confirmation
 * that data actually refreshed. Users on slow networks couldn't tell if it worked.
 * NOW: Spinner → green checkmark (400ms) → hide. Haptic success pulse.
 * Standard: Apple HIG (Pull-to-Refresh Completion), Instagram/Twitter pattern,
 * Nielsen #1 (Visibility of System Status).
 */
function showRefreshComplete(): void {
  if (!indicator) {
    return;
  }

  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }

  // Stop spinning, show checkmark
  indicator.classList.remove('pull-refresh-loading');
  indicator.classList.add('pull-refresh-complete');

  // Swap icon: arrow → checkmark
  const icon = indicator.querySelector<HTMLElement>('.pull-refresh-spinner i');
  if (icon) {
    icon.classList.remove('ph-arrow-counter-clockwise');
    icon.classList.add('ph-check-circle');
  }

  // Success haptic — distinct from the initial "threshold reached" light pulse
  haptic.success();

  // Hold the checkmark visible for 700ms, then slide up and hide
  resetTimer = setTimeout(() => {
    resetIndicator();
    // Restore original icon for next pull
    if (icon) {
      icon.classList.remove('ph-check-circle');
      icon.classList.add('ph-arrow-counter-clockwise');
    }
    resetTimer = null;
  }, 700);
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
      const detail: PullRefreshEventDetail = {};
      const event = new CustomEvent(REFRESH_EVENT, { cancelable: true, detail });
      const handled = !document.dispatchEvent(event);

      if (handled) {
        // PLATINUM FIX: Cryptographic Theater Race Condition Guard
        // Delay showing the completion checkmark until the async fetch actually finishes.
        if (detail.wait) {
          detail.wait.finally(() => {
            showRefreshComplete();
          });
        } else {
          showRefreshComplete();
        }
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
let _initialized = false;
export function initPullToRefresh(): void {
  if (!('ontouchstart' in window) || _initialized) {
    return;
  }
  _initialized = true;

  document.addEventListener('touchstart', handleTouchStart, { passive: true });
  // P0-003 FIX: Changed from { passive: true } to { passive: false }.
  // Previous: passive:true prevented e.preventDefault() from being called.
  // This meant Chrome Android's built-in pull-to-refresh fired SIMULTANEOUSLY
  // with the custom spinner — causing double-refresh on every pull-down gesture.
  // Now: Only calls preventDefault() when actively pulling (scrollTop === 0 && distance > 0),
  // preserving normal scrolling performance for all other touch interactions.
  // Standard: Web API specification (passive listeners cannot call preventDefault).
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd, { passive: true });
}
