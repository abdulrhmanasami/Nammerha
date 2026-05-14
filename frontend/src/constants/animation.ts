// ============================================================================
// Nammerha — Animation Constants (Design System)
// P2-ANIM-001 FIX: Centralized animation timing constants.
// ============================================================================
// Previous: All 17 portal card renderers hardcoded `i * 50`ms as inline
// animation-delay. Three separate timing values existed across the codebase:
//   - 50ms (portal list cards — most common)
//   - 80ms (some dashboard stats)
//   - 100ms (notification items)
// This fragmentation means changing the animation rhythm requires grep-and-replace
// across 17+ files — a guaranteed source of timing drift.
//
// Now: Single source of truth for all stagger timing.
// Usage:
//   import { NM_STAGGER_MS, staggerDelay } from '../constants/animation';
//   `<div style="animation-delay:${staggerDelay(i)}">`
//
// Standard: Design System Token Governance, DRY Principle.
// ============================================================================

/**
 * Standard stagger delay between sequential card/list item animations.
 * 50ms is perceptually optimal: fast enough to feel fluid (not janky),
 * slow enough for the eye to register the cascade (not simultaneous).
 *
 * Cognitive science: 40-60ms range activates the brain's "flowing motion"
 * perception. Below 30ms feels simultaneous; above 100ms feels sluggish.
 */
export const NM_STAGGER_MS = 50;

/**
 * Maximum total animation delay to prevent long lists from feeling slow.
 * After 10 items (500ms total), all remaining items appear simultaneously.
 * Standard: Material Design 3 — "Cap cascading delays at 500ms."
 */
export const NM_STAGGER_MAX_MS = 500;

/**
 * Helper to compute capped stagger delay for index-based card rendering.
 * Returns a CSS-ready string like "150ms".
 *
 * @param index - 0-based index of the item in the list
 * @param stepMs - Override the default stagger step (default: NM_STAGGER_MS)
 * @returns CSS time value string (e.g., "150ms")
 *
 * @example
 * `<div style="animation-delay:${staggerDelay(i)}">`
 * // index 0 → "0ms", index 5 → "250ms", index 12 → "500ms" (capped)
 */
export function staggerDelay(index: number, stepMs = NM_STAGGER_MS): string {
    const delay = Math.min(index * stepMs, NM_STAGGER_MAX_MS);
    return `${delay}ms`;
}
