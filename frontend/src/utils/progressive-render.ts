/**
 * P1-UXA-002 FIX: Client-Side Progressive Rendering Utility
 * ══════════════════════════════════════════════════════════════════════════
 * For portals using SWR cache (which fetches all data at once), this utility
 * provides client-side progressive rendering — shows first N items and adds
 * a "Show More" button to reveal subsequent batches.
 *
 * Why client-side instead of server-side pagination?
 * 1. SWR cache already has all data — second fetch would be wasteful
 * 2. Preserves instant tab-switching (SWR serves cached data immediately)
 * 3. Solves the REAL problem: DOM rendering 1000+ cards causes jank
 * 4. Zero backend changes required
 *
 * For lists WITHOUT SWR (e.g., marketplace), use server-side pagination
 * via createPaginator() from './load-more.ts'.
 *
 * Usage:
 *   const rendered = renderProgressive({
 *       items: projects,
 *       containerEl: tbody,
 *       pageSize: 20,
 *       renderItem: (p, i) => `<div style="animation-delay:${i * 50}ms">...</div>`,
 *       emptyState: () => renderEmptyState({ ... }),
 *   });
 *
 * Standard: Nielsen #1 (System Status), WCAG 2.1 AA (keyboard accessible).
 * ══════════════════════════════════════════════════════════════════════════
 */

import { t } from './i18n';
import { tryApplyI18n } from '../utils/i18n-apply';

interface ProgressiveConfig<T> {
    /** Full array of items (all data) */
    items: T[];
    /** Container element to render into */
    containerEl: HTMLElement;
    /** Items per page. Default: 20 */
    pageSize?: number;
    /** Render a single item to HTML. Index is relative to full array. */
    renderItem: (item: T, index: number) => string;
    /** Returns empty state HTML when zero items */
    emptyState?: () => string;
    /** Called after rendering a batch */
    onRender?: (visibleCount: number, totalCount: number) => void;
}

/**
 * Renders items progressively into a container.
 * Shows first `pageSize` items immediately, with "Show More" for the rest.
 */
export function renderProgressive<T>(config: ProgressiveConfig<T>): void {
    const {
        items,
        containerEl,
        pageSize = 20,
        renderItem,
        emptyState,
        onRender,
    } = config;

    // Empty state
    if (items.length === 0) {
        containerEl.innerHTML = emptyState?.() ?? '';
        return;
    }

    // If small list, render all at once (no pagination needed)
    if (items.length <= pageSize) {
        containerEl.innerHTML = items.map(renderItem).join('');
        tryApplyI18n();
        onRender?.(items.length, items.length);
        return;
    }

    // Render first page
    let visibleCount = pageSize;
    const firstBatch = items.slice(0, pageSize).map(renderItem).join('');
    containerEl.innerHTML = firstBatch;

    // Create "Show More" button
    const btnId = `${containerEl.id}-show-more`;

    // Clean up any existing show-more from previous render
    document.getElementById(btnId)?.parentElement?.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'nm-load-more-wrapper';

    const btn = document.createElement('button');
    btn.id = btnId;
    btn.type = 'button';
    btn.className = 'nm-load-more-btn';
    updateButtonText(btn, visibleCount, items.length);

    btn.addEventListener('click', () => {
        const nextBatch = items.slice(visibleCount, visibleCount + pageSize);
        const html = nextBatch.map((item, i) => renderItem(item, visibleCount + i)).join('');
        containerEl.insertAdjacentHTML('beforeend', html);

        visibleCount += nextBatch.length;
        tryApplyI18n();
        onRender?.(visibleCount, items.length);

        if (visibleCount >= items.length) {
            // All items shown — remove button and disconnect observer
            observer?.disconnect();
            wrapper.remove();
        } else {
            updateButtonText(btn, visibleCount, items.length);
        }
    });

    wrapper.appendChild(btn);
    containerEl.parentElement?.insertBefore(wrapper, containerEl.nextSibling);

    // UX-F009 FIX: IntersectionObserver auto-loading.
    // PREVIOUS: Required explicit "Show More" click for each batch.
    // NOW: Auto-triggers when button scrolls into viewport — seamless infinite scroll.
    // Button remains visible as fallback + progress indicator.
    // Standard: Material Design 3 (Infinite Scroll), Nielsen #7 (Flexibility).
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && visibleCount < items.length) {
                    btn.click();
                }
            },
            { rootMargin: '200px' }, // Pre-fetch 200px before visible
        );
        observer.observe(wrapper);
    }

    tryApplyI18n();
    onRender?.(visibleCount, items.length);
}

/** Update "Show More" button label with remaining count */
function updateButtonText(btn: HTMLButtonElement, shown: number, total: number): void {
    const remaining = total - shown;
    btn.innerHTML = `
        <i class="ph ph-arrow-down text-base" aria-hidden="true"></i>
        ${t('show_more_count', `Show More (${remaining} remaining)`).replace('${count}', String(remaining))}
    `;
}
