/**
 * Nammerha — Theme Boot (Synchronous)
 * ════════════════════════════════════
 * Runs before ANY paint to prevent flash of wrong theme.
 * Must be loaded as <script src="/theme-boot.js"></script> (NO defer/async).
 */
(function() {
  var t = 'dark';
  try { t = localStorage.getItem('nm-theme') || 'dark'; } catch(e) {}
  document.documentElement.setAttribute('data-theme', t);
})();
