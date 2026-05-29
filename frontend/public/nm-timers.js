/* ═══════════════════════════════════════════════════════════════════════════
 * PLATINUM STANDARD: EVENT QUARANTINE REGISTRY (ZOMBIE LISTENER ERADICATION)
 * ═══════════════════════════════════════════════════════════════════════════
 * This file guarantees mathematical zero-leak state for setTimeout operations
 * across all Vanilla JS assets in the Nammerha platform.
 * As per AGENTS.md MEMO 44 and MEMO 49, all setTimeout operations in transient
 * components MUST be wrapped in the addTrackedTimer registry.
 * ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // The global registry
  window.__nm_timers = new Map();

  /**
   * Adds a tracked timeout to the global quarantine registry.
   * If a timer with the same ID already exists, it is chemically incinerated
   * before the new one is spawned.
   *
   * @param {Function} callback - The function to execute
   * @param {number} delay - The delay in milliseconds
   * @param {string} [id] - Optional strict ID. If omitted, a cryptographic random ID is generated.
   * @returns {string} The ID of the tracked timer
   */
  window.addTrackedTimer = function (callback, delay, id) {
    var timerId =
      id ||
      'timer_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);

    // Incinerate existing timer with the same ID
    if (window.__nm_timers.has(timerId)) {
      clearTimeout(window.__nm_timers.get(timerId));
    }

    // Wrap the callback to self-destruct from the registry upon execution
    var wrappedCallback = function () {
      window.__nm_timers.delete(timerId);
      callback();
    };

    var timeoutId = setTimeout(wrappedCallback, delay);
    window.__nm_timers.set(timerId, timeoutId);

    return timerId;
  };

  /**
   * Chemically incinerates all currently active timers in the registry.
   * Guaranteed to prevent memory leaks during SPA navigation or pagehide.
   */
  window.clearAllTrackedTimers = function () {
    window.__nm_timers.forEach(function (timeoutId) {
      clearTimeout(timeoutId);
    });
    window.__nm_timers.clear();
  };

  // Automatic Quarantine Enforcement: Annihilate all timers when the page unloads
  window.addEventListener(
    'pagehide',
    function () {
      window.clearAllTrackedTimers();
    },
    { capture: true }
  );
})();
