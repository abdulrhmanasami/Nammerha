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
        /* UXA-011 FIX: about.html moved from 'profile' → 'home'.
           About is company information, not user-specific profile content.
           Standard: Nielsen #2 (Match System ↔ Real World). */
        'about.html': 'home',
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
        // CONF-UX-001 FIX: BOQ Builder is a tool page with its own sticky CTA.
        // Unified nav at z-9900 physically blocked the "Publish to Marketplace" button at z-20.
        // Standard: Apple HIG (Primary Action Accessibility), Fitts's Law.
        'engineer-boq.html',
        // Legal Pages (suppress nav on static content pages)
        'privacy.html', 'terms.html', 'refund-policy.html',
    ];

    // ─── Navigation Tabs (Phosphor icons) ────────────────────────────────
    var TABS = [
        { id: 'home', label: 'Home', i18n: 'nav_home', icon: 'ph-house', href: '/index.html' },
        { id: 'projects', label: 'Projects', i18n: 'nav_projects', icon: 'ph-buildings', href: '/projects.html' },
        /* UXA-010 FIX: Impact tab → donor-proof.html (impact tracking page).
           Previous: donor-basket.html — a shopping cart, not impact viewing.
           'Impact' implies reviewing contributions & outcomes, not adding items.
           Standard: Nielsen #2 (Match System ↔ Real World), IA Best Practice. */
        { id: 'impact', label: 'Impact', i18n: 'nav_impact', icon: 'ph-chart-bar', href: '/donor-proof.html' },
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

            // P1-NAV-001 FIX: Scroll-to-top on active tab re-tap.
            // Native iOS tab bars scroll to top when the already-active tab is tapped.
            // Without this, the app feels like a web page — active tabs do nothing.
            // Standard: Apple HIG (Tab Bar), Material Design 3 (Navigation Bar).
            if (active) {
                a.addEventListener('click', function (e) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
            }
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

    /* P2-FB-GHOST FIX: Removed initMobileSearchToggle() (was L280-338).
       The function searched for .nav-search-icon elements — none exist anymore.
       Mobile search was migrated to [data-search-trigger] wired by search-overlay.ts.
       Standard: Dead Code Elimination, DRY Principle. */

    // ─── Init ────────────────────────────────────────────────────────────
    // P2-PERF-001 FIX: Sidebar toggle extracted to sidebar.js (loaded only
    // on dashboard pages). Theme CSS moved to main.css in P1-PERF-001.
    // nav.js is now focused: bottom nav bar + mobile search toggle.
    function init() {
        removeOldNavs();

        // P2-NAV-001 FIX: Hide nav on auth flow pages (login, register,
        // verify-email, reset-password) — these are full-page layouts.
        if (shouldHideNav()) {
            // ─── P1-002 FIX: Dashboard Home Escape Link ─────────────────────
            // Previous: Portal pages hid bottom nav (sidebar-only). On mobile,
            // users who missed the hamburger pulse had NO way to navigate home.
            // Now: Inject a small home-arrow link next to the sidebar-toggle.
            // Only on dashboard layout pages (not auth/wizard pages).
            // Standard: Apple HIG — "Always provide a way to return home."
            // ─────────────────────────────────────────────────────────────────
            var dashLayout = document.querySelector('.dashboard-layout');
            if (dashLayout) {
                var sidebarToggle = dashLayout.querySelector('.sidebar-toggle');
                if (sidebarToggle) {
                    var homeLink = document.createElement('a');
                    homeLink.href = '/index.html';
                    homeLink.className = 'nm-dashboard-home-link';
                    homeLink.setAttribute('aria-label',
                        (window.NammerhaI18n && window.NammerhaI18n.t)
                            ? window.NammerhaI18n.t('nav_home')
                            : 'Home'
                    );
                    homeLink.setAttribute('data-i18n-aria', 'nav_home');
                    homeLink.innerHTML = '<i class="ph ph-house text-lg" aria-hidden="true"></i>';
                    // Insert AFTER the sidebar toggle
                    sidebarToggle.parentNode.insertBefore(homeLink, sidebarToggle.nextSibling);
                }
            }
            return;
        }

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

        // ─── P0-001 FIX: Notification Bell "Coming Soon" Handler ────────────
        // Previous: Bell icon existed on 11 HTML pages with ZERO JS handler.
        // Users tapped and got no response — silent dead end.
        // Now: Informational toast (consistent with SSO "coming soon" in auth.ts)
        // + haptic feedback. Uses event delegation on shared CSS class.
        // Standard: Nielsen #1 (System Status Visibility), Honest Affordances.
        // ─────────────────────────────────────────────────────────────────────
        document.querySelectorAll('#nav-notification-btn, #mobile-notif-bell, [data-notif-bell]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                // Show toast if showToast is available (loaded by page modules)
                var msg = window.NammerhaI18n && window.NammerhaI18n.t
                    ? window.NammerhaI18n.t('notif_coming_soon')
                    : 'Notifications are coming soon. Stay tuned!';
                // Use global showToast if available, otherwise create inline toast
                if (window._nmShowToast) {
                    window._nmShowToast(msg, 'info');
                } else {
                    // Lightweight fallback — inject a transient banner
                    var toast = document.createElement('div');
                    toast.className = 'nm-notif-toast';
                    toast.setAttribute('role', 'status');
                    toast.textContent = msg;
                    document.body.appendChild(toast);
                    // Trigger enter animation
                    requestAnimationFrame(function () {
                        toast.classList.add('nm-notif-toast--visible');
                    });
                    setTimeout(function () {
                        toast.classList.add('nm-notif-toast--exit');
                        toast.addEventListener('transitionend', function () { toast.remove(); });
                    }, 3500);
                }
                // Haptic feedback
                if (window.NammerhaHaptic && window.NammerhaHaptic.light) {
                    window.NammerhaHaptic.light();
                } else if (navigator.vibrate) {
                    navigator.vibrate(10);
                }
            });
        });

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
                // SST-002 FIX: CSS custom property replaces inline style.paddingBottom.
                // main.css consumes --nm-nav-padding via `main#main-content` rule.
                // Standard: P1-001 precedent — CSS Single Source of Truth.
                var totalPadding = navH + 16;
                document.documentElement.style.setProperty('--nm-nav-padding', totalPadding + 'px');
            });
        }

        // P2-FB-GHOST: initMobileSearchToggle() removed — see L272 comment.

        // PLT-UX-AUD-KB FIX: Virtual keyboard management.
        // Detects when mobile virtual keyboard opens/closes and toggles
        // .keyboard-visible on <html> for CSS hooks (hide bottom nav, reposition toast).
        // Uses Visual Viewport API (Chrome 61+, Safari 13+). No-op on desktop.
        // Standard: Apple HIG — "Adjust layout for virtual keyboard."
        if (window.visualViewport) {
            var KBD_THRESHOLD = 150; // px — keyboard must be at least this tall
            window.visualViewport.addEventListener('resize', function () {
                var heightDiff = window.innerHeight - window.visualViewport.height;
                if (heightDiff > KBD_THRESHOLD) {
                    document.documentElement.classList.add('keyboard-visible');
                } else {
                    document.documentElement.classList.remove('keyboard-visible');
                }
            }, { passive: true });
        }

        // ─── P0-002 FIX: Page Navigation Loading Bar ────────────────────────
        // Previous: View transitions API only activates when the new page starts
        // painting. On Syrian 2G (50-100kbps), navigation takes 3-15 seconds.
        // Users saw NOTHING during this window → assumed app froze → tapped repeatedly.
        // Now: Branded gradient bar appears instantly on link click.
        // Standard: Nielsen #1 (System Status Visibility), Core Web Vitals (INP).
        // ─────────────────────────────────────────────────────────────────────
        var _loadingBar = null;
        document.addEventListener('click', function (e) {
            var link = e.target.closest('a[href]');
            if (!link) return;
            var href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
            // Only intercept same-origin navigations
            try {
                var url = new URL(href, window.location.origin);
                if (url.origin !== window.location.origin) return;
            } catch (_) { return; }
            // Skip if modifier keys are held (new tab, etc.)
            if (e.ctrlKey || e.metaKey || e.shiftKey || link.target === '_blank') return;
            // Don't show for same-page links
            if (href === window.location.pathname) return;
            // Inject loading bar
            if (_loadingBar) _loadingBar.remove();
            _loadingBar = document.createElement('div');
            _loadingBar.className = 'nm-page-loading-bar';
            _loadingBar.setAttribute('aria-hidden', 'true');
            document.body.appendChild(_loadingBar);
        });
        // Clean up on back/forward cache restore
        window.addEventListener('pageshow', function (e) {
            if (e.persisted && _loadingBar) {
                _loadingBar.classList.add('nm-page-loading-bar--done');
                setTimeout(function () { if (_loadingBar) { _loadingBar.remove(); _loadingBar = null; } }, 500);
            }
        });

        // ─── DEF-014 FIX: Service Worker Update Prompt ──────────────────────
        // Previous: SW registered but no update UI. Users on cached versions
        // see stale content until all tabs are closed.
        // Now: Detects 'waiting' SW and shows a toast with tap-to-update action.
        // Standard: PWA Best Practices, Nielsen #1 (System Status Visibility).
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(function (reg) {
                // Check if an update is already waiting
                function promptUpdate(sw) {
                    // P1-SW-001 FIX: CSS class replaces 4-line inline style.cssText.
                    // Previous: physical left:0;right:0 (RTL-unsafe), z-index:99999 (magic number).
                    // Now: .nm-sw-banner uses inset-inline:0 and var(--z-overlay).
                    // Standard: P1-001 precedent, CSS Architecture, Logical Properties.
                    var banner = document.createElement('div');
                    banner.className = 'nm-sw-banner';
                    banner.setAttribute('role', 'alert');
                    var bannerText = document.createElement('span');
                    bannerText.textContent = window.NammerhaI18n && window.NammerhaI18n.t
                        ? window.NammerhaI18n.t('sw_update_available')
                        : 'Update available — tap to refresh';
                    var bannerBtn = document.createElement('button');
                    bannerBtn.textContent = window.NammerhaI18n && window.NammerhaI18n.t
                        ? window.NammerhaI18n.t('sw_update_btn')
                        : 'Update';
                    bannerBtn.setAttribute('data-haptic', 'tap');
                    bannerBtn.addEventListener('click', function () {
                        sw.postMessage({ type: 'SKIP_WAITING' });
                        banner.remove();
                    });
                    banner.appendChild(bannerText);
                    banner.appendChild(bannerBtn);
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

