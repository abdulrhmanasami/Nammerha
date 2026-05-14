/**
 * donor-basket.ts — Dynamic Construction Basket
 *
 * Reads CartStore and renders materials dynamically.
 * Supports quantity adjustment, item removal, total calculation,
 * and optional platform tip selection per profitability study §1.
 *
 * FORENSIC-C1.3: GATED — Donation system suspended indefinitely (2026-05-12).
 */
import '../styles/main.css';
import { DONATIONS_ENABLED } from '../utils/feature-flags';
import { initPullToRefresh } from '../utils/pull-refresh';
// UX-F020 FIX: initPullToRefresh() REMOVED from module top level.
// PREVIOUS: Called at line 13 before DONATIONS_ENABLED gate — created DOM
// observers and event listeners for a page that immediately shows "Checkout Unavailable".
// NOW: Moved inside guardedInit(), only fires when donations are active.
import { CartStore, type CartItem } from '../components/cart';
import { escapeHtml } from '../utils/xss';
import { formatDollars } from '../utils/format';
import { t } from '../utils/i18n';
// GAP-N03 FIX: Global search overlay on checkout page
import { initSearch } from '../utils/search-overlay';
// UX-004 FIX: Haptic feedback for native-app tactile response
import { haptic } from '../utils/haptic';
// PLT-CART-001 FIX: Wire checkout to actual donations API
import { donations } from '../api';
import { setLoadingState } from '../utils/loading-state';
// BLOCKER-A FIX: Auth guard — unauthenticated visitors see "Sign in required" overlay
// instead of broken checkout with cryptic 401 API errors.
import { requireAuth } from '../utils/auth-guard';
// UX-F020 FIX: initSearch() REMOVED from module top level (same rationale as above).

// FRC-003 FIX: Default tip 0% (was 3%). Humanitarian platform — opt-in tipping only.
let selectedTipPercentage = 0;
let customTipAmount: number | null = null;
let isCustomTip = false;

// ─── FORENSIC-C1.3 FIX: Suspension Gate ─────────────────────────────────────
// When donations are suspended, show a clear notice instead of the checkout.
function showBasketSuspensionNotice(): void {
    const mainContent = document.getElementById('main-content') ?? document.querySelector('main');
    if (!mainContent) { return; }

    mainContent.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
            <div class="size-20 rounded-full bg-warning-yellow/10 flex items-center justify-center">
                <i class="ph ph-shopping-cart text-warning-yellow nm-icon-40" aria-hidden="true"></i>
            </div>
            <h2 class="text-lg font-bold" data-i18n="basket_suspended_title">${escapeHtml(t('basket_suspended_title', 'Checkout Unavailable'))}</h2>
            <p class="text-sm text-slate-500 max-w-xs dark:text-slate-400" data-i18n="basket_suspended_msg">${escapeHtml(t('basket_suspended_msg', 'The donation checkout is being upgraded. Your cart items are saved and will be available when the system is back online.'))}</p>
            <a href="/" class="btn-primary nm-btn-inline mt-2">
                <i class="ph ph-house" aria-hidden="true"></i>
                <span data-i18n="back_to_home">${escapeHtml(t('back_to_home', 'Back to Home'))}</span>
            </a>
        </div>`;
}

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
                        tipCustomInputWrap.classList.remove('nm-hidden');
                    }
                    tipCustomInput?.focus();
                } else {
                    isCustomTip = false;
                    customTipAmount = null;
                    selectedTipPercentage = parseInt(tipValue ?? '0', 10);
                    if (tipCustomInputWrap) {
                        tipCustomInputWrap.classList.add('nm-hidden');
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
        card.className = 'cart-item-card glass-card p-4 rounded-xl flex items-center justify-between border-s-4 border-s-trust-blue animate-fade-in-up';
        card.dataset.itemId = item.id;

        card.innerHTML = `
      <div class="flex items-center gap-4 flex-1 min-w-0">
        <div class="w-12 h-12 bg-trust-blue/10 rounded-lg flex items-center justify-center shrink-0">
          <i class="ph ${item.iconClass} text-trust-blue" aria-hidden="true"></i>
        </div>
        <div class="min-w-0 flex-1">
          <h4 class="font-semibold text-slate-800 truncate dark:text-slate-200">${escapeHtml(item.name)}</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(item.category)}</p>
        </div>
      </div>
      <div class="flex items-center gap-3 shrink-0 ms-3">
        <div class="flex items-center gap-1">
          <button type="button" class="qty-btn qty-minus size-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors" aria-label="${escapeHtml(t('basket_decrease_qty', 'Decrease quantity'))}">
            <i class="ph ph-minus ph-xs" aria-hidden="true"></i>
          </button>
          <span class="qty-display text-sm font-bold w-6 text-center">${item.quantity}</span>
          <button type="button" class="qty-btn qty-plus size-7 rounded-full bg-trust-blue/10 hover:bg-trust-blue/20 text-trust-blue flex items-center justify-center transition-colors" aria-label="${escapeHtml(t('basket_increase_qty', 'Increase quantity'))}">
            <i class="ph ph-plus ph-xs" aria-hidden="true"></i>
          </button>
        </div>
        <div class="text-end min-w-[60px]">
          <div class="font-bold text-slate-900 dark:text-slate-100">${formatDollars(item.unitPrice * item.quantity)}</div>
          <div class="text-3xs text-slate-400 dark:text-slate-500">${formatDollars(item.unitPrice)}/${escapeHtml(t('basket_per_unit', 'ea'))}</div>
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
                    <div class="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                        <span class="truncate max-w-[60%]">${escapeHtml(item.name)} <span class="text-slate-400 dark:text-slate-500">×${item.quantity}</span></span>
                        <span class="font-bold">${formatDollars(item.unitPrice * item.quantity)}</span>
                    </div>
                `).join('');

                breakdownEl.innerHTML = `
                    <div class="border-t border-slate-100 pt-3 space-y-1.5 dark:border-dark-border">
                        <p class="text-3xs font-bold uppercase tracking-wider text-slate-400 mb-2 dark:text-slate-500" data-i18n="checkout_breakdown">${escapeHtml(t('checkout_breakdown', 'Order Summary'))}</p>
                        ${itemsHtml}
                        <div class="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-100 dark:text-slate-100 dark:border-dark-border">
                            <span data-i18n="checkout_subtotal">${escapeHtml(t('checkout_subtotal', 'Subtotal'))}</span>
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

    // P2-001 FIX: Clear cart with explicit Native Modal (removed 5s exploding timer)
    clearBtn?.addEventListener('click', () => {
        if (CartStore.getItems().length === 0) {
            return;
        }
        
        const dialog = document.createElement('dialog');
        dialog.className = 'nm-dialog p-0 w-[90%] max-w-sm rounded-2xl border-0 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm open:animate-fade-in-up';
        dialog.innerHTML = `
            <div class="p-6">
                <div class="size-12 rounded-full bg-red-50 flex items-center justify-center mb-4 text-red-600 dark:bg-red-500/10">
                    <i class="ph ph-trash text-2xl" aria-hidden="true"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-2 dark:text-slate-100">${escapeHtml(t('basket_clear_title', 'Clear Basket?'))}</h3>
                <p class="text-sm text-slate-500 mb-6 dark:text-slate-400">${escapeHtml(t('basket_clear_desc', 'Are you sure you want to remove all items from your basket? This action cannot be undone.'))}</p>
                <div class="flex gap-3">
                    <button type="button" class="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors dark:text-slate-300" id="dialog-cancel">${escapeHtml(t('common_no', 'No'))}</button>
                    <button type="button" class="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors" id="dialog-confirm">${escapeHtml(t('basket_clear_yes', 'Yes, Clear All'))}</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        
        dialog.querySelector('#dialog-cancel')?.addEventListener('click', () => {
            dialog.close();
        });
        
        dialog.querySelector('#dialog-confirm')?.addEventListener('click', () => {
            CartStore.clear();
            dialog.close();
            render();
        });
        
        dialog.addEventListener('close', () => dialog.remove());
        dialog.showModal();
    });

    // PLT-CART-001 FIX: Wire checkout to donations.create() API.
    // Previous: Dead-end placeholder showing "Payment gateway coming soon."
    // Now: Calls centralized donations.create() with Idempotency-Key protection,
    // loading state via setLoadingState(), and success/error feedback.
    // Standard: Core revenue path — donors MUST be able to complete donations.
    confirmBtn?.addEventListener('click', async () => {
        haptic.success(); // UX-004: Confirm funding celebration feedback
        const btn = confirmBtn as HTMLButtonElement;
        if (CartStore.getItems().length === 0 || btn.disabled) {
            return;
        }

        const items = CartStore.getItems();
        const tipAmount = getTipAmount();

        // Map CartStore items to API format.
        // CartStore stores unitPrice in dollars; escrow API expects cents (BIGINT).
        const donationItems: Array<{ item_id: string; amount: number }> = items.map(item => ({
            item_id: item.id,
            amount: Math.round(item.unitPrice * item.quantity * 100),
        }));

        // PLT-CART-002: Include platform tip as a dedicated line item (if any).
        // The backend accepts a special `platform-tip` item_id for platform support.
        if (tipAmount > 0) {
            donationItems.push({
                item_id: 'platform-tip',
                amount: Math.round(tipAmount * 100),
            });
        }

        const restore = setLoadingState(btn, t('basket_processing', 'Processing...'));

        try {
            const response = await donations.create({
                items: donationItems,
                return_url: `${window.location.origin}/donor-portal.html?donation=success`,
            });

            if (response.success) {
                haptic.success();
                restore('success');

                // Clear cart after successful donation
                CartStore.clear();

                // Show success banner
                const successBanner = document.createElement('div');
                successBanner.className = 'rounded-xl p-4 text-sm font-medium flex items-center gap-3 bg-emerald-50 text-emerald-700 border border-emerald-200 mt-3 animate-fade-in-up';
                successBanner.innerHTML = `<i class="ph ph-check-circle text-xl" aria-hidden="true"></i> ${escapeHtml(t('basket_donation_success', 'Thank you! Your donation has been submitted successfully. You will be redirected shortly.'))}`;
                checkoutSheet?.appendChild(successBanner);

                // Re-render to show empty cart
                render();

                // Redirect to donor portal after brief delay
                const redirectUrl = (response.data as { redirect_url?: string })?.redirect_url;
                if (redirectUrl) {
                    // Payment gateway redirect (Stripe/Fatora)
                    setTimeout(() => { window.location.href = redirectUrl; }, 1200);
                } else {
                    // Direct donation (no external payment) → donor portal
                    setTimeout(() => {
                        window.location.href = '/donor-portal.html?donation=success';
                    }, 2000);
                }
            } else {
                haptic.heavy();
                restore('error');
                const errorBanner = document.createElement('div');
                errorBanner.className = 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 mt-3 animate-fade-in-up';
                errorBanner.innerHTML = `<i class="ph ph-warning-circle" aria-hidden="true"></i> ${escapeHtml(response.error ?? t('basket_donation_error', 'Something went wrong. Please try again.'))}`;
                checkoutSheet?.appendChild(errorBanner);
                setTimeout(() => errorBanner.remove(), 6000);
            }
        } catch (err) {
            haptic.heavy();
            restore('error');
            const message = err instanceof Error ? err.message : t('basket_network_error', 'Network error. Please check your connection and try again.');
            const errorBanner = document.createElement('div');
            errorBanner.className = 'rounded-xl p-3 text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 mt-3 animate-fade-in-up';
            errorBanner.innerHTML = `<i class="ph ph-wifi-slash" aria-hidden="true"></i> ${escapeHtml(message)}`;
            checkoutSheet?.appendChild(errorBanner);
            setTimeout(() => errorBanner.remove(), 6000);
        }
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

// BLOCKER-A FIX: Guard all protected content behind auth check.
// FORENSIC-C1.3 FIX: Block checkout when donations are suspended.
function guardedInit(): void {
    if (!requireAuth()) { return; }
    if (!DONATIONS_ENABLED) {
        showBasketSuspensionNotice();
        return;
    }
    // UX-F020 FIX: Side effects now inside gate — only fire when donations active.
    initPullToRefresh();
    initSearch();
    initDonorBasket();
    initKeyboardHandler();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', guardedInit);
} else {
    guardedInit();
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

// BLOCKER-A FIX: Keyboard handler is now initialized inside guardedInit() above
// to ensure it only runs after auth verification passes.
