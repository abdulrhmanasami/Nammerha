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

        // Glassmorphism styling matching Nammerha design system
        btn.style.cssText =
            'position:fixed;' +
            'bottom:100px;' +
            'inset-inline-end:16px;' +
            'z-index:var(--z-dropdown,10);' +
            'width:44px;height:44px;' +
            'border-radius:var(--radius-full,9999px);' +
            'background:var(--surface-elevated,rgba(255,255,255,0.7));' +
            'backdrop-filter:blur(12px);' +
            '-webkit-backdrop-filter:blur(12px);' +
            'border:1px solid var(--border-light,rgba(255,255,255,0.3));' +
            'box-shadow:var(--shadow-elevation,0 2px 8px rgba(0,0,0,0.08));' +
            'color:var(--trust-blue,#1a73e8);' +
            'cursor:pointer;' +
            'display:flex;align-items:center;justify-content:center;' +
            'opacity:0;visibility:hidden;' +
            'transition:opacity 0.3s ease,visibility 0.3s ease,transform 0.15s ease;' +
            '-webkit-tap-highlight-color:transparent;';

        btn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Active press feedback
        btn.addEventListener('pointerdown', function () {
            btn.style.transform = 'scale(0.9)';
        });
        btn.addEventListener('pointerup', function () {
            btn.style.transform = '';
        });
        btn.addEventListener('pointerleave', function () {
            btn.style.transform = '';
        });

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

            if (scrollY > SCROLL_THRESHOLD) {
                fab.style.opacity = '1';
                fab.style.visibility = 'visible';
            } else {
                fab.style.opacity = '0';
                fab.style.visibility = 'hidden';
            }
            ticking = false;
        });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
})();
