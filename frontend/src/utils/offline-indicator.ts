// ============================================================================
// Nammerha — Offline Indicator (Native-App Feel)
// P2-MOB-002 FIX: Visual feedback when the device is offline
// ============================================================================
// Architecture: Lightweight banner that slides down from the top when navigator
// reports offline status. Auto-dismisses when back online. Uses the platform's
// existing design tokens for visual consistency.

let banner: HTMLElement | null = null;

function createBanner(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'nm-offline-banner';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.innerHTML = `
        <i class="ph ph-wifi-slash" aria-hidden="true" style="font-size:16px"></i>
        <span data-i18n="offline_message">You are offline — showing cached data</span>
    `;
    document.body.prepend(el);
    return el;
}

function showOffline(): void {
    if (!banner) {
        banner = createBanner();
    }
    // Force reflow then animate
    void banner.offsetHeight;
    banner.classList.add('nm-offline-visible');
}

function hideOffline(): void {
    if (banner) {
        banner.classList.remove('nm-offline-visible');
    }
}

/**
 * Initialize the offline indicator.
 * Safe to call multiple times — only attaches once.
 */
export function initOfflineIndicator(): void {
    // Show immediately if already offline
    if (!navigator.onLine) {
        showOffline();
    }

    window.addEventListener('offline', showOffline);
    window.addEventListener('online', hideOffline);
}
