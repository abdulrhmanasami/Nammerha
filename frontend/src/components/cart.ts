/**
 * Nammerha CartStore — Itemized Construction Cart Engine
 *
 * localStorage-backed cart with CustomEvent reactivity for cross-page sync.
 * Strict Phosphor Icons only — no external dependencies.
 */

import { reportWarning } from '../error-reporter';
// FRIC-2026-F04 FIX: Import isRTL for logical positioning in fly-to-cart animation.
import { isRTL } from '../utils/i18n';

export interface CartItem {
    id: string;
    name: string;
    unitPrice: number;
    quantity: number;
    category: string;
    projectId: string;
    iconClass: string; // Phosphor icon class, e.g. "ph-package"
}

const STORAGE_KEY = 'nmrh_cart';
const CART_EVENT = 'cart:updated';

class CartStoreImpl {
    private items: CartItem[] = [];

    constructor() {
        this.hydrate();
    }

    /** Load cart state from localStorage */
    private hydrate(): void {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed: unknown = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this.items = parsed as CartItem[];
                }
            }
        } catch (err) {
            reportWarning('[Cart] Failed to hydrate cart from localStorage', { component: 'cart', action: 'hydrate', error: err instanceof Error ? err.message : String(err) });
            this.items = [];
        }
    }

    /** Persist cart state to localStorage and emit event */
    private persist(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
        } catch (err) {
            reportWarning('[Cart] Failed to persist cart to localStorage', { component: 'cart', action: 'persist', error: err instanceof Error ? err.message : String(err) });
        }
        window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { items: this.items } }));
    }

    /** Add an item or increment quantity if already in cart */
    addItem(item: Omit<CartItem, 'quantity'>, qty = 1): void {
        const existing = this.items.find((i) => i.id === item.id);
        if (existing) {
            existing.quantity += qty;
        } else {
            this.items.push({ ...item, quantity: qty });
        }
        this.persist();
    }

    /** Remove an item entirely from cart */
    removeItem(id: string): void {
        this.items = this.items.filter((i) => i.id !== id);
        this.persist();
    }

    /** Update quantity for a specific item */
    updateQuantity(id: string, qty: number): void {
        const item = this.items.find((i) => i.id === id);
        if (!item) {
            return;
        }

        if (qty <= 0) {
            this.removeItem(id);
            return;
        }
        item.quantity = qty;
        this.persist();
    }

    /** Get all items in cart */
    getItems(): ReadonlyArray<CartItem> {
        return this.items;
    }

    /** Get total item count */
    getCount(): number {
        return this.items.reduce((sum, i) => sum + i.quantity, 0);
    }

    /** Get total price */
    getTotal(): number {
        return this.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    }

    /** Check if an item is in the cart */
    hasItem(id: string): boolean {
        return this.items.some((i) => i.id === id);
    }

    /** Clear all items */
    clear(): void {
        this.items = [];
        this.persist();
    }
}

/** Singleton cart store instance */
export const CartStore = new CartStoreImpl();

/**
 * Render a cart badge count into a target element.
 * Call this on page load and on `cart:updated` events.
 */
export function renderCartBadge(badgeEl: HTMLElement | null): void {
    if (!badgeEl) {
        return;
    }
    const count = CartStore.getCount();
    if (count > 0) {
        badgeEl.textContent = count > 99 ? '99+' : String(count);
        badgeEl.classList.remove('nm-hidden');
    } else {
        badgeEl.classList.add('nm-hidden');
    }
}

/**
 * Fly-to-cart micro-interaction.
 * Clones a source element and animates it toward a target element.
 */
export function flyToCart(
    sourceEl: HTMLElement,
    targetEl: HTMLElement,
    onComplete?: () => void
): void {
    const sourceRect = sourceEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const flyEl = document.createElement('i');
    flyEl.className = sourceEl.className;
    flyEl.setAttribute('aria-hidden', 'true');
    // DEF-UX-005 FIX: CSS custom properties replace inline style.cssText.
    // Previous: 7 inline style mutations — violated P1-SST-001.
    // Now: Start position via CSS custom properties, animation via CSS class.
    // Standard: CSS Single Source of Truth, Custom Property-driven animation.
    flyEl.classList.add('nm-fly-item');
    // FRIC-2026-F04 FIX: Compute inset-inline-start-aware position.
    // In RTL, inset-inline-start maps to physical `right`, so we compute
    // distance from the inline-start edge (right edge in RTL, left in LTR).
    const rtl = isRTL();
    const vw = window.innerWidth;
    const sourceInlineStart = rtl ? (vw - sourceRect.right) : sourceRect.left;
    flyEl.style.setProperty('--fly-x', `${sourceInlineStart}px`);
    flyEl.style.setProperty('--fly-y', `${sourceRect.top}px`);
    flyEl.style.setProperty('--fly-size', getComputedStyle(sourceEl).fontSize);

    document.body.appendChild(flyEl);

    // Force reflow before applying transition
    void flyEl.offsetHeight;

    // DEF-UX-005 FIX: Target position via CSS custom properties + class toggle.
    // FRIC-2026-F04 FIX: RTL-aware target center computation.
    const targetCenterPhysical = targetRect.left + targetRect.width / 2 - 10;
    const targetInlineStart = rtl ? (vw - targetCenterPhysical - 20) : targetCenterPhysical;
    flyEl.style.setProperty('--fly-x', `${targetInlineStart}px`);
    flyEl.style.setProperty('--fly-y', `${targetRect.top + targetRect.height / 2 - 10}px`);
    flyEl.classList.add('nm-fly-item--landing');

    flyEl.addEventListener('transitionend', () => {
        flyEl.remove();
        // DEF-UX-005 FIX: CSS class replaces inline style for target bounce.
        targetEl.classList.add('nm-cart-bounce');
        targetEl.addEventListener('animationend', () => {
            targetEl.classList.remove('nm-cart-bounce');
        }, { once: true });
        onComplete?.();
    }, { once: true });

    // Fallback cleanup
    setTimeout(() => {
        if (flyEl.parentNode) {
            flyEl.remove();
            onComplete?.();
        }
    }, 800);
}
