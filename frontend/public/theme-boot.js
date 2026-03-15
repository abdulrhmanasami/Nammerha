/**
 * Nammerha — Theme Boot (Synchronous)
 * ════════════════════════════════════
 * Runs before ANY paint to prevent flash of wrong theme.
 * Must be loaded as <script src="/theme-boot.js"></script> (NO defer/async).
 */
(function() {
  // P2-002 FIX: Respect OS preference for first-time visitors
  var fallback = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  var t = fallback;
  try { t = localStorage.getItem('nm-theme') || fallback; } catch(e) {}
  document.documentElement.setAttribute('data-theme', t);
})();
