/**
 * FRC-010 FIX + SHAITANI AUDIT (GAP-2026-005)
 * ═══════════════════════════════════════════════════
 * Provides tactile feedback for mobile interactions via the Vibration API.
 * Gracefully degrades to no-op on unsupported devices (desktop, iOS Safari).
 *
 * Architecture Fixes (Platinum Standard):
 *   1. Harmonized pattern signatures with public/haptic.js
 *   2. Added Desktop Guard to prevent triggering gamepad rumble on mice
 *   3. Integrated 50ms anti-spam throttle barrier
 *
 * Usage:
 *   import { haptic } from '/src/utils/haptic.ts';
 *   haptic.light();    // 10ms
 *   haptic.medium();   // 15ms
 *   haptic.heavy();    // [10, 30, 10, 30, 10]
 *   haptic.success();  // [15, 50, 15]
 */

type HapticIntensity = 'light' | 'medium' | 'heavy' | 'success' | 'warning';

const PATTERNS: Record<HapticIntensity, number | number[]> = {
    light: 10,
    medium: 15,
    heavy: [10, 30, 10, 30, 10],
    success: [15, 50, 15],
    warning: [10, 30, 20],
};

let lastVibrateTime = 0;
const THROTTLE_MS = 50;

function canVibrate(): boolean {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) {
        return false;
    }
    
    // Desktop Guard: Prevent firing on laptops with connected gamepads
    try {
        if (!window.matchMedia('(pointer: coarse)').matches && !('ontouchstart' in window)) {
            return false;
        }
    } catch {
        // matchMedia not supported
    }

    return true;
}

function vibrate(pattern: number | number[]): void {
    if (!canVibrate()) {
        return;
    }

    const now = Date.now();
    if (now - lastVibrateTime < THROTTLE_MS) {
        return; // Throttled to prevent battery drain / sensor blocking
    }

    try {
        navigator.vibrate(pattern);
        lastVibrateTime = now;
    } catch {
        // Swallow — vibration is non-critical UX enhancement
    }
}

export const haptic = {
    /** 10ms — item selection, toggle, tab switch */
    light: () => vibrate(PATTERNS.light),

    /** 15ms — add to cart, confirm action, button press */
    medium: () => vibrate(PATTERNS.medium),

    /** Pattern — destructive action, error alert */
    heavy: () => vibrate(PATTERNS.heavy),

    /** Double-tap pattern — multi-step completion, checkout success */
    success: () => vibrate(PATTERNS.success),

    /** Warning pattern — attention needed */
    warning: () => vibrate(PATTERNS.warning),

    /** Raw pattern control for custom interactions */
    custom: (pattern: number | number[]) => vibrate(pattern),
} as const;

export type { HapticIntensity };
