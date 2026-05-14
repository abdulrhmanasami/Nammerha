// ============================================================================
// Nammerha — Shared KPI Count-Up Animation
// F-019 FIX: Extract engineer's setKPI() into a shared utility so ALL portals
// get animated count-up on KPI values instead of instant text replacement.
//
// Previously ONLY engineer-portal.ts had animated count-up (requestAnimationFrame).
// All other portals used setText() — instant text change, no perceived performance.
//
// Usage:
//   import { animateKPI } from '../utils/kpi-animation';
//   animateKPI('kpi-active', 12);
//   animateKPI('kpi-earnings', 45000, { prefix: '$', isCents: true });
// ============================================================================

import { getLocale } from './locale';

interface KPIOptions {
    /** Symbol prefix (e.g., '$' for currency) */
    prefix?: string;
    /** If true, treats value as cents and divides by 100 for display */
    isCents?: boolean;
    /** Animation duration in ms (default: 1200ms) */
    duration?: number;
}

/**
 * Animate a KPI value from 0 → target using eased requestAnimationFrame.
 * Also sets `aria-live="polite"` for screen reader announcements (F-017).
 *
 * @param elementId - The DOM element ID (e.g., 'kpi-active')
 * @param targetValue - The target numeric value
 * @param options - Animation configuration
 */
export function animateKPI(
    elementId: string,
    targetValue: number,
    options: KPIOptions = {},
): void {
    const el = document.getElementById(elementId);
    if (!el) { return; }

    const { prefix = '', isCents = false, duration = 1200 } = options;
    const locale = getLocale();
    const start = performance.now();

    // F-017 FIX: Ensure KPI containers have aria-live for screen reader updates.
    // Set on first call — subsequent calls reuse the existing attribute.
    if (!el.getAttribute('aria-live')) {
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('role', 'status');
    }

    const format = (current: number): string => {
        if (prefix === '$' || isCents) {
            const displayValue = isCents ? Math.round(current / 100) : current;
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
            }).format(displayValue);
        }
        return `${prefix}${Math.round(current).toLocaleString(locale)}`;
    };

    const tick = (now: number): void => {
        const progress = Math.min((now - start) / duration, 1);
        // Cubic ease-out: fast start, smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentValue = targetValue * eased;
        el.textContent = format(currentValue);
        if (progress < 1) { requestAnimationFrame(tick); }
    };

    requestAnimationFrame(tick);
}
