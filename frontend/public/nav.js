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
        'projects.html': 'projects',
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

    // CON-AUD-03 FIX: Pages where the bottom nav must be hidden entirely.
    // Three categories:
    //   1. Auth flows (no nav) — full-screen immersive login/register.
    //   2. Dashboard pages (sidebar nav) — C-002: suppress dual-navigation.
    //   3. Full-screen wizards/capture (own fixed footer) — bottom nav would
    //      physically overlap their CTA buttons, blocking user interaction.
    // Standard: Nielsen #4 (Consistency), Apple HIG (No redundant navigation).
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
        // Full-screen wizards/capture (CON-AUD-03: own fixed footer CTA)
        'homeowner-report.html', 'engineer-camera.html',
    ];

    // ─── Navigation Tabs (Phosphor icons) ────────────────────────────────
    var TABS = [
        { id: 'home', label: 'Home', i18n: 'nav_home', icon: 'ph-house', href: '/index.html' },
        { id: 'projects', label: 'Projects', i18n: 'nav_projects', icon: 'ph-buildings', href: '/projects.html' },
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
            // PLT-AUD-F005 FIX: Title for landscape mode where labels are hidden
            a.title = tab.label;
            // GAP-2026-005 FIX: Haptic feedback on tab tap
            a.setAttribute('data-haptic', 'tap');
            wrap.appendChild(a);
        }

        nav.appendChild(wrap);

        // ─── Theme Toggle FAB ─────────────────────────────────────────────
        // CONF-2026-004 FIX: All theme logic is in theme-toggle.js (Single Source of Truth).
        // nav.js ONLY creates the FAB button with data attributes — theme-toggle.js
        // auto-discovers [data-nm-theme-toggle] and wires the click handler + icon sync.
        // No inline toggle logic, no OS listener, no cross-page icon hacks.
        var themeBtn = document.createElement('button');
        themeBtn.id = 'nm-global-theme-toggle';
        themeBtn.setAttribute('data-nm-theme-toggle', '');
        // GAP-2026-005 FIX: Haptic feedback on theme toggle
        themeBtn.setAttribute('data-haptic', 'tap');
        // P2-AUD-003 FIX: i18n-aware theme toggle title
        var themeLabel = isDark
            ? (window.NammerhaI18n && window.NammerhaI18n.t ? window.NammerhaI18n.t('nav_theme_light') : 'Light Mode')
            : (window.NammerhaI18n && window.NammerhaI18n.t ? window.NammerhaI18n.t('nav_theme_dark') : 'Dark Mode');
        themeBtn.title = themeLabel;
        themeBtn.setAttribute('aria-label', themeLabel);
        themeBtn.className = 'nm-theme-fab';

        var themeBtnIcon = document.createElement('i');
        themeBtnIcon.setAttribute('data-nm-theme-icon', '');
        // Initial icon class — theme-toggle.js will sync correctly on init
        themeBtnIcon.className = isDark ? 'ph ph-sun-dim text-amber-500' : 'ph ph-moon-stars text-indigo-400';
        themeBtn.appendChild(themeBtnIcon);
        nav.appendChild(themeBtn);

        // Listen for theme changes dispatched by theme-toggle.js to update nav-level state
        document.addEventListener('nm-theme-changed', function(e) {
            var next = e.detail && e.detail.theme;
            if (!next) { return; }
            // Update nav theme attribute (CSS uses this for nav bar colors)
            nav.setAttribute('data-nav-theme', next);
            // Update i18n-aware title/aria-label
            var newLabel = next === 'dark'
                ? (window.NammerhaI18n && window.NammerhaI18n.t ? window.NammerhaI18n.t('nav_theme_light') : 'Light Mode')
                : (window.NammerhaI18n && window.NammerhaI18n.t ? window.NammerhaI18n.t('nav_theme_dark') : 'Dark Mode');
            themeBtn.title = newLabel;
            themeBtn.setAttribute('aria-label', newLabel);
        });

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

        // CONF-2026-004 FIX: Ensure unified theme engine is loaded.
        // Pages like auth.html and about.html load theme-toggle.js explicitly.
        // Dashboard pages only load nav.js — so we inject theme-toggle.js
        // dynamically to wire the FAB's [data-nm-theme-toggle] button.
        if (!window.NammerhaTheme) {
            var themeScript = document.createElement('script');
            themeScript.src = '/theme-toggle.js?v=2';
            // No defer — already past DOMContentLoaded. Executes immediately on load.
            document.head.appendChild(themeScript);
        } else {
            // theme-toggle.js already loaded — re-run autoWireAll to discover
            // the dynamically-created FAB button.
            if (window.NammerhaTheme.syncAllIcons) {
                window.NammerhaTheme.syncAllIcons();
            }
        }

        // GAP-2026-004 FIX: Load offline indicator for network status detection.
        // Critical for Syrian users with intermittent connectivity.
        // Uses navigator.onLine + online/offline events (no service worker needed).
        if (!window._nmOfflineIndicator) {
            var offlineScript = document.createElement('script');
            offlineScript.src = '/offline-indicator.js?v=1';
            document.head.appendChild(offlineScript);
        }

        // GAP-2026-005 FIX: Load haptic feedback engine.
        // Wraps navigator.vibrate() for tactile feedback on touch devices.
        // Auto-wires [data-haptic] elements via event delegation.
        if (!window.NammerhaHaptic) {
            var hapticScript = document.createElement('script');
            hapticScript.src = '/haptic.js?v=1';
            document.head.appendChild(hapticScript);
        }

        // M-AUD-009 FIX: Load back-to-top FAB for long-scrolling pages.
        // Uses same dynamic injection pattern as theme-toggle.js/haptic.js.
        // Standard: Mobile UX (Long Page Navigation), Apple HIG.
        if (!window._nmBackToTop) {
            var bttScript = document.createElement('script');
            bttScript.src = '/back-to-top.js?v=1';
            document.head.appendChild(bttScript);
        }

        // CONF-2026-001 FIX: Dynamic bottom padding based on actual nav height.
        // Previous: hardcoded 96px — failed on iPhone 14+ (34px safe area caused
        // content cutoff) and wasted space on non-notch devices.
        // Now: requestAnimationFrame waits for browser paint (including CSS
        // env(safe-area-inset-bottom) resolution), then measures real height.
        // A CSS custom property --nm-nav-h is set on :root so any page can use it.
        // Standard: Apple HIG (Safe Area adaptation), CSS env() specification.
        var nav = document.getElementById('nammerha-unified-nav');
        var main = document.querySelector('main');
        if (nav && main) {
            requestAnimationFrame(function () {
                var navH = nav.offsetHeight;
                // Fallback: minimum 64px (nav items ~52px + padding), max 140px (extreme safe area)
                if (navH < 64) navH = 64;
                if (navH > 140) navH = 140;
                // Set CSS custom property for global use (toast, checkout sheet, etc.)
                document.documentElement.style.setProperty('--nm-nav-h', navH + 'px');
                // Add 16px breathing room beyond the nav
                var totalPadding = navH + 16;
                var currentPadding = parseInt(window.getComputedStyle(main).paddingBottom, 10) || 0;
                if (currentPadding < totalPadding) main.style.paddingBottom = totalPadding + 'px';
            });
        }

        initMobileSearchToggle();

        // ─── DEF-014 FIX: Service Worker Update Prompt ──────────────────────
        // Previous: SW registered but no update UI. Users on cached versions
        // see stale content until all tabs are closed.
        // Now: Detects 'waiting' SW and shows a toast with tap-to-update action.
        // Standard: PWA Best Practices, Nielsen #1 (System Status Visibility).
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(function (reg) {
                // Check if an update is already waiting
                function promptUpdate(sw) {
                    // Create a simple banner if toast system is not loaded yet
                    var banner = document.createElement('div');
                    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;' +
                        'background:linear-gradient(135deg,#1A73E8,#109173);color:#fff;' +
                        'padding:12px 16px;text-align:center;font-size:13px;font-weight:700;' +
                        'cursor:pointer;-webkit-tap-highlight-color:transparent;';
                    banner.setAttribute('role', 'alert');
                    banner.textContent = window.NammerhaI18n && window.NammerhaI18n.t
                        ? window.NammerhaI18n.t('sw_update_available')
                        : 'Update available — tap to refresh';
                    banner.addEventListener('click', function () {
                        sw.postMessage({ type: 'SKIP_WAITING' });
                        banner.remove();
                    });
                    document.body.appendChild(banner);
                }

                if (reg.waiting) { promptUpdate(reg.waiting); }

                reg.addEventListener('updatefound', function () {
                    var newSW = reg.installing;
                    if (!newSW) return;
                    newSW.addEventListener('statechange', function () {
                        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                            promptUpdate(newSW);
                        }
                    });
                });

                // Reload when the new SW takes over
                var refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', function () {
                    if (refreshing) return;
                    refreshing = true;
                    window.location.reload();
                });
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

