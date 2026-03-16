/**
 * Nammerha — Shared Theme Toggle (I-001 FIX)
 * ════════════════════════════════════════════
 * Single Source of Truth for theme toggling behavior.
 * Used by auth.html (standalone) and nav.js (bottom bar FAB).
 *
 * Architecture: This module auto-discovers a toggle button by ID and wires
 * click+icon behavior. It does NOT handle initial theme detection —
 * that is theme-boot.js's responsibility (synchronous, runs before paint).
 *
 * Usage in HTML:
 *   <button id="nm-theme-toggle" aria-label="Toggle theme">
 *     <i id="nm-theme-toggle-icon" class="ph ph-sun-dim" aria-hidden="true"></i>
 *   </button>
 *   <script src="/theme-toggle.js" defer></script>
 */
(function () {
    'use strict';

    /**
     * Toggle theme between dark↔light.
     * Returns the NEW theme string ('dark' | 'light').
     */
    function toggleTheme() {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('nm-theme', next); } catch (e) { /* incognito mode */ }
        return next;
    }

    /**
     * Sync an icon element to reflect the current theme.
     * Shows sun icon in dark mode (→ click to go light), moon in light mode.
     */
    function syncIcon(iconEl, theme) {
        if (!iconEl) return;
        var isDark = theme === 'dark';
        iconEl.className = isDark ? 'ph ph-sun-dim text-amber-500' : 'ph ph-moon-stars text-indigo-400';
        iconEl.style.fontSize = iconEl.style.fontSize || '18px';
    }

    /**
     * Auto-discover and wire a toggle button.
     * Button ID: nm-theme-toggle (or auth-theme-toggle for backwards compat)
     * Icon ID:   nm-theme-toggle-icon (or auth-theme-icon)
     */
    function autoInit() {
        var btn = document.getElementById('nm-theme-toggle') || document.getElementById('auth-theme-toggle');
        if (!btn) return;

        var icon = btn.querySelector('i') || document.getElementById('nm-theme-toggle-icon') || document.getElementById('auth-theme-icon');
        var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

        // Set initial icon state
        syncIcon(icon, currentTheme);

        // Wire click handler
        btn.addEventListener('click', function () {
            var newTheme = toggleTheme();
            syncIcon(icon, newTheme);
        });
    }

    // Expose for nav.js to import toggle logic without duplicating
    window.NammerhaTheme = {
        toggle: toggleTheme,
        syncIcon: syncIcon,
    };

    // Auto-init for standalone usage (auth.html)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }
})();
