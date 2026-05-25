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
 *   - PLT-UX-AUD P1-SEARCH-001 FIX: Arabic-first search (bilingual index)
 *
 * Standard: Apple Spotlight / Material Design Search overlay
 */

import { t, isRTL } from './i18n';

interface SearchResult {
  title: string;
  subtitle: string;
  // PLT-UX-AUD P1-SEARCH-001 FIX: Arabic search parity for Syria-first audience.
  title_ar: string;
  subtitle_ar: string;
  href: string;
  icon: string;
  i18nTitle?: string;
}

/** Static page index for client-side search — bilingual (EN + AR) */
const PAGE_INDEX: SearchResult[] = [
  {
    title: 'Home',
    title_ar: 'الرئيسية',
    subtitle: 'Main platform page',
    subtitle_ar: 'الصفحة الرئيسية للمنصة',
    href: 'index.html',
    icon: 'house',
    i18nTitle: 'home',
  },
  {
    title: 'Sign In',
    title_ar: 'تسجيل الدخول',
    subtitle: 'Login to your account',
    subtitle_ar: 'الدخول إلى حسابك',
    href: 'auth.html',
    icon: 'sign-in',
    i18nTitle: 'sign_in_btn',
  },
  {
    title: 'Wallet',
    title_ar: 'المحفظة',
    subtitle: 'Your balance and transactions',
    subtitle_ar: 'رصيدك ومعاملاتك',
    href: 'wallet.html',
    icon: 'wallet',
    i18nTitle: 'wallet',
  },
  {
    title: 'Profile',
    title_ar: 'الملف الشخصي',
    subtitle: 'Your account settings',
    subtitle_ar: 'إعدادات حسابك',
    href: 'profile.html',
    icon: 'user',
    i18nTitle: 'profile',
  },
  // PLT-UX-AUD P0-GHOST-001 FIX: user-basket removed — payments suspended indefinitely.
  // PLT-UX-AUD P0-GHOST-001 FIX: user-proof removed — payments suspended indefinitely.
  {
    title: 'Report Damage',
    title_ar: 'الإبلاغ عن ضرر',
    subtitle: 'Submit damage report',
    subtitle_ar: 'تقديم تقرير عن الأضرار',
    href: 'homeowner-report.html',
    icon: 'warning',
    i18nTitle: 'report_damage',
  },
  {
    title: 'BOQ Builder',
    title_ar: 'جدول الكميات',
    subtitle: 'Engineer bill of quantities',
    subtitle_ar: 'جدول كميات المهندس',
    href: 'engineer-boq.html',
    icon: 'clipboard-text',
    i18nTitle: 'engineer_boq_builder',
  },
  {
    title: 'Site Verification',
    title_ar: 'التحقق الميداني',
    subtitle: 'GPS-stamped field camera',
    subtitle_ar: 'كاميرا ميدانية بتحديد GPS',
    href: 'engineer-camera.html',
    icon: 'camera',
    i18nTitle: 'site_verification',
  },
  {
    title: 'Homeowner Portal',
    title_ar: 'بوابة صاحب المنزل',
    subtitle: 'Manage your property',
    subtitle_ar: 'إدارة ممتلكاتك',
    href: 'homeowner-portal.html',
    icon: 'house-line',
    i18nTitle: 'homeowner_portal',
  },
  // payments_DISABLED: user Portal hidden until payments feature is re-enabled
  // { title: 'user Portal', title_ar: 'بوابة المتبرع', ... }
  {
    title: 'Contractor Dashboard',
    title_ar: 'لوحة المقاول',
    subtitle: 'Manage projects and bids',
    subtitle_ar: 'إدارة المشاريع والعطاءات',
    href: 'contractor-dashboard.html',
    icon: 'hard-hat',
    i18nTitle: 'contractor_dashboard',
  },
  {
    title: 'Contractor Portal',
    title_ar: 'بوابة المقاول',
    subtitle: 'Contractor workspace',
    subtitle_ar: 'مساحة عمل المقاول',
    href: 'contractor-portal.html',
    icon: 'wrench',
    i18nTitle: 'contractor_portal',
  },
  {
    title: 'Supplier Dashboard',
    title_ar: 'لوحة المورّد',
    subtitle: 'Catalog and orders',
    subtitle_ar: 'الكتالوج والطلبات',
    href: 'supplier-dashboard.html',
    icon: 'storefront',
    i18nTitle: 'supplier_dashboard',
  },
  {
    title: 'Tradesperson Portal',
    title_ar: 'بوابة الحِرَفي',
    subtitle: 'Your trade services',
    subtitle_ar: 'خدماتك الحرفية',
    href: 'tradesperson-portal.html',
    icon: 'hammer',
    i18nTitle: 'tradesperson_portal',
  },
  {
    title: 'Pricing',
    title_ar: 'الأسعار',
    subtitle: 'Platform pricing plans',
    subtitle_ar: 'خطط تسعير المنصة',
    href: 'pricing.html',
    icon: 'tag',
    i18nTitle: 'pricing',
  },
  {
    title: 'Privacy Policy',
    title_ar: 'سياسة الخصوصية',
    subtitle: 'How we protect your data',
    subtitle_ar: 'كيف نحمي بياناتك',
    href: 'privacy.html',
    icon: 'lock',
    i18nTitle: 'privacy_policy',
  },
  {
    title: 'Terms of Service',
    title_ar: 'شروط الخدمة',
    subtitle: 'Platform terms',
    subtitle_ar: 'شروط المنصة',
    href: 'terms.html',
    icon: 'file-text',
    i18nTitle: 'terms_of_service',
  },
  {
    title: 'Contact Us',
    title_ar: 'اتصل بنا',
    subtitle: 'Get in touch',
    subtitle_ar: 'تواصل معنا',
    href: 'contact.html',
    icon: 'envelope',
    i18nTitle: 'contact_us',
  },
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
  overlay.setAttribute('aria-label', t('search_aria_label', 'بحث في المنصة'));
  overlay.innerHTML = `
        <div class="search-overlay-content">
            <div class="search-input-wrapper">
                <i class="ph ph-magnifying-glass text-slate-400 text-xl dark:text-slate-500" aria-hidden="true"></i>
                <input type="search" id="search-input" class="search-input"
                       placeholder="${t('search_pages', 'ابحث عن صفحات، ميزات...')}" autocomplete="off"
                       data-i18n-placeholder="search_pages" />
                <kbd class="search-kbd">ESC</kbd>
            </div>
            <div id="search-results" class="search-results"></div>
            <div class="search-footer">
                <span class="text-slate-500 text-xs flex items-center gap-1.5 dark:text-slate-400">
                    <kbd class="search-kbd-mini">↑↓</kbd> ${t('search_navigate', 'تنقّل')}
                    <kbd class="search-kbd-mini">↵</kbd> ${t('search_select', 'اختيار')}
                    <kbd class="search-kbd-mini">esc</kbd> ${t('search_close', 'إغلاق')}
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
            <div class="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500">${t('search_suggestions', 'اقتراحات')}</div>
            ${PAGE_INDEX.slice(0, 6).map(buildResultHTML).join('')}`;
    return;
  }

  const q = query.toLowerCase();
  // PLT-UX-AUD P1-SEARCH-001 FIX: Match against both English AND Arabic fields.
  // Syrian users (primary audience) type Arabic — previous English-only search was blind.
  const matches = PAGE_INDEX.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.subtitle.toLowerCase().includes(q) ||
      p.title_ar.includes(q) ||
      p.subtitle_ar.includes(q),
  );

  if (matches.length === 0) {
    resultsEl.innerHTML = `
            <div class="flex flex-col items-center py-8 text-center">
                <i class="ph ph-magnifying-glass text-slate-300 nm-icon-32" aria-hidden="true"></i>
                <p class="text-sm text-slate-500 mt-2 font-medium dark:text-slate-400">${t('search_no_results', 'لا توجد مشاريع مطابقة لبحثك')}</p>
                <p class="text-xs text-slate-400 mt-1 dark:text-slate-500">${t('search_try_different', 'جرّب مصطلح بحث مختلف')}</p>
            </div>`;
    return;
  }

  // PLT-UX-AUD P3-SEARCH-007 FIX: Use t() with interpolation instead of English pluralization.
  const countLabel = t('search_results_count', `${matches.length} results`).replace(
    '{n}',
    String(matches.length),
  );
  resultsEl.innerHTML = `
        <div class="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500">
            ${countLabel}
        </div>
        ${matches.map(buildResultHTML).join('')}`;
}

function buildResultHTML(result: SearchResult): string {
  const i18nAttr = result.i18nTitle ? ` data-i18n="${result.i18nTitle}"` : '';
  // PLT-UX-AUD P1-SEARCH-001 FIX: Display Arabic titles when RTL is active.
  const displayTitle = isRTL() ? result.title_ar : result.title;
  const displaySubtitle = isRTL() ? result.subtitle_ar : result.subtitle;
  return `
        <a href="${result.href}" class="search-result-item">
            <div class="search-result-icon">
                <i class="ph ph-${result.icon}" aria-hidden="true"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold truncate"${i18nAttr}>${displayTitle}</p>
                <p class="text-xs text-slate-500 truncate dark:text-slate-400">${displaySubtitle}</p>
            </div>
            <i class="ph ph-caret-right text-slate-400 text-sm dark:text-slate-500 nm-dir-shift" aria-hidden="true"></i>
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

    // PLATINUM FIX: Missing Keyboard Engine (Ghost Feature)
    overlayEl.addEventListener('keydown', (e: KeyboardEvent) => {
      const results = Array.from(
        overlayEl?.querySelectorAll<HTMLAnchorElement>('.search-result-item') || [],
      );
      if (results.length === 0) {
        return;
      }

      const activeIdx = results.findIndex((a) => a === document.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (activeIdx < results.length - 1) {
          results[activeIdx + 1]?.focus();
        } else {
          results[0]?.focus(); // Loop to top
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (activeIdx > 0) {
          results[activeIdx - 1]?.focus();
        } else if (activeIdx === 0) {
          inputEl?.focus(); // Return to input
        } else {
          results[results.length - 1]?.focus(); // Loop to bottom
        }
      } else if (e.key === 'Enter') {
        // If input is focused and enter is pressed, navigate to first result
        if (document.activeElement === inputEl && results.length > 0 && results[0]) {
          e.preventDefault();
          window.location.href = results[0].href;
        }
      }
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
  document.querySelectorAll('[data-search-trigger]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openSearch();
    });
  });
}
