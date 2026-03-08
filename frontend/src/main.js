// ============================================================================
// Nammerha — Dashboard (index) entry point
// ============================================================================
import './styles/main.css';
import { renderCartBadge } from './components/cart';
function initDashboard() {
    // Render cart badge count in navbar
    const cartBadge = document.getElementById('nav-cart-badge');
    renderCartBadge(cartBadge);
    // Listen for cart updates from other pages
    window.addEventListener('cart:updated', () => {
        renderCartBadge(cartBadge);
    });
}
// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
}
else {
    initDashboard();
}
