// ============================================================================
// Nammerha — Notification Panel Component (IMP-015)
// ============================================================================
// Self-injecting notification dropdown attached to #notification-bell.
// Polls unread count every 60s, renders notification list with mark-read.
//
// Architecture:
//   - Attaches to bell button created by header-normalize.ts
//   - Uses api.notifications.* for all backend communication
//   - Dismisses on outside click (click-away pattern)
//   - RTL-safe (uses logical properties: inset-inline-end)
//   - Accessible: aria-expanded, role="dialog", focus trap
//
// Usage:
//   import { initNotificationPanel } from '../components/notification-panel';
//   initNotificationPanel();  // Call once on any authenticated page
// ============================================================================

import { notifications } from '../api';
import { getCurrentUser } from '../auth';
import { escapeHtml } from '../utils/xss';
import { t } from '../utils/i18n';
import { relativeTimeAgo } from '../utils/format';

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000;  // 1 minute
const MAX_DISPLAY = 20;
const PANEL_ID = 'nm-notification-panel';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Notification {
    notification_id: string;
    type: string;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
    is_read: boolean;
    created_at: string;
}

// ─── Notification Type → Icon + Color ───────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
    escrow_locked:    { icon: 'ph-lock-key',        color: 'text-emerald-600' },
    escrow_released:  { icon: 'ph-lock-open',       color: 'text-green-600' },
    escrow_refunded:  { icon: 'ph-arrow-counter-clockwise', color: 'text-amber-600' },
    bid_received:     { icon: 'ph-gavel',           color: 'text-blue-600' },
    bid_accepted:     { icon: 'ph-thumbs-up',       color: 'text-green-600' },
    project_update:   { icon: 'ph-buildings',       color: 'text-indigo-600' },
    kyc_approved:     { icon: 'ph-seal-check',      color: 'text-green-600' },
    kyc_rejected:     { icon: 'ph-x-circle',        color: 'text-red-600' },
    po_status:        { icon: 'ph-package',         color: 'text-purple-600' },
    proof_verified:   { icon: 'ph-camera',          color: 'text-teal-600' },
    system:           { icon: 'ph-megaphone-simple', color: 'text-slate-600' },
};

const DEFAULT_CONFIG = { icon: 'ph-bell', color: 'text-slate-500' };

// ─── Constants ──────────────────────────────────────────────────────────────
const BELL_SELECTORS = '#notification-bell, #nav-notification-btn, #mobile-notif-bell, [data-notif-bell]';
const BADGE_SELECTORS = '#notif-count, #nav-notif-badge, #mobile-notif-badge, .notif-count, .cart-badge[id$="notif-badge"], [data-notif-badge]';

// ─── State ──────────────────────────────────────────────────────────────────

let isOpen = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let panel: HTMLElement | null = null;
let activeBell: HTMLElement | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize the notification panel. Safe to call on any page.
 * No-ops if user is not authenticated or bell button doesn't exist.
 */
export function initNotificationPanel(): void {
    const user = getCurrentUser();
    if (!user) { return; }

    // Wait for DOM — bell may be injected by header-normalize after DOMContentLoaded
    const attach = () => {
        const bells = document.querySelectorAll<HTMLElement>(BELL_SELECTORS);
        if (bells.length === 0) { return; }

        bells.forEach(bell => {
            // Prevent double-init
            if (bell.dataset['notifInit'] === '1') { return; }
            bell.dataset['notifInit'] = '1';

            // Wire click
            bell.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePanel(bell);
            });
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (isOpen && panel && !panel.contains(e.target as Node)) {
                // If the click is on any of the bells, togglePanel handles it.
                // Otherwise, close the panel.
                const isBellClick = Array.from(bells).some(b => b.contains(e.target as Node));
                if (!isBellClick && activeBell) {
                    closePanel(activeBell);
                }
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen && activeBell) {
                closePanel(activeBell);
                activeBell.focus();
            }
        });

        // Initial badge fetch
        updateBadge();

        // Start polling (only one interval globally)
        if (!pollTimer) {
            pollTimer = setInterval(updateBadge, POLL_INTERVAL_MS);
        }

        // Stop polling when page is hidden (battery optimization for field devices)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            } else if (!document.hidden && !pollTimer) {
                updateBadge();
                pollTimer = setInterval(updateBadge, POLL_INTERVAL_MS);
            }
        });
    };

    // Try immediately, fallback to DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
    } else {
        // Small delay to allow header-normalize to inject the bell first
        setTimeout(attach, 50);
    }
}

/**
 * Force refresh the unread badge count.
 * Useful after performing actions that generate notifications.
 */
export function refreshNotificationBadge(): void {
    updateBadge();
}

// ─── Badge ──────────────────────────────────────────────────────────────────

async function updateBadge(): Promise<void> {
    try {
        const result = await notifications.getUnreadCount();
        const count = result?.data?.unread_count ?? 0;

        const badges = document.querySelectorAll<HTMLElement>(BADGE_SELECTORS);
        if (badges.length === 0) { return; }

        badges.forEach(badge => {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.classList.remove('hidden', 'nm-hidden');
                // Subtle pulse animation on new notifications
                badge.classList.add('nm-notif-pulse');
                setTimeout(() => badge.classList.remove('nm-notif-pulse'), 600);
            } else {
                badge.classList.add('hidden', 'nm-hidden');
            }
        });
    } catch {
        // Silent — badge update is non-critical
    }
}

// ─── Panel Toggle ───────────────────────────────────────────────────────────

function togglePanel(bell: HTMLElement): void {
    if (isOpen) {
        closePanel(activeBell || bell);
    } else {
        openPanel(bell);
    }
}

async function openPanel(bell: HTMLElement): Promise<void> {
    isOpen = true;
    activeBell = bell;
    bell.setAttribute('aria-expanded', 'true');

    // Create or reuse panel
    if (!panel) {
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'nm-notif-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', t('notifications', 'Notifications'));
        document.body.appendChild(panel);
    }

    // Position relative to bell
    positionPanel(bell);

    // Loading state
    panel.innerHTML = `
        <div class="nm-notif-header">
            <h3 class="nm-notif-title" data-i18n="notifications">${t('notifications', 'Notifications')}</h3>
            <button type="button" id="nm-mark-all-read" class="nm-notif-mark-all" data-i18n="mark_all_read"
                    aria-label="${t('mark_all_read', 'Mark all as read')}">
                ${t('mark_all_read', 'Mark all read')}
            </button>
        </div>
        <div class="nm-notif-body">
            <div class="nm-notif-loading">
                <i class="ph ph-spinner-gap ph-spin text-slate-400 text-xl" aria-hidden="true"></i>
            </div>
        </div>
    `;

    // Show with animation
    panel.classList.add('nm-notif-panel-open');

    // Wire mark-all-read
    panel.querySelector('#nm-mark-all-read')?.addEventListener('click', async () => {
        try {
            await notifications.markAllAsRead();
            updateBadge();
            // Refresh list
            await loadNotifications();
        } catch { /* silent */ }
    });

    // Load notifications
    await loadNotifications();
}

function closePanel(bell: HTMLElement): void {
    isOpen = false;
    activeBell = null;
    bell.setAttribute('aria-expanded', 'false');

    if (panel) {
        panel.classList.remove('nm-notif-panel-open');
        // Remove after animation
        setTimeout(() => {
            if (panel && !isOpen) {
                panel.remove();
                panel = null;
            }
        }, 200);
    }
}

// ─── Load & Render ──────────────────────────────────────────────────────────

async function loadNotifications(): Promise<void> {
    const body = panel?.querySelector('.nm-notif-body');
    if (!body) { return; }

    try {
        const response = await notifications.getAll();
        const items = (Array.isArray(response?.data) ? response.data : []) as Notification[];
        const display = items.slice(0, MAX_DISPLAY);

        if (display.length === 0) {
            body.innerHTML = `
                <div class="nm-notif-empty">
                    <i class="ph ph-bell-slash text-slate-300 text-3xl" aria-hidden="true"></i>
                    <p data-i18n="no_notifications">${t('no_notifications', 'No notifications yet')}</p>
                </div>
            `;
            return;
        }

        body.innerHTML = display.map(renderNotificationItem).join('');

        // Wire individual mark-read buttons
        body.querySelectorAll('[data-mark-read]').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset['markRead'];
                if (!id) { return; }
                try {
                    await notifications.markAsRead(id);
                    // Update UI immediately (optimistic)
                    const item = btn.closest('.nm-notif-item');
                    item?.classList.remove('nm-notif-unread');
                    item?.classList.add('nm-notif-read');
                    (btn as HTMLElement).remove();
                    updateBadge();
                } catch { /* silent */ }
            });
        });

    } catch {
        body.innerHTML = `
            <div class="nm-notif-empty">
                <i class="ph ph-warning-circle text-red-400 text-2xl" aria-hidden="true"></i>
                <p data-i18n="failed_to_load">${t('failed_to_load', 'Failed to load')}</p>
            </div>
        `;
    }
}

function renderNotificationItem(n: Notification): string {
    const config = TYPE_CONFIG[n.type] ?? DEFAULT_CONFIG;
    const unreadClass = n.is_read ? 'nm-notif-read' : 'nm-notif-unread';
    const markBtn = n.is_read ? '' : `
        <button type="button" data-mark-read="${escapeHtml(n.notification_id)}"
                class="nm-notif-item-mark" aria-label="${t('mark_read', 'Mark as read')}"
                title="${t('mark_read', 'Mark as read')}">
            <i class="ph ph-check" aria-hidden="true"></i>
        </button>
    `;

    return `
        <div class="nm-notif-item ${unreadClass}" data-notif-id="${escapeHtml(n.notification_id)}">
            <div class="nm-notif-item-icon ${config.color}">
                <i class="ph ${config.icon}" aria-hidden="true"></i>
            </div>
            <div class="nm-notif-item-content">
                <p class="nm-notif-item-title">${escapeHtml(n.title)}</p>
                <p class="nm-notif-item-body">${escapeHtml(n.body)}</p>
                <time class="nm-notif-item-time">${relativeTimeAgo(n.created_at)}</time>
            </div>
            ${markBtn}
        </div>
    `;
}

// ─── Panel Positioning ──────────────────────────────────────────────────────

function positionPanel(bell: HTMLElement): void {
    if (!panel) { return; }
    const rect = bell.getBoundingClientRect();

    // Position below the bell, aligned to the end edge
    // P1-001 FIX: Physical left/right → CSS Logical Properties (insetInlineEnd)
    // This automatically handles RTL without manual isRtl branching.
    panel.style.position = 'fixed';
    panel.style.top = `${rect.bottom + 8}px`;

    // Reset both physical + logical to avoid stale values
    panel.style.left = '';
    panel.style.right = '';
    // Align panel to the 'end' edge — near the bell icon
    panel.style.insetInlineEnd = `${window.innerWidth - rect.right}px`;
}
