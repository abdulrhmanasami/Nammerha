/**
 * Nammerha — Unified Bottom Navigation Bar
 * ═══════════════════════════════════════════
 * Auto-injects a consistent 5-tab navigation bar into every stitch page.
 * Detects the current page from the URL to highlight the active tab.
 * 
 * Usage: Add <script src="../nav/nav.js" defer></script> to any page.
 * The script automatically removes any existing <nav> at the bottom
 * and replaces it with the canonical navigation bar.
 */
(function () {
    'use strict';

    // ─── Page→Tab Mapping ────────────────────────────────────────────────────
    // Maps stitch directory names to their corresponding tab ID
    const PAGE_TAB_MAP = {
        'nammerha_dashboard': 'home',
        'generated_screen_1': 'home',
        'generated_screen_2': 'home',
        'itemized_project_details': 'projects',
        'engineer_boq_builder': 'projects',
        'homeowner_repair_request_step_1': 'projects',
        'donor_construction_basket': 'impact',
        'donor_delivery_verification_notification': 'impact',
        'pricing_oracle_epa_engine': 'projects',
    };

    // ─── Navigation Tabs Definition ──────────────────────────────────────────
    const TABS = [
        {
            id: 'home',
            label: 'Home',
            labelAr: 'الرئيسية',
            i18nKey: 'nav_home',
            icon: 'home',
            href: '../nammerha_dashboard/code.html',
        },
        {
            id: 'projects',
            label: 'Projects',
            labelAr: 'المشاريع',
            i18nKey: 'nav_projects',
            icon: 'map',
            href: '../itemized_project_details/code.html',
        },
        {
            id: 'impact',
            label: 'Impact',
            labelAr: 'الأثر',
            i18nKey: 'nav_impact',
            icon: 'analytics',
            href: '../donor_construction_basket/code.html',
        },
        {
            id: 'wallet',
            label: 'Wallet',
            labelAr: 'المحفظة',
            i18nKey: 'nav_wallet',
            icon: 'account_balance_wallet',
            href: '#',
        },
        {
            id: 'profile',
            label: 'Profile',
            labelAr: 'الحساب',
            i18nKey: 'nav_profile',
            icon: 'person',
            href: '#',
        },
    ];

    // ─── Detect Active Tab ───────────────────────────────────────────────────
    function detectActiveTab() {
        var path = window.location.pathname;

        // Match stitch directory name from URL
        for (var dir in PAGE_TAB_MAP) {
            if (path.indexOf(dir) !== -1) {
                return PAGE_TAB_MAP[dir];
            }
        }

        return 'home'; // Default
    }

    // ─── Build Navigation HTML ───────────────────────────────────────────────
    function buildNavBar() {
        var activeTab = detectActiveTab();

        var nav = document.createElement('nav');
        nav.id = 'nammerha-bottom-nav';
        nav.className = 'fixed bottom-0 left-0 right-0 z-50 border-t';
        nav.style.cssText = [
            'background: rgba(255, 255, 255, 0.85)',
            'backdrop-filter: blur(16px)',
            '-webkit-backdrop-filter: blur(16px)',
            'border-color: rgba(226, 232, 240, 0.6)',
        ].join(';');

        // Dark mode support
        if (document.documentElement.classList.contains('dark') ||
            document.body.classList.contains('dark')) {
            nav.style.cssText = [
                'background: rgba(24, 17, 33, 0.85)',
                'backdrop-filter: blur(16px)',
                '-webkit-backdrop-filter: blur(16px)',
                'border-color: rgba(51, 65, 85, 0.5)',
            ].join(';');
        }

        var container = document.createElement('div');
        container.style.cssText = [
            'display: flex',
            'align-items: center',
            'justify-content: space-around',
            'padding: 8px 16px',
            'max-width: 480px',
            'margin: 0 auto',
        ].join(';');

        TABS.forEach(function (tab) {
            var isActive = tab.id === activeTab;
            var link = document.createElement('a');
            link.href = tab.href;
            link.style.cssText = [
                'display: flex',
                'flex-direction: column',
                'align-items: center',
                'gap: 2px',
                'text-decoration: none',
                'color: ' + (isActive ? '#1A73E8' : '#94a3b8'),
                'transition: color 0.2s ease',
                'padding: 4px 8px',
                'min-width: 56px',
            ].join(';');

            // Icon
            var icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.textContent = tab.icon;
            icon.style.fontSize = '24px';
            if (isActive) {
                icon.style.fontVariationSettings = "'FILL' 1";
            }

            // Label
            var label = document.createElement('span');
            label.textContent = tab.label;
            label.setAttribute('data-i18n', tab.i18nKey);
            label.style.cssText = [
                'font-size: 10px',
                'font-weight: ' + (isActive ? '700' : '500'),
                'letter-spacing: 0.02em',
            ].join(';');

            link.appendChild(icon);
            link.appendChild(label);
            container.appendChild(link);
        });

        nav.appendChild(container);

        // Safe area for modern phones (notch/gesture bar)
        var safeArea = document.createElement('div');
        safeArea.style.height = '20px';
        nav.appendChild(safeArea);

        return nav;
    }

    // ─── Remove Existing Nav Bars ────────────────────────────────────────────
    function removeExistingNavBars() {
        // Remove any existing bottom nav elements
        var navs = document.querySelectorAll('nav');
        navs.forEach(function (nav) {
            // Only remove bottom/sticky navs, not top headers
            var style = window.getComputedStyle(nav);
            var isBottom =
                nav.classList.contains('sticky') && style.bottom === '0px' ||
                style.position === 'fixed' && parseInt(style.bottom) <= 0 ||
                nav.querySelector('[data-i18n="nav_home"]') ||
                nav.querySelector('[data-i18n="nav_projects"]') ||
                nav.textContent.indexOf('Profile') !== -1 && nav.textContent.indexOf('Home') !== -1;

            if (isBottom && !nav.classList.contains('fixed') && !nav.id) {
                nav.remove();
            } else if (nav.style.position === 'fixed' && nav.querySelector('[data-i18n]')) {
                // Check if this is a bottom nav with data-i18n tabs
                var rect = nav.getBoundingClientRect();
                if (rect.top > window.innerHeight * 0.7) {
                    nav.remove();
                }
            }
        });

        // Also remove navs with bottom-0 in class
        document.querySelectorAll('nav[class*="bottom-0"]').forEach(function (nav) {
            nav.remove();
        });
        // Remove sticky bottom navs
        document.querySelectorAll('nav.sticky').forEach(function (nav) {
            if (nav.style.bottom === '0' || nav.className.indexOf('bottom') !== -1) {
                nav.remove();
            }
        });
    }

    // ─── Initialize ──────────────────────────────────────────────────────────
    function init() {
        removeExistingNavBars();

        var navBar = buildNavBar();
        document.body.appendChild(navBar);

        // Ensure main content has bottom padding
        var main = document.querySelector('main');
        if (main) {
            main.style.paddingBottom = '96px';
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
