import '../styles/main.css';
import { auth } from '../api';

// ============================================================================
// Nammerha — Email Verification Landing Page
// PLT-AUD-006 FIX: User-friendly verification result display
// PLT-MAR11-006 FIX: Uses centralized API client instead of raw fetch
//
// This page is loaded when a user clicks the verification link in their email.
// It calls the backend API to verify the token, then displays a user-friendly
// success or error message instead of raw JSON.
// ============================================================================

// ─── DOM References ─────────────────────────────────────────────────────────
const iconContainer = document.getElementById('verify-icon-container');
const icon = document.getElementById('verify-icon');
const title = document.getElementById('verify-title');
const subtitle = document.getElementById('verify-subtitle');
const banner = document.getElementById('verify-banner');
const bannerInner = document.getElementById('verify-banner-inner');
const bannerIcon = document.getElementById('verify-banner-icon');
const bannerTitle = document.getElementById('verify-banner-title');
const bannerText = document.getElementById('verify-banner-text');
const actions = document.getElementById('verify-actions');

// ─── Extract Token from URL ────────────────────────────────────────────────
// The backend sends links like: /verify-email.html?token=<uuid>
const urlParams = new URLSearchParams(window.location.search);
const verifyToken = urlParams.get('token');

function showResult(type: 'success' | 'error' | 'expired', titleText: string, message: string): void {
    // Update header icon
    if (iconContainer && icon) {
        if (type === 'success') {
            iconContainer.className = 'inline-flex items-center justify-center size-16 bg-smoky-jade rounded-2xl shadow-lg shadow-smoky-jade/20 mb-4';
            icon.className = 'ph ph-check-circle text-white';
            icon.style.fontSize = '32px';
        } else if (type === 'expired') {
            iconContainer.className = 'inline-flex items-center justify-center size-16 bg-warning-yellow rounded-2xl shadow-lg shadow-warning-yellow/20 mb-4';
            icon.className = 'ph ph-clock-countdown text-white';
            icon.style.fontSize = '32px';
        } else {
            iconContainer.className = 'inline-flex items-center justify-center size-16 bg-red-500 rounded-2xl shadow-lg shadow-red-500/20 mb-4';
            icon.className = 'ph ph-x-circle text-white';
            icon.style.fontSize = '32px';
        }
    }

    // Update title and subtitle
    if (title) { title.textContent = titleText; }
    if (subtitle) { subtitle.textContent = ''; }

    // Show banner
    if (banner && bannerInner && bannerIcon && bannerTitle && bannerText) {
        banner.style.display = 'block';
        bannerTitle.textContent = titleText;
        bannerText.textContent = message;

        if (type === 'success') {
            bannerInner.className = 'rounded-xl p-4 text-sm font-medium flex items-start gap-3 bg-emerald-50 text-emerald-700 border border-emerald-200';
            bannerIcon.className = 'ph ph-check-circle mt-0.5';
        } else if (type === 'expired') {
            bannerInner.className = 'rounded-xl p-4 text-sm font-medium flex items-start gap-3 bg-amber-50 text-amber-700 border border-amber-200';
            bannerIcon.className = 'ph ph-clock-countdown mt-0.5';
        } else {
            bannerInner.className = 'rounded-xl p-4 text-sm font-medium flex items-start gap-3 bg-red-50 text-red-700 border border-red-200';
            bannerIcon.className = 'ph ph-warning-circle mt-0.5';
        }
    }

    // Show sign-in action
    if (actions) { actions.style.display = 'block'; }
}

// ─── Verify Token via API ───────────────────────────────────────────────────
async function verifyEmail(): Promise<void> {
    if (!verifyToken) {
        showResult('error', 'Invalid Link', 'No verification token found. Please check your email for the correct link.');
        return;
    }

    try {
        // PLT-MAR11-006 FIX: Uses centralized API client with 30s timeout,
        // CSRF token attachment, and unified error handling.
        const data = await auth.verifyEmail(verifyToken);

        if (data.success) {
            showResult('success', 'Email Verified!', data.message ?? 'Your email has been verified. You can now sign in to access all platform features.');
        } else {
            // The API client returns the parsed response even on non-2xx
            showResult('error', 'Verification Failed', data.error ?? 'Something went wrong. Please try again or contact support.');
        }
    } catch (err) {
        // The centralized API client throws on network errors, timeouts, and non-2xx responses
        const message = err instanceof Error ? err.message : 'Could not reach the server.';

        if (message.includes('timeout') || message.includes('abort')) {
            showResult('error', 'Request Timeout', 'The request timed out. Please check your network connection and try again.');
        } else if (message.includes('expired') || message.includes('410')) {
            showResult('expired', 'Token Expired', 'Your verification link has expired. Please request a new one from the Sign In page.');
        } else if (message.includes('not found') || message.includes('404')) {
            showResult('error', 'Token Not Found', 'This verification link is invalid or has already been used.');
        } else {
            showResult('error', 'Network Error', message);
        }
    }
}

// Initialize on page load
verifyEmail();
