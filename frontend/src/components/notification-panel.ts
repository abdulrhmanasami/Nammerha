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
// PLT-UX-AUD P3-LOG-006 FIX: Structured telemetry for silent catch blocks.
import { reportWarning } from '../error-reporter';

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

// SYS-005 FIX: Close/reopen race elimination.
// closeTimerId: Tracks the 200ms exit animation timer from closePanel().
//   Cancelled on reopen to prevent the stale timer from removing the new panel.
// openGeneration: Monotonic counter incremented on each openPanel() call.
//   After async loadNotifications() completes, the generation is checked —
//   if it doesn't match, the completion is stale and ignored.
let closeTimerId: ReturnType<typeof setTimeout> | null = null;
let openGeneration = 0;

// P1-009 FIX (Wave 2): RAF-throttled reposition handler for scroll/resize.
// PREVIOUS: positionPanel() was called ONCE in openPanel(). Window resize
// (portrait→landscape rotation) or scroll (non-fixed headers) left the panel
// at stale coordinates — visually detached from the bell icon or overflowing viewport.
// NOW: Scroll + resize events trigger RAF-throttled repositioning while panel is open.
// Handlers are removed on close to prevent memory leaks.
// Standard: 60fps animation budget, Passive Event Listeners (battery optimization).
let repositionRafId: number | null = null;

function handleScrollOrResize(): void {
    if (repositionRafId !== null) { return; } // Already scheduled — skip
    repositionRafId = requestAnimationFrame(() => {
        repositionRafId = null;
        if (isOpen && activeBell && panel) {
            positionPanel(activeBell);
        }
    });
}

function startRepositionListeners(): void {
    // capture: true catches scroll on ANY ancestor (not just window)
    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
}

function stopRepositionListeners(): void {
    window.removeEventListener('scroll', handleScrollOrResize, true);
    window.removeEventListener('resize', handleScrollOrResize);
    if (repositionRafId !== null) {
        cancelAnimationFrame(repositionRafId);
        repositionRafId = null;
    }
}

// P2-015 FIX: Focus trap for notification panel (WCAG 2.4.3 Focus Order).
// PREVIOUS: Panel opened without moving focus — Tab escaped to page content
// behind the panel. Screen reader users didn't know the panel opened.
// NOW: Focus moves to panel on open, Tab/Shift+Tab cycles within focusable
// elements, focus returns to bell on ALL close paths.
// Standard: WAI-ARIA Authoring Practices §3.9 (Dialog), WCAG 2.4.3, Apple HIG.
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href]:not([tabindex="-1"]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
let focusTrapCleanup: (() => void) | null = null;

function installFocusTrap(container: HTMLElement): void {
    const handler = (e: KeyboardEvent): void => {
        if (e.key !== 'Tab') { return; }

        const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) { return; }

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;

        if (e.shiftKey) {
            // Shift+Tab on first element → wrap to last
            if (document.activeElement === first || !container.contains(document.activeElement)) {
                e.preventDefault();
                last.focus();
            }
        } else {
            // Tab on last element → wrap to first
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };

    container.addEventListener('keydown', handler);
    focusTrapCleanup = () => container.removeEventListener('keydown', handler);
}

function removeFocusTrap(): void {
    focusTrapCleanup?.();
    focusTrapCleanup = null;
}

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
                // P2-015: focus restore now handled by closePanel() for ALL paths
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
    } catch (err) {
        // PLT-UX-AUD P3-LOG-006 FIX: Badge update non-critical but logged for Syria 2G diagnostics.
        reportWarning('[NotificationPanel] Badge update failed', { component: 'notification-panel', action: 'update_badge', error: err instanceof Error ? err.message : String(err) });
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
    // SYS-005 FIX (Race Vector 1): Cancel any pending close timer.
    // PREVIOUS: closePanel() scheduled panel.remove() via setTimeout(200ms).
    // If user clicked bell again within that 200ms window, the stale timer
    // would fire mid-use — the guard `if (panel && !isOpen)` catches most
    // cases, but edge cases with CSS animation state remain.
    // NOW: Proactively cancel the timer, eliminating the race entirely.
    if (closeTimerId !== null) {
        clearTimeout(closeTimerId);
        closeTimerId = null;
    }

    // SYS-005 FIX (Race Vector 2): Generation counter for async staleness.
    // If user closes and reopens during the await loadNotifications(), the
    // original async completion would install focus trap on stale content.
    const generation = ++openGeneration;

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

    // P1-009 FIX (Wave 2): Start tracking scroll/resize while panel is open.
    startRepositionListeners();

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
        } catch (err) {
            // PLT-UX-AUD P3-LOG-006 FIX: Structured telemetry replaces /* silent */.
            reportWarning('[NotificationPanel] Mark-all-read failed', { component: 'notification-panel', action: 'mark_all_read', error: err instanceof Error ? err.message : String(err) });
        }
    });

    // Load notifications
    await loadNotifications();

    // SYS-005 FIX: Check generation — if another open/close cycle happened
    // during the await, this completion is STALE. Installing focus trap or
    // moving focus would corrupt the current panel state.
    if (generation !== openGeneration || !isOpen || !panel) { return; }

    // P2-015 FIX: Install focus trap AFTER content loads (mark-read buttons exist).
    // Move focus into the panel so keyboard users know it opened.
    installFocusTrap(panel);
    const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();
}

function closePanel(bell: HTMLElement): void {
    // SYS-005 FIX (Race Vector 3): Guard against double-close.
    // PREVIOUS: Escape keydown + outside click could both fire closePanel
    // within the same event loop tick. Second call would set aria-expanded=false
    // on a bell that's already closed and schedule a redundant remove timer.
    // NOW: Early exit if already closed.
    if (!isOpen) { return; }

    isOpen = false;
    activeBell = null;
    bell.setAttribute('aria-expanded', 'false');

    // P2-015 FIX: Remove focus trap before DOM removal.
    removeFocusTrap();

    // P1-009 FIX (Wave 2): Stop repositioning when panel closes.
    stopRepositionListeners();

    if (panel) {
        panel.classList.remove('nm-notif-panel-open');
        // Remove after animation — SYS-005: Track timer for cancellation on reopen
        closeTimerId = setTimeout(() => {
            closeTimerId = null;
            if (panel && !isOpen) {
                panel.remove();
                panel = null;
            }
        }, 200);
    }

    // P2-015 FIX: Return focus to bell on ALL close paths.
    bell.focus();
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
                } catch (err) {
                    // PLT-UX-AUD P3-LOG-006 FIX: Structured telemetry replaces /* silent */.
                    reportWarning('[NotificationPanel] Mark-as-read failed', { component: 'notification-panel', action: 'mark_read', notificationId: id, error: err instanceof Error ? err.message : String(err) });
                }
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

// P1-009 FIX (Wave 2): Enhanced positionPanel() with viewport clamping.
// PREVIOUS: Blindly positioned panel below bell regardless of available space.
// On mobile or when bell is near the bottom of the viewport, the panel overflowed
// below the visible area — user had to scroll to see notifications.
// NOW: Measures available space below vs above. If insufficient space below,
// positions panel ABOVE the bell. Clamps horizontal position to prevent
// left-edge overflow on narrow viewports.
// Standard: Material Design 3 (Menu Positioning), Apple HIG (Popover Placement).
function positionPanel(bell: HTMLElement): void {
    if (!panel) { return; }
    const rect = bell.getBoundingClientRect();
    const panelHeight = panel.offsetHeight || 400; // Estimate before first render

    panel.style.position = 'fixed';

    // Check if panel would overflow below viewport
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    if (spaceBelow < panelHeight && rect.top > panelHeight + 8) {
        // Position ABOVE the bell (flip)
        panel.style.top = `${rect.top - panelHeight - 8}px`;
    } else {
        // Default: position below the bell
        panel.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - panelHeight - 8)}px`;
    }

    // Reset both physical + logical to avoid stale values
    panel.style.left = '';
    panel.style.right = '';
    panel.style.insetInlineStart = '';
    // Align panel to the 'end' edge — near the bell icon
    panel.style.insetInlineEnd = `${Math.max(8, window.innerWidth - rect.right)}px`;

    // Clamp horizontal: prevent left-edge overflow on narrow viewports
    // (schedule after next frame to read computed layout)
    requestAnimationFrame(() => {
        if (!panel) { return; }
        const panelRect = panel.getBoundingClientRect();
        if (panelRect.left < 8) {
            panel.style.insetInlineEnd = '';
            panel.style.insetInlineStart = '8px';
        }
    });
}
