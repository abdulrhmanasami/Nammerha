/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Offline Indicator (GAP-2026-004)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Self-injecting network status indicator. Critical for Syrian user base
 * with intermittent connectivity (2G/3G, power outages, infrastructure gaps).
 *
 * Architecture:
 *   - Uses navigator.onLine + online/offline events (NO service worker needed)
 *   - Injects fixed banner at viewport top with slide animation
 *   - RTL-aware, theme-aware, i18n-aware
 *   - Fully self-contained CSS (injected via <style> element)
 *   - Loaded dynamically by nav.js or explicitly via <script> tag
 *
 * Behavior:
 *   1. Page load while offline → banner appears immediately
 *   2. Connection drops → banner slides down (amber warning)
 *   3. Connection restored → banner turns green ("Connected!") for 2.5s → slides up
 *
 * Standard: Nielsen #1 (System Status Visibility), Apple HIG (Status Indicators),
 *           Material Design 3 (Snackbar/Banner), WCAG 4.1.3 (Status Messages).
 *
 * @version 1.0.0
 * @since GAP-2026-004
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    // Prevent double-initialization
    if (window._nmOfflineIndicator) { return; }
    window._nmOfflineIndicator = true;

    // ─── Configuration ──────────────────────────────────────────────────
    var BANNER_ID = 'nm-offline-banner';
    var STYLE_ID  = 'nm-offline-styles';
    var ONLINE_DISMISS_DELAY = 2500; // ms to show "Connected!" before dismissing
    var ANIMATION_DURATION   = 350;  // ms for slide animation

    // ─── Inject CSS ─────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) { return; }

        var css = [
            /* Banner container */
            '#' + BANNER_ID + ' {',
            '  position: fixed;',
            '  top: 0;',
            '  inset-inline: 0;',
            '  z-index: var(--z-overlay, 9970);', /* P2-OFF-001 FIX: Was 99999 magic number — now uses design token */
            '  transform: translateY(-100%);',
            '  transition: transform ' + ANIMATION_DURATION + 'ms cubic-bezier(0.4, 0, 0.2, 1),',
            '              background ' + ANIMATION_DURATION + 'ms ease,',
            '              border-color ' + ANIMATION_DURATION + 'ms ease;',
            '  backdrop-filter: blur(12px);',
            '  -webkit-backdrop-filter: blur(12px);',
            '  padding: calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px;',
            '  display: flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  gap: 8px;',
            '  font-family: "IBM Plex Sans Arabic", "Inter", system-ui, sans-serif;',
            '  font-size: 13px;',
            '  font-weight: 600;',
            '  line-height: 1;',
            '  border-bottom: 1px solid transparent;',
            '  box-shadow: 0 2px 12px rgba(0,0,0,0.1);',
            '  pointer-events: auto;',
            '}',
            /* Visible state */
            '#' + BANNER_ID + '.nm-offline-visible {',
            '  transform: translateY(0);',
            '}',
            /* Offline state (amber) */
            '#' + BANNER_ID + '.nm-offline-state {',
            '  background: rgba(251, 191, 36, 0.95);',
            '  color: #78350f;',
            '  border-bottom-color: rgba(245, 158, 11, 0.3);',
            '}',
            /* Online restored state (green) */
            '#' + BANNER_ID + '.nm-online-state {',
            '  background: rgba(34, 197, 94, 0.95);',
            '  color: #052e16;',
            '  border-bottom-color: rgba(22, 163, 74, 0.3);',
            '}',
            /* Dark theme overrides */
            'html[data-theme="dark"] #' + BANNER_ID + '.nm-offline-state {',
            '  background: rgba(120, 53, 15, 0.95);',
            '  color: #fef3c7;',
            '  border-bottom-color: rgba(245, 158, 11, 0.2);',
            '}',
            'html[data-theme="dark"] #' + BANNER_ID + '.nm-online-state {',
            '  background: rgba(5, 46, 22, 0.95);',
            '  color: #bbf7d0;',
            '  border-bottom-color: rgba(22, 163, 74, 0.2);',
            '}',
            /* Icon styling */
            '#' + BANNER_ID + ' i {',
            '  font-size: 16px;',
            '  flex-shrink: 0;',
            '}',
            /* Pulse animation for offline icon */
            '#' + BANNER_ID + '.nm-offline-state i {',
            '  animation: nm-offline-pulse 2s ease-in-out infinite;',
            '}',
            '@keyframes nm-offline-pulse {',
            '  0%, 100% { opacity: 1; }',
            '  50% { opacity: 0.5; }',
            '}',
            /* Reduced motion respect */
            '@media (prefers-reduced-motion: reduce) {',
            '  #' + BANNER_ID + ' { transition-duration: 0.01ms !important; }',
            '  #' + BANNER_ID + '.nm-offline-state i { animation: none !important; }',
            '}',
        ].join('\n');

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── Create Banner DOM ──────────────────────────────────────────────
    function createBanner() {
        var banner = document.getElementById(BANNER_ID);
        if (banner) { return banner; }

        banner = document.createElement('div');
        banner.id = BANNER_ID;
        // WCAG 4.1.3: Status messages must be exposed to assistive tech
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.setAttribute('aria-atomic', 'true');

        // Icon
        var icon = document.createElement('i');
        icon.setAttribute('aria-hidden', 'true');
        banner.appendChild(icon);

        // Text
        var text = document.createElement('span');
        banner.appendChild(text);

        document.body.appendChild(banner);
        return banner;
    }

    // ─── Show / Hide Banner ─────────────────────────────────────────────
    var dismissTimer = null;

    function showOffline() {
        clearTimeout(dismissTimer);

        var banner = createBanner();
        var icon = banner.querySelector('i');
        var text = banner.querySelector('span');

        // Determine i18n text
        var offlineText = 'أنت غير متصل بالإنترنت';
        if (window.NammerhaI18n && window.NammerhaI18n.t) {
            offlineText = window.NammerhaI18n.t('offline_banner') || offlineText;
        }

        icon.className = 'ph ph-wifi-slash';
        text.textContent = offlineText;

        // Switch to offline state
        banner.classList.remove('nm-online-state');
        banner.classList.add('nm-offline-state');

        // Trigger reflow before adding visible class for animation
        void banner.offsetHeight;
        banner.classList.add('nm-offline-visible');
    }

    function showOnlineRestored() {
        var banner = document.getElementById(BANNER_ID);
        if (!banner) { return; }

        var icon = banner.querySelector('i');
        var text = banner.querySelector('span');

        // Determine i18n text
        var onlineText = 'تم استعادة الاتصال';
        if (window.NammerhaI18n && window.NammerhaI18n.t) {
            onlineText = window.NammerhaI18n.t('online_banner') || onlineText;
        }

        icon.className = 'ph ph-wifi-high';
        text.textContent = onlineText;

        // Switch to online state
        banner.classList.remove('nm-offline-state');
        banner.classList.add('nm-online-state');

        // Auto-dismiss after delay
        clearTimeout(dismissTimer);
        dismissTimer = setTimeout(function () {
            banner.classList.remove('nm-offline-visible');
            // Clean up DOM after slide-up animation completes
            setTimeout(function () {
                banner.classList.remove('nm-online-state');
            }, ANIMATION_DURATION);
        }, ONLINE_DISMISS_DELAY);
    }

    // ─── Event Listeners ────────────────────────────────────────────────
    function init() {
        injectStyles();

        // Check initial state — if page loaded while offline, show immediately
        if (!navigator.onLine) {
            // Small delay to let DOM settle (especially if nav.js is still building)
            setTimeout(showOffline, 100);
        }

        // Listen for connectivity changes
        window.addEventListener('offline', showOffline);
        window.addEventListener('online', showOnlineRestored);
    }

    // ─── Bootstrap ──────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
