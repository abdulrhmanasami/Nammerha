/**
 * donor-basket.ts — Dynamic Construction Basket
 *
 * Reads CartStore and renders materials dynamically.
 * Supports quantity adjustment, item removal, and total calculation.
 */
import '../styles/main.css';
import { CartStore, type CartItem } from '../components/cart';
import { escapeHtml } from '../utils/xss';

function initDonorBasket(): void {
    const container = document.getElementById('cart-items-container');
    const emptyState = document.getElementById('empty-cart-state');
    const totalEl = document.getElementById('cart-total');
    const countEl = document.getElementById('cart-count');
    const checkoutSheet = document.getElementById('checkout-sheet');
    const clearBtn = document.getElementById('clear-cart-btn');
    const confirmBtn = document.getElementById('confirm-funding-btn');
    const trustFeatures = document.getElementById('trust-features');

    if (!container) {
        return;
    }

    function render(): void {
        const items = CartStore.getItems();
        const heading = container!.querySelector('h3');

        // Clear existing items (keep the heading)
        const existingCards = container!.querySelectorAll('.cart-item-card');
        existingCards.forEach((el) => el.remove());

        if (items.length === 0) {
            if (heading) {
                heading.style.display = 'none';
            }
            if (emptyState) {
                emptyState.style.display = 'block';
            }
            if (checkoutSheet) {
                checkoutSheet.style.display = 'none';
            }
            if (trustFeatures) {
                trustFeatures.style.display = 'none';
            }
            return;
        }

        // Show elements
        if (heading) {
            heading.style.display = 'block';
        }
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        if (checkoutSheet) {
            checkoutSheet.style.display = 'block';
        }
        if (trustFeatures) {
            trustFeatures.style.display = 'grid';
        }

        // Render each item
        items.forEach((item) => {
            const card = createItemCard(item);
            container!.appendChild(card);
        });

        // Update totals
        updateTotals();
    }

    function createItemCard(item: CartItem): HTMLElement {
        const card = document.createElement('div');
        card.className = 'cart-item-card glass-card p-4 rounded-xl flex items-center justify-between border-l-4 border-l-trust-blue animate-fade-in-up';
        card.dataset.itemId = item.id;

        card.innerHTML = `
      <div class="flex items-center gap-4 flex-1 min-w-0">
        <div class="w-12 h-12 bg-trust-blue/10 rounded-lg flex items-center justify-center shrink-0">
          <i class="ph ${item.iconClass} text-trust-blue" aria-hidden="true"></i>
        </div>
        <div class="min-w-0 flex-1">
          <h4 class="font-semibold text-slate-800 truncate">${escapeHtml(item.name)}</h4>
          <p class="text-xs text-slate-500">${escapeHtml(item.category)}</p>
        </div>
      </div>
      <div class="flex items-center gap-3 shrink-0 ml-3">
        <div class="flex items-center gap-1">
          <button class="qty-btn qty-minus size-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors" aria-label="Decrease quantity">
            <i class="ph ph-minus ph-xs" aria-hidden="true"></i>
          </button>
          <span class="qty-display text-sm font-bold w-6 text-center">${item.quantity}</span>
          <button class="qty-btn qty-plus size-7 rounded-full bg-trust-blue/10 hover:bg-trust-blue/20 text-trust-blue flex items-center justify-center transition-colors" aria-label="Increase quantity">
            <i class="ph ph-plus ph-xs" aria-hidden="true"></i>
          </button>
        </div>
        <div class="text-right min-w-[60px]">
          <div class="font-bold text-slate-900">$${(item.unitPrice * item.quantity).toFixed(2)}</div>
          <div class="text-[10px] text-slate-400">$${item.unitPrice.toFixed(2)}/ea</div>
        </div>
      </div>
    `;

        // Quantity buttons
        const minusBtn = card.querySelector('.qty-minus');
        const plusBtn = card.querySelector('.qty-plus');

        minusBtn?.addEventListener('click', () => {
            if (item.quantity <= 1) {
                // Animate removal
                card.style.transition = 'opacity 0.3s, transform 0.3s';
                card.style.opacity = '0';
                card.style.transform = 'translateX(-20px)';
                setTimeout(() => {
                    CartStore.removeItem(item.id);
                    render();
                }, 300);
            } else {
                CartStore.updateQuantity(item.id, item.quantity - 1);
                render();
            }
        });

        plusBtn?.addEventListener('click', () => {
            CartStore.updateQuantity(item.id, item.quantity + 1);
            render();
        });

        return card;
    }

    function updateTotals(): void {
        const total = CartStore.getTotal();
        const count = CartStore.getCount();

        if (totalEl) {
            totalEl.textContent = `$${total.toFixed(2)}`;
        }
        if (countEl) {
            countEl.textContent = String(count);
        }
    }

    // HGH-001 FIX: Local escapeHtml removed — using centralized import from utils/xss.ts

    // Clear cart button
    clearBtn?.addEventListener('click', () => {
        if (CartStore.getItems().length === 0) {
            return;
        }
        CartStore.clear();
        render();
    });

    // Confirm funding button
    confirmBtn?.addEventListener('click', () => {
        if (CartStore.getItems().length === 0) {
            return;
        }
        // Future: integrate with payment gateway
        const total = CartStore.getTotal();
        const count = CartStore.getCount();
        alert(`Proceeding to secure checkout:\n${count} items — $${total.toFixed(2)}\n\nPayment gateway integration coming soon.`);
    });

    // Listen for external cart updates
    window.addEventListener('cart:updated', () => {
        render();
    });

    // Initial render
    render();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDonorBasket);
} else {
    initDonorBasket();
}
