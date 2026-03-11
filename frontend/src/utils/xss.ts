// ============================================================================
// Nammerha Frontend — XSS Protection Utility
// P0-NEW-001 FIX: Global HTML escape function for all innerHTML templates.
// Every user-controlled value (project titles, material names, user names,
// descriptions, etc.) MUST be wrapped in escapeHtml() before innerHTML injection.
// ============================================================================

/**
 * HTML entity escape map.
 * Covers all characters that could break an HTML context:
 *   & → &amp;   (prevents entity injection)
 *   < → &lt;    (prevents tag opening)
 *   > → &gt;    (prevents tag closing)
 *   " → &quot;  (prevents attribute breakout in double-quoted attrs)
 *   ' → &#39;   (prevents attribute breakout in single-quoted attrs)
 */
const ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

const ESCAPE_REGEX = /[&<>"']/g;

/**
 * Escape a string for safe HTML rendering in innerHTML templates.
 *
 * Accepts string, number, null, or undefined. Returns an empty string for
 * null/undefined values to prevent "null" or "undefined" from rendering.
 *
 * @example
 * ```ts
 * // BEFORE (XSS vulnerable):
 * `<h3>${project.title}</h3>`
 *
 * // AFTER (safe):
 * `<h3>${escapeHtml(project.title)}</h3>`
 * ```
 */
export function escapeHtml(value: string | number | null | undefined): string {
    if (value === null || value === undefined) { return ''; }
    return String(value).replace(ESCAPE_REGEX, (ch) => ESCAPE_MAP[ch] ?? ch);
}
