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
        'wallet.html': 'wallet',
        'profile.html': 'profile',
        'about.html': 'profile',
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

    // ─── Navigation Tabs (Phosphor icons) ────────────────────────────────
    var TABS = [
        { id: 'home', label: 'Home', i18n: 'nav_home', icon: 'ph-house', href: '/index.html' },
        { id: 'projects', label: 'Projects', i18n: 'nav_projects', icon: 'ph-buildings', href: '/project-details.html' },
        { id: 'impact', label: 'Impact', i18n: 'nav_impact', icon: 'ph-chart-bar', href: '/donor-basket.html' },
        { id: 'wallet', label: 'Wallet', i18n: 'nav_wallet', icon: 'ph-wallet', href: '/wallet.html' },
        { id: 'profile', label: 'Profile', i18n: 'nav_profile', icon: 'ph-user', href: '/profile.html' },
    ];

    // ─── Detect Active Tab ───────────────────────────────────────────────
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
        nav.style.cssText =
            'position:fixed;bottom:0;left:0;right:0;z-index:9999;' +
            'background:' + (isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.92)') + ';backdrop-filter:blur(16px);' +
            '-webkit-backdrop-filter:blur(16px);border-top:1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(226,232,240,0.6)') + ';';
        nav.setAttribute('data-nav-theme', isDark ? 'dark' : 'light');

        var wrap = document.createElement('div');
        wrap.style.cssText =
            'display:flex;align-items:center;justify-content:space-around;' +
            'padding:8px 16px;max-width:480px;margin:0 auto;';

        for (var i = 0; i < TABS.length; i++) {
            var tab = TABS[i];
            var active = tab.id === activeTab;

            var a = document.createElement('a');
            a.href = tab.href;
            a.setAttribute('aria-current', active ? 'page' : 'false');
            a.style.cssText =
                'display:flex;flex-direction:column;align-items:center;gap:2px;' +
                'text-decoration:none;padding:4px 8px;min-width:54px;' +
                'color:' + (active ? '#1A73E8' : (isDark ? '#94a3b8' : '#94a3b8')) + ';' +
                'transition:color 0.2s;';

            // MOB-001 FIX: Use regular "ph" for ALL icons.
            // The "ph-fill" weight requires Phosphor-Fill.woff2 which is NOT shipped.
            // Active differentiation is via color (L72-73), not font weight.
            var icon = document.createElement('i');
            icon.className = 'ph ' + tab.icon;
            icon.setAttribute('aria-hidden', 'true');
            icon.style.fontSize = '22px';

            var lbl = document.createElement('span');
            lbl.textContent = tab.label;
            lbl.setAttribute('data-i18n', tab.i18n);
            lbl.style.cssText =
                'font-size:10px;letter-spacing:0.02em;' +
                'font-weight:' + (active ? '700' : '500') + ';';

            a.appendChild(icon);
            a.appendChild(lbl);
            wrap.appendChild(a);
        }

        nav.appendChild(wrap);

        // ─── Theme Toggle Button (sun/moon) ─────────────────────────────
        var themeBtn = document.createElement('button');
        themeBtn.id = 'nm-global-theme-toggle';
        themeBtn.title = isDark ? 'وضع النهار' : 'وضع الليل';
        themeBtn.style.cssText =
            'position:absolute;top:-18px;right:16px;width:36px;height:36px;' +
            'border-radius:50%;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)') + ';' +
            'background:' + (isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)') + ';' +
            'color:' + (isDark ? '#fbbf24' : '#6366f1') + ';font-size:16px;' +
            'display:flex;align-items:center;justify-content:center;cursor:pointer;' +
            'box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:all 0.3s;' +
            '-webkit-appearance:none;appearance:none;outline:none;padding:0;';
        var themeBtnIcon = document.createElement('i');
        themeBtnIcon.className = isDark ? 'ph ph-sun' : 'ph ph-moon';
        themeBtn.appendChild(themeBtnIcon);
        nav.appendChild(themeBtn);

        themeBtn.addEventListener('click', function() {
            document.documentElement.classList.add('nm-theme-transition');
            var cur = document.documentElement.getAttribute('data-theme') || 'dark';
            var next = cur === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            try { localStorage.setItem('nm-theme', next); } catch(e) {}
            themeBtnIcon.className = next === 'dark' ? 'ph ph-sun' : 'ph ph-moon';
            themeBtn.title = next === 'dark' ? 'وضع النهار' : 'وضع الليل';
            // Rebuild nav styling for new theme
            var nd = next === 'dark';
            nav.style.background = nd ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.92)';
            nav.style.borderTopColor = nd ? 'rgba(255,255,255,0.08)' : 'rgba(226,232,240,0.6)';
            themeBtn.style.background = nd ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)';
            themeBtn.style.borderColor = nd ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
            themeBtn.style.color = nd ? '#fbbf24' : '#6366f1';
            // Also sync about page's toggle if present
            var aboutIcon = document.getElementById('themeIcon');
            if (aboutIcon) aboutIcon.className = nd ? 'ph ph-sun' : 'ph ph-moon';
            setTimeout(function() {
                document.documentElement.classList.remove('nm-theme-transition');
            }, 500);
        });

        // Safe area for modern phones
        var safe = document.createElement('div');
        safe.style.height = 'env(safe-area-inset-bottom, 16px)';
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

    // ─── Responsive Sidebar Toggle (Dashboard Pages) ────────────────────
    // RADICAL FIX: Uses Tailwind 'hidden' class toggle instead of CSS transform.
    // Sidebar starts hidden on mobile (class="hidden md:flex" in HTML).
    // Toggle button removes 'hidden' and adds 'flex' to show it as a fixed overlay.
    function initSidebarToggle() {
        var sidebar = document.querySelector('.dashboard-sidebar');
        if (!sidebar) return;

        var toggleBtn = document.querySelector('.sidebar-toggle');
        var overlay = document.querySelector('.sidebar-overlay');
        if (!toggleBtn && !overlay) return;

        function openSidebar() {
            sidebar.classList.remove('hidden');
            sidebar.classList.add('flex');
            // On mobile: position fixed, full height, above content
            sidebar.style.position = 'fixed';
            sidebar.style.top = '0';
            sidebar.style.bottom = '0';
            sidebar.style.insetInlineStart = '0'; // RTL-aware: left in LTR, right in RTL
            sidebar.style.zIndex = '9998';
            sidebar.style.width = '280px';
            sidebar.style.transform = 'translateX(0)'; // Override CSS translateX(-100%/100%)
            sidebar.style.boxShadow = '4px 0 24px rgba(0,0,0,0.15)';
            if (overlay) overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeSidebar() {
            // Only hide on mobile (< md breakpoint)
            if (window.innerWidth < 768) {
                sidebar.classList.add('hidden');
                sidebar.classList.remove('flex');
                sidebar.style.position = '';
                sidebar.style.top = '';
                sidebar.style.bottom = '';
                sidebar.style.insetInlineStart = '';
                sidebar.style.zIndex = '';
                sidebar.style.width = '';
                sidebar.style.transform = '';
                sidebar.style.boxShadow = '';
            }
            if (overlay) overlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                var isHidden = sidebar.classList.contains('hidden');
                if (isHidden) openSidebar();
                else closeSidebar();
            });
        }

        if (overlay) {
            overlay.addEventListener('click', closeSidebar);
        }

        // Close sidebar on navigation link click (mobile)
        var sidebarLinks = sidebar.querySelectorAll('a[href]');
        for (var i = 0; i < sidebarLinks.length; i++) {
            sidebarLinks[i].addEventListener('click', function () {
                if (window.innerWidth < 768) closeSidebar();
            });
        }

        // Close on escape key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !sidebar.classList.contains('hidden')) {
                closeSidebar();
            }
        });
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

    // ─── Global Theme CSS Injection ─────────────────────────────────────
    function injectGlobalThemeCSS() {
        if (document.getElementById('nm-global-theme-css')) return;
        var style = document.createElement('style');
        style.id = 'nm-global-theme-css';
        style.textContent = [
            'html.nm-theme-transition, html.nm-theme-transition *, html.nm-theme-transition *::before, html.nm-theme-transition *::after {',
            '  transition: background-color 0.4s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease !important;',
            '}',
            'html[data-theme="light"] {',
            '  --bg-primary: #f5f7fa;',
            '  --bg-secondary: #edf0f5;',
            '  --bg-card: rgba(0,0,0,0.02);',
            '  --text-primary: #1a202c;',
            '  --text-secondary: rgba(26,32,44,0.65);',
            '  --text-tertiary: rgba(26,32,44,0.4);',
            '}',
            'html[data-theme="light"] body {',
            '  background-color: #f5f7fa;',
            '  color: #1a202c;',
            '}',
            'html[data-theme="light"] .glass, html[data-theme="light"] [class*="card"] {',
            '  background: rgba(255,255,255,0.7);',
            '  border-color: rgba(0,0,0,0.08);',
            '}',
            'html[data-theme="light"] main {',
            '  background-color: #f5f7fa;',
            '  color: #1a202c;',
            '}',
            'html[data-theme="light"] .top-nav, html[data-theme="light"] header {',
            '  background: rgba(245,247,250,0.9) !important;',
            '  border-color: rgba(0,0,0,0.06) !important;',
            '}',
            'html[data-theme="light"] input, html[data-theme="light"] select, html[data-theme="light"] textarea {',
            '  background: rgba(255,255,255,0.9);',
            '  border-color: rgba(0,0,0,0.12);',
            '  color: #1a202c;',
            '}',
        ].join('\n');
        document.head.appendChild(style);
    }

    // ─── Init ────────────────────────────────────────────────────────────
    function init() {
        removeOldNavs();
        injectGlobalThemeCSS();
        document.body.appendChild(buildNavBar());

        var main = document.querySelector('main');
        if (main) {
            var currentPadding = parseInt(window.getComputedStyle(main).paddingBottom, 10) || 0;
            if (currentPadding < 80) main.style.paddingBottom = '96px';
        }

        initSidebarToggle();
        initMobileSearchToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
