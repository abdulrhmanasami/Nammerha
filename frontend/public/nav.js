/**
 * Nammerha — Unified Bottom Navigation Bar (Frontend Build)
 * ═══════════════════════════════════════════════════════════
 * Auto-injects a consistent 5-tab navigation bar into every page.
 * Detects the current page from the URL to highlight the active tab.
 * Removes any duplicated/inconsistent nav bars from the HTML source.
 */
(function () {
    'use strict';

    // ─── Page→Tab Mapping ────────────────────────────────────────────────────
    var PAGE_TAB_MAP = {
        'index.html': 'home',
        'project-details.html': 'projects',
        'engineer-boq.html': 'projects',
        'engineer-camera.html': 'projects',
        'homeowner-report.html': 'projects',
        'donor-basket.html': 'impact',
        'donor-proof.html': 'impact',
        'admin-dashboard.html': 'home',
        'admin-escrow.html': 'wallet',
        'admin-kyc.html': 'profile',
        'admin-oracle.html': 'projects',
    };

    // ─── Navigation Tabs ────────────────────────────────────────────────────
    var TABS = [
        { id: 'home', label: 'Home', i18n: 'nav_home', icon: 'home', href: '/index.html' },
        { id: 'projects', label: 'Projects', i18n: 'nav_projects', icon: 'map', href: '/project-details.html' },
        { id: 'impact', label: 'Impact', i18n: 'nav_impact', icon: 'analytics', href: '/donor-basket.html' },
        { id: 'wallet', label: 'Wallet', i18n: 'nav_wallet', icon: 'account_balance_wallet', href: '/admin-escrow.html' },
        { id: 'profile', label: 'Profile', i18n: 'nav_profile', icon: 'person', href: '/admin-kyc.html' },
    ];

    // ─── Detect Active Tab ───────────────────────────────────────────────────
    function detectActiveTab() {
        var path = window.location.pathname;
        for (var page in PAGE_TAB_MAP) {
            if (path.indexOf(page) !== -1) {
                return PAGE_TAB_MAP[page];
            }
        }
        // Default: if at root '/', it's home
        if (path === '/' || path === '') return 'home';
        return 'home';
    }

    // ─── Check Dark Mode ────────────────────────────────────────────────────
    function isDarkMode() {
        return document.documentElement.classList.contains('dark') ||
            document.body.classList.contains('dark') ||
            window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // ─── Build Navigation Bar ───────────────────────────────────────────────
    function buildNavBar() {
        var activeTab = detectActiveTab();
        var dark = isDarkMode();

        var nav = document.createElement('nav');
        nav.id = 'nammerha-unified-nav';
        nav.setAttribute('aria-label', 'Main navigation');

        // Styles
        var navBg = dark
            ? 'background:rgba(24,17,33,0.9);border-color:rgba(51,65,85,0.5);'
            : 'background:rgba(255,255,255,0.92);border-color:rgba(226,232,240,0.6);';
        nav.style.cssText =
            'position:fixed;bottom:0;left:0;right:0;z-index:9999;' +
            'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
            'border-top:1px solid;' + navBg;

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
                'color:' + (active ? '#1A73E8' : (dark ? '#64748b' : '#94a3b8')) + ';' +
                'transition:color 0.2s;';

            var icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.textContent = tab.icon;
            icon.style.cssText = 'font-size:24px;' +
                (active ? "font-variation-settings:'FILL' 1;" : '');

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

        // Safe area for modern phones
        var safe = document.createElement('div');
        safe.style.height = 'env(safe-area-inset-bottom, 16px)';
        nav.appendChild(safe);

        return nav;
    }

    // ─── Remove Old Navigation Bars ──────────────────────────────────────────
    function removeOldNavs() {
        // Remove any nav element that's at the bottom of the page
        var allNavs = document.querySelectorAll('nav');
        for (var i = 0; i < allNavs.length; i++) {
            var n = allNavs[i];
            // Skip if it's our injected nav
            if (n.id === 'nammerha-unified-nav') continue;
            // Check if it looks like a bottom nav
            var cls = n.className || '';
            var hasBottomIndicator =
                cls.indexOf('bottom-0') !== -1 ||
                cls.indexOf('bottom') !== -1 && cls.indexOf('sticky') !== -1 ||
                cls.indexOf('bottom') !== -1 && cls.indexOf('fixed') !== -1;
            // Check if it contains tab-like links
            var hasTabLinks = n.querySelector('[data-i18n*="nav_"]') ||
                (n.textContent.indexOf('Home') !== -1 && n.textContent.indexOf('Projects') !== -1) ||
                (n.textContent.indexOf('Home') !== -1 && n.textContent.indexOf('Profile') !== -1) ||
                (n.textContent.indexOf('Explore') !== -1 && n.textContent.indexOf('Profile') !== -1);

            if (hasBottomIndicator || hasTabLinks) {
                n.remove();
            }
        }
    }

    // ─── Init ────────────────────────────────────────────────────────────────
    function init() {
        removeOldNavs();
        document.body.appendChild(buildNavBar());

        // Ensure main content has bottom padding
        var main = document.querySelector('main');
        if (main) {
            var currentPadding = parseInt(window.getComputedStyle(main).paddingBottom, 10) || 0;
            if (currentPadding < 80) {
                main.style.paddingBottom = '96px';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
