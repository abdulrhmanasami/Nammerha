/**
 * Nammerha — Global Error Catcher + Unified Bottom Navigation Bar
 * ═══════════════════════════════════════════════════════════════════
 * PLT-FINAL-004 FIX: The TypeScript error-reporter module only covers
 * index.html (loaded via main.ts). This lightweight catcher runs on
 * EVERY page via nav.js, ensuring auth, wallet, profile, and all 24
 * page entry points capture errors → sendBeacon to /api/client-errors.
 *
 * Idempotent: If the TS error-reporter already installed window.onerror,
 * this will NOT overwrite it.
 */
(function () {
    'use strict';
    if (window.onerror) return; // TS module already installed — skip

    var ERROR_ENDPOINT = '/api/client-errors';
    var errCount = 0;
    var MAX_PER_MIN = 10;
    var lastReset = Date.now();

    function shouldReport() {
        if (Date.now() - lastReset > 60000) { errCount = 0; lastReset = Date.now(); }
        if (errCount >= MAX_PER_MIN) return false;
        errCount++;
        return true;
    }

    function send(payload) {
        if (!shouldReport()) return;
        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon(ERROR_ENDPOINT, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
            }
        } catch (e) { /* swallow — last resort, error already logged to console */ }
    }

    window.onerror = function (msg, source, lineno, colno, error) {
        send({
            message: typeof msg === 'string' ? msg : (error && error.message) || 'Unknown',
            source: source, lineno: lineno, colno: colno,
            stack: error && error.stack,
            url: location.href,
            timestamp: new Date().toISOString(),
            type: 'error'
        });
    };

    window.onunhandledrejection = function (event) {
        var reason = event.reason;
        send({
            message: reason instanceof Error ? reason.message : String(reason || 'Unhandled rejection'),
            stack: reason instanceof Error ? reason.stack : undefined,
            url: location.href,
            timestamp: new Date().toISOString(),
            type: 'unhandledrejection'
        });
    };
})();

/**
 * Nammerha — Unified Bottom Navigation Bar (Frontend Build)
 * ═══════════════════════════════════════════════════════════
 * Auto-injects consistent 5-tab navigation into every page.
 * Uses Phosphor icons (same as the rest of the frontend).
 * Detects active tab from URL. Removes old inconsistent navs.
 */
(function () {
    'use strict';

    // ─── Page→Tab Mapping ────────────────────────────────────────────────
    var PAGE_TAB_MAP = {
        'index.html': 'home',
        'project-details.html': 'projects',
        'engineer-boq.html': 'projects',
        'engineer-camera.html': 'projects',
        'homeowner-report.html': 'projects',
        'donor-basket.html': 'impact',
        'donor-proof.html': 'impact',
        'donor-portal.html': 'impact',
        'wallet.html': 'wallet',
        'profile.html': 'profile',
        'about.html': 'profile',
        'pricing.html': 'profile',
        'contact.html': 'profile',
        'tradesperson-portal.html': 'projects',
        'homeowner-portal.html': 'projects',
        'contractor-portal.html': 'projects',
        'admin-dashboard.html': 'home',
        'admin-escrow.html': 'wallet',
        'admin-kyc.html': 'profile',
        'admin-oracle.html': 'projects',
        'admin-revenue.html': 'wallet',
        'admin-fintech.html': 'wallet',
        'compliance-dashboard.html': 'projects',
        'contractor-dashboard.html': 'projects',
        'supplier-dashboard.html': 'projects',
    };

    // Pages where the bottom nav should be hidden entirely:
    // - Auth flows (no nav needed)
    // - Dashboard/portal pages (have their own sidebar navigation — C-002 FIX)
    var HIDE_NAV_PAGES = [
        // Auth flows
        'auth.html', 'reset-password.html', 'verify-email.html',
        // Dashboard pages with sidebar nav (C-002: suppress dual-navigation)
        'admin-dashboard.html', 'admin-escrow.html', 'admin-kyc.html',
        'admin-oracle.html', 'admin-revenue.html', 'admin-fintech.html',
        'compliance-dashboard.html', 'contractor-dashboard.html',
        'supplier-dashboard.html', 'homeowner-portal.html',
        'donor-portal.html', 'contractor-portal.html',
        'tradesperson-portal.html',
    ];

    // ─── Navigation Tabs (Phosphor icons) ────────────────────────────────
    var TABS = [
        { id: 'home', label: 'Home', i18n: 'nav_home', icon: 'ph-house', href: '/index.html' },
        { id: 'projects', label: 'Projects', i18n: 'nav_projects', icon: 'ph-buildings', href: '/project-details.html' },
        { id: 'impact', label: 'Impact', i18n: 'nav_impact', icon: 'ph-chart-bar', href: '/donor-basket.html' },
        { id: 'wallet', label: 'Wallet', i18n: 'nav_wallet', icon: 'ph-wallet', href: '/wallet.html' },
        { id: 'profile', label: 'Profile', i18n: 'nav_profile', icon: 'ph-user', href: '/profile.html' },
    ];

    // ─── Detect Active Tab ───────────────────────────────────────────────
    function shouldHideNav() {
        var path = window.location.pathname;
        for (var i = 0; i < HIDE_NAV_PAGES.length; i++) {
            if (path.indexOf(HIDE_NAV_PAGES[i]) !== -1) return true;
        }
        // C-002 FALLBACK: Dynamic detection for any future dashboard pages.
        // If a page has a .dashboard-sidebar, it has its own nav — don't inject bottom nav.
        if (document.querySelector('.dashboard-sidebar')) return true;
        return false;
    }

    function detectActiveTab() {
        var path = window.location.pathname;
        for (var page in PAGE_TAB_MAP) {
            if (path.indexOf(page) !== -1) return PAGE_TAB_MAP[page];
        }
        if (path === '/' || path === '') return 'home';
        return 'home';
    }

    // ─── Build Navigation Bar ───────────────────────────────────────────
    function buildNavBar() {
        var activeTab = detectActiveTab();

        var nav = document.createElement('nav');
        nav.id = 'nammerha-unified-nav';
        nav.setAttribute('aria-label', 'Main navigation');
        var isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
        // P1-001 FIX: CSS classes replace inline style.cssText
        nav.className = 'nm-bottom-nav';
        nav.setAttribute('data-nav-theme', isDark ? 'dark' : 'light');

        var wrap = document.createElement('div');
        wrap.className = 'nm-nav-wrap';

        for (var i = 0; i < TABS.length; i++) {
            var tab = TABS[i];
            var active = tab.id === activeTab;

            var a = document.createElement('a');
            a.href = tab.href;
            a.setAttribute('aria-current', active ? 'page' : 'false');
            // P1-001 FIX: CSS class replaces inline style.cssText
            a.className = 'nm-nav-item';

            // MOB-001 FIX: Use regular "ph" for ALL icons.
            // The "ph-fill" weight requires Phosphor-Fill.woff2 which is NOT shipped.
            // Active differentiation is via color (L72-73), not font weight.
            var icon = document.createElement('i');
            icon.className = 'ph ' + tab.icon + ' nm-nav-icon';
            icon.setAttribute('aria-hidden', 'true');

            var lbl = document.createElement('span');
            lbl.textContent = tab.label;
            lbl.setAttribute('data-i18n', tab.i18n);
            lbl.className = 'nm-nav-label';

            a.appendChild(icon);
            a.appendChild(lbl);
            wrap.appendChild(a);
        }

        nav.appendChild(wrap);

        // ─── Theme Toggle Button (sun/moon) ─────────────────────────────
        var themeBtn = document.createElement('button');
        themeBtn.id = 'nm-global-theme-toggle';
        // P2-AUD-003 FIX: i18n-aware theme toggle title (was hardcoded Arabic)
        var themeLabel = isDark
            ? (window.NammerhaI18n && window.NammerhaI18n.t ? window.NammerhaI18n.t('nav_theme_light') : 'Light Mode')
            : (window.NammerhaI18n && window.NammerhaI18n.t ? window.NammerhaI18n.t('nav_theme_dark') : 'Dark Mode');
        themeBtn.title = themeLabel;
        // P1-I18N-003 FIX: aria-label for screen reader accessibility
        themeBtn.setAttribute('aria-label', themeLabel);
        // P1-001 FIX: CSS class replaces inline style.cssText
        themeBtn.className = 'nm-theme-fab';
        var themeBtnIcon = document.createElement('i');
        themeBtnIcon.className = isDark ? 'ph ph-sun' : 'ph ph-moon';
        themeBtn.appendChild(themeBtnIcon);
        nav.appendChild(themeBtn);

        themeBtn.addEventListener('click', function() {
            document.documentElement.classList.add('nm-theme-transition');
            // P0-ARCH-004 FIX: Delegate to shared NammerhaTheme module (Single Source of Truth).
            // Falls back to inline logic if theme-toggle.js hasn't loaded (graceful degradation).
            var next;
            if (window.NammerhaTheme && window.NammerhaTheme.toggle) {
                next = window.NammerhaTheme.toggle();
            } else {
                var cur = document.documentElement.getAttribute('data-theme') || 'dark';
                next = cur === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                try { localStorage.setItem('nm-theme', next); } catch(e) {}
            }
            themeBtnIcon.className = next === 'dark' ? 'ph ph-sun' : 'ph ph-moon';
            // P2-AUD-003 FIX: i18n-aware theme toggle title
            themeBtn.title = next === 'dark'
                ? (window.NammerhaI18n && window.NammerhaI18n.t ? window.NammerhaI18n.t('nav_theme_light') : 'Light Mode')
                : (window.NammerhaI18n && window.NammerhaI18n.t ? window.NammerhaI18n.t('nav_theme_dark') : 'Dark Mode');
            // P1-001 FIX: Theme switching now only flips data-nav-theme — CSS handles the rest
            nav.setAttribute('data-nav-theme', next);
            // Also sync about page's toggle if present
            var aboutIcon = document.getElementById('themeIcon');
            if (aboutIcon) aboutIcon.className = (next === 'dark') ? 'ph ph-sun' : 'ph ph-moon';
            setTimeout(function() {
                document.documentElement.classList.remove('nm-theme-transition');
            }, 500);
        });

        // P3-AUD-003 FIX: Auto-sync theme when OS preference changes.
        // Respects manual override: if user explicitly toggled theme (stored in
        // localStorage), OS changes are ignored. Otherwise, follows system preference.
        try {
            var mql = window.matchMedia('(prefers-color-scheme: dark)');
            if (mql && mql.addEventListener) {
                mql.addEventListener('change', function(e) {
                    // Only auto-sync if user hasn't manually set a preference
                    try { if (localStorage.getItem('nm-theme')) return; } catch(ex) {}
                    var next = e.matches ? 'dark' : 'light';
                    document.documentElement.setAttribute('data-theme', next);
                    var nd = next === 'dark';
                    themeBtnIcon.className = nd ? 'ph ph-sun' : 'ph ph-moon';
                    // P1-001 FIX: Only flip attribute — CSS handles theme colors
                    nav.setAttribute('data-nav-theme', next);
                });
            }
        } catch(e) { /* matchMedia not supported — graceful degradation */ }

        // Safe area for modern phones
        var safe = document.createElement('div');
        safe.className = 'nm-nav-safe-area';
        nav.appendChild(safe);

        return nav;
    }

    // ─── Remove Old Navigation Bars ──────────────────────────────────────
    function removeOldNavs() {
        var allNavs = document.querySelectorAll('nav');
        for (var i = 0; i < allNavs.length; i++) {
            var n = allNavs[i];
            if (n.id === 'nammerha-unified-nav') continue;
            var cls = n.className || '';
            var isBottomNav =
                cls.indexOf('bottom-nav') !== -1 ||
                cls.indexOf('bottom-0') !== -1 ||
                (cls.indexOf('sticky') !== -1 && cls.indexOf('bottom') !== -1);
            if (isBottomNav) n.remove();
        }
    }

    // ─── Mobile Search Toggle ─────────────────────────────────────────────
    // On mobile (<640px), the full search bar (.nav-search-full) is hidden by CSS.
    // Clicking .nav-search-icon toggles .nav-search-expanded on the parent <nav>.
    //
    // ARCHITECTURE: Uses event delegation on document.body for defense-in-depth.
    // This guarantees the click handler fires even if DOM shifts or nav.js loads
    // before elements are fully painted. The delegated handler matches clicks on
    // .nav-search-icon *or any of its children* (e.g. the <i> icon inside).
    function initMobileSearchToggle() {
        var searchInput = document.getElementById('search-input');
        if (!searchInput) return;

        var isOpen = false;

        function getNavBar() {
            var icon = document.querySelector('.nav-search-icon');
            return icon ? icon.closest('nav') : null;
        }

        function openSearch() {
            var navBar = getNavBar();
            if (!navBar) return;
            isOpen = true;
            navBar.classList.add('nav-search-expanded');
            searchInput.focus();
        }

        function closeSearch() {
            var navBar = getNavBar();
            if (!navBar) return;
            isOpen = false;
            navBar.classList.remove('nav-search-expanded');
            searchInput.blur();
        }

        // Event delegation: catch click on .nav-search-icon or any child of it
        document.addEventListener('click', function (e) {
            var target = e.target;
            // Walk up from click target to see if we hit .nav-search-icon
            while (target && target !== document) {
                if (target.classList && target.classList.contains('nav-search-icon')) {
                    e.preventDefault();
                    e.stopPropagation();
                    openSearch();
                    return;
                }
                target = target.parentElement;
            }
        });

        // Close on Escape
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen) closeSearch();
        });

        // Close when input loses focus (tap elsewhere)
        searchInput.addEventListener('blur', function () {
            setTimeout(function () {
                if (isOpen && document.activeElement !== searchInput) closeSearch();
            }, 200);
        });

        // Close on window resize if now desktop
        window.addEventListener('resize', function () {
            if (isOpen && window.innerWidth >= 640) closeSearch();
        });
    }

    // ─── Init ────────────────────────────────────────────────────────────
    // P2-PERF-001 FIX: Sidebar toggle extracted to sidebar.js (loaded only
    // on dashboard pages). Theme CSS moved to main.css in P1-PERF-001.
    // nav.js is now focused: bottom nav bar + mobile search toggle.
    function init() {
        removeOldNavs();

        // P2-NAV-001 FIX: Hide nav on auth flow pages (login, register,
        // verify-email, reset-password) — these are full-page layouts.
        if (shouldHideNav()) return;

        document.body.appendChild(buildNavBar());

        var main = document.querySelector('main');
        if (main) {
            var currentPadding = parseInt(window.getComputedStyle(main).paddingBottom, 10) || 0;
            if (currentPadding < 80) main.style.paddingBottom = '96px';
        }

        initMobileSearchToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

