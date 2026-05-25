// ============================================================================
// Nammerha Frontend — Feature Flags (Zero-Config Static Gates)
// ============================================================================
// FORENSIC-AUDIT-2026-05-12: Strategic feature suspension mechanism.
//
// These are compile-time constants. Vite's dead-code elimination will strip
// suspended feature code from production bundles when the flag is `false`.
//
// To re-enable a feature, change the flag and rebuild.
// ============================================================================

/**
 * 🔴 payment SYSTEM — SUSPENDED INDEFINITELY (2026-05-12)
 *
 * Strategic decision by project owner. The entire payment/crowdfunding
 * subsystem is frozen. This includes:
 *   - user portal, proof, basket pages
 *   - payment checkout flow (payments.create())
 *   - user-specific API calls
 *   - user role assignment
 *
 * The عطاء (Ataa/Bid/Tender) system is SEPARATE and remains fully active.
 * Do NOT confuse عطاء (Bid) with تبرع (payment).
 *
 * @see KI: nammerha_payment_suspension
 */
export const PAYMENTS_ENABLED = false;

/**
 * When payments are suspended, project-details page shows BOQ items
 * in read-only mode (no "Add to Cart" buttons).
 */
export const CART_CHECKOUT_ENABLED = PAYMENTS_ENABLED;
