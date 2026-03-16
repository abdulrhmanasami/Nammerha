// ============================================================================
// Nammerha — Pull-to-Refresh (Native-App Feel)
// P1-MOB-001 FIX: Touch gesture handler for pull-to-refresh on mobile
// P1-MOB-002 FIX: Haptic feedback via navigator.vibrate()
// ============================================================================

const THRESHOLD_PX = 60;
const MAX_PULL_PX  = 120;

let indicator: HTMLElement | null = null;
let startY = 0;
let currentY = 0;
let pulling = false;

function createIndicator(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'pull-refresh-indicator';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="pull-refresh-spinner"><i class="ph ph-arrow-counter-clockwise" style="font-size:20px"></i></div>`;
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
    indicator.style.transform  = `translateY(${distance}px)`;
    indicator.style.opacity    = String(Math.min(distance / THRESHOLD_PX, 1));
    indicator.classList.toggle('pull-refresh-ready', distance >= THRESHOLD_PX);

    if (distance >= THRESHOLD_PX) {
        // P1-MOB-002 FIX: Haptic pulse at threshold
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
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
            setTimeout(() => location.reload(), 300);
        } else {
            indicator.style.transform = 'translateY(0)';
            indicator.style.opacity   = '0';
        }
    }
    startY = 0;
    currentY = 0;
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
