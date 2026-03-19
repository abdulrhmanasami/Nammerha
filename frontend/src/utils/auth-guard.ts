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
 * Architecture:
 *   1. Check for JWT token in localStorage/cookie
 *   2. If absent → show auth-required overlay with redirect CTA
 *   3. If present but expired → attempt silent refresh, fallback to overlay
 *   4. Skeleton guard integration: removes skeletons on auth failure
 *
 * Usage:
 *   import { requireAuth } from '../utils/auth-guard';
 *   requireAuth(); // Call at top of any protected page module
 *
 * @version 1.0.0
 * @since GAP-004
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Token storage key used by the platform auth system */
const TOKEN_KEY = 'nm_access_token';
const REFRESH_KEY = 'nm_refresh_token';

/**
 * Checks if a JWT token is present and not expired.
 */
function hasValidToken(): boolean {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
        return false;
    }

    try {
        // Decode JWT payload (base64url) to check expiry
        const payloadB64 = token.split('.')[1];
        if (!payloadB64) {
            return false;
        }

        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
        const exp = payload.exp;
        if (!exp) {
            return true;
        }

        // Token expired if exp is in the past (with 30s grace period)
        return (exp * 1000) > (Date.now() - 30_000);
    } catch {
        // Malformed token = treat as invalid
        return false;
    }
}

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
                <i class="ph ph-lock text-trust-blue nm-icon-40"  aria-hidden="true"></i>
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

    // Apply i18n translations if the engine is loaded
    if (typeof (window as unknown as Record<string, unknown>).applyI18n === 'function') {
        ((window as unknown as Record<string, unknown>).applyI18n as () => void)();
    }
}

/**
 * Enforces authentication on the current page.
 * Call this at the top of any protected page's TS module.
 *
 * @returns true if authenticated, false if auth overlay was shown
 */
export function requireAuth(): boolean {
    if (hasValidToken()) {
        return true;
    }

    // Check for refresh token - if present, user had a session
    const hasRefresh = !!localStorage.getItem(REFRESH_KEY);

    if (hasRefresh) {
        // User had a session but token expired.
        // In a full implementation, we'd attempt a silent refresh here.
        // For now, show the auth overlay with the sign-in CTA.
        showAuthRequired();
        return false;
    }

    // No tokens at all - first visit or logged out
    showAuthRequired();
    return false;
}

/**
 * Checks auth status without blocking the page.
 * Useful for conditionally showing/hiding UI elements.
 */
export function isAuthenticated(): boolean {
    return hasValidToken();
}
