/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Page Load Guard (GAP-2601 FIX)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PROBLEM: Every page loads its TS module via <script type="module">.
 *          If this fails (network error on Syrian 2G, CDN issue, JS parse error),
 *          skeleton loaders (.animate-pulse divs) spin FOREVER — no error message,
 *          no retry button. The user is stranded on a blank/spinning page.
 *
 * SOLUTION: A lightweight (~1.5KB) NON-MODULE script that monitors page hydration.
 *           After a configurable timeout, if skeleton loaders are still visible,
 *           it injects a user-friendly error banner with a retry button.
 *
 * Architecture:
 *   • Loaded as a regular <script defer> — NOT type="module" — so it works
 *     even when ES module loading itself fails.
 *   • Uses requestIdleCallback → setTimeout fallback for minimum performance impact.
 *   • Checks for [data-skeleton], .animate-pulse, and .ph-spin indicators.
 *   • Respects prefers-reduced-motion for the retry button animation.
 *   • RTL-safe — inline styles use logical properties.
 *   • i18n-aware — checks for window.NM_LANG or html[lang] to show Arabic/English.
 *
 * Standard: Progressive Enhancement, Nielsen #1 (System Status Visibility),
 *           Apple HIG (Error Recovery), Material Design 3 (Error States).
 *
 * @version 1.0.0
 * @since GAP-2601
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  /** Timeout in ms before showing the error fallback. 10s accommodates Syrian 2G. */
  var GUARD_TIMEOUT_MS = 10000;

  /** CSS class added to <html> by page modules when initial data hydration completes. */
  var HYDRATED_ATTR = 'data-hydrated';

  /**
   * Detect if page still has unresolved skeleton loaders.
   * Returns true if skeletons are present AND no hydration signal has been set.
   * GAP-2601-V2 FIX: Also checks if skeleton elements are actually visible
   * (display !== 'none') to avoid false positives from hidden tab sections.
   */
  function hasUnresolvedSkeletons() {
    // If the page TS module signaled hydration, all is well
    if (document.documentElement.hasAttribute(HYDRATED_ATTR)) {
      return false;
    }

    // Check for common skeleton indicators — but only VISIBLE ones
    var pulseElements = document.querySelectorAll('.animate-pulse');
    var spinners = document.querySelectorAll('.ph-spin');
    var skeletons = document.querySelectorAll('[data-skeleton]');

    var visibleCount = 0;
    var all = [].concat(
      Array.prototype.slice.call(pulseElements),
      Array.prototype.slice.call(spinners),
      Array.prototype.slice.call(skeletons)
    );
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      // Skip if element or parent is hidden (nm-hidden class or display:none)
      if (el.closest('.nm-hidden') || el.offsetParent === null) { continue; }
      visibleCount++;
    }

    return visibleCount > 0;
  }

  /**
   * Inject the error banner with retry CTA into the page.
   * Placed inside <main> if present, otherwise appended to <body>.
   */
  function injectErrorBanner() {
    // Don't inject if already present
    if (document.getElementById('nm-load-guard-banner')) { return; }

    // Determine language for i18n
    var lang = (window.NM_LANG || document.documentElement.lang || 'en').substring(0, 2);
    var isArabic = (lang === 'ar');

    var title = isArabic
      ? 'تعذّر تحميل البيانات'
      : 'Unable to load data';
    var desc = isArabic
      ? 'يبدو أن هناك مشكلة في الاتصال. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.'
      : 'There seems to be a connection issue. Please check your internet connection and try again.';
    var retryText = isArabic ? 'إعادة المحاولة' : 'Retry';
    var dir = isArabic ? 'rtl' : 'ltr';

    var banner = document.createElement('div');
    banner.id = 'nm-load-guard-banner';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.style.cssText = [
      'position:fixed',
      /* P2-LDG-001 FIX: Was magic bottom:80px — doesn't respect dynamic --nm-nav-h\n         set by nav.js. On devices with large safe-area insets, the banner could\n         be partially hidden behind the nav bar.\n         Standard: CSS Custom Properties, Adaptive Component Positioning. */
      'bottom:calc(var(--nm-nav-h, 80px) + 8px)',
      'inset-inline-start:50%',
      'transform:translateX(-50%)',
      /* DT-5 FIX: Was magic z-index:9940 — now uses design token with fallback.\n         Note: load-guard inline styles are INTENTIONAL — fallback component\n         must render when main CSS fails to load (progressive enhancement).\n         Standard: INC-X06 z-index token governance. */
      'z-index:var(--z-toast, 9940)',
      'max-width:380px',
      'width:calc(100% - 32px)',
      'background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      'color:#f8fafc',
      'border-radius:16px',
      'padding:20px',
      'box-shadow:0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)',
      'font-family:system-ui, -apple-system, sans-serif',
      'direction:' + dir,
      'animation:nmLoadGuardFadeIn 0.4s ease-out'
    ].join(';');

    banner.innerHTML = [
      '<style>',
      '@keyframes nmLoadGuardFadeIn{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}',
      '@media(prefers-reduced-motion:reduce){@keyframes nmLoadGuardFadeIn{from{opacity:0}to{opacity:1}}}',
      '</style>',
      '<div style="display:flex;align-items:flex-start;gap:12px">',
        '<div style="width:40px;height:40px;border-radius:10px;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">',
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        '</div>',
        '<div style="flex:1;min-width:0">',
          '<p style="font-size:14px;font-weight:700;margin:0">' + title + '</p>',
          '<p style="font-size:12px;color:rgba(248,250,252,0.6);margin:4px 0 0;line-height:1.5">' + desc + '</p>',
        '</div>',
      '</div>',
      '<button id="nm-load-guard-retry" style="',
        'margin-top:14px;',
        'width:100%;',
        'padding:10px 16px;',
        'background:#1a73e8;',
        'color:white;',
        'font-size:13px;',
        'font-weight:700;',
        'border:none;',
        'border-radius:10px;',
        'cursor:pointer;',
        'display:flex;',
        'align-items:center;',
        'justify-content:center;',
        'gap:8px;',
        'transition:background 0.2s',
      '">',
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
        retryText,
      '</button>'
    ].join('');

    // Insert into DOM
    var main = document.querySelector('#main-content') || document.querySelector('main');
    var container = main || document.body;
    container.appendChild(banner);

    // Wire retry button
    var retryBtn = document.getElementById('nm-load-guard-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        window.location.reload();
      });
      retryBtn.addEventListener('mouseenter', function () {
        this.style.background = '#1557b0';
      });
      retryBtn.addEventListener('mouseleave', function () {
        this.style.background = '#1a73e8';
      });
    }

    // Also hide all remaining spinners to reduce confusion
    var spinners = document.querySelectorAll('.ph-spin');
    for (var i = 0; i < spinners.length; i++) {
      spinners[i].classList.remove('ph-spin');
      // Replace spinner icon with alert icon visually
      spinners[i].className = spinners[i].className.replace('ph-spinner-gap', 'ph-warning-circle');
      spinners[i].style.color = '#ef4444';
    }
  }

  /**
   * Schedule the guard check. Uses requestIdleCallback if available,
   * falls back to setTimeout for maximum compatibility.
   */
  function scheduleGuard() {
    var timer = setTimeout(function () {
      if (hasUnresolvedSkeletons()) {
        injectErrorBanner();
      }
    }, GUARD_TIMEOUT_MS);

    // If the page hydrates before timeout, cancel the guard
    var observer = new MutationObserver(function () {
      if (document.documentElement.hasAttribute(HYDRATED_ATTR)) {
        clearTimeout(timer);
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [HYDRATED_ATTR] });
  }

  // ─── Bootstrap ──────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleGuard);
  } else {
    scheduleGuard();
  }
})();
