// ============================================================================
// Nammerha — Back-to-Top FAB (Self-Injecting Component)
// GAP-010 FIX: Scroll-to-top button for long-scrolling pages
// ============================================================================
// Design:
//   - Appears after scrolling 400px
//   - Fixed position, RTL-safe (inset-inline-end)
//   - Uses z-index design token var(--z-dropdown)
//   - Glassmorphism style matching design system
//   - Smooth scroll with scrollTo({ behavior: 'smooth' })
//   - 60fps show/hide via opacity transition (no layout thrash)
// ============================================================================

const SCROLL_THRESHOLD = 400;
let fab: HTMLButtonElement | null = null;
let ticking = false;

function createFab(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'back-to-top-fab';
    btn.setAttribute('aria-label', 'Back to top');
    btn.setAttribute('data-i18n-aria', 'aria_back_to_top');
    btn.innerHTML = '<i class="ph ph-arrow-up" style="font-size:20px" aria-hidden="true"></i>';

    // DEF-BTT-TS FIX: CSS class replaces 22-line inline style.cssText.
    // .nm-back-to-top in main.css handles all styling including dark mode,
    // reduced motion, and keyboard visibility.
    // Previous: inline style.cssText duplicated the CSS class properties.
    // Standard: CSS Single Source of Truth, DRY Principle.
    btn.className = 'nm-back-to-top';

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Active press feedback via CSS class toggle (no inline styles)
    btn.addEventListener('pointerdown', () => {
        btn.classList.add('nm-back-to-top--pressed');
    });
    btn.addEventListener('pointerup', () => {
        btn.classList.remove('nm-back-to-top--pressed');
    });
    btn.addEventListener('pointerleave', () => {
        btn.classList.remove('nm-back-to-top--pressed');
    });

    document.body.appendChild(btn);
    return btn;
}

function handleScroll(): void {
    if (ticking) { return; }
    ticking = true;

    requestAnimationFrame(() => {
        const scrollY = window.scrollY || document.documentElement.scrollTop;

        if (!fab) {
            fab = createFab();
        }

        // DEF-BTT-TS FIX: Class toggle replaces inline style.opacity/visibility.
        // .nm-back-to-top--visible { opacity:1; visibility:visible } in main.css.
        fab.classList.toggle('nm-back-to-top--visible', scrollY > SCROLL_THRESHOLD);
        ticking = false;
    });
}

/**
 * Initialize back-to-top FAB on the current page.
 * Safe to call multiple times — only attaches once.
 */
export function initBackToTop(): void {
    // Guard against double-init
    if (document.getElementById('back-to-top-fab')) {
        return;
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
}
