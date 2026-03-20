/**
 * pricing.ts — Pricing Page Controller
 *
 * Handles 4-tier billing (Free / Pro / Business / Enterprise),
 * yearly toggle with 20% discount, animated price transitions,
 * and subscribe button actions.
 *
 * Per profitability study §2: SaaS Monetization — Geo-appropriate pricing.
 * $15 Pro for local Syrian contractors, $49 Business for firms,
 * $99 Enterprise for international organizations.
 */
import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { subscriptions } from '../api';
import { reportError } from '../error-reporter';
import { getCurrentUser } from '../auth';
import { t } from '../utils/i18n';
import { formatCents } from '../utils/format';
// W6-005 FIX: Import escapeHtml for defense-in-depth XSS protection on innerHTML.
import { escapeHtml } from '../utils/xss';

// ─── Price Constants (all in cents) ─────────────────────────────────────────

interface TierPricing {
    monthly: number;
    yearly: number;   // = monthly * 0.80 (20% off)
}

const TIERS: Record<string, TierPricing> = {
    pro:        { monthly: 1500,  yearly: Math.round(1500 * 0.80) },   // $15 → $12
    business:   { monthly: 4900,  yearly: Math.round(4900 * 0.80) },   // $49 → $39
    enterprise: { monthly: 9900,  yearly: Math.round(9900 * 0.80) },   // $99 → $79
};

// ─── State ──────────────────────────────────────────────────────────────────

let isYearly = false;

// ─── DOM Helpers ────────────────────────────────────────────────────────────

// P3-FMT-001 FIX: Removed local centsToDisplay() — uses shared formatCents()
// from utils/format.ts for consistent locale-aware currency formatting.

function updateAllPrices(): void {
    const priceEls = document.querySelectorAll<HTMLElement>('.tier-price');
    const intervalEls = document.querySelectorAll<HTMLElement>('.tier-interval');

    priceEls.forEach(el => {
        const tier = el.dataset['tier'];
        if (!tier || !TIERS[tier]) {
            return;
        }

        const price = isYearly ? TIERS[tier].yearly : TIERS[tier].monthly;

        // DEF-REM-001 FIX: CSS class toggle replaces 5× inline style mutations.
        // Previous: el.style.opacity/transform = ... — violated P1-SST-001.
        // Standard: CSS Single Source of Truth, class-driven animation.
        el.classList.add('nm-price-exit');

        setTimeout(() => {
            el.textContent = formatCents(price);
            el.classList.remove('nm-price-exit');
            el.classList.add('nm-price-enter');
            // PLT-ANIM-001 FIX: Was setTimeout(200) timing hack that assumed
            // CSS animation duration. Now uses animationend for reliable cleanup.
            // Standard: Event-driven animation lifecycle, no magic numbers.
            el.addEventListener('animationend', function cleanup() {
                el.classList.remove('nm-price-enter');
                el.removeEventListener('animationend', cleanup);
            }, { once: true });
        }, 150);
    });

    intervalEls.forEach(el => {
        el.textContent = isYearly
            ? t('pricing_per_month_yearly', '/mo (billed yearly)')
            : t('pricing_per_month', '/month');
    });
}

function updateToggleVisual(): void {
    const switchBtn = document.getElementById('billing-switch');
    const thumb = switchBtn?.querySelector('span');
    if (!switchBtn || !thumb) {
        return;
    }

    if (isYearly) {
        switchBtn.classList.remove('bg-slate-200');
        switchBtn.classList.add('bg-trust-blue');
        switchBtn.setAttribute('aria-checked', 'true');
        thumb.classList.remove('translate-x-0');
        thumb.classList.add('translate-x-7');
    } else {
        switchBtn.classList.remove('bg-trust-blue');
        switchBtn.classList.add('bg-slate-200');
        switchBtn.setAttribute('aria-checked', 'false');
        thumb.classList.remove('translate-x-7');
        thumb.classList.add('translate-x-0');
    }
}

// ─── Event Handlers ─────────────────────────────────────────────────────────

async function handleSubscribe(planSlug: string): Promise<void> {
    // BONUS-01: Use getCurrentUser() instead of broken localStorage.getItem('authToken')
    const user = getCurrentUser();
    if (!user) {
        window.location.href = '/auth.html?redirect=/pricing.html';
        return;
    }

    // Enterprise = contact sales
    if (planSlug === 'enterprise') {
        window.location.href = '/contact.html?subject=enterprise';
        return;
    }

    try {
        // BONUS-01: Uses centralized API client with httpOnly cookies, CSRF, 30s timeout
        const body = await subscriptions.subscribe(planSlug);

        if (body.success) {
            const btn = document.getElementById(`btn-plan-${planSlug}`);
            if (btn) {
                btn.innerHTML = `<i class="ph ph-check nm-icon-gap-end" aria-hidden="true"></i>${escapeHtml(t('pricing_subscribed', 'Subscribed!'))}`;
                btn.classList.add('bg-smoky-jade');
                btn.classList.remove('bg-trust-blue');
            }
        } else {
            const btn = document.getElementById(`btn-plan-${planSlug}`);
            if (btn) {
                btn.textContent = body.error ?? t('pricing_error', 'Error');
                setTimeout(() => {
                    btn.textContent = btn.dataset['originalText'] ?? t('pricing_try_again', 'Try Again');
                }, 3000);
            }
        }
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const btn = document.getElementById(`btn-plan-${planSlug}`);
        if (btn) {
            btn.textContent = t('pricing_error', 'Error');
            setTimeout(() => {
                btn.textContent = btn.dataset['originalText'] ?? t('pricing_try_again', 'Try Again');
            }, 3000);
        }
        // BONUS-01: Replaced console.error with centralized error reporting
        reportError(new Error(`[pricing] Subscribe error: ${errMsg}`), { planSlug });
    }
}

// ─── Initialization ─────────────────────────────────────────────────────────

function initPricing(): void {
    // DEF-REM-001 FIX: Transition now governed by CSS `.tier-price` rule.
    // Previous: el.style.transition = '...' on each element — violated P1-SST-001.

    // Billing toggle
    const switchBtn = document.getElementById('billing-switch');
    switchBtn?.addEventListener('click', () => {
        isYearly = !isYearly;
        updateToggleVisual();
        updateAllPrices();
    });

    // Store original button text for error recovery
    ['free', 'pro', 'business', 'enterprise'].forEach(slug => {
        const btn = document.getElementById(`btn-plan-${slug}`);
        if (btn) {
            btn.dataset['originalText'] = btn.textContent ?? '';
        }
    });

    // Subscribe buttons
    document.getElementById('btn-plan-free')?.addEventListener('click', () => {
        handleSubscribe('free');
    });
    document.getElementById('btn-plan-pro')?.addEventListener('click', () => {
        handleSubscribe('pro');
    });
    document.getElementById('btn-plan-business')?.addEventListener('click', () => {
        handleSubscribe('business');
    });
    document.getElementById('btn-plan-enterprise')?.addEventListener('click', () => {
        handleSubscribe('enterprise');
    });
}

// DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPricing);
} else {
    initPricing();
}
