/**
 * Nammerha — Back-to-Top FAB (Self-Injecting Vanilla JS Component)
 * ═══════════════════════════════════════════════════════════════════
 * M-AUD-009 FIX: Provides scroll-to-top capability for long-scrolling pages.
 * Auto-injected by nav.js following the theme-toggle.js / haptic.js pattern.
 *
 * Design:
 *   - Appears after scrolling 400px
 *   - Fixed position, RTL-safe (inset-inline-end)
 *   - Uses z-index design token var(--z-dropdown)
 *   - Glassmorphism style matching design system
 *   - Smooth scroll with scrollTo({ behavior: 'smooth' })
 *   - 60fps show/hide via opacity transition (no layout thrash)
 *   - Dark mode aware via data-theme attribute
 *
 * Standard: Mobile UX (Long Page Navigation), Apple HIG (Scroll Affordance).
 */
(function () {
    'use strict';

    // Guard against double-init
    if (window._nmBackToTop) return;
    window._nmBackToTop = true;

    var SCROLL_THRESHOLD = 400;
    var fab = null;
    var ticking = false;

    function createFab() {
        var btn = document.createElement('button');
        btn.id = 'back-to-top-fab';
        btn.setAttribute('aria-label', 'Back to top');
        btn.setAttribute('data-i18n-aria', 'aria_back_to_top');
        btn.setAttribute('data-haptic', 'tap');
        btn.innerHTML = '<i class="ph ph-arrow-up" style="font-size:20px" aria-hidden="true"></i>';

        // P1-BTT-001 FIX: CSS class replaces 17-property inline style.cssText.
        // All styling now in main.css (.nm-back-to-top), enabling:
        //   • Dark mode overrides via html[data-theme="dark"]
        //   • .keyboard-visible hide (P1-BTT-002)
        //   • @media (prefers-reduced-motion) override (P3-A11Y-001)
        // Standard: P1-001 precedent (nav.js), CSS Single Source of Truth.
        btn.className = 'nm-back-to-top';

        btn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Active press feedback — uses CSS :active state (.nm-back-to-top:active in main.css)
        // No JS pointerdown/up/leave needed — CSS handles it for consistency.

        document.body.appendChild(btn);
        return btn;
    }

    function handleScroll() {
        if (ticking) return;
        ticking = true;

        requestAnimationFrame(function () {
            var scrollY = window.scrollY || document.documentElement.scrollTop;

            if (!fab) {
                fab = createFab();
            }

            // P1-BTT-SYNC FIX: CSS class toggle replaces inline style.opacity/visibility.
            // Aligns with back-to-top.ts and main.css (.nm-back-to-top--visible).
            // Enables: dark mode, reduced motion, keyboard-visible hiding.
            fab.classList.toggle('nm-back-to-top--visible', scrollY > SCROLL_THRESHOLD);
            ticking = false;
        });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
})();
