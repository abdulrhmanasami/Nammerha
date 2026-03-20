/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Nammerha — Authentication Guard Utility
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GAP-004 FIX: Protected pages (wallet, profile, portals, dashboards)
 * must verify authentication state before rendering content.
 * If no valid session exists, the user sees a clear "Please sign in"
 * message instead of skeleton loaders that persist forever.
 *
 * P0-AUTH-001 FIX: REWRITTEN — Previous implementation checked
 * localStorage('nm_access_token') for a JWT that NEVER EXISTS.
 * The login flow (auth.ts → pages/auth.ts) stores user profile data
 * under 'nammerha_auth', and the JWT lives in an httpOnly cookie
 * (inaccessible to JavaScript by design — api.ts documents this).
 * Result: requireAuth() ALWAYS returned false → wallet page showed
 * "Sign in required" even for authenticated users.
 *
 * Now uses the canonical isAuthenticated() from auth.ts which checks
 * the actual session data in localStorage('nammerha_auth').
 * Standard: Single Source of Truth, DRY Principle, Zero-Assumption Policy.
 *
 * Usage:
 *   import { requireAuth } from '../utils/auth-guard';
 *   requireAuth(); // Call at top of any protected page module
 *
 * @version 2.0.0
 * @since GAP-004, P0-AUTH-001
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { isAuthenticated as checkSession } from '../auth';
import { tryApplyI18n } from './i18n-apply';

/**
 * Shows the "Please sign in" overlay on the current page.
 * Replaces skeleton loaders with a clear auth-required message.
 */
function showAuthRequired(): void {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) {
        return;
    }

    // Determine current page path for redirect-after-login
    const returnPath = encodeURIComponent(window.location.pathname + window.location.search);

    mainContent.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
            <div class="size-20 rounded-full bg-trust-blue/10 flex items-center justify-center">
                <i class="ph ph-lock text-trust-blue nm-icon-40" aria-hidden="true"></i>
            </div>
            <h2 class="text-lg font-bold" data-i18n="auth_required">Sign in required</h2>
            <p class="text-sm text-slate-500 max-w-xs" data-i18n="auth_required_msg">
                Please sign in to access this page. Your data is safe and waiting for you.
            </p>
            <a href="/auth.html?redirect=${returnPath}" class="btn-primary nm-btn-inline mt-2">
                <i class="ph ph-sign-in" aria-hidden="true"></i>
                <span data-i18n="sign_in_btn">Sign In</span>
            </a>
        </div>`;

    // PLT-AUD5-002 FIX: Replaced unsafe (window as unknown as Record<string, unknown>)
    // double-cast with shared type-safe utility.
    tryApplyI18n();
}

/**
 * Enforces authentication on the current page.
 * Call this at the top of any protected page's TS module.
 *
 * P0-AUTH-001 FIX: Uses canonical checkSession() from auth.ts
 * which reads localStorage('nammerha_auth') — the ACTUAL session data
 * stored by the login flow. Previous: checked nm_access_token (never set).
 *
 * @returns true if authenticated, false if auth overlay was shown
 */
export function requireAuth(): boolean {
    if (checkSession()) {
        return true;
    }

    // No valid session — show auth overlay
    showAuthRequired();
    return false;
}

/**
 * Checks auth status without blocking the page.
 * Useful for conditionally showing/hiding UI elements.
 *
 * P0-AUTH-001 FIX: Delegates to canonical auth.ts instead of
 * duplicating broken JWT localStorage logic.
 */
export function isAuthenticated(): boolean {
    return checkSession();
}

