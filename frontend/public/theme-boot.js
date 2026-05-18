/**
 * Nammerha — Theme & Locale Boot (Synchronous)
 * ══════════════════════════════════════════════
 * Runs before ANY paint to prevent flash of wrong theme OR locale.
 * Must be loaded as <script src="/theme-boot.js"></script> (NO defer/async).
 *
 * P1-WEB-001 FIX: Merged locale boot into theme-boot.js.
 * PREVIOUS: Only auth.html had inline locale boot — ALL other pages loaded
 * as lang="ar" dir="rtl" and only flipped after i18n.js loaded asynchronously.
 * English users on 2G networks saw 5-10 seconds of RTL-mirrored layout.
 * NOW: Every page that includes theme-boot.js gets instant locale detection.
 * Standard: i18n UX, FOUC Prevention, Platform Consistency.
 */
(function() {
  // ─── Theme Boot ────────────────────────────────────────────────────
  // P2-002 FIX: Respect OS preference for first-time visitors
  var fallback = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  var t = fallback;
  try { t = localStorage.getItem('nm-theme') || fallback; } catch(e) { /* localStorage unavailable (incognito/quota) — use OS preference */ }
  document.documentElement.setAttribute('data-theme', t);

  // ─── Locale Boot ───────────────────────────────────────────────────
  // P1-WEB-001 FIX: Instant locale detection — zero FOUC for non-Arabic users.
  // Reads nm-locale from localStorage and sets lang + dir attributes
  // BEFORE any paint. If no locale stored, defaults stay (ar/rtl = Syria-first).
  try {
    var l = localStorage.getItem('nm-locale');
    if (l) {
      document.documentElement.setAttribute('lang', l);
      document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
    }
  } catch(e) { /* localStorage unavailable — graceful degradation, default to ar/rtl */ }
})();
