/**
 * project-details.ts — BOQ Add-to-Cart Interactivity
 *
 * Wires up "Add to Cart" buttons with fly-to-cart animation,
 * badge count sync, and button state management.
 */
import '../styles/main.css';
import { CartStore, renderCartBadge, flyToCart } from '../components/cart';
import { t } from '../utils/i18n';

function initProjectDetails(): void {
    const cartBadge = document.getElementById('header-cart-badge');
    const cartBtn = document.getElementById('header-cart-btn');
    const addButtons = document.querySelectorAll<HTMLButtonElement>('.add-to-cart-btn');

    // Initial badge render
    renderCartBadge(cartBadge);

    // Mark items already in cart
    addButtons.forEach((btn) => {
        const itemId = btn.dataset.itemId;
        if (itemId && CartStore.hasItem(itemId)) {
            markAsAdded(btn);
        }
    });

    // Wire up Add to Cart buttons
    addButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const itemId = btn.dataset.itemId;
            const itemName = btn.dataset.itemName;
            const unitPrice = parseFloat(btn.dataset.itemUnitPrice ?? '0');
            const category = btn.dataset.itemCategory ?? '';
            const projectId = btn.dataset.itemProject ?? '';
            const iconClass = btn.dataset.itemIcon ?? 'ph-package';

            if (!itemId || !itemName) {
                return;
            }

            // Add to cart store
            CartStore.addItem({
                id: itemId,
                name: itemName,
                unitPrice,
                category,
                projectId,
                iconClass,
            });

            // Get the icon element inside the button for fly animation
            const iconEl = btn.querySelector<HTMLElement>('i.ph');
            if (iconEl && cartBtn) {
                flyToCart(iconEl, cartBtn, () => {
                    renderCartBadge(cartBadge);
                });
            } else {
                renderCartBadge(cartBadge);
            }

            // Mark button as added
            markAsAdded(btn);
        });
    });

    // Listen for cross-tab/cross-page cart updates
    window.addEventListener('cart:updated', () => {
        renderCartBadge(cartBadge);
    });
}

function markAsAdded(btn: HTMLButtonElement): void {
    btn.classList.add('btn-added');
    btn.innerHTML = `
    <i class="ph ph-check-circle" style="font-size:20px" aria-hidden="true"></i>
    ${t('project_added_to_cart', 'Added to Cart')}
  `;
    btn.disabled = true;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProjectDetails);
} else {
    initProjectDetails();
}
