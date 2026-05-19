/**
 * P1-UXA-002 FIX: Progressive Load-More Pagination Utility
 * ══════════════════════════════════════════════════════════════════════════
 * Provides cursor-free offset/limit pagination for portal list views.
 * Critical for Syria's 2G/3G networks where loading 1000+ records at once
 * causes 10-30s page freezes and potential OOM crashes on low-end devices.
 *
 * Architecture:
 *   - State machine tracks offset, hasMore, isLoading per list instance
 *   - Renders a "Load More" button below the list container
 *   - Auto-disables button during fetch, re-enables on completion
 *   - Integrates with renderErrorWithRetry for failed pages
 *   - Respects RTL layout via logical CSS properties
 *
 * Usage:
 *   const paginator = createPaginator({
 *       containerId: 'projects-tbody',
 *       pageSize: 20,
 *       fetcher: (limit, offset) => contractor.getProjects(undefined, { limit, offset }),
 *       renderItems: (items) => items.map(renderProjectRow).join(''),
 *       emptyState: () => renderEmptyState('no_projects', 'No projects found', 'ph-folder-open'),
 *   });
 *   await paginator.loadFirst(); // Initial load
 *
 * Standard: WCAG 2.1 AA (keyboard accessible load-more), Nielsen #1 (system status).
 * ══════════════════════════════════════════════════════════════════════════
 */

import { t } from './i18n';
import { renderErrorWithRetry } from './error-retry';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PaginatorConfig<T> {
  /** ID of the container element where items are rendered */
  containerId: string;
  /** Number of items per page. Default: 20 */
  pageSize?: number;
  /** Async function that fetches a page of data */
  fetcher: (limit: number, offset: number) => Promise<{ data?: T[] | null; success?: boolean }>;
  /** Function that converts items to HTML string (appended to container) */
  renderItems: (items: T[]) => string;
  /** Function that returns empty state HTML when zero total results */
  emptyState?: () => string;
  /** Called after each successful page load with the page items */
  onPageLoad?: (items: T[], totalLoaded: number) => void;
}

interface PaginatorState {
  offset: number;
  hasMore: boolean;
  isLoading: boolean;
  totalLoaded: number;
}

interface Paginator {
  /** Load the first page (resets state, clears container) */
  loadFirst: () => Promise<void>;
  /** Load the next page (appends to container) */
  loadNext: () => Promise<void>;
  /** Reset state without loading */
  reset: () => void;
  /** Current state */
  readonly state: Readonly<PaginatorState>;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createPaginator<T>(config: PaginatorConfig<T>): Paginator {
  const pageSize = config.pageSize ?? 20;

  const state: PaginatorState = {
    offset: 0,
    hasMore: true,
    isLoading: false,
    totalLoaded: 0,
  };

  /** Get or create the "Load More" button below the container */
  function getOrCreateLoadMoreBtn(container: HTMLElement): HTMLButtonElement {
    const btnId = `${config.containerId}-load-more`;
    let btn = document.getElementById(btnId) as HTMLButtonElement | null;

    if (!btn) {
      btn = document.createElement('button');
      btn.id = btnId;
      btn.type = 'button';
      btn.className = 'nm-load-more-btn';
      btn.setAttribute('data-i18n', 'load_more');
      btn.addEventListener('click', () => {
        void loadNext();
      });

      // Insert after the container
      const wrapper = document.createElement('div');
      wrapper.className = 'nm-load-more-wrapper';
      wrapper.appendChild(btn);
      container.parentElement?.insertBefore(wrapper, container.nextSibling);
    }

    return btn;
  }

  /** Update load-more button visibility and text */
  function updateLoadMoreUI(container: HTMLElement): void {
    const btnId = `${config.containerId}-load-more`;
    const wrapper = document.getElementById(btnId)?.parentElement;

    if (!state.hasMore || state.totalLoaded === 0) {
      wrapper?.classList.add('nm-hidden');
      return;
    }

    wrapper?.classList.remove('nm-hidden');
    const btn = getOrCreateLoadMoreBtn(container);
    btn.disabled = false;
    btn.innerHTML = `
            <i class="ph ph-arrow-down text-base" aria-hidden="true"></i>
            ${t('load_more', 'تحميل المزيد')}
        `;
  }

  /** Show loading state on button */
  function setButtonLoading(btn: HTMLButtonElement): void {
    btn.disabled = true;
    btn.innerHTML = `
            <i class="ph ph-spinner-gap ph-spin text-base" aria-hidden="true"></i>
            ${t('loading', 'جاري التحميل...')}
        `;
  }

  async function loadFirst(): Promise<void> {
    const container = document.getElementById(config.containerId);
    if (!container) {
      return;
    }

    // Reset state
    state.offset = 0;
    state.hasMore = true;
    state.totalLoaded = 0;
    container.innerHTML = '';

    await fetchPage(container, true);
  }

  async function loadNext(): Promise<void> {
    if (state.isLoading || !state.hasMore) {
      return;
    }

    const container = document.getElementById(config.containerId);
    if (!container) {
      return;
    }

    await fetchPage(container, false);
  }

  async function fetchPage(container: HTMLElement, isFirst: boolean): Promise<void> {
    if (state.isLoading) {
      return;
    }
    state.isLoading = true;

    // Show loading on button (not first load — that uses skeleton)
    let btn: HTMLButtonElement | undefined;
    if (!isFirst) {
      btn = getOrCreateLoadMoreBtn(container);
      setButtonLoading(btn);
    }

    try {
      const res = await config.fetcher(pageSize, state.offset);
      const items = res.data ?? [];

      if (isFirst && items.length === 0) {
        // Empty state
        container.innerHTML =
          config.emptyState?.() ??
          `
                    <div class="p-8 text-center text-slate-400 dark:text-slate-500">
                        <i class="ph ph-folder-open text-3xl" aria-hidden="true"></i>
                        <p class="mt-2 text-sm" data-i18n="no_data">${t('no_data', 'لا توجد بيانات')}</p>
                    </div>
                `;
        state.hasMore = false;
        updateLoadMoreUI(container);
        return;
      }

      // Append rendered items
      const html = config.renderItems(items);
      container.insertAdjacentHTML('beforeend', html);

      // Update state
      state.offset += items.length;
      state.totalLoaded += items.length;
      state.hasMore = items.length >= pageSize;

      // Callback
      config.onPageLoad?.(items, state.totalLoaded);

      // Update button
      updateLoadMoreUI(container);
    } catch (err) {
      if (isFirst) {
        // First page error — show full error state
        renderErrorWithRetry(container, loadFirst, undefined, undefined, err);
      } else {
        // Subsequent page error — show error on the button area
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `
                        <i class="ph ph-warning-circle text-base text-red-400" aria-hidden="true"></i>
                        ${t('load_more_retry', 'فشل — اضغط لإعادة المحاولة')}
                    `;
        }
      }
    } finally {
      state.isLoading = false;
    }
  }

  function reset(): void {
    state.offset = 0;
    state.hasMore = true;
    state.isLoading = false;
    state.totalLoaded = 0;

    // Clean up load-more button
    const btnId = `${config.containerId}-load-more`;
    document.getElementById(btnId)?.parentElement?.remove();
  }

  return {
    loadFirst,
    loadNext,
    reset,
    get state() {
      return state;
    },
  };
}
