/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Unified Theme Engine (CONF-2026-004)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CANONICAL Single Source of Truth for all theme toggle behavior across
 * the entire Nammerha platform.
 *
 * Architecture:
 *   theme-boot.js  → Detection  (synchronous, pre-paint FOUC guard)
 *   theme-toggle.js → Interaction (deferred, post-paint toggle + icon sync)
 *
 * This module:
 *   1. Auto-discovers ALL buttons with [data-nm-theme-toggle] and wires click
 *   2. Auto-syncs ALL icons with [data-nm-theme-icon] on every toggle
 *   3. Manages smooth CSS transition class (nm-theme-transition)
 *   4. Listens for OS prefers-color-scheme changes (respects manual override)
 *   5. Dispatches 'nm-theme-changed' CustomEvent for cross-component sync
 *   6. Exposes window.NammerhaTheme = { toggle, get, syncAllIcons } for
 *      programmatic access by nav.js, about.html, or any future consumer
 *
 * Usage in HTML (any page):
 *   <button data-nm-theme-toggle aria-label="Toggle theme">
 *     <i data-nm-theme-icon aria-hidden="true"></i>
 *   </button>
 *   <script src="/theme-toggle.js?v=2" defer></script>
 *
 * Backwards compatibility:
 *   Also discovers legacy IDs: #nm-theme-toggle, #auth-theme-toggle,
 *   #themeToggle (about.html), and their icon children.
 *
 * Standard: WCAG 1.4.1 (Use of Color), Apple HIG (System Appearance),
 *           Material Design 3 (Color Scheme), Nielsen #4 (Consistency).
 *
 * @version 2.0.0
 * @since CONF-2026-004
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    // ─── Icon Convention ────────────────────────────────────────────────
    // Standardized across ALL pages. Dark mode shows sun (→ go light),
    // light mode shows moon (→ go dark).
    var ICON_DARK  = 'ph ph-sun-dim text-amber-500';
    var ICON_LIGHT = 'ph ph-moon-stars text-indigo-400';

    // ─── Storage Key ────────────────────────────────────────────────────
    var STORAGE_KEY = 'nm-theme';

    // ─── Transition CSS class (added to <html> during theme switch) ─────
    var TRANSITION_CLASS = 'nm-theme-transition';
    var TRANSITION_DURATION = 500;

    /**
     * Get the current applied theme.
     * @returns {'dark'|'light'}
     */
    function getTheme() {
        return document.documentElement.getAttribute('data-theme') || 'dark';
    }

    /**
     * Toggle theme between dark ↔ light.
     * Manages transition class, persists to localStorage, syncs all icons,
     * and dispatches CustomEvent for cross-component coordination.
     * @returns {'dark'|'light'} The NEW theme
     */
    function toggleTheme() {
        var current = getTheme();
        var next = current === 'dark' ? 'light' : 'dark';

        // Smooth transition class
        document.documentElement.classList.add(TRANSITION_CLASS);

        // Apply theme
        document.documentElement.setAttribute('data-theme', next);

        // Persist
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* incognito */ }

        // Sync all icons on page
        syncAllIcons(next);

        // Dispatch event for cross-module coordination (nav.js data-nav-theme, etc.)
        try {
            document.dispatchEvent(new CustomEvent('nm-theme-changed', {
                detail: { theme: next, previous: current }
            }));
        } catch (e) { /* IE11 fallback — CustomEvent not supported */ }

        // Remove transition class after animation completes
        setTimeout(function () {
            document.documentElement.classList.remove(TRANSITION_CLASS);
        }, TRANSITION_DURATION);

        return next;
    }

    /**
     * Sync a single icon element to reflect the given theme.
     * @param {Element} iconEl
     * @param {string} theme
     */
    function syncIcon(iconEl, theme) {
        if (!iconEl) { return; }
        iconEl.className = theme === 'dark' ? ICON_DARK : ICON_LIGHT;
        // Preserve inline font-size if set
        if (!iconEl.style.fontSize) { iconEl.style.fontSize = '18px'; }
    }

    /**
     * Sync ALL theme icons on the page.
     * Discovers by:
     *   1. [data-nm-theme-icon] attribute (canonical)
     *   2. Legacy IDs: #nm-theme-toggle-icon, #auth-theme-icon, #themeIcon
     * @param {string} [theme] Optional, defaults to current theme
     */
    function syncAllIcons(theme) {
        if (!theme) { theme = getTheme(); }

        // Canonical: all elements with data attribute
        var icons = document.querySelectorAll('[data-nm-theme-icon]');
        for (var i = 0; i < icons.length; i++) {
            syncIcon(icons[i], theme);
        }

        // Legacy IDs (backwards compatibility)
        var legacyIds = ['nm-theme-toggle-icon', 'auth-theme-icon', 'themeIcon'];
        for (var j = 0; j < legacyIds.length; j++) {
            var el = document.getElementById(legacyIds[j]);
            if (el && !el.hasAttribute('data-nm-theme-icon')) {
                syncIcon(el, theme);
            }
        }
    }

    /**
     * Auto-discover and wire ALL theme toggle buttons on the page.
     * Discovers by:
     *   1. [data-nm-theme-toggle] attribute (canonical)
     *   2. Legacy IDs: #nm-theme-toggle, #auth-theme-toggle, #themeToggle
     */
    function autoWireAll() {
        var currentTheme = getTheme();

        // Sync all icons to current state first
        syncAllIcons(currentTheme);

        // Canonical: all elements with data attribute
        var buttons = document.querySelectorAll('[data-nm-theme-toggle]');
        for (var i = 0; i < buttons.length; i++) {
            wireButton(buttons[i]);
        }

        // Legacy IDs (backwards compatibility)
        var legacyBtnIds = ['nm-theme-toggle', 'auth-theme-toggle', 'themeToggle'];
        for (var j = 0; j < legacyBtnIds.length; j++) {
            var btn = document.getElementById(legacyBtnIds[j]);
            if (btn && !btn.hasAttribute('data-nm-theme-toggle')) {
                wireButton(btn);
            }
        }
    }

    /**
     * Wire a single button for theme toggling. Idempotent — won't double-wire.
     * @param {Element} btn
     */
    function wireButton(btn) {
        if (!btn || btn._nmThemeWired) { return; }
        btn._nmThemeWired = true;

        btn.addEventListener('click', function () {
            toggleTheme();
        });
    }

    /**
     * Listen for OS color scheme changes.
     * Respects manual override: if user has explicitly toggled (stored in
     * localStorage), OS changes are ignored. Otherwise, follows system.
     */
    function initSystemPreferenceListener() {
        try {
            var mql = window.matchMedia('(prefers-color-scheme: dark)');
            if (!mql || !mql.addEventListener) { return; }

            mql.addEventListener('change', function (e) {
                // Only auto-sync if user hasn't manually set a preference
                try {
                    if (localStorage.getItem(STORAGE_KEY)) { return; }
                } catch (ex) { /* localStorage unavailable */ }

                var next = e.matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', next);
                syncAllIcons(next);

                // Dispatch so nav.js can update data-nav-theme
                try {
                    document.dispatchEvent(new CustomEvent('nm-theme-changed', {
                        detail: { theme: next, previous: next === 'dark' ? 'light' : 'dark' }
                    }));
                } catch (err) { /* CustomEvent not supported */ }
            });
        } catch (e) { /* matchMedia not supported — graceful degradation */ }
    }

    // ─── Public API ─────────────────────────────────────────────────────
    window.NammerhaTheme = {
        toggle: toggleTheme,
        get: getTheme,
        syncIcon: syncIcon,
        syncAllIcons: syncAllIcons,
    };

    // ─── Bootstrap ──────────────────────────────────────────────────────
    function init() {
        autoWireAll();
        initSystemPreferenceListener();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
