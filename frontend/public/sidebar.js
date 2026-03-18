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

        // ── MED-004 FIX: WAI-ARIA Tab Keyboard Navigation ──────────────
        // WAI-ARIA Authoring Practices §3.26 mandates:
        //   • Arrow Down/Up: Move focus between tabs (wraps at edges)
        //   • Home: Focus first tab
        //   • End: Focus last tab
        //   • Enter/Space: Activate focused tab
        // This handler works for ALL 6 dashboard portals via the shared
        // role="tablist" nav in every sidebar.
        // Standard: WAI-ARIA §3.26, WCAG 2.1.1 (Keyboard), WCAG 4.1.2.
        var tablist = sidebar.querySelector('[role="tablist"]');
        if (tablist) {
            var tabs = tablist.querySelectorAll('[role="tab"]');
            if (tabs.length > 0) {
                // ── Activate a tab: update ARIA, show panel, dispatch event ──
                // FRIC-2026-001 FIX: Smooth tab panel transition via CSS animation re-trigger.
                // INC-001 FIX: Migrated from style.display to classList.add/remove('hidden').
                // Previous: inline style manipulation — inconsistent with class="hidden" convention.
                // Now: Uses classList which is consistent with HTML initial state and sidebar toggle.
                // Animation re-trigger preserved: classList.remove('hidden') triggers reflow,
                // then void offsetHeight and animation reset ensure CSS keyframes replay.
                // Standard: Design System Consistency, Material Design 3, Apple HIG.
                function activateTab(tab) {
                    // Deselect all tabs and hide all panels
                    for (var t = 0; t < tabs.length; t++) {
                        tabs[t].setAttribute('aria-selected', 'false');
                        tabs[t].classList.remove('bg-trust-blue/10', 'text-trust-blue');
                        tabs[t].classList.add('text-slate-600');
                        var panelId = tabs[t].getAttribute('aria-controls');
                        if (panelId) {
                            var panel = document.getElementById(panelId);
                            if (panel) { panel.classList.add('hidden'); }
                        }
                    }
                    // Select target tab
                    tab.setAttribute('aria-selected', 'true');
                    tab.classList.add('bg-trust-blue/10', 'text-trust-blue');
                    tab.classList.remove('text-slate-600');
                    var activePanel = tab.getAttribute('aria-controls');
                    if (activePanel) {
                        var ap = document.getElementById(activePanel);
                        if (ap) {
                            // Show the panel
                            ap.classList.remove('hidden');
                            // Force CSS animation re-trigger:
                            // 1. Strip existing animation (browser clears pending animation)
                            ap.style.animation = 'none';
                            // 2. Force synchronous reflow so the browser acknowledges the reset
                            void ap.offsetHeight;
                            // 3. Remove override — main.css [id^="section-"] animation replays
                            ap.style.animation = '';
                        }
                    }
                    tab.focus();
                    // Dispatch custom event for portal TS modules
                    tab.dispatchEvent(new CustomEvent('nm:tab-activate', {
                        bubbles: true,
                        detail: { tabId: tab.id, panelId: activePanel }
                    }));
                }

                // ── Click handler for all tabs ──
                for (var ti = 0; ti < tabs.length; ti++) {
                    tabs[ti].addEventListener('click', function () {
                        activateTab(this);
                    });
                }

                // ── Keyboard handler ──
                tablist.addEventListener('keydown', function (e) {
                    var current = document.activeElement;
                    if (!current || current.getAttribute('role') !== 'tab') { return; }

                    var index = -1;
                    for (var ci = 0; ci < tabs.length; ci++) {
                        if (tabs[ci] === current) { index = ci; break; }
                    }
                    if (index === -1) { return; }

                    var handled = false;
                    switch (e.key) {
                        case 'ArrowDown':
                        case 'ArrowRight':
                            index = (index + 1) % tabs.length;
                            tabs[index].focus();
                            handled = true;
                            break;
                        case 'ArrowUp':
                        case 'ArrowLeft':
                            index = (index - 1 + tabs.length) % tabs.length;
                            tabs[index].focus();
                            handled = true;
                            break;
                        case 'Home':
                            tabs[0].focus();
                            handled = true;
                            break;
                        case 'End':
                            tabs[tabs.length - 1].focus();
                            handled = true;
                            break;
                        case 'Enter':
                        case ' ':
                            activateTab(current);
                            handled = true;
                            break;
                    }
                    if (handled) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                });

                // Set tabindex for roving tabindex pattern
                for (var ri = 0; ri < tabs.length; ri++) {
                    tabs[ri].setAttribute('tabindex',
                        tabs[ri].getAttribute('aria-selected') === 'true' ? '0' : '-1'
                    );
                }
                // Update tabindex on focus
                tablist.addEventListener('focusin', function (e) {
                    if (e.target.getAttribute('role') !== 'tab') { return; }
                    for (var fi = 0; fi < tabs.length; fi++) {
                        tabs[fi].setAttribute('tabindex', tabs[fi] === e.target ? '0' : '-1');
                    }
                });
            }
        }
    }

    // ─── Bootstrap ──────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebarToggle);
    } else {
        initSidebarToggle();
    }
})();
