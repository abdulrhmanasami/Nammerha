/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Responsive Dashboard Sidebar Module
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * P2-PERF-001 FIX: Extracted from monolithic nav.js (23KB → SRP).
 * This module is ONLY loaded on dashboard pages that have a sidebar.
 *
 * Features:
 *   • CSS class-based toggle (.sidebar-open) — no inline styles
 *   • Smooth 0.28s cubic-bezier slide animation via CSS transform
 *   • RTL-safe — CSS handles mirroring via [dir="rtl"] rules
 *   • Focus trap (WCAG 2.4.3) — Tab cycles inside sidebar when modal
 *   • Escape key dismissal
 *   • Overlay click dismissal
 *   • Auto-close on link navigation (mobile)
 *   • Focus restoration to toggle button on close
 *
 * Dependencies:
 *   • main.css: .dashboard-sidebar, .sidebar-open, .sidebar-overlay
 *   • HTML: .sidebar-toggle button, .sidebar-overlay div
 *
 * @version 1.0.0
 * @since P2-PERF-001
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    // ─── Sidebar Toggle ─────────────────────────────────────────────────
    function initSidebarToggle() {
        var sidebar = document.querySelector('.dashboard-sidebar');
        if (!sidebar) { return; }

        var toggleBtn = document.querySelector('.sidebar-toggle');
        var overlay = document.querySelector('.sidebar-overlay');
        if (!toggleBtn && !overlay) { return; }

        // ── Open ────────────────────────────────────────────────────────
        function openSidebar() {
            sidebar.classList.remove('hidden');
            sidebar.classList.add('sidebar-open');
            if (overlay) { overlay.classList.add('active'); }
            document.body.style.overflow = 'hidden';
            trapFocus(true);
        }

        // ── Close ───────────────────────────────────────────────────────
        function closeSidebar() {
            if (window.innerWidth < 768) {
                sidebar.classList.remove('sidebar-open');
                // Wait for CSS transition (0.28s) to complete before hiding
                setTimeout(function () {
                    if (!sidebar.classList.contains('sidebar-open')) {
                        sidebar.classList.add('hidden');
                    }
                }, 300);
            }
            if (overlay) { overlay.classList.remove('active'); }
            document.body.style.overflow = '';
            trapFocus(false);
        }

        // ── Focus Trap (WCAG 2.4.3) ────────────────────────────────────
        // When sidebar is open as a modal overlay, keyboard focus must not
        // escape to background content. Tab at last element wraps to first,
        // Shift+Tab at first wraps to last.
        var focusTrapHandler = null;

        function trapFocus(enable) {
            if (!enable) {
                if (focusTrapHandler) {
                    document.removeEventListener('keydown', focusTrapHandler);
                    focusTrapHandler = null;
                }
                if (toggleBtn) { toggleBtn.focus(); }
                return;
            }

            var FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

            focusTrapHandler = function (e) {
                if (e.key !== 'Tab') { return; }
                var focusable = sidebar.querySelectorAll(FOCUSABLE);
                if (focusable.length === 0) { return; }

                var first = focusable[0];
                var last = focusable[focusable.length - 1];

                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            };

            document.addEventListener('keydown', focusTrapHandler);

            // Move initial focus into sidebar
            var firstFocusable = sidebar.querySelector('a[href], button');
            if (firstFocusable) { firstFocusable.focus(); }
        }

        // ── Event Bindings ──────────────────────────────────────────────

        // Toggle button
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                var isHidden = sidebar.classList.contains('hidden') ||
                               !sidebar.classList.contains('sidebar-open');
                if (isHidden) { openSidebar(); }
                else { closeSidebar(); }
            });
        }

        // Overlay click
        if (overlay) {
            overlay.addEventListener('click', closeSidebar);
        }

        // Close on sidebar link click (mobile — feels native)
        var sidebarLinks = sidebar.querySelectorAll('a[href]');
        for (var i = 0; i < sidebarLinks.length; i++) {
            sidebarLinks[i].addEventListener('click', function () {
                if (window.innerWidth < 768) { closeSidebar(); }
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && sidebar.classList.contains('sidebar-open')) {
                closeSidebar();
            }
        });
    }

    // ─── Bootstrap ──────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebarToggle);
    } else {
        initSidebarToggle();
    }
})();
