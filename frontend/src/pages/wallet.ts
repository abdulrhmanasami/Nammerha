import '../styles/main.css';
import { PAYMENTS_ENABLED } from '../utils/feature-flags';
import { reportError, reportWarning } from '../error-reporter';
import { escrowPayments, payments } from '../api';
import { escapeHtml } from '../utils/xss';
import { formatCents } from '../utils/format';
import { formatDate } from '../utils/locale';
import { t } from '../utils/i18n';
import { initOfflineIndicator } from '../utils/offline-indicator';
import { guardSkeleton } from '../utils/skeleton-guard';
import { requireAuth } from '../utils/auth-guard';
import { renderProgressive } from '../utils/progressive-render';
import { renderErrorWithRetry } from '../utils/error-retry';
import { renderEmptyState } from '../utils/empty-state';
// GAP-002 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
// UX-004 FIX: Haptic feedback for native-app tactile response
import { haptic } from '../utils/haptic';
import { initBackToTop } from '../components/back-to-top';
// SYS-004 FIX: Dialog polyfill for older Android WebViews (Syria).
import { polyfillDialog } from '../utils/dialog-polyfill';
// GAP-N03 FIX: Global search overlay on inner pages
import { initSearch } from '../utils/search-overlay';
// INC-NEW-01 FIX: Unified page header — eliminates duplicate back-button wiring
import { initPageHeader } from '../components/page-header';
// UX PLATINUM FIX: UI Lock for Escrow Idempotency Feedback
import { showProcessingLock } from '../utils/ui-lock';
// F-004 FIX: Hub FAB on all pages — portal navigation from inner pages
import { mountHubFAB } from '../components/portal-context';
// F-010 FIX: Breadcrumb navigation on inner pages
import { initBreadcrumb } from '../utils/breadcrumb';
initPullToRefresh();
initBackToTop();
initSearch();
initPageHeader();

// ============================================================================
// Nammerha — Wallet Page Engine
// P0-004 FIX: Dynamic escrow balance and transaction history
// ============================================================================

interface EscrowSummary {
  total_locked: number;
  total_released: number;
  locked_count: number;
  released_count: number;
}

interface Transaction {
  transaction_id: string;
  project_title?: string;
  material_name?: string;
  amount: number;
  status: 'locked' | 'released' | 'refunded' | 'completed' | 'pending';
  created_at: string;
}

// A2 FIX: Delegation guard for receipt download listener.
// PREVIOUS: listener was added INSIDE loadTransactions() with no guard.
// Pull-to-refresh or retry → loadTransactions() called again → duplicate listeners stacked.
// Each tap fires N downloads on Syrian metered 3G — bandwidth and trust destroyer.
// NOW: Module-level guard ensures single-attach. Same pattern as homeowner-portal.ts L609.
// Standard: Event Delegation Best Practice, Nielsen #5 (Error Prevention).
let receiptDelegationWired = false;

// CRIT-UX-004: Module-level state for transaction filtering
let allTransactions: Transaction[] = [];
let filterDelegationWired = false;

// PLAT-UX-005 FIX: Monotonic Request ID to prevent race conditions on slow networks.
let lastFetchId = 0;
// PLAT-MEM-001 FIX: Reference to the skeleton guard cancellation function to prevent memory leaks.
let cancelTxSkeleton: (() => void) | null = null;

/**
 * CRIT-UX-004: Render a filtered subset of transactions using progressive rendering.
 */
function renderFilteredTransactions(container: HTMLElement, transactions: Transaction[]): void {
  renderProgressive({
    items: transactions,
    containerEl: container,
    pageSize: 20,
    renderItem: (tx) => renderTransaction(tx),
    emptyState: () =>
      renderEmptyState({
        icon: 'wallet',
        title: t('wallet_no_transactions', 'لا توجد معاملات بعد'),
        subtitle: t(
          PAYMENTS_ENABLED ? 'wallet_history_description_full' : 'wallet_history_description',
          PAYMENTS_ENABLED
            ? 'Your payment and payment history will appear here'
            : 'Your payment and escrow history will appear here',
        ),
      }),
  });
}

/**
 * CRIT-UX-004: Update the transaction count display.
 */
function updateTxCount(count: number): void {
  const countEl = document.getElementById('tx-count');
  if (countEl) {
    countEl.textContent = count > 0 ? `(${count})` : '';
  }

  // PLAT-A11Y-001 FIX: Screen Reader Announcement for Dynamic DOM Filtering
  // Filtering without page reload leaves visually impaired users blind to the result.
  let announcer = document.getElementById('a11y-tx-announcer');
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'a11y-tx-announcer';
    announcer.setAttribute('aria-live', 'polite');
    announcer.className = 'sr-only'; // Tailwind hidden visually but accessible
    document.body.appendChild(announcer);
  }
  // Allow DOM to register the node before updating text for reliable screen reader hooks
  setTimeout(() => {
    if (announcer) {
      announcer.textContent = t('wallet_tx_found_a11y', `${count} transactions found`);
    }
  }, 50);
}

// HIGH-001 FIX: formatCents() consolidated — imported from utils/format.ts.

// P1-001 FIX: formatDate() deduplicated — imported from utils/locale.ts.

// ─── Load Escrow Summary ────────────────────────────────────────────────────
async function loadEscrowSummary(): Promise<void> {
  // PLT-AUD-W01 FIX: ID was 'escrow-balance' — HTML uses 'wallet-balance'.
  //    Root cause: TS and HTML written independently, IDs never reconciled.
  //    The skeleton loader stayed on-screen forever because balanceEl was always null.
  //    Standard: DOM Contract — TS element IDs MUST match HTML IDs.
  const balanceEl = document.getElementById('wallet-balance');
  const lockedEl = document.getElementById('locked-count');
  const releasedEl = document.getElementById('released-count');

  // FORENSIC-C1.7 FIX: payments API returns 503 when PAYMENTS_ENABLED=false.
  // Wallet is a universal page — it must NOT depend on the suspended payment system.
  // When payments are suspended, show zeroed escrow balance gracefully.
  if (!PAYMENTS_ENABLED) {
    // PLT-UX-AUD P3-ANIM-004 FIX: Entry animation for escrow summary (visual consistency).
    if (balanceEl) {
      balanceEl.textContent = formatCents(0);
      balanceEl.classList.add('animate-fade-in-up');
    }
    if (lockedEl) {
      lockedEl.classList.remove('animate-pulse');
      lockedEl.textContent = `0 ${t('wallet_locked', 'محجوز')}`;
      lockedEl.classList.add('animate-fade-in-up');
    }
    if (releasedEl) {
      releasedEl.classList.remove('animate-pulse');
      releasedEl.textContent = `0 ${t('wallet_released', 'محرّر')}`;
      releasedEl.classList.add('animate-fade-in-up');
    }
    return;
  }

  try {
    const response = await escrowPayments.getMyEscrow();
    if (response.success && response.data) {
      // P3-AUD-NEW-003 FIX: Runtime guard — gracefully handle API shape drift
      // PLAT-FIN-001 FIX: Enforce strict integer check for financial amounts.
      // NaN and Infinity bypass `typeof === 'number'`, which destroys UI trust.
      const summary = response.data as Partial<EscrowSummary>;
      if (!Number.isSafeInteger(summary.total_locked)) {
        return;
      }
      if (balanceEl) {
        balanceEl.textContent = formatCents(summary.total_locked);
        balanceEl.classList.add('animate-fade-in-up');
      }
      // PLAT-UX-003 FIX (Part 2): Clear skeleton animation class after hydration.
      // PLT-UX-AUD P3-ANIM-004 FIX: Entry animation for visual consistency.
      if (lockedEl) {
        lockedEl.classList.remove('animate-pulse');
        lockedEl.textContent = `${summary.locked_count ?? 0} ${t('wallet_locked', 'محجوز')}`;
        lockedEl.classList.add('animate-fade-in-up');
      }
      if (releasedEl) {
        releasedEl.classList.remove('animate-pulse');
        releasedEl.textContent = `${summary.released_count ?? 0} ${t('wallet_released', 'محرّر')}`;
        releasedEl.classList.add('animate-fade-in-up');
      }
      // UX-REM-V006 FIX: Currency context indicator.
      // PREVIOUS: Balance shown as "$1,500" — Syrian users may assume SYP.
      // NOW: Small "USD" badge injected next to balance for clarity.
      // Standard: Nielsen #2 (Match system & real world), ISO 4217.
      if (balanceEl && !balanceEl.parentElement?.querySelector('.nm-currency-tag')) {
        const tag = document.createElement('span');
        tag.className =
          'nm-currency-tag text-3xs text-slate-400 dark:text-slate-500 ms-1 font-medium';
        tag.textContent = 'USD';
        tag.setAttribute('data-i18n-skip', 'true'); // ISO code — do not translate
        balanceEl.parentElement?.appendChild(tag);
      }
    }
  } catch (err) {
    reportWarning('[Wallet] Escrow summary load failed', {
      component: 'wallet',
      action: 'load_escrow',
      error: err instanceof Error ? err.message : String(err),
    });
    if (balanceEl) {
      balanceEl.textContent = '$0.00';
    }
    // PLAT-UX-003 FIX (Part 2): Hydrate locked/released on failure — prevent frozen skeletons.
    if (lockedEl) {
      lockedEl.classList.remove('animate-pulse');
      lockedEl.textContent = `0 ${t('wallet_locked', 'محجوز')}`;
    }
    if (releasedEl) {
      releasedEl.classList.remove('animate-pulse');
      releasedEl.textContent = `0 ${t('wallet_released', 'محرّر')}`;
    }
  }
}

// ─── Render Transaction Item ────────────────────────────────────────────────
function renderTransaction(tx: Transaction): string {
  const statusConfig: Record<string, { icon: string; color: string; label: string }> = {
    locked: {
      icon: 'lock-simple',
      color: 'text-trust-blue',
      label: t('wallet_status_locked', 'محجوز'),
    },
    released: {
      icon: 'check-circle',
      color: 'text-smoky-jade',
      label: t('wallet_status_released', 'محرّر'),
    },
    refunded: {
      icon: 'arrow-counter-clockwise',
      color: 'text-warm-earth',
      label: t('wallet_status_refunded', 'مُستردّ'),
    },
    completed: {
      icon: 'check-circle',
      color: 'text-smoky-jade',
      label: t('wallet_status_completed', 'مكتمل'),
    },
    pending: {
      icon: 'clock',
      color: 'text-warm-earth',
      label: t('wallet_status_pending', 'معلّق'),
    },
  };

  const config = statusConfig[tx.status] ?? {
    icon: 'clock',
    color: 'text-warm-earth',
    label: t('wallet_status_pending', 'معلّق'),
  };

  // V-003 FIX: Receipt download button — only for finalized transactions.
  // Pending/refunded entries don't have downloadable receipts.
  const canDownload = ['locked', 'released', 'completed'].includes(tx.status);
  const receiptBtn = canDownload
    ? `<button
            class="v003-receipt-btn size-8 rounded-lg bg-trust-blue/5 hover:bg-trust-blue/15 flex items-center justify-center transition-colors shrink-0"
            data-escrow-id="${escapeHtml(tx.transaction_id)}"
            title="${escapeHtml(t('download_receipt', 'تحميل الإيصال'))}"
            aria-label="${escapeHtml(t('download_receipt', 'تحميل الإيصال'))}"
          >
            <i class="ph ph-file-pdf text-trust-blue text-sm" aria-hidden="true"></i>
          </button>`
    : '';

  return `
    <div class="bg-surface rounded-xl p-4 flex items-center gap-4 shadow-sm border border-slate-100 animate-fade-in-up dark:border-dark-border">
      <div class="size-10 bg-trust-blue/10 rounded-lg flex items-center justify-center shrink-0">
        <i class="ph ph-${config.icon} ${config.color}" aria-hidden="true"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold truncate">${escapeHtml(tx.material_name ?? tx.project_title ?? t('wallet_transaction', 'معاملة'))}</p>
        <p class="text-3xs text-slate-400 dark:text-slate-500">${formatDate(tx.created_at)}</p>
      </div>
      <div class="text-end shrink-0">
        <p class="text-sm font-bold ${config.color}">${formatCents(tx.amount)}</p>
        <p class="text-3xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">${config.label}</p>
      </div>
      ${receiptBtn}
    </div>`;
}

// ─── Load Transaction History ───────────────────────────────────────────────
async function loadTransactions(): Promise<void> {
  const listEl = document.getElementById('transaction-list');
  if (!listEl) {
    return;
  }

  // PLAT-UX-005 FIX: Monotonic Request ID Lock
  // Prevents older, delayed requests from overwriting newer user actions.
  const currentFetchId = ++lastFetchId;

  try {
    // FORENSIC-C1.7 FIX: Only fetch payment history when payments are enabled.
    // Previously this always called escrowPayments.getMyHistory() which returns 503
    // when PAYMENTS_ENABLED=false on the backend, breaking the entire wallet page.
    const fetches: Promise<unknown>[] = [payments.getMyPayments()];
    if (PAYMENTS_ENABLED) {
      fetches.push(escrowPayments.getMyHistory());
    }

    const [payRes, donRes] = (await Promise.allSettled(fetches)) as [
      PromiseSettledResult<Awaited<ReturnType<typeof payments.getMyPayments>>>,
      PromiseSettledResult<Awaited<ReturnType<typeof escrowPayments.getMyHistory>>> | undefined,
    ];

    // PLAT-UX-005: If another fetch was initiated while we waited, discard these results.
    if (currentFetchId !== lastFetchId) {
      return;
    }

    // PLAT-MEM-001 FIX: Clear the skeleton guard timer now that data has arrived.
    // Prevents the 35-second timeout from firing randomly in the background.
    if (cancelTxSkeleton) {
      cancelTxSkeleton();
      cancelTxSkeleton = null;
    }

    const transactions: Transaction[] = [];

    if (
      donRes &&
      donRes.status === 'fulfilled' &&
      (donRes.value as { success: boolean; data?: unknown }).success &&
      Array.isArray((donRes.value as { data?: unknown }).data)
    ) {
      transactions.push(...(donRes.value as { data: Transaction[] }).data);
    }
    if (
      payRes.status === 'fulfilled' &&
      (payRes.value as { success: boolean; data?: unknown }).success &&
      Array.isArray((payRes.value as { data?: unknown }).data)
    ) {
      transactions.push(...(payRes.value as { data: Transaction[] }).data);
    }

    // Sort by date descending
    transactions.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    // CRIT-UX-004: Store transactions for filtering
    allTransactions = transactions;

    // P1-UXA-002 FIX: Progressive rendering for wallet transactions
    renderFilteredTransactions(listEl, transactions);

    // CRIT-UX-004: Show transaction count
    updateTxCount(transactions.length);

    // CRIT-UX-004: Wire filter chips — event delegation on filter container
    if (!filterDelegationWired) {
      filterDelegationWired = true;
      const filtersEl = document.getElementById('tx-filters');
      if (filtersEl) {
        filtersEl.addEventListener('click', (e: Event) => {
          const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.nm-filter-chip');
          if (!chip) return;
          haptic.light();
          const filterVal = chip.dataset['filter'] ?? 'all';

          // Update active chip
          filtersEl.querySelectorAll('.nm-filter-chip').forEach((c) => {
            c.classList.remove('nm-filter-chip--active');
            c.setAttribute('aria-checked', 'false');
          });
          chip.classList.add('nm-filter-chip--active');
          chip.setAttribute('aria-checked', 'true');

          // Filter and re-render
          const filtered =
            filterVal === 'all'
              ? allTransactions
              : allTransactions.filter((tx) => tx.status === filterVal);
          renderFilteredTransactions(listEl, filtered);
          updateTxCount(filtered.length);
        });
      }
    }

    // V-003 FIX: Receipt download — event delegation on the transaction list.
    // Opens PDF receipt in a new tab. Uses homeowner receipt endpoint.
    // A2 FIX: Guard ensures this listener is attached ONCE per page lifecycle.
    if (!receiptDelegationWired) {
      receiptDelegationWired = true;
      listEl.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.v003-receipt-btn');
        if (!btn || btn.disabled) return;
        e.stopPropagation();
        const escrowId = btn.dataset['escrowId'];
        if (!escrowId) return;
        haptic.light(); // UX-004: Tactile download feedback

        // PLAT-UX-006 FIX: Tactile & Visual closure for silent downloads
        // Prevents double-clicks and reassures the user that action is processing.
        const icon = btn.querySelector('i');
        const originalClass = icon?.className ?? '';
        if (icon) {
          icon.className = 'ph ph-spinner animate-spin text-trust-blue text-sm';
          btn.disabled = true;
          btn.setAttribute('aria-busy', 'true');
        }

        // P1-RECEIPT-001 FIX: Replaced window.open() with hidden anchor click.
        const receiptLink = document.createElement('a');
        receiptLink.href = `/api/homeowner/receipts/${encodeURIComponent(escrowId)}`;
        receiptLink.target = '_blank';
        receiptLink.rel = 'noopener noreferrer';
        document.body.appendChild(receiptLink);
        receiptLink.click();
        receiptLink.remove();

        // Release the button lock after browser completes navigation handoff
        setTimeout(() => {
          if (icon) {
            icon.className = originalClass;
          }
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
        }, 1500);
      });
    }
  } catch (err) {
    reportError(
      err instanceof Error ? err : new Error('[Wallet] Transaction history load failed'),
      { component: 'wallet', action: 'load_transactions' },
    );
    renderErrorWithRetry(
      listEl,
      loadTransactions,
      'wallet_load_failed',
      'Unable to load transactions.',
      err,
    );
  }
}

// ─── Initialize ─────────────────────────────────────────────────────────────
function init(): void {
  // P2-MOB-002 FIX: Show offline indicator when device loses connectivity
  initOfflineIndicator();

  // GAP-004 FIX: Auth guard — show sign-in overlay if not authenticated
  if (!requireAuth()) {
    return; // Auth overlay shown, skip data loading
  }

  // F-004 FIX: Hub FAB — portal navigation from inner pages.
  mountHubFAB('');
  // F-010 FIX: Breadcrumb — spatial orientation on inner pages.
  initBreadcrumb();

  // P3-UX-004 FIX: Guard skeleton loaders with timeout fallback
  // PLAT-MEM-001: Store reference to clear timeout upon success
  cancelTxSkeleton = guardSkeleton({
    container: 'transaction-list',
    timeoutMs: 15000,
    onRetry: () => {
      if (cancelTxSkeleton) cancelTxSkeleton(); // Reset the guard
      loadTransactions();
    },
  });

  loadEscrowSummary();
  loadTransactions();

  // P1-F4 FIX: Wire wallet history button to scroll to transaction section.
  // Previous: dead button with no handler, no id.
  document.getElementById('scroll-to-history')?.addEventListener('click', () => {
    haptic.light(); // UX-004: Tactile tap feedback
    const section = document.getElementById('transaction-list');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // INC-NEW-01 FIX: Back button wiring moved to shared page-header.ts.
  // Previous: 8 lines of duplicate code (identical to profile.ts).
  // Now: initPageHeader() called at module top — single source of truth.

  // PLT-AUD-W02 FIX: Wire "Deposit" quick action → deposit dialog.
  //    Previous: deposit-action button (wallet.html L129) and deposit-dialog (wallet.html L199)
  //    existed but NO code connected them. Users tapped "Deposit" → nothing happened.
  //    Standard: Nielsen Heuristic #1 (System Status Visibility), FinTech UX.
  const depositBtn = document.getElementById('deposit-action');
  const depositDialog = document.getElementById('deposit-dialog') as HTMLDialogElement | null;
  if (depositBtn && depositDialog) {
    depositBtn.addEventListener('click', () => {
      haptic.medium(); // UX-004: Confirm action feedback
      // SYS-004: Polyfill for older browsers before calling showModal().
      polyfillDialog(depositDialog);
      depositDialog.showModal();
    });
    // UX-REM-F003 FIX: Deposit button honesty — aria-disabled for screen readers.
    // The HTML already has a pre-rendered "Soon" badge (wallet.html L147).
    // PREVIOUS: JS injected a SECOND badge, causing duplicate "(Soon)(Soon)".
    // NOW: Only set aria-disabled for a11y — the visual badge is in the HTML.
    // Standard: WCAG 4.1.2 (Name, Role, Value), Honest Affordances.
    depositBtn.setAttribute('aria-disabled', 'true');
    // Wire dialog cancel button
    depositDialog.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      depositDialog.close();
    });
    // Wire "Notify Me" button to show toast and close
    document.getElementById('deposit-notify-btn')?.addEventListener('click', () => {
      haptic.light();
      depositDialog.close();

      // UX PLATINUM FIX: Escrow Double-Click Anxiety (UI Freeze)
      // Lock the UI instantly when the user initiates a financial action
      const unlock = showProcessingLock(t('processing_secure', 'جاري المعالجة الآمنة...'));

      setTimeout(() => {
        unlock();
        // Dynamic import: toast is only needed on this interaction path
        import('../utils/toast')
          .then(({ showToast }) => {
            showToast(
              t('deposit_notify_confirmed', "We'll notify you when deposits are available!"),
              'success',
            );
          })
          .catch(() => {
            /* Intentional: Toast module failed to load */
          });
      }, 800);
    });
  }

  // GAP-N02 FIX: Wire "Add Funds" button with proper UX feedback.
  // Previous: Dead button — user tapped and nothing happened (Nielsen Heuristic #1 violation).
  // Now: Acknowledges click, explains status, provides actionable alternative.
  // This is the correct "graceful degradation" pattern — NOT a patch.
  // Will be upgraded to payment gateway modal when backend is ready.
  // Standard: FinTech UX — every CTA must have a response path.
  const addFundsBtn = document.getElementById('add-funds-btn');
  if (addFundsBtn) {
    addFundsBtn.addEventListener('click', () => {
      haptic.medium(); // UX-004: Confirm action feedback

      // UX PLATINUM FIX: Escrow Double-Click Anxiety (UI Freeze)
      const unlock = showProcessingLock(t('processing_secure', 'جاري إنشاء جلسة الدفع...'));

      setTimeout(() => {
        unlock();
        // Show inline feedback banner with actionable context
        const parent = addFundsBtn.parentElement;
        if (!parent) {
          return;
        }

        // Prevent duplicate banners
        if (parent.querySelector('#add-funds-banner')) {
          return;
        }

        const banner = document.createElement('div');
        banner.id = 'add-funds-banner';
        banner.className =
          'mt-3 rounded-xl p-3 text-xs font-medium flex items-center gap-2 bg-white/20 text-white backdrop-blur-sm animate-fade-in-up';
        // P2-UX-001 FIX: Replaced auto-dismiss setTimeout with user-controlled dismiss button.
        // Previous: Banner vanished after 5s — slow readers, cognitive disabilities couldn't finish reading.
        // Standard: WCAG 2.2.1 (Timing Adjustable), Nielsen #3 (User Control).
        banner.innerHTML = `
                  <i class="ph ph-info shrink-0 text-base" aria-hidden="true"></i>
                  <span class="flex-1">${escapeHtml(t('add_funds_coming_soon', 'إضافة الرصيد — قريباً'))}</span>
                  <button type="button" class="shrink-0 ms-2 p-1 rounded-full hover:bg-white/20 transition-colors" aria-label="${escapeHtml(t('common_dismiss', 'تجاهل'))}">
                      <i class="ph ph-x text-sm" aria-hidden="true"></i>
                  </button>
              `;
        parent.appendChild(banner);

        // Dismiss on button click
        banner.querySelector('button')?.addEventListener('click', () => {
          banner.classList.add('animate-fade-out');
          banner.addEventListener('animationend', () => banner.remove(), { once: true });
        });
      }, 1000);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
