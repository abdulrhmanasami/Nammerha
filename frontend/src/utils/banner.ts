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
        inner: 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200',
        icon: 'ph ph-warning-circle',
    },
    success: {
        inner: 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200',
        icon: 'ph ph-check-circle',
    },
    /* PLAT-M01 FIX: 'info' type for non-error informational messages (e.g. SSO coming-soon).
       Previous: only 'error' (red) and 'success' (green). SSO feedback used 'error' — alarming
       language for a non-error state. Standard: Nielsen #9, Material Design 3 (Informational). */
    info: {
        inner: 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200',
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
    if (!banner || !inner || !icon || !text) { return; }

    banner.style.display = 'block';
    text.textContent = message;
    inner.className = STRUCTURED_CLASSES[type].inner;
    icon.className = STRUCTURED_CLASSES[type].icon;
}

/** Hide a structured banner. */
export function hideStructuredBanner(banner: HTMLElement | null): void {
    if (banner) { banner.style.display = 'none'; }
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
    if (!banner) { return; }

    banner.className = SIMPLE_CLASSES[type];
    banner.textContent = message;
    banner.style.display = '';

    if (autoDismissMs > 0) {
        setTimeout(() => { banner.style.display = 'none'; }, autoDismissMs);
    }
}
