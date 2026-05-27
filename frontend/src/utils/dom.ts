// ============================================================================
// Nammerha Frontend — Shared DOM Utilities
// P4-001 FIX: Extracted from triplicated implementations in homeowner-portal.ts,
// contractor-portal.ts, and user-portal.ts.
// ============================================================================

/**
 * Set the text content of a DOM element by its ID.
 * No-op if the element doesn't exist (safe for optional KPI cards).
 */
export function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
    // PLATINUM UX FIX: Protect Logical CSS RTL/LTR Drift
    el.setAttribute('dir', 'auto');
  }
}

/**
 * PLATINUM FIX: Phantom Skeleton Hydration (Race Condition in skipAntiFlicker)
 * Evaluates whether an API request should bypass the 300ms Skeleton Anti-Flicker guard.
 * If the container already has substantial hydrated data (length > 20) or lacks skeleton placeholders,
 * the flicker delay is skipped. This prevents "Data ➔ Skeleton ➔ Data" flashes on cached/re-rendered views.
 */
export function shouldSkipFlicker(containerId: string): boolean {
  const container = document.getElementById(containerId);
  if (!container) {return false;}

  // If the container has substantial text content and no active skeletons, it's already hydrated.
  const content = container.textContent?.trim() || '';
  if (content.length > 20 && !container.querySelector('.animate-pulse')) {
    return true;
  }
  return false;
}
