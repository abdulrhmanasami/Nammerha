// ============================================================================
// Nammerha — Swipeable Tab Navigation (Native-App Feel)
// P1-MOB-003 FIX: Horizontal swipe gesture for dashboard tab switching
// ============================================================================
// Architecture: Clean observer pattern — controllers subscribe to swipe events,
// the module handles all touch math internally. Zero coupling to DOM structure.
//
// Usage:
//   import { initSwipeTabs } from '../utils/swipe-tabs';
//   initSwipeTabs({
//       containerSelector: '.dashboard-main',
//       tabs: ['dashboard', 'projects', 'requests'],
//       onSwitch: (tab) => switchTab(tab),
//       getCurrentTab: () => currentTabVariable,
//   });

interface SwipeTabsConfig<T extends string = string> {
    /** CSS selector for the swipeable container (touch target) */
    containerSelector: string;
    /** Ordered tab names — swipe left = next, swipe right = previous */
    tabs: readonly T[];
    /** Callback when a tab should be activated */
    onSwitch: (tab: T) => void;
    /** Returns the currently active tab name */
    getCurrentTab: () => T;
    /** Minimum horizontal distance (px) to trigger a tab switch. Default: 50 */
    threshold?: number;
    /** Maximum vertical distance (px) before swipe is cancelled (scroll). Default: 80 */
    maxVertical?: number;
}

/**
 * Initialize swipe-based tab navigation on a container.
 * Returns a cleanup function to remove listeners.
 */
export function initSwipeTabs<T extends string>(config: SwipeTabsConfig<T>): (() => void) | null {
    // Only on touch devices
    if (!('ontouchstart' in window)) {
        return null;
    }

    const container = document.querySelector(config.containerSelector);
    if (!container) {
        return null;
    }

    const threshold = config.threshold ?? 50;
    const maxVertical = config.maxVertical ?? 80;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    function handleTouchStart(e: Event): void {
        const touch = (e as TouchEvent).touches[0];
        if (!touch) {
            return;
        }
        startX = touch.clientX;
        startY = touch.clientY;
        tracking = true;
    }

    function handleTouchEnd(e: Event): void {
        if (!tracking) {
            return;
        }
        tracking = false;

        const touch = (e as TouchEvent).changedTouches[0];
        if (!touch) {
            return;
        }

        const deltaX = touch.clientX - startX;
        const deltaY = Math.abs(touch.clientY - startY);

        // Ignore if vertical scroll was dominant
        if (deltaY > maxVertical) {
            return;
        }

        // Ignore if horizontal distance is below threshold
        if (Math.abs(deltaX) < threshold) {
            return;
        }

        const { tabs, getCurrentTab, onSwitch } = config;
        const current = getCurrentTab();
        const idx = tabs.indexOf(current);
        if (idx === -1) {
            return;
        }

        if (deltaX < 0 && idx < tabs.length - 1) {
            // Swipe left → next tab
            // P1-MOB-002 FIX: Haptic feedback on tab switch
            if (navigator.vibrate) {
                navigator.vibrate(8);
            }
            onSwitch(tabs[idx + 1]!);
        } else if (deltaX > 0 && idx > 0) {
            // Swipe right → previous tab
            if (navigator.vibrate) {
                navigator.vibrate(8);
            }
            onSwitch(tabs[idx - 1]!);
        }
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Return cleanup function
    return () => {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchend', handleTouchEnd);
    };
}
