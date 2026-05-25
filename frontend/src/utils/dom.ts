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
