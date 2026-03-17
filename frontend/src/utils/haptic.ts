/**
 * FRC-010 FIX: Haptic Feedback Utility
 * ═══════════════════════════════════════════════════
 * Provides tactile feedback for mobile interactions via the Vibration API.
 * Gracefully degrades to no-op on unsupported devices (desktop, iOS Safari).
 *
 * Standard: Apple HIG — "The best haptic experiences complement the visual
 * and auditory experience." | Material Design — "Use haptics sparingly for
 * meaningful actions."
 *
 * Usage:
 *   import { haptic } from '/src/utils/haptic.ts';
 *   haptic.light();    // 10ms — item selection, toggle
 *   haptic.medium();   // 30ms — add to cart, button press
 *   haptic.heavy();    // 50ms — destructive action confirm, error
 *   haptic.success();  // pattern — multi-step completion
 */

type HapticIntensity = 'light' | 'medium' | 'heavy' | 'success';

const PATTERNS: Record<HapticIntensity, number | number[]> = {
    light: 10,
    medium: 30,
    heavy: 50,
    success: [15, 50, 15], // double-tap pattern for positive feedback
};

function canVibrate(): boolean {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

function vibrate(pattern: number | number[]): void {
    if (!canVibrate()) return;
    try {
        navigator.vibrate(pattern);
    } catch {
        // Swallow — vibration is non-critical UX enhancement
    }
}

export const haptic = {
    /** 10ms — item selection, toggle, tab switch */
    light: () => vibrate(PATTERNS.light),

    /** 30ms — add to cart, confirm action, button press */
    medium: () => vibrate(PATTERNS.medium),

    /** 50ms — destructive action, error alert */
    heavy: () => vibrate(PATTERNS.heavy),

    /** Double-tap pattern — multi-step completion, checkout success */
    success: () => vibrate(PATTERNS.success),

    /** Raw pattern control for custom interactions */
    custom: (pattern: number | number[]) => vibrate(pattern),
} as const;

export type { HapticIntensity };
