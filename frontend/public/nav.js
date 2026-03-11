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
        'admin-dashboard.html': 'home',
        'admin-escrow.html': 'wallet',
        'admin-kyc.html': 'profile',
        'admin-oracle.html': 'projects',
    };

    // ─── Navigation Tabs (Phosphor icons) ────────────────────────────────
    var TABS = [
        { id: 'home', label: 'Home', i18n: 'nav_home', icon: 'ph-house', href: '/index.html' },
        { id: 'projects', label: 'Projects', i18n: 'nav_projects', icon: 'ph-buildings', href: '/project-details.html' },
        { id: 'impact', label: 'Impact', i18n: 'nav_impact', icon: 'ph-chart-bar', href: '/donor-basket.html' },
        { id: 'wallet', label: 'Wallet', i18n: 'nav_wallet', icon: 'ph-wallet', href: '/admin-escrow.html' },
        { id: 'profile', label: 'Profile', i18n: 'nav_profile', icon: 'ph-user', href: '/admin-kyc.html' },
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
        nav.style.cssText =
            'position:fixed;bottom:0;left:0;right:0;z-index:9999;' +
            'background:rgba(255,255,255,0.92);backdrop-filter:blur(16px);' +
            '-webkit-backdrop-filter:blur(16px);border-top:1px solid rgba(226,232,240,0.6);';

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
                'color:' + (active ? '#1A73E8' : '#94a3b8') + ';' +
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
            sidebar.style.left = '0';
            sidebar.style.bottom = '0';
            sidebar.style.zIndex = '9998';
            sidebar.style.width = '280px';
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
                sidebar.style.left = '';
                sidebar.style.bottom = '';
                sidebar.style.zIndex = '';
                sidebar.style.width = '';
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

    // ─── Init ────────────────────────────────────────────────────────────
    function init() {
        removeOldNavs();
        document.body.appendChild(buildNavBar());

        var main = document.querySelector('main');
        if (main) {
            var currentPadding = parseInt(window.getComputedStyle(main).paddingBottom, 10) || 0;
            if (currentPadding < 80) main.style.paddingBottom = '96px';
        }

        initSidebarToggle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
