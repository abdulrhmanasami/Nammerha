/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Haptic Feedback Engine (GAP-2026-005)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lightweight tactile feedback for critical user interactions.
 * Wraps navigator.vibrate() with safe checks and predefined patterns.
 *
 * Browser Support:
 *   ✅ Android (Chrome, Firefox, Edge) — full vibrate API support
 *   ❌ iOS Safari — does NOT support navigator.vibrate()
 *   Graceful degradation: silently no-ops on unsupported browsers.
 *
 * Architecture:
 *   - Self-injecting component (loaded by nav.js dynamically)
 *   - Only activates on touch devices (pointer: coarse)
 *   - Exposes window.NammerhaHaptic for cross-module usage
 *   - Automatically wires to [data-haptic] attributed elements
 *
 * Usage in HTML:
 *   <button data-haptic="tap">Click me</button>
 *   <button data-haptic="success">Confirm</button>
 *   <button data-haptic="error">Delete</button>
 *
 * Programmatic:
 *   window.NammerhaHaptic.tap();
 *   window.NammerhaHaptic.success();
 *   window.NammerhaHaptic.error();
 *   window.NammerhaHaptic.fire('confirm');
 *
 * Standard: Apple HIG (Haptic Feedback), Material Design 3 (Touch Feedback),
 *           W3C Vibration API Level 2.
 *
 * @version 1.0.0
 * @since GAP-2026-005
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    // Prevent double-initialization
    if (window.NammerhaHaptic) { return; }

    // ─── Feature Detection ──────────────────────────────────────────────
    var isTouch = false;
    try {
        isTouch = window.matchMedia('(pointer: coarse)').matches;
    } catch (e) { /* matchMedia not supported */ }

    var canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

    /**
     * Safely trigger vibration.
     * @param {number|number[]} pattern — Duration in ms, or [vibrate, pause, vibrate, ...]
     */
    function vibrate(pattern) {
        if (!canVibrate || !isTouch) { return; }
        try {
            navigator.vibrate(pattern);
        } catch (e) { /* silently degrade */ }
    }

    // ─── Predefined Haptic Patterns ─────────────────────────────────────
    // Inspired by iOS UIImpactFeedbackGenerator and Android HapticFeedbackConstants
    var PATTERNS = {
        /** Light tap — navigation, selection, toggle (10ms) */
        tap: 10,
        /** Medium tap — button press, submit (15ms) */
        confirm: 15,
        /** Success — transaction complete, donation confirmed (two short pulses) */
        success: [15, 50, 15],
        /** Warning — attention needed (short-long pattern) */
        warning: [10, 30, 20],
        /** Error — validation failure, network error (three short bursts) */
        error: [10, 30, 10, 30, 10],
    };

    // ─── Public API ─────────────────────────────────────────────────────
    var api = {
        /** Light tap (10ms) — for navigation, selection, toggle */
        tap: function () { vibrate(PATTERNS.tap); },
        /** Medium confirm (15ms) — for button press, submit */
        confirm: function () { vibrate(PATTERNS.confirm); },
        /** Success double-pulse — for transaction complete */
        success: function () { vibrate(PATTERNS.success); },
        /** Warning pattern — for attention needed */
        warning: function () { vibrate(PATTERNS.warning); },
        /** Error triple-burst — for validation failure */
        error: function () { vibrate(PATTERNS.error); },
        /** Fire a named pattern */
        fire: function (name) {
            var fn = api[name];
            if (typeof fn === 'function') { fn(); }
        },
        /** Whether haptic feedback is supported on this device */
        supported: canVibrate && isTouch,
    };

    window.NammerhaHaptic = api;

    // ─── Auto-wire [data-haptic] Elements ────────────────────────────────
    // Uses event delegation on document body for efficiency.
    // Supports dynamically-created elements (nav.js FAB, portal buttons, etc.)
    function initAutoWire() {
        document.addEventListener('click', function (e) {
            if (!canVibrate || !isTouch) { return; }

            var target = e.target;
            // Walk up the DOM tree to find [data-haptic]
            while (target && target !== document) {
                if (target.getAttribute && target.getAttribute('data-haptic')) {
                    var pattern = target.getAttribute('data-haptic');
                    api.fire(pattern);
                    return;
                }
                target = target.parentElement;
            }
        });
    }

    // ─── Bootstrap ──────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAutoWire);
    } else {
        initAutoWire();
    }
})();
