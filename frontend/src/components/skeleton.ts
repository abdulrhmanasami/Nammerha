// ============================================================================
// Nammerha — Shared Skeleton Components
// P2-SKEL-001 FIX: Standardized skeleton loading patterns.
// ============================================================================
// Previous: Each page created ad-hoc skeleton HTML strings with inconsistent
// classes, dimensions, and animation timings. Some used animate-pulse (Tailwind),
// others used custom @keyframes, and the homepage retry path hardcoded a 280px
// skeleton string inline.
//
// Now: Centralized skeleton factory functions produce consistent, accessible,
// dark-mode-aware loading placeholders across all pages.
//
// Usage:
//   import { createCardSkeleton, createListSkeleton, createStatSkeleton } from '../components/skeleton';
//   container.innerHTML = createCardSkeleton(3); // 3 card placeholders
// ============================================================================

/**
 * A single project card skeleton — matches the dimensions of buildProjectCard().
 * Includes cover image area, title bar, description bar, and progress bar.
 */
export function createProjectCardSkeleton(): string {
    return `
    <div class="min-w-[280px] w-[280px] glass-card rounded-2xl overflow-hidden shadow-md snap-start snap-always nm-skeleton" aria-hidden="true">
        <div class="h-44 bg-slate-200 dark:bg-slate-700 nm-skeleton-pulse"></div>
        <div class="p-4 space-y-3">
            <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 nm-skeleton-pulse"></div>
            <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full nm-skeleton-pulse" style="animation-delay: 0.1s"></div>
            <div class="h-2 bg-slate-200 dark:bg-slate-700 rounded-full w-full mt-2 nm-skeleton-pulse" style="animation-delay: 0.2s"></div>
        </div>
    </div>`;
}

/**
 * A stat card skeleton — matches the Stats Quick Glance card dimensions.
 */
export function createStatSkeleton(): string {
    return `
    <div class="w-full rounded-2xl p-5 bg-slate-200 dark:bg-slate-700 nm-skeleton" aria-hidden="true">
        <div class="space-y-3">
            <div class="h-3 bg-slate-300 dark:bg-slate-600 rounded w-1/3 nm-skeleton-pulse"></div>
            <div class="h-6 bg-slate-300 dark:bg-slate-600 rounded w-1/2 nm-skeleton-pulse" style="animation-delay: 0.1s"></div>
            <div class="h-3 bg-slate-300 dark:bg-slate-600 rounded w-1/4 nm-skeleton-pulse" style="animation-delay: 0.2s"></div>
        </div>
    </div>`;
}

/**
 * A list item skeleton — matches portal list items (projects, transactions, bids).
 */
export function createListItemSkeleton(): string {
    return `
    <div class="glass-card rounded-xl p-4 flex items-center gap-4 nm-skeleton" aria-hidden="true">
        <div class="size-12 rounded-xl bg-slate-200 dark:bg-slate-700 shrink-0 nm-skeleton-pulse"></div>
        <div class="flex-1 space-y-2">
            <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3 nm-skeleton-pulse"></div>
            <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full nm-skeleton-pulse" style="animation-delay: 0.1s"></div>
        </div>
        <div class="h-8 w-16 bg-slate-200 dark:bg-slate-700 rounded-lg shrink-0 nm-skeleton-pulse" style="animation-delay: 0.15s"></div>
    </div>`;
}

/**
 * Generate N skeleton items of a given type.
 * @param count - Number of skeleton items to generate
 * @param type - 'card' | 'list' | 'stat'
 * @param wrapperClass - Optional CSS class for the container div
 */
export function createSkeletonGroup(
    count: number,
    type: 'card' | 'list' | 'stat' = 'card',
    wrapperClass = ''
): string {
    const factory = {
        card: createProjectCardSkeleton,
        list: createListItemSkeleton,
        stat: createStatSkeleton,
    }[type];

    const items = Array.from({ length: count }, () => factory()).join('');
    
    if (wrapperClass) {
        return `<div class="${wrapperClass}">${items}</div>`;
    }
    return items;
}

/**
 * Replace a container's content with skeletons, then call a loader function.
 * On success, replaces skeletons with real content. On failure, shows error.
 * 
 * @param containerId - DOM id of the container
 * @param count - Number of skeleton items to show
 * @param type - Skeleton type
 * @param loader - Async function that returns HTML string or null
 */
export async function withSkeletonLoading(
    containerId: string,
    count: number,
    type: 'card' | 'list' | 'stat',
    loader: () => Promise<string | null>,
): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) { return; }

    // Show skeletons
    container.innerHTML = createSkeletonGroup(count, type);

    try {
        const html = await loader();
        if (html !== null) {
            container.innerHTML = html;
        }
    } catch {
        // Leave skeletons visible — caller handles error state
    }
}
