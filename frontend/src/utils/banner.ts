import { addTrackedTimer } from './tracked-timers';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Shared Banner Utility — Nammerha Platform
 * P2-AUD-002 FIX: Extracted from duplicated implementations in auth.ts,
 * reset-password.ts, and supplier-dashboard.ts.
 *
 * Supports two DOM patterns:
 *   1. Structured banner (auth pages) — 4-element DOM: container, inner, icon, text
 *   2. Simple banner (dashboards)    — single element with auto-dismiss
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type BannerType = 'error' | 'success' | 'info';

/** DOM element references for structured banners (auth pages). */
export interface StructuredBannerElements {
  readonly banner: HTMLElement | null;
  readonly inner: HTMLElement | null;
  readonly icon: HTMLElement | null;
  readonly text: HTMLElement | null;
}

// ─── CSS Class Constants ────────────────────────────────────────────────────

const STRUCTURED_CLASSES = {
  error: {
    inner:
      'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200',
    icon: 'ph ph-warning-circle',
  },
  success: {
    inner:
      'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200',
    icon: 'ph ph-check-circle',
  },
  /* PLAT-M01 FIX: 'info' type for non-error informational messages (e.g. SSO coming-soon).
       Previous: only 'error' (red) and 'success' (green). SSO feedback used 'error' — alarming
       language for a non-error state. Standard: Nielsen #9, Material Design 3 (Informational). */
  info: {
    inner:
      'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200',
    icon: 'ph ph-info',
  },
} as const;

const SIMPLE_CLASSES = {
  error: 'px-4 py-3 rounded-lg text-sm font-medium mb-4 bg-red-50 text-red-700',
  success: 'px-4 py-3 rounded-lg text-sm font-medium mb-4 bg-smoky-jade/10 text-smoky-jade',
  info: 'px-4 py-3 rounded-lg text-sm font-medium mb-4 bg-blue-50 text-blue-700',
} as const;

// ─── Structured Banner (Auth Pages) ─────────────────────────────────────────

/**
 * Show a structured banner with icon + text for auth-style pages.
 * Requires a 4-element DOM structure: banner container, inner wrapper,
 * icon element, and text element.
 */
export function showStructuredBanner(
  elements: StructuredBannerElements,
  type: BannerType,
  message: string,
): void {
  const { banner, inner, icon, text } = elements;
  if (!banner || !inner || !icon || !text) {
    return;
  }

  // DEF-VIS-002 FIX: Replaced `style.display = 'block'` with classList toggle.
  // Previous: inline style overrode CSS and violated P1-001 precedent.
  // P0-001 FIX (Wave 2): Changed from 'hidden' → 'nm-hidden'.
  // ROOT CAUSE: HTML templates use `nm-hidden` (main.css L2487: display:none!important).
  // But this file was toggling Tailwind's `hidden` class — a different selector.
  // The first showBanner call removed 'hidden' (which didn't exist) while
  // nm-hidden remained, keeping ALL banners invisible in production.
  // Standard: CSS Single Source of Truth — use platform nm-hidden utility class.
  banner.classList.remove('nm-hidden');
  text.textContent = message;
  inner.className = STRUCTURED_CLASSES[type].inner;
  icon.className = STRUCTURED_CLASSES[type].icon;
}

/** Hide a structured banner. */
export function hideStructuredBanner(banner: HTMLElement | null): void {
  // P0-001 FIX (Wave 2): 'hidden' → 'nm-hidden' — parity with showStructuredBanner.
  if (banner) {
    banner.classList.add('nm-hidden');
  }
}

// ─── Simple Banner (Dashboard Pages) ────────────────────────────────────────

/**
 * Show a simple single-element banner with optional auto-dismiss.
 * Used by dashboard pages where the banner is a single DOM element.
 *
 * @param bannerId   - DOM id of the banner element
 * @param type       - 'error' or 'success'
 * @param message    - Text content to display
 * @param autoDismissMs - Auto-hide after N milliseconds (default: 5000, pass 0 to disable)
 */
export function showSimpleBanner(
  bannerId: string,
  type: BannerType,
  message: string,
  autoDismissMs = 5000,
): void {
  const banner = document.getElementById(bannerId);
  if (!banner) {
    return;
  }

  banner.className = SIMPLE_CLASSES[type];
  banner.textContent = message;
  // DEF-VIS-002 FIX: Replaced `style.display = ''` with classList toggle.
  // P0-001 FIX (Wave 2): 'hidden' → 'nm-hidden' — parity with structured banner.
  banner.classList.remove('nm-hidden');

  if (autoDismissMs > 0) {
    addTrackedTimer(setTimeout(() => {
      banner.classList.add('nm-hidden');
    }, autoDismissMs));
  }
}
