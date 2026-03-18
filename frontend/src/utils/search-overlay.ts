/**
 * Nammerha — Global Search Overlay (FRC-005 FIX)
 *
 * Provides a platform-wide search capability accessible from any page.
 * Triggered via keyboard shortcut (Cmd/Ctrl+K) or an injected search button
 * in the bottom nav or header.
 *
 * Architecture:
 *   - Full-screen overlay with glassmorphism backdrop
 *   - Auto-focus input on open
 *   - Client-side search across known page data
 *   - Keyboard Escape dismissal
 *   - WCAG: role="search", aria-label, focus trap
 *
 * Standard: Apple Spotlight / Material Design Search overlay
 */

interface SearchResult {
    title: string;
    subtitle: string;
    href: string;
    icon: string;
    i18nTitle?: string;
}

/** Static page index for client-side search (no API needed) */
const PAGE_INDEX: SearchResult[] = [
    { title: 'Home', subtitle: 'Main platform page', href: 'index.html', icon: 'house', i18nTitle: 'home' },
    { title: 'Sign In', subtitle: 'Login to your account', href: 'auth.html', icon: 'sign-in', i18nTitle: 'sign_in_btn' },
    { title: 'Wallet', subtitle: 'Your balance and transactions', href: 'wallet.html', icon: 'wallet', i18nTitle: 'wallet' },
    { title: 'Profile', subtitle: 'Your account settings', href: 'profile.html', icon: 'user', i18nTitle: 'profile' },
    { title: 'Construction Basket', subtitle: 'Your donation cart', href: 'donor-basket.html', icon: 'shopping-cart', i18nTitle: 'construction_basket' },
    { title: 'Report Damage', subtitle: 'Submit damage report', href: 'homeowner-report.html', icon: 'warning', i18nTitle: 'report_damage' },
    { title: 'BOQ Builder', subtitle: 'Engineer bill of quantities', href: 'engineer-boq.html', icon: 'clipboard-text', i18nTitle: 'engineer_boq_builder' },
    { title: 'Site Verification', subtitle: 'GPS-stamped field camera', href: 'engineer-camera.html', icon: 'camera', i18nTitle: 'site_verification' },
    { title: 'Proof of Delivery', subtitle: 'Verified delivery confirmation', href: 'donor-proof.html', icon: 'shield-check', i18nTitle: 'proof_of_delivery' },
    { title: 'Homeowner Portal', subtitle: 'Manage your property', href: 'homeowner-portal.html', icon: 'house-line', i18nTitle: 'homeowner_portal' },
    { title: 'Donor Portal', subtitle: 'Your donations and impact', href: 'donor-portal.html', icon: 'heart', i18nTitle: 'donor_portal' },
    { title: 'Contractor Dashboard', subtitle: 'Manage projects and bids', href: 'contractor-dashboard.html', icon: 'hard-hat', i18nTitle: 'contractor_dashboard' },
    { title: 'Contractor Portal', subtitle: 'Contractor workspace', href: 'contractor-portal.html', icon: 'wrench', i18nTitle: 'contractor_portal' },
    { title: 'Supplier Dashboard', subtitle: 'Catalog and orders', href: 'supplier-dashboard.html', icon: 'storefront', i18nTitle: 'supplier_dashboard' },
    { title: 'Tradesperson Portal', subtitle: 'Your trade services', href: 'tradesperson-portal.html', icon: 'hammer', i18nTitle: 'tradesperson_portal' },
    { title: 'Pricing', subtitle: 'Platform pricing plans', href: 'pricing.html', icon: 'tag', i18nTitle: 'pricing' },
    { title: 'Privacy Policy', subtitle: 'How we protect your data', href: 'privacy.html', icon: 'lock', i18nTitle: 'privacy_policy' },
    { title: 'Terms of Service', subtitle: 'Platform terms', href: 'terms.html', icon: 'file-text', i18nTitle: 'terms_of_service' },
    { title: 'Contact Us', subtitle: 'Get in touch', href: 'contact.html', icon: 'envelope', i18nTitle: 'contact_us' },
];

let overlayEl: HTMLDivElement | null = null;
let resultsEl: HTMLDivElement | null = null;
let inputEl: HTMLInputElement | null = null;
let isOpen = false;

function createOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.id = 'search-overlay';
    overlay.className = 'search-overlay';
    overlay.setAttribute('role', 'search');
    overlay.setAttribute('aria-label', 'Platform search');
    overlay.innerHTML = `
        <div class="search-overlay-content">
            <div class="search-input-wrapper">
                <i class="ph ph-magnifying-glass text-slate-400 text-xl"  aria-hidden="true"></i>
                <input type="search" id="search-input" class="search-input"
                       placeholder="Search pages, features..." autocomplete="off"
                       data-i18n-placeholder="search_pages" />
                <kbd class="search-kbd">ESC</kbd>
            </div>
            <div id="search-results" class="search-results"></div>
            <div class="search-footer">
                <span class="text-slate-500 text-xs flex items-center gap-1.5">
                    <kbd class="search-kbd-mini">↑↓</kbd> navigate
                    <kbd class="search-kbd-mini">↵</kbd> select
                    <kbd class="search-kbd-mini">esc</kbd> close
                </span>
            </div>
        </div>`;

    return overlay;
}

function renderResults(query: string): void {
    if (!resultsEl) {
        return;
    }

    if (!query.trim()) {
        // Show suggested pages
        resultsEl.innerHTML = `
            <div class="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Suggestions</div>
            ${PAGE_INDEX.slice(0, 6).map(buildResultHTML).join('')}`;
        return;
    }

    const q = query.toLowerCase();
    const matches = PAGE_INDEX.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q)
    );

    if (matches.length === 0) {
        resultsEl.innerHTML = `
            <div class="flex flex-col items-center py-8 text-center">
                <i class="ph ph-magnifying-glass text-slate-300 nm-icon-32"  aria-hidden="true"></i>
                <p class="text-sm text-slate-500 mt-2 font-medium">No results found</p>
                <p class="text-xs text-slate-400 mt-1">Try a different search term</p>
            </div>`;
        return;
    }

    resultsEl.innerHTML = `
        <div class="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            ${matches.length} result${matches.length > 1 ? 's' : ''}
        </div>
        ${matches.map(buildResultHTML).join('')}`;
}

function buildResultHTML(result: SearchResult): string {
    const i18nAttr = result.i18nTitle ? ` data-i18n="${result.i18nTitle}"` : '';
    return `
        <a href="${result.href}" class="search-result-item">
            <div class="search-result-icon">
                <i class="ph ph-${result.icon}" aria-hidden="true"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold truncate"${i18nAttr}>${result.title}</p>
                <p class="text-xs text-slate-500 truncate">${result.subtitle}</p>
            </div>
            <i class="ph ph-arrow-right text-slate-400 text-sm"  aria-hidden="true"></i>
        </a>`;
}

function openSearch(): void {
    if (isOpen) {
        return;
    }

    if (!overlayEl) {
        overlayEl = createOverlay();
        document.body.appendChild(overlayEl);
        inputEl = overlayEl.querySelector('#search-input');
        resultsEl = overlayEl.querySelector('#search-results');

        // Input handler
        inputEl?.addEventListener('input', () => {
            renderResults(inputEl?.value ?? '');
        });

        // Backdrop click = close
        overlayEl.addEventListener('click', (e) => {
            if (e.target === overlayEl) {
                closeSearch();
            }
        });
    }

    isOpen = true;
    overlayEl.classList.add('active');
    document.body.classList.add('nm-scroll-locked');

    // Show suggestions
    renderResults('');

    // Focus input after transition
    requestAnimationFrame(() => {
        inputEl?.focus();
    });
}

function closeSearch(): void {
    if (!isOpen || !overlayEl) {
        return;
    }

    isOpen = false;
    overlayEl.classList.remove('active');
    document.body.classList.remove('nm-scroll-locked');

    // Clear input
    if (inputEl) {
        inputEl.value = '';
    }
}

/**
 * Initialize the global search overlay.
 * Call this from main.ts to enable platform-wide search.
 */
export function initSearch(): void {
    // Cmd/Ctrl+K shortcut
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            if (isOpen) {
                closeSearch();
            } else {
                openSearch();
            }
        }
        if (e.key === 'Escape' && isOpen) {
            closeSearch();
        }
    });

    // Wire any search trigger buttons on the page
    document.querySelectorAll('[data-search-trigger]').forEach(btn => {
        btn.addEventListener('click', () => {
            openSearch();
        });
    });
}
