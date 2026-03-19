/**
 * donor-basket.ts — Dynamic Construction Basket
 *
 * Reads CartStore and renders materials dynamically.
 * Supports quantity adjustment, item removal, total calculation,
 * and optional platform tip selection per profitability study §1.
 */
import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { CartStore, type CartItem } from '../components/cart';
import { escapeHtml } from '../utils/xss';
import { formatDollars } from '../utils/format';
import { t } from '../utils/i18n';
// GAP-N03 FIX: Global search overlay on checkout page
import { initSearch } from '../utils/search-overlay';
// UX-004 FIX: Haptic feedback for native-app tactile response
import { haptic } from '../utils/haptic';
initSearch();

// FRC-003 FIX: Default tip 0% (was 3%). Humanitarian platform — opt-in tipping only.
let selectedTipPercentage = 0;
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

    // P0-F2 FIX: Populate project context card dynamically from CartStore.
    // Previous: hardcoded "Harbor View Reconstruction" / "Aleppo, Syria" in HTML.
    function updateProjectContext(): void {
        const nameEl = document.getElementById('basket-project-name');
        const locEl = document.getElementById('basket-project-location');
        const items = CartStore.getItems();
        if (nameEl && items.length > 0) {
            // CartItem may carry project metadata; fall back to generic text
            const first = items[0] as CartItem & { projectName?: string; projectLocation?: string };
            nameEl.textContent = first.projectName ?? t('basket_project_items', 'Construction Materials');
            nameEl.removeAttribute('data-i18n');
        }
        if (locEl && items.length > 0) {
            const first = items[0] as CartItem & { projectLocation?: string };
            const span = locEl.querySelector('span');
            if (span) {
                span.textContent = first.projectLocation ?? t('basket_various_projects', 'Various Projects');
                span.removeAttribute('data-i18n');
            }
        }
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
                haptic.light(); // UX-004: Tip select feedback
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
            // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
            if (heading) {
                heading.classList.add('nm-hidden');
            }
            if (emptyState) {
                emptyState.classList.remove('nm-hidden');
            }
            if (checkoutSheet) {
                checkoutSheet.classList.add('nm-hidden');
            }
            if (trustFeatures) {
                trustFeatures.classList.add('nm-hidden');
            }
            return;
        }

        // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
        // Show elements
        if (heading) {
            heading.classList.remove('nm-hidden');
        }
        if (emptyState) {
            emptyState.classList.add('nm-hidden');
        }
        if (checkoutSheet) {
            checkoutSheet.classList.remove('nm-hidden');
        }
        if (trustFeatures) {
            trustFeatures.classList.remove('nm-hidden');
        }

        // Render each item
        items.forEach((item) => {
            const card = createItemCard(item);
            container!.appendChild(card);
        });

        // Update totals
        updateTotals();

        // P0-F2 FIX: Populate project context each time items change
        updateProjectContext();
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
          <button class="qty-btn qty-minus size-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors" aria-label="${t('basket_decrease_qty', 'Decrease quantity')}">
            <i class="ph ph-minus ph-xs" aria-hidden="true"></i>
          </button>
          <span class="qty-display text-sm font-bold w-6 text-center">${item.quantity}</span>
          <button class="qty-btn qty-plus size-7 rounded-full bg-trust-blue/10 hover:bg-trust-blue/20 text-trust-blue flex items-center justify-center transition-colors" aria-label="${t('basket_increase_qty', 'Increase quantity')}">
            <i class="ph ph-plus ph-xs" aria-hidden="true"></i>
          </button>
        </div>
        <div class="text-end min-w-[60px]">
          <div class="font-bold text-slate-900">${formatDollars(item.unitPrice * item.quantity)}</div>
          <div class="text-3xs text-slate-400">${formatDollars(item.unitPrice)}/${t('basket_per_unit', 'ea')}</div>
        </div>
      </div>
    `;

        // Quantity buttons
        const minusBtn = card.querySelector('.qty-minus');
        const plusBtn = card.querySelector('.qty-plus');

        minusBtn?.addEventListener('click', () => {
            haptic.light(); // UX-004: Qty adjust feedback
            if (item.quantity <= 1) {
                // P2-007 FIX: RTL-aware removal animation direction
                // P3-BAS-01 FIX: CSS class instead of 3× inline style mutations
                card.classList.add('nm-card-removing');
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
            haptic.light(); // UX-004: Qty adjust feedback
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

        // FRC-N03 FIX: Inject itemized breakdown into checkout sheet.
        // Previous: Only a single total was shown — donors had no line-item transparency.
        // Now: Each item is listed with qty × unit price = subtotal.
        // Standard: eCommerce UX — checkout must show per-item breakdown.
        const confirmTotalEl = document.getElementById('confirm-total');
        if (confirmTotalEl) {
            confirmTotalEl.textContent = `— ${formatDollars(total)}`;
        }

        // Render itemized breakdown above checkout button
        let breakdownEl = document.getElementById('checkout-breakdown');
        if (!breakdownEl && checkoutSheet) {
            breakdownEl = document.createElement('div');
            breakdownEl.id = 'checkout-breakdown';
            breakdownEl.className = 'px-4 mb-3';
            // Insert before the confirm button
            const confirmBtn = document.getElementById('confirm-funding-btn');
            if (confirmBtn) {
                confirmBtn.parentElement?.insertBefore(breakdownEl, confirmBtn);
            }
        }

        if (breakdownEl) {
            const items = CartStore.getItems();
            if (items.length > 0) {
                const itemsHtml = items.map(item => `
                    <div class="flex justify-between text-xs text-slate-600">
                        <span class="truncate max-w-[60%]">${escapeHtml(item.name)} <span class="text-slate-400">×${item.quantity}</span></span>
                        <span class="font-bold">${formatDollars(item.unitPrice * item.quantity)}</span>
                    </div>
                `).join('');

                breakdownEl.innerHTML = `
                    <div class="border-t border-slate-100 pt-3 space-y-1.5">
                        <p class="text-3xs font-bold uppercase tracking-wider text-slate-400 mb-2" data-i18n="checkout_breakdown">${t('checkout_breakdown', 'Order Summary')}</p>
                        ${itemsHtml}
                        <div class="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-100">
                            <span data-i18n="checkout_subtotal">${t('checkout_subtotal', 'Subtotal')}</span>
                            <span>${formatDollars(total)}</span>
                        </div>
                    </div>
                `;
            } else {
                breakdownEl.innerHTML = '';
            }
        }

        // Update tip display when totals change
        updateTipDisplay();
    }

    // HGH-001 FIX: Local escapeHtml removed — using centralized import from utils/xss.ts

    // P2-001 FIX: Clear cart with inline confirmation dialog
    let clearPending = false;
    clearBtn?.addEventListener('click', () => {
        if (CartStore.getItems().length === 0) {
            return;
        }
        if (!clearPending) {
            // Show confirmation banner
            clearPending = true;
            const confirm = document.createElement('div');
            confirm.id = 'clear-confirm-banner';
            confirm.className = 'rounded-xl p-3 text-sm font-medium flex items-center justify-between gap-2 bg-amber-50 text-amber-700 border border-amber-200 mt-3 animate-fade-in-up';
            confirm.innerHTML = `
                <span><i class="ph ph-warning" aria-hidden="true"></i> ${t('basket_clear_confirm', 'Clear all items?')}</span>
                <div class="flex gap-2">
                    <button id="clear-yes" class="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-lg">${t('common_yes', 'Yes')}</button>
                    <button id="clear-no" class="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg">${t('common_no', 'No')}</button>
                </div>`;
            container!.prepend(confirm);
            confirm.querySelector('#clear-yes')?.addEventListener('click', () => {
                CartStore.clear();
                confirm.remove();
                clearPending = false;
                render();
            });
            confirm.querySelector('#clear-no')?.addEventListener('click', () => {
                confirm.remove();
                clearPending = false;
            });
            // Auto-dismiss after 5s
            setTimeout(() => { if (clearPending) { confirm.remove(); clearPending = false; } }, 5000);
        }
    });

    // P0-003 FIX: Confirm funding button with double-click guard and disabled state
    confirmBtn?.addEventListener('click', () => {
        haptic.success(); // UX-004: Confirm funding celebration feedback
        if (CartStore.getItems().length === 0 || (confirmBtn as HTMLButtonElement).disabled) {
            return;
        }
        // Guard: disable button during processing
        (confirmBtn as HTMLButtonElement).disabled = true;

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
        setTimeout(() => {
            banner.remove();
            (confirmBtn as HTMLButtonElement).disabled = false;
        }, 5000);
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

// ─── CONF-003 FIX: Virtual Keyboard Viewport Handler ────────────────────────
// Problem: When the custom tip input gets focus on mobile, the virtual keyboard
// pushes the checkout sheet off-screen, hiding the CTA.
// Fix: Use visualViewport API to detect keyboard presence and shift the sheet up.
// Standard: Google Material Design — Input fields must remain visible above keyboard.
function initKeyboardHandler(): void {
    const checkoutSheet = document.getElementById('checkout-sheet');
    if (!checkoutSheet || !window.visualViewport) { return; }

    const viewport = window.visualViewport;

    function adjustForKeyboard(): void {
        if (!checkoutSheet) { return; }
        // The difference between window height and visual viewport height
        // equals the keyboard height
        const keyboardHeight = window.innerHeight - viewport.height;

        if (keyboardHeight > 100) {
            // DEF-REM-005 FIX: CSS custom property + class toggle replaces inline styles.
            // Previous: 3× style.transform/transition — violated P1-SST-001.
            checkoutSheet.style.setProperty('--kb-shift', `${keyboardHeight}px`);
            checkoutSheet.classList.add('nm-keyboard-shifted');
        } else {
            // Keyboard hidden — reset
            checkoutSheet.classList.remove('nm-keyboard-shifted');
            checkoutSheet.style.removeProperty('--kb-shift');
        }
    }

    viewport.addEventListener('resize', adjustForKeyboard);
}

// Initialize keyboard handler
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKeyboardHandler);
} else {
    initKeyboardHandler();
}
