/**
 * Nammerha Icon Wrapper — Phosphor Icons Integration
 * Source: /stitch/phosphor-icons (LOCAL ONLY — no external icon libs)
 *
 * Usage:
 *   import { icon } from '../components/icon';
 *   element.innerHTML = icon('house', { size: 'lg', className: 'text-trust-blue' });
 */
/**
 * Returns an HTML string for a Phosphor icon <i> element.
 *
 * @param name  Phosphor icon name WITHOUT the "ph-" prefix (e.g. "house", "magnifying-glass")
 * @param opts  Optional sizing, classes, and accessibility
 * @returns     HTML string like `<i class="ph ph-house ph-lg text-trust-blue" aria-hidden="true"></i>`
 */
export function icon(name, opts = {}) {
    const classes = ['ph', `ph-${name}`];
    if (opts.size) {
        classes.push(`ph-${opts.size}`);
    }
    if (opts.className) {
        classes.push(opts.className);
    }
    const ariaAttr = opts.label
        ? `aria-label="${opts.label}" role="img"`
        : 'aria-hidden="true"';
    return `<i class="${classes.join(' ')}" ${ariaAttr}></i>`;
}
/**
 * Renders a Phosphor icon directly into a DOM element.
 *
 * @param container  Target DOM element
 * @param name       Phosphor icon name (e.g. "house")
 * @param opts       Optional sizing and classes
 */
export function renderIconInto(container, name, opts = {}) {
    container.innerHTML = icon(name, opts);
}
