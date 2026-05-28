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
    var ICON_SYSTEM = 'ph ph-monitor text-slate-400 dark:text-slate-500';

    // ─── Storage Key ────────────────────────────────────────────────────
    var STORAGE_KEY = 'nm-theme';

    // ─── Transition CSS class (added to <html> during theme switch) ─────
    var TRANSITION_CLASS = 'nm-theme-transition';
    var TRANSITION_DURATION = 500;

    /**
     * Get the explicit mode from storage.
     * @returns {'dark'|'light'|'system'}
     */
    function getMode() {
        try {
            return localStorage.getItem(STORAGE_KEY) || 'system';
        } catch (e) {
            return 'system';
        }
    }

    /**
     * Get the current applied theme.
     * @returns {'dark'|'light'}
     */
    function getTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }

    /**
     * Toggle theme between dark ↔ light ↔ system.
     * Manages transition class, persists to localStorage, syncs all icons,
     * and dispatches CustomEvent for cross-component coordination.
     * @returns {'dark'|'light'|'system'} The NEW mode
     */
    function toggleTheme() {
        var currentMode = getMode();
        var nextMode;

        if (currentMode === 'dark') {
            nextMode = 'light';
        } else if (currentMode === 'light') {
            nextMode = 'system';
        } else {
            nextMode = 'dark'; // from system to dark
        }

        var nextTheme;
        if (nextMode === 'system') {
            try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* incognito */ }
            nextTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
        } else {
            nextTheme = nextMode;
            try { localStorage.setItem(STORAGE_KEY, nextMode); } catch (e) { /* incognito */ }
        }

        // Smooth transition class
        document.documentElement.classList.add(TRANSITION_CLASS);

        // Apply theme
        document.documentElement.setAttribute('data-theme', nextTheme);

        // Sync all icons on page
        syncAllIcons(nextMode);

        // Dispatch event for cross-module coordination (nav.js data-nav-theme, etc.)
        try {
            document.dispatchEvent(new CustomEvent('nm-theme-changed', {
                detail: { theme: nextTheme, mode: nextMode, previousMode: currentMode }
            }));
        } catch (e) { /* IE11 fallback — CustomEvent not supported */ }

        // Remove transition class after animation completes
        setTimeout(function () {
            document.documentElement.classList.remove(TRANSITION_CLASS);
        }, TRANSITION_DURATION);

        return nextMode;
    }

    /**
     * Sync a single icon element to reflect the given mode.
     * @param {Element} iconEl
     * @param {string} mode
     */
    function syncIcon(iconEl, mode) {
        if (!iconEl) { return; }
        if (mode === 'system') {
            iconEl.className = ICON_SYSTEM;
        } else {
            iconEl.className = mode === 'dark' ? ICON_DARK : ICON_LIGHT;
        }
        // P3-SST-003 FIX: Removed defensive `iconEl.style.fontSize = '18px'`.
        // Font-size is now governed by CSS: `[data-nm-theme-icon] { font-size: 18px; }`
        // Standard: CSS Single Source of Truth.
    }

    /**
     * Sync ALL theme icons on the page.
     * Discovers by:
     *   1. [data-nm-theme-icon] attribute (canonical)
     *   2. Legacy IDs: #nm-theme-toggle-icon, #auth-theme-icon, #themeIcon
     * @param {string} [mode] Optional, defaults to current mode
     */
    function syncAllIcons(mode) {
        if (!mode) { mode = getMode(); }

        // Canonical: all elements with data attribute
        var icons = document.querySelectorAll('[data-nm-theme-icon]');
        for (var i = 0; i < icons.length; i++) {
            syncIcon(icons[i], mode);
        }

        // Legacy IDs (backwards compatibility)
        var legacyIds = ['nm-theme-toggle-icon', 'auth-theme-icon', 'themeIcon'];
        for (var j = 0; j < legacyIds.length; j++) {
            var el = document.getElementById(legacyIds[j]);
            if (el && !el.hasAttribute('data-nm-theme-icon')) {
                syncIcon(el, mode);
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
        var currentMode = getMode();

        // Sync all icons to current state first
        syncAllIcons(currentMode);

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
        // PLATINUM AUDIT (2026-05-28): System OS preference listener REMOVED.
        // It was causing a "Ghost State" by dynamically overriding the user's
        // explicit mandate that "Light Mode is the absolute default". 
        // If a user's OS went dark, the app went dark against the platform's mandate.
    }

    // ─── Public API ─────────────────────────────────────────────────────
    window.NammerhaTheme = {
        toggle: toggleTheme,
        getTheme: getTheme,
        getMode: getMode,
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
