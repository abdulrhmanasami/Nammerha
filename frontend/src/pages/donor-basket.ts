/**
 * donor-basket.ts — Dynamic Construction Basket
 *
 * Reads CartStore and renders materials dynamically.
 * Supports quantity adjustment, item removal, total calculation,
 * and optional platform tip selection per profitability study §1.
 */
import '../styles/main.css';
import { CartStore, type CartItem } from '../components/cart';
import { escapeHtml } from '../utils/xss';
import { formatDollars } from '../utils/format';
import { t } from '../utils/i18n';

// ─── Tip State ──────────────────────────────────────────────────────────────
let selectedTipPercentage = 3;  // Default: 3% (geo-appropriate for humanitarian context)
let customTipAmount: number | null = null;
let isCustomTip = false;

function initDonorBasket(): void {
    const container = document.getElementById('cart-items-container');
    const emptyState = document.getElementById('empty-cart-state');
    const totalEl = document.getElementById('cart-total');
    const countEl = document.getElementById('cart-count');
    const checkoutSheet = document.getElementById('checkout-sheet');
    const clearBtn = document.getElementById('clear-cart-btn');
    const confirmBtn = document.getElementById('confirm-funding-btn');
    const trustFeatures = document.getElementById('trust-features');

    // Tip elements
    const tipAmountEl = document.getElementById('tip-amount');
    const totalWithTipEl = document.getElementById('total-with-tip');
    const tipCustomInputWrap = document.getElementById('tip-custom-input-wrap');
    const tipCustomInput = document.getElementById('tip-custom-input') as HTMLInputElement | null;

    if (!container) {
        return;
    }

    // ─── Tip Logic ──────────────────────────────────────────────────────────
    function getTipAmount(): number {
        if (isCustomTip && customTipAmount !== null) {
            return Math.max(0, customTipAmount);
        }
        const total = CartStore.getTotal();
        return Math.round(total * (selectedTipPercentage / 100) * 100) / 100;
    }

    function updateTipDisplay(): void {
        const tipAmount = getTipAmount();
        const cartTotal = CartStore.getTotal();
        const grandTotal = cartTotal + tipAmount;

        if (tipAmountEl) {
            tipAmountEl.textContent = formatDollars(tipAmount);
        }
        if (totalWithTipEl) {
            totalWithTipEl.textContent = formatDollars(grandTotal);
        }
    }

    function initTipButtons(): void {
        const tipButtons = document.querySelectorAll<HTMLButtonElement>('.tip-btn');

        tipButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const tipValue = btn.dataset['tip'];

                // Update active state
                tipButtons.forEach((b) => b.classList.remove('tip-btn-active'));
                btn.classList.add('tip-btn-active');

                if (tipValue === 'custom') {
                    isCustomTip = true;
                    customTipAmount = 0;
                    if (tipCustomInputWrap) {
                        tipCustomInputWrap.classList.remove('hidden');
                    }
                    tipCustomInput?.focus();
                } else {
                    isCustomTip = false;
                    customTipAmount = null;
                    selectedTipPercentage = parseInt(tipValue ?? '0', 10);
                    if (tipCustomInputWrap) {
                        tipCustomInputWrap.classList.add('hidden');
                    }
                }

                updateTipDisplay();
            });
        });

        // Custom tip input handler
        tipCustomInput?.addEventListener('input', () => {
            const val = parseFloat(tipCustomInput.value);
            customTipAmount = isNaN(val) ? 0 : Math.max(0, val);
            updateTipDisplay();
        });
    }

    // ─── Render ─────────────────────────────────────────────────────────────
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
          <h4 class="font-semibold text-slate-800 dark:text-slate-100 truncate">${escapeHtml(item.name)}</h4>
          <p class="text-xs text-slate-500">${escapeHtml(item.category)}</p>
        </div>
      </div>
      <div class="flex items-center gap-3 shrink-0 ml-3">
        <div class="flex items-center gap-1">
          <button class="qty-btn qty-minus size-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors" aria-label="${t('basket_decrease_qty', 'Decrease quantity')}">
            <i class="ph ph-minus ph-xs" aria-hidden="true"></i>
          </button>
          <span class="qty-display text-sm font-bold w-6 text-center">${item.quantity}</span>
          <button class="qty-btn qty-plus size-7 rounded-full bg-trust-blue/10 hover:bg-trust-blue/20 text-trust-blue flex items-center justify-center transition-colors" aria-label="${t('basket_increase_qty', 'Increase quantity')}">
            <i class="ph ph-plus ph-xs" aria-hidden="true"></i>
          </button>
        </div>
        <div class="text-right min-w-[60px]">
          <div class="font-bold text-slate-900">${formatDollars(item.unitPrice * item.quantity)}</div>
          <div class="text-[10px] text-slate-400">${formatDollars(item.unitPrice)}/${t('basket_per_unit', 'ea')}</div>
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
            totalEl.textContent = formatDollars(total);
        }
        if (countEl) {
            countEl.textContent = String(count);
        }

        // Update tip display when totals change
        updateTipDisplay();
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
        // HIGH-002 FIX: Replace alert() with inline checkout banner
        const total = CartStore.getTotal();
        const count = CartStore.getCount();
        const tipAmount = getTipAmount();
        const grandTotal = total + tipAmount;

        const banner = document.createElement('div');
        banner.className = 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 mt-3 animate-fade-in-up';

        const tipText = tipAmount > 0
            ? ` + ${formatDollars(tipAmount)} ${t('tip_label', 'tip')}`
            : '';

        banner.innerHTML = `<i class="ph ph-lock-simple" aria-hidden="true"></i> ${t('basket_checkout_msg', 'Proceeding to secure checkout')}: ${count} ${t('basket_items', 'items')} — ${formatDollars(total)}${tipText} = ${formatDollars(grandTotal)}. ${t('basket_gateway_soon', 'Payment gateway coming soon.')}`;
        checkoutSheet?.appendChild(banner);
        setTimeout(() => banner.remove(), 5000);
    });

    // Listen for external cart updates
    window.addEventListener('cart:updated', () => {
        render();
    });

    // Initialize tip buttons
    initTipButtons();

    // Initial render
    render();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDonorBasket);
} else {
    initDonorBasket();
}
