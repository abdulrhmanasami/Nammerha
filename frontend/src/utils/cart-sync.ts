/**
 * INC-N05 FIX: Cross-Page Cart Badge Synchronization
 * ═══════════════════════════════════════════════════
 * Problem: Cart badge on index.html (#nav-cart-badge, #mobile-cart-badge) and
 * project-details.html (#header-cart-badge) are separate DOM instances reading
 * from localStorage. Adding items on one page doesn't update the badge on
 * another already-open page until reload.
 *
 * Solution: Listen for `storage` events (fires when localStorage changes in
 * ANOTHER tab/window) and update all cart badge elements on the current page.
 *
 * Standard: Apple HIG — "Ensure consistency across all areas of your app."
 *
 * Usage: Import in main entry points (main.ts, pages that show cart badges).
 *   import '/src/utils/cart-sync.ts';
 */

const CART_KEY = 'nammerha_cart';

/** All possible cart badge element IDs across the platform */
const BADGE_SELECTORS = [
    '#nav-cart-badge',
    '#mobile-cart-badge',
    '#header-cart-badge',
] as const;

interface CartItem {
    id: string;
    qty: number;
    [key: string]: unknown;
}

function getCartCount(): number {
    try {
        const raw = localStorage.getItem(CART_KEY);
        if (!raw) {
            return 0;
        }
        const items: CartItem[] = JSON.parse(raw);
        return Array.isArray(items) ? items.reduce((sum, i) => sum + (i.qty || 1), 0) : 0;
    } catch {
        /* Intentional: Corrupted localStorage or Safari private mode → return 0.
           Cart badge is non-critical — must degrade silently. */
        return 0;
    }
}

function updateBadges(count: number): void {
    for (const sel of BADGE_SELECTORS) {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) {
            continue;
        }

        if (count > 0) {
            el.textContent = String(count);
            // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
            el.classList.remove('nm-hidden');
            // Subtle scale animation for visual feedback
            el.animate?.(
                [
                    { transform: 'scale(1.3)' },
                    { transform: 'scale(1)' },
                ],
                { duration: 200, easing: 'ease-out' },
            );
        } else {
            // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
            el.classList.add('nm-hidden');
        }
    }
}

// ── Listen for cross-tab storage changes ────────────────────────────────────
window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== CART_KEY) {
        return;
    }
    updateBadges(getCartCount());
});

// ── Also update on same-page cart mutations (custom event) ──────────────────
window.addEventListener('cart-updated', () => {
    updateBadges(getCartCount());
});

// ── Initialize on load ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateBadges(getCartCount());
});

export { getCartCount, updateBadges, CART_KEY };
