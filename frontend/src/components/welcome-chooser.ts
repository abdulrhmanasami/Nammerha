// ============================================================================
// Nammerha — P0-004: Post-Registration Welcome Chooser
// ============================================================================
// Task-oriented onboarding modal shown ONCE after first login post-registration.
// Guides the user to the right portal via human-centered task descriptions
// instead of role labels. Stores selection in nm_preferred_workspace for the
// existing "Continue to [X]" banner on return visits.
//
// Trigger chain:
//   1. auth.ts registers → sets `nmh_onboarding_pending` in localStorage
//   2. auth.ts login → detects flag → appends `?onboarding=1` to redirect URL
//   3. main.ts → `initWelcomeChooser()` detects `?onboarding=1`
//   4. Tour engine fires → homepage tour runs → dispatches 'nm:tour:complete'
//   5. This component listens for that event → shows the chooser modal
//   6. User selects a task card → stored in nm_preferred_workspace → navigated
//
// Standards:
//   - WCAG 2.1 SC 2.4.3 (Focus Order): Focus trap within modal
//   - WCAG 2.1 SC 1.3.1 (Info & Relationships): role="dialog" + aria-modal
//   - Nielsen #2 (Match System ↔ Real World): Task descriptions, not role names
//   - Nielsen #3 (User Control): "Maybe Later" dismiss option
//   - Apple HIG (Onboarding): Minimal, task-oriented, skippable
//   - Logical CSS: RTL-safe via logical properties
// ============================================================================

import { t, isRTL } from '../utils/i18n';
import { escapeHtml as esc } from '../utils/xss';
// P1-001 REFACTOR: Import from shared workspace map (SSoT).
import { WS_STORAGE_KEY } from '../utils/workspace-map';
// P1-W14 FIX: Zombie listeners and timeout tracking.
// P1-W14 FIX: Zombie listeners and timeout tracking.
import { addTrackedTimer } from '../utils/tracked-timers';

const CHOOSER_SHOWN_KEY = 'nm_welcome_chooser_shown';
const ONBOARDING_PARAM = 'onboarding';

// ─── Task-Oriented Workspace Cards ──────────────────────────────────────────
// Each card answers "What do you need?" not "What role are you?"
// Standard: Airbnb/Fiverr task-facade pattern — portals are implementation details.
interface WorkspaceOption {
  /** Workspace ID — matches WORKSPACE_ROUTES keys in utils/workspace-map.ts */
  id: string;
  /** Phosphor icon class (without ph- prefix) */
  icon: string;
  /** i18n key for the task title */
  titleKey: string;
  /** English fallback for title */
  titleFallback: string;
  /** i18n key for the task description */
  descKey: string;
  /** English fallback for description */
  descFallback: string;
  /** Navigation target href */
  href: string;
  /** Card accent color class */
  colorClass: string;
  /** Card accent background class */
  bgClass: string;
}

const WORKSPACE_OPTIONS: WorkspaceOption[] = [
  {
    id: 'homeowner',
    icon: 'house-line',
    titleKey: 'wc_task_homeowner',
    titleFallback: 'I need my house repaired',
    descKey: 'wc_desc_homeowner',
    descFallback: 'Report damage, track repairs, and manage your reconstruction project',
    href: '/homeowner-portal.html',
    colorClass: 'text-trust-blue',
    bgClass: 'bg-trust-blue/10 dark:bg-trust-blue/20',
  },
  {
    id: 'engineer',
    icon: 'hard-hat',
    titleKey: 'wc_task_engineer',
    titleFallback: "I'm an engineer or contractor",
    descKey: 'wc_desc_engineer',
    descFallback: 'Bid on projects, verify construction, and manage field operations',
    href: '/projects.html',
    colorClass: 'text-smoky-jade dark:text-emerald-400',
    bgClass: 'bg-smoky-jade/10 dark:bg-emerald-400/20',
  },
  // HIGH-UX-001 FIX: Tradesperson workspace option.
  // PREVIOUS: 5 registration roles but only 4 welcome chooser cards.
  // Tradespersons selected "engineer/contractor" → landed on /projects.html
  // instead of /tradesperson-portal.html → could not find their work queue.
  // Standard: Nielsen #2 (Match System ↔ Real World), Role Completeness.
  {
    id: 'tradesperson',
    icon: 'wrench',
    titleKey: 'wc_task_tradesperson',
    titleFallback: "I'm a skilled tradesperson",
    descKey: 'wc_desc_tradesperson',
    descFallback: 'Find repair jobs, manage service requests, and grow your business',
    href: '/tradesperson-portal.html',
    colorClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-600/10 dark:bg-amber-400/20',
  },
  {
    id: 'supplier',
    icon: 'storefront',
    titleKey: 'wc_task_supplier',
    titleFallback: 'I supply building materials',
    descKey: 'wc_desc_supplier',
    descFallback: 'List your catalog, fulfill purchase orders, and track deliveries',
    href: '/supplier-dashboard.html',
    colorClass: 'text-purple-600 dark:text-purple-400',
    bgClass: 'bg-purple-600/10 dark:bg-purple-400/20',
  },
  {
    id: 'explorer',
    icon: 'compass',
    titleKey: 'wc_task_explorer',
    titleFallback: 'I want to explore projects',
    descKey: 'wc_desc_explorer',
    descFallback: 'Browse reconstruction projects, view progress, and see the impact',
    href: '/projects.html',
    colorClass: 'text-warm-earth',
    bgClass: 'bg-warm-earth/10 dark:bg-warm-earth/20',
  },
];

// P0-JRN-002 FIX: user workspace option// HIGH-001: The Donor/User system has been globally eradicated from the platform.
// No user portal card will be injected.

// ─── State ──────────────────────────────────────────────────────────────────
let chooserEl: HTMLElement | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize the welcome chooser. Call from main.ts after autoTriggerTour().
 *
 * Logic:
 * 1. Check if ?onboarding=1 is in the URL
 * 2. Clean the param from the URL (History API replaceState)
 * 3. If the homepage tour is running → wait for 'nm:tour:complete' event
 * 4. If the tour is already done or not applicable → show immediately
 * 5. Show the chooser modal
 */
export function initWelcomeChooser(): void {
  // Gate 1: Only show on onboarding flow
  const params = new URLSearchParams(window.location.search);
  if (params.get(ONBOARDING_PARAM) !== '1') {
    return;
  }

  // Gate 2: Only show once per user
  try {
    if (localStorage.getItem(CHOOSER_SHOWN_KEY) === '1') {
      cleanOnboardingParam();
      return;
    }
  } catch {
    /* Safari private mode — proceed, worst case shows again */
  }

  // Clean ?onboarding=1 from URL (cosmetic — prevents bookmark with stale param)
  cleanOnboardingParam();

  // Determine if the homepage tour is currently active
  const tourOverlay = document.getElementById('nmr-tour-overlay');
  if (tourOverlay) {
    // Tour is running → wait for it to finish
    document.addEventListener(
      'nm:tour:complete',
      () => {
        // Small delay for smooth transition — don't stack modals
        addTrackedTimer(setTimeout(showChooser, 600));
      },
      { once: true },
    );
  } else {
    // Tour already done or not applicable → show after page settles
    addTrackedTimer(setTimeout(showChooser, 1800));
  }
}

// ─── URL Cleanup ────────────────────────────────────────────────────────────

function cleanOnboardingParam(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(ONBOARDING_PARAM);
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* URL API unavailable — harmless */
  }
}

// ─── Modal Rendering ────────────────────────────────────────────────────────

function showChooser(): void {
  // Safety: don't double-show
  if (chooserEl) {
    return;
  }

  const rtl = isRTL();
  const titleText = t('wc_title', 'أهلاً بك في نعمّرها! 🎉');
  const subtitleText = t('wc_subtitle', 'ما الذي يجلبك إلى هنا اليوم؟');
  const laterText = t('wc_later', 'لاحقاً');

  // Build cards HTML
  const cardsHtml = WORKSPACE_OPTIONS.map(
    (opt, i) => `
        <button type="button"
                class="nm-wc-card group"
                data-wc-id="${esc(opt.id)}"
                data-wc-href="${esc(opt.href)}"
                style="animation-delay: ${150 + i * 80}ms"
                aria-label="${esc(t(opt.titleKey, opt.titleFallback))}">
            <div class="nm-wc-card-icon ${esc(opt.bgClass)}">
                <i class="ph ph-${esc(opt.icon)} nm-icon-28 ${esc(opt.colorClass)}" aria-hidden="true"></i>
            </div>
            <div class="nm-wc-card-body">
                <h3 class="nm-wc-card-title" data-i18n="${esc(opt.titleKey)}">${esc(t(opt.titleKey, opt.titleFallback))}</h3>
                <p class="nm-wc-card-desc" data-i18n="${esc(opt.descKey)}">${esc(t(opt.descKey, opt.descFallback))}</p>
            </div>
            <i class="ph ph-caret-right nm-wc-card-arrow nm-dir-shift ${esc(opt.colorClass)}" aria-hidden="true"></i>
        </button>
    `,
  ).join('');

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'nm-welcome-chooser';
  modal.className = 'nm-wc-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', t('wc_dialog_label', 'مرحباً — اختر مسارك'));
  modal.dir = rtl ? 'rtl' : 'ltr';

  modal.innerHTML = `
        <div class="nm-wc-backdrop"></div>
        <div class="nm-wc-panel">
            <div class="nm-wc-header">
                <div class="nm-wc-greeting">
                    <h2 class="nm-wc-title" data-i18n="wc_title">${esc(titleText)}</h2>
                    <p class="nm-wc-subtitle" data-i18n="wc_subtitle">${esc(subtitleText)}</p>
                </div>
            </div>
            <div class="nm-wc-cards">
                ${cardsHtml}
            </div>
            <div class="nm-wc-footer">
                <button type="button" class="nm-wc-dismiss" data-action="dismiss">
                    <span data-i18n="wc_later">${esc(laterText)}</span>
                </button>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
  chooserEl = modal;

  // Trigger entrance animation (next frame)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modal.classList.add('nm-wc-overlay--visible');
    });
  });

  // ── Event Wiring ──
  wireChooserEvents(modal);

  // ── Focus Management ──
  // Focus the first card after animation settles
  addTrackedTimer(setTimeout(() => {
    const firstCard = modal.querySelector<HTMLElement>('.nm-wc-card');
    firstCard?.focus();
  }, 500));
}

// ─── Event Handling ─────────────────────────────────────────────────────────

function wireChooserEvents(modal: HTMLElement): void {
  // Card selection
  modal.querySelectorAll<HTMLElement>('.nm-wc-card').forEach((card) => {
    card.addEventListener('click', () => {
      const wsId = card.dataset.wcId;
      const href = card.dataset.wcHref;
      if (!wsId || !href) {
        return;
      }

      // Store workspace preference (feeds "Continue to [X]" banner)
      try {
        localStorage.setItem(WS_STORAGE_KEY, wsId);
      } catch {
        /* quota */
      }

      // Animate selection
      card.classList.add('nm-wc-card--selected');
      modal.classList.add('nm-wc-overlay--exiting');

      // Navigate after exit animation
      addTrackedTimer(setTimeout(() => {
        window.location.href = href;
      }, 350));
    });

    // Keyboard: Enter/Space triggers click
    card.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  // Dismiss button
  const dismissBtn = modal.querySelector<HTMLElement>('[data-action="dismiss"]');
  dismissBtn?.addEventListener('click', () => {
    dismissChooser();
  });

  // Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      dismissChooser();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Focus trap — Tab cycles within modal
  modal.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Tab') {
      return;
    }

    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) {
      e.preventDefault();
      modal.focus();
      return;
    }

    const arr = Array.from(focusable);
    const first = arr[0];
    const last = arr[arr.length - 1];

    if (document.activeElement === modal) {
      e.preventDefault();
      if (e.shiftKey) {
        last?.focus();
      } else {
        first?.focus();
      }
      return;
    }

    if (!modal.contains(document.activeElement)) {
      e.preventDefault();
      modal.focus();
      return;
    }

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  });

  // Backdrop click = dismiss
  const backdrop = modal.querySelector('.nm-wc-backdrop');
  backdrop?.addEventListener('click', () => {
    dismissChooser();
  });
}

// ─── Dismiss ────────────────────────────────────────────────────────────────

function dismissChooser(): void {
  if (!chooserEl) {
    return;
  }

  // Mark as shown — won't re-trigger
  try {
    localStorage.setItem(CHOOSER_SHOWN_KEY, '1');
  } catch {
    /* quota */
  }

  // Exit animation
  chooserEl.classList.add('nm-wc-overlay--exiting');
  chooserEl.classList.remove('nm-wc-overlay--visible');

  addTrackedTimer(setTimeout(() => {
    chooserEl?.remove();
    chooserEl = null;
  }, 400));
}
