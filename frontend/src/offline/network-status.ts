// ============================================================================
// Nammerha — Network Status Bar (Self-Injecting Component)
// ============================================================================
// Bilingual (EN/AR) floating status bar that shows:
//   - "Offline" warning when disconnected
//   - "Syncing..." when replaying queued requests
//   - "Online" confirmation that auto-fades
//   - SW update notification with refresh button
//
// Follows the Self-Injecting Component pattern:
//   import './offline/network-status';  // Just import — auto-mounts
// ============================================================================

import { listenToServiceWorker, initNetworkListeners, isOnline } from './sw-register';
import { getPendingCount, replayQueue } from './offline-queue';
import { t, isRTL } from '../utils/i18n';

const STATUS_BAR_ID = 'nammerha-network-status';

// Bilingual messages
type StatusType = 'offline' | 'syncing' | 'online' | 'syncSuccess' | 'syncFailed' | 'swUpdate';

const STATUS_KEYS: Record<StatusType, {key: string, fb: string}> = {
    offline: { key: 'network_offline', fb: 'You are offline — changes will sync when connection returns' },
    syncing: { key: 'network_syncing', fb: 'Syncing offline changes...' },
    online: { key: 'network_online', fb: 'Back online' },
    syncSuccess: { key: 'network_sync_success', fb: 'All changes synced successfully' },
    syncFailed: { key: 'network_sync_failed', fb: 'Some changes could not be synced' },
    swUpdate: { key: 'network_sw_update', fb: 'New version available — ' },
};

function createStatusBar(): HTMLElement {
    const existing = document.getElementById(STATUS_BAR_ID);
    if (existing) {
        return existing;
    }

    const bar = document.createElement('div');
    bar.id = STATUS_BAR_ID;
    bar.className = 'network-status-bar';
    bar.setAttribute('role', 'alert');
    bar.setAttribute('aria-live', 'polite');
    document.body.appendChild(bar);
    return bar;
}

function showStatus(type: StatusType, autoHideMs?: number): void {
    const bar = createStatusBar();
    const isRtl = isRTL();

    bar.dir = isRtl ? 'rtl' : 'ltr';
    bar.className = `network-status-bar network-status--${type}`;

    if (type === 'swUpdate') {
        const msg = t('network_sw_update', 'New version available — ');
        const refreshLabel = t('network_refresh', 'Refresh');
        bar.innerHTML = `
            <span class="network-status__icon"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i></span>
            <span class="network-status__text">${msg}</span>
            <button type="button" class="network-status__action" id="nm-sw-refresh-btn">${refreshLabel}</button>
        `;
        // NMR-NS-001 FIX: Replaced inline onclick="location.reload()" with addEventListener.
        // Previous: inline handler — blocked by CSP script-src 'self', making refresh button dead.
        // Standard: CONF-CSP-01 pattern, WHATWG CSP Level 3.
        bar.querySelector('#nm-sw-refresh-btn')?.addEventListener('click', () => { location.reload(); });
    } else {
        /* PLT-NET-001 FIX: Replaced emoji icons with Phosphor font glyphs.
           Previous: Emoji (⚡🔄✅⚠️) — renders inconsistently across Android/iOS/desktop
           and breaks the platform's professional visual identity.
           Standard: Platform Icon Governance — Phosphor icons exclusively. */
        const icons: Record<StatusType, string> = {
            offline: '<i class="ph ph-wifi-slash" aria-hidden="true"></i>',
            syncing: '<i class="ph ph-arrows-clockwise ph-spin" aria-hidden="true"></i>',
            online: '<i class="ph ph-wifi-high" aria-hidden="true"></i>',
            syncSuccess: '<i class="ph ph-check-circle" aria-hidden="true"></i>',
            syncFailed: '<i class="ph ph-warning" aria-hidden="true"></i>',
            swUpdate: '<i class="ph ph-arrows-clockwise" aria-hidden="true"></i>',
        };
        bar.innerHTML = `
            <span class="network-status__icon">${icons[type]}</span>
            <span class="network-status__text">${t(STATUS_KEYS[type].key, STATUS_KEYS[type].fb)}</span>
        `;
    }

    bar.classList.add('network-status--visible');

    if (autoHideMs) {
        setTimeout(() => {
            bar.classList.remove('network-status--visible');
        }, autoHideMs);
    }
}

function hideStatus(): void {
    const bar = document.getElementById(STATUS_BAR_ID);
    if (bar) {
        bar.classList.remove('network-status--visible');
    }
}

// ─── Initialize: Wire up all event listeners ────────────────────────────────
function init(): void {
    // Network listeners (emits nammerha:online / nammerha:offline events)
    initNetworkListeners();

    // Show initial state if offline
    if (!isOnline()) {
        showStatus('offline');
    }

    // Online → sync queued requests
    document.addEventListener('nammerha:online', async () => {
        const pendingCount = await getPendingCount();

        if (pendingCount > 0) {
            showStatus('syncing');
            const result = await replayQueue();
            if (result.failed === 0) {
                showStatus('syncSuccess', 3000);
            } else {
                showStatus('syncFailed', 5000);
            }
        } else {
            showStatus('online', 2000);
        }
    });

    // Offline → show warning
    document.addEventListener('nammerha:offline', () => {
        showStatus('offline');
    });

    // SW messages (Background Sync results)
    listenToServiceWorker((msg) => {
        switch (msg.type) {
            case 'sync-success':
                showStatus('syncSuccess', 3000);
                break;
            case 'sync-failed':
                showStatus('syncFailed', 5000);
                break;
        }
    });

    // SW update notification
    document.addEventListener('nammerha:sw-updated', () => {
        showStatus('swUpdate');
    });

    // W9-001 FIX: Store interval ID and clear on page unload to prevent
    // ghost intervals from accumulating during SPA-like navigation.
    const pendingCheckId = setInterval(async () => {
        if (!isOnline()) {
            const count = await getPendingCount();
            if (count > 0) {
                const bar = document.getElementById(STATUS_BAR_ID);
                if (bar) {
                    const badge = bar.querySelector('.network-status__badge');
                    const badgeText = `${count} ${t('network_pending', 'pending changes')}`;
                    if (badge) {
                        badge.textContent = badgeText;
                    } else {
                        const span = document.createElement('span');
                        span.className = 'network-status__badge';
                        span.textContent = badgeText;
                        bar.appendChild(span);
                    }
                }
            }
        }
    }, 10_000);
    window.addEventListener('beforeunload', () => clearInterval(pendingCheckId));
}

// Self-inject on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Re-export hide for programmatic use
export { hideStatus, showStatus };
