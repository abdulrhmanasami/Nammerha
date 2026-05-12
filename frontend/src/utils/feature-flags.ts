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
 * 🔴 DONATION SYSTEM — SUSPENDED INDEFINITELY (2026-05-12)
 *
 * Strategic decision by project owner. The entire donation/crowdfunding
 * subsystem is frozen. This includes:
 *   - Donor portal, proof, basket pages
 *   - Donation checkout flow (donations.create())
 *   - Donor-specific API calls
 *   - Donor role assignment
 *
 * The عطاء (Ataa/Bid/Tender) system is SEPARATE and remains fully active.
 * Do NOT confuse عطاء (Bid) with تبرع (Donation).
 *
 * @see KI: nammerha_donation_suspension
 */
export const DONATIONS_ENABLED = false;

/**
 * When donations are suspended, project-details page shows BOQ items
 * in read-only mode (no "Add to Cart" buttons).
 */
export const CART_CHECKOUT_ENABLED = DONATIONS_ENABLED;
