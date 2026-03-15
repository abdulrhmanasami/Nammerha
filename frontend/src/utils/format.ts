// ============================================================================
// Nammerha Frontend — Shared Formatting Utilities
// NMR-AUD-301 FIX: Single source of truth for currency formatting.
// Previously main.ts had its own formatCents and tradesperson-portal used
// hardcoded '$' — this module unifies all portals.
// ============================================================================

/**
 * Format a value in cents to a locale-aware currency string.
 * Uses Intl.NumberFormat for proper symbol placement, grouping, and RTL support.
 *
 * @param cents - Amount in cents (integer). e.g., 150000 = $1,500.00
 * @param currency - ISO 4217 currency code. Default: 'USD'.
 * @param locale - BCP 47 locale tag. Default: auto-detected from browser.
 * @returns Formatted currency string, e.g. "$1,500" or "١٬٥٠٠ $"
 */
export function formatCents(
    cents: number,
    currency = 'USD',
    locale?: string,
): string {
    const resolvedLocale = locale
        ?? (document.documentElement.lang || navigator.language || 'en-US');

    return new Intl.NumberFormat(resolvedLocale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(cents / 100);
}

/**
 * Format a dollar amount (float) to a locale-aware currency string.
 * P1-003 FIX: Companion to formatCents() for dollar-denominated values
 * (e.g. CartStore.unitPrice). Prevents manual `$${...toFixed(2)}` formatting
 * that breaks in Arabic/RTL locales.
 *
 * @param dollars - Amount in dollars (float). e.g., 1500.50 = "$1,500.50"
 * @param currency - ISO 4217 currency code. Default: 'USD'.
 * @param locale - BCP 47 locale tag. Default: auto-detected from browser.
 * @returns Formatted currency string, e.g. "$1,500.50" or "١٬٥٠٠٫٥٠ $"
 */
export function formatDollars(
    dollars: number,
    currency = 'USD',
    locale?: string,
): string {
    const resolvedLocale = locale
        ?? (document.documentElement.lang || navigator.language || 'en-US');

    return new Intl.NumberFormat(resolvedLocale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(dollars);
}

/**
 * Format a relative time in a locale-aware way.
 * NMR-AUD-305 FIX: Replaces manual concatenation that broke in RTL locales.
 * Uses Intl.RelativeTimeFormat for proper Arabic/RTL rendering.
 *
 * @param dateStr - ISO 8601 date string or timestamp
 * @returns Locale-aware relative time string, e.g. "3 hours ago" or "منذ ٣ ساعات"
 */
export function relativeTimeAgo(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);

    const resolvedLocale = document.documentElement.lang
        || navigator.language
        || 'en-US';

    try {
        const rtf = new Intl.RelativeTimeFormat(resolvedLocale, { numeric: 'auto' });

        if (diffSec < 60) { return rtf.format(-diffSec, 'second'); }
        if (diffSec < 3600) { return rtf.format(-Math.floor(diffSec / 60), 'minute'); }
        if (diffSec < 86400) { return rtf.format(-Math.floor(diffSec / 3600), 'hour'); }
        return rtf.format(-Math.floor(diffSec / 86400), 'day');
    } catch {
        // Fallback for environments without Intl.RelativeTimeFormat
        const hours = Math.floor(diffMs / 3600000);
        if (hours < 1) { return 'Just now'; }
        if (hours < 24) { return `${hours}h ago`; }
        return `${Math.floor(hours / 24)}d ago`;
    }
}
