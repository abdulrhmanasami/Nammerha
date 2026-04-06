/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Haptic Feedback Engine (GAP-2026-005) [SHAITANI PLATINUM FIX]
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lightweight tactile feedback for critical user interactions.
 * Wraps navigator.vibrate() with safe checks and predefined patterns.
 *
 * Architecture Fixes (Platinum Standard):
 *   1. Event Delegation migrated from `click` to `pointerdown` for INSTANT
 *      native-feeling feedback (eliminates 300ms touch-lift delay).
 *   2. Integrated 50ms anti-spam throttle barrier for battery preservation.
 *   3. Harmonized pattern signatures with frontend/src/utils/haptic.ts.
 *
 * Browser Support:
 *   ✅ Android (Chrome, Firefox, Edge) — full vibrate API support
 *   ❌ iOS Safari — does NOT support navigator.vibrate()
 *   Graceful degradation: silently no-ops on unsupported browsers.
 *
 * @version 1.5.0
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    if (window.NammerhaHaptic) { return; }

    var isTouch = false;
    try {
        isTouch = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);
    } catch (e) { /* matchMedia not supported */ }

    var canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    var lastVibrateTime = 0;
    var THROTTLE_MS = 50;

    function vibrate(pattern) {
        if (!canVibrate || !isTouch) { return; }
        var now = Date.now();
        if (now - lastVibrateTime < THROTTLE_MS) { return; }

        try {
            navigator.vibrate(pattern);
            lastVibrateTime = now;
        } catch (e) { /* silently degrade */ }
    }

    var PATTERNS = {
        tap: 10,
        confirm: 15,
        success: [15, 50, 15],
        warning: [10, 30, 20],
        error: [10, 30, 10, 30, 10],
    };

    var api = {
        tap: function () { vibrate(PATTERNS.tap); },
        confirm: function () { vibrate(PATTERNS.confirm); },
        success: function () { vibrate(PATTERNS.success); },
        warning: function () { vibrate(PATTERNS.warning); },
        error: function () { vibrate(PATTERNS.error); },
        fire: function (name) {
            var fn = api[name];
            if (typeof fn === 'function') { fn(); }
        },
        supported: canVibrate && isTouch,
    };

    window.NammerhaHaptic = api;

    function initAutoWire() {
        // Use pointerdown for 0ms lag, giving an authentic native app sensation.
        document.addEventListener('pointerdown', function (e) {
            // Guard: Only vibrate on physical touch, ignore mouse clicks on desktop.
            if (e.pointerType === 'mouse') { return; }
            if (!canVibrate || !isTouch) { return; }

            var target = e.target;
            while (target && target !== document) {
                if (target.getAttribute && target.getAttribute('data-haptic')) {
                    var pattern = target.getAttribute('data-haptic');
                    api.fire(pattern);
                    return;
                }
                target = target.parentElement;
            }
        }, { passive: true }); // passive for scroll performance
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAutoWire);
    } else {
        initAutoWire();
    }
})();
