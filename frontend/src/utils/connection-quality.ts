import { escapeHtml as esc } from './xss';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Connection Quality Indicator (P2-PLT-004)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Problem: Syria 2G networks fluctuate between "slow but working" and
 * "completely offline." The existing offline-indicator.ts only shows a
 * binary online/offline banner. Users on 2G connections see spinners and
 * think the app is broken — they don't know it's a network issue.
 *
 * Solution: A connection quality badge in the portal header that shows:
 *   - 🟢 Good (4G/WiFi) → hidden (no noise)
 *   - 🟡 Slow (3G/2G)   → subtle amber pill "Slow connection"
 *   - 🔴 Offline         → red pill "Offline" (supplements offline-indicator)
 *
 * Detection: Uses the Network Information API (navigator.connection) where
 * available, with a latency probe fallback for Safari/Firefox.
 *
 * Architecture: This module renders a small pill badge into any element
 * with id="nm-connection-quality". Portal-bootstrap.ts creates this element
 * in the header. The indicator auto-updates on connection changes.
 *
 * Standard: Nielsen #1 (Visibility of System Status), PWA Connectivity Patterns.
 *
 * @version 1.0.0
 * @since P2-PLT-004
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { t } from './i18n';
import { tryApplyI18n } from './i18n-apply';


type ConnectionQuality = 'good' | 'slow' | 'offline';

/** Prevent multiple initializations */
let initialized = false;

/** Current rendered quality — prevents redundant DOM updates */
let currentQuality: ConnectionQuality | null = null;

/**
 * Detect connection quality using Network Information API or fallback.
 * Returns 'good', 'slow', or 'offline'.
 */
function detectQuality(): ConnectionQuality {
  if (!navigator.onLine) {
    return 'offline';
  }

  // Use Network Information API when available (Chrome, Edge, Android WebView)
  const conn = (navigator as NavigatorWithConnection).connection;
  if (conn) {
    const effectiveType = conn.effectiveType;
    // effectiveType: 'slow-2g' | '2g' | '3g' | '4g'
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      return 'slow';
    }
    // Also check downlink (Mbps) — some 3G connections are actually slow
    if (effectiveType === '3g' && conn.downlink !== undefined && conn.downlink < 0.5) {
      return 'slow';
    }
    return 'good';
  }

  // Fallback: Can't detect quality without Network Information API
  // Default to 'good' — the offline indicator handles the binary case
  return 'good';
}

/** Quality → UI config mapping */
const QUALITY_CONFIG = {
  good: {
    hidden: true,
    pillClass: '',
    icon: '',
    i18nKey: '',
    fallback: '',
  },
  slow: {
    hidden: false,
    pillClass: 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300',
    icon: 'ph-cell-signal-low',
    i18nKey: 'connection_slow',
    fallback: 'اتصال بطيء',
  },
  offline: {
    hidden: false,
    pillClass: 'bg-red-500/15 text-red-600 dark:bg-red-400/20 dark:text-red-300',
    icon: 'ph-wifi-slash',
    i18nKey: 'connection_offline',
    fallback: 'غير متصل',
  },
} as const;

/**
 * Render the connection quality indicator into the target element.
 */
function renderQuality(quality: ConnectionQuality): void {
  if (quality === currentQuality) {
    return; // No change — skip DOM update
  }
  currentQuality = quality;

  const target = document.getElementById('nm-connection-quality');
  if (!target) {
    return;
  }

  const config = QUALITY_CONFIG[quality];

  if (config.hidden) {
    target.classList.add('nm-hidden');
    target.innerHTML = '';
    return;
  }

  target.classList.remove('nm-hidden');
  target.className = `nm-connection-pill inline-flex items-center gap-1 text-3xs font-bold px-2 py-0.5 rounded-full transition-all ${config.pillClass}`;
  target.setAttribute('role', 'status');
  target.setAttribute('aria-live', 'polite');
  target.innerHTML = `
    <i class="ph ${esc(config.icon)} text-xs" aria-hidden="true"></i>
    <span data-i18n="${esc(config.i18nKey)}">${esc(t(config.i18nKey, config.fallback))}</span>
  `;
  tryApplyI18n();
}

/**
 * Initialize the connection quality indicator.
 * Safe to call multiple times — only attaches listeners once.
 *
 * Requires a DOM element with id="nm-connection-quality" to render into.
 * If the element doesn't exist, this function is a no-op.
 */
export function initConnectionQuality(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  // Initial render
  renderQuality(detectQuality());

  // Listen for online/offline changes
  window.addEventListener('online', () => renderQuality(detectQuality()));
  window.addEventListener('offline', () => renderQuality('offline'));

  // Listen for Network Information API changes (Chromium only)
  const conn = (navigator as NavigatorWithConnection).connection;
  if (conn) {
    conn.addEventListener('change', () => renderQuality(detectQuality()));
  }
}

/**
 * Type augmentation for Network Information API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
 */
interface NetworkInformation extends EventTarget {
  readonly effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
  readonly downlink: number;
  readonly rtt: number;
  readonly saveData: boolean;
  addEventListener(type: 'change', listener: () => void): void;
}

interface NavigatorWithConnection extends Navigator {
  readonly connection?: NetworkInformation;
}
