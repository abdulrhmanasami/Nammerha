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

function centsToUsd(cents: number): string {
    return `$${(cents / 100).toFixed(0)}`;
}

/** Resolve an i18n key via the platform's NammerhaI18n engine, fallback to English */
function t(key: string, fallback: string): string {
    const w = window as unknown as { NammerhaI18n?: { t: (k: string) => string | undefined } };
    return w.NammerhaI18n?.t(key) ?? fallback;
}

function updateAllPrices(): void {
    const priceEls = document.querySelectorAll<HTMLElement>('.tier-price');
    const intervalEls = document.querySelectorAll<HTMLElement>('.tier-interval');

    priceEls.forEach(el => {
        const tier = el.dataset['tier'];
        if (!tier || !TIERS[tier]) {
            return;
        }

        const price = isYearly ? TIERS[tier].yearly : TIERS[tier].monthly;

        // Animate price change
        el.style.opacity = '0';
        el.style.transform = 'translateY(-4px)';

        setTimeout(() => {
            el.textContent = centsToUsd(price);
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
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
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/auth.html?redirect=/pricing.html';
        return;
    }

    // Enterprise = contact sales
    if (planSlug === 'enterprise') {
        window.location.href = '/contact.html?subject=enterprise';
        return;
    }

    try {
        const res = await fetch('/api/subscriptions/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ plan_slug: planSlug }),
        });

        const body = await res.json() as { success: boolean; error?: string };

        if (body.success) {
            const btn = document.getElementById(`btn-plan-${planSlug}`);
            if (btn) {
                btn.textContent = `✓ ${t('pricing_subscribed', 'Subscribed!')}`;
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
        // Log error for debugging (stripped by production minifier)
        // eslint-disable-next-line no-console
        console.error('[pricing] Subscribe error:', errMsg);
    }
}

// ─── Initialization ─────────────────────────────────────────────────────────

function initPricing(): void {
    // Set transition styles on price elements
    document.querySelectorAll<HTMLElement>('.tier-price').forEach(el => {
        el.style.transition = 'opacity 150ms ease, transform 150ms ease';
    });

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
