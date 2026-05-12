// ============================================================================
// Nammerha — Standardized Empty State Component
// P2-004 FIX: Consistent empty state CTAs across all portal pages.
// ============================================================================
// Architecture: Provides a single, i18n-aware empty state generator used by
// all portal pages. Eliminates inconsistent empty state markup where some
// portals had icons without text, some had text without CTAs, and some
// had completely different styling.
//
// Usage:
//   import { renderEmptyState } from '../utils/empty-state';
//   container.innerHTML = renderEmptyState({
//       icon: 'hand-heart',
//       title: t('no_items', 'No items yet'),
//       subtitle: t('no_items_hint', 'Browse projects to get started'),
//       ctaLabel: t('browse_projects', 'Browse Projects'),
//       ctaHref: '/projects.html',
//   });
// ============================================================================

import { escapeHtml as esc } from './xss';

interface EmptyStateConfig {
    /** Phosphor icon name (without ph- prefix) */
    icon: string;
    /** Primary heading text (already translated) */
    title: string;
    /** Optional subtitle text (already translated) */
    subtitle?: string;
    /** Optional CTA button label */
    ctaLabel?: string;
    /** Optional CTA button href */
    ctaHref?: string;
    /** Optional CTA button i18n key */
    ctaI18nKey?: string;
    /** Whether to span full column width (for grid layouts) */
    fullSpan?: boolean;
}

/**
 * Generate a standardized empty state HTML block.
 * All portals should use this to ensure visual consistency.
 */
export function renderEmptyState(config: EmptyStateConfig): string {
    const {
        icon,
        title,
        subtitle,
        ctaLabel,
        ctaHref,
        ctaI18nKey,
        fullSpan = false,
    } = config;

    const spanClass = fullSpan ? 'col-span-full ' : '';

    const ctaHtml = ctaLabel && ctaHref
        ? `<a href="${esc(ctaHref)}" class="btn-primary nm-btn-sm mt-4 inline-flex items-center gap-2">
               <i class="ph ph-arrow-right" aria-hidden="true"></i>
               <span${ctaI18nKey ? ` data-i18n="${esc(ctaI18nKey)}"` : ''}>${esc(ctaLabel)}</span>
           </a>`
        : '';

    const subtitleHtml = subtitle
        ? `<p class="text-xs text-slate-400 mt-1 dark:text-slate-500">${esc(subtitle)}</p>`
        : '';

    return `<div class="${spanClass}p-8 text-center text-slate-400 dark:text-slate-500">
        <div class="size-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 dark:bg-dark-elevated">
            <i class="ph ph-${esc(icon)} nm-icon-32" aria-hidden="true"></i>
        </div>
        <p class="text-sm font-bold text-slate-700 dark:text-slate-300">${esc(title)}</p>
        ${subtitleHtml}
        ${ctaHtml}
    </div>`;
}
