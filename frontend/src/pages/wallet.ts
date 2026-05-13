import '../styles/main.css';
import { DONATIONS_ENABLED } from '../utils/feature-flags';
import { reportError, reportWarning } from '../error-reporter';
import { donations, payments } from '../api';
import { escapeHtml } from '../utils/xss';
import { formatCents } from '../utils/format';
import { formatDate } from '../utils/locale';
import { t } from '../utils/i18n';
import { initOfflineIndicator } from '../utils/offline-indicator';
import { guardSkeleton } from '../utils/skeleton-guard';
import { requireAuth } from '../utils/auth-guard';
// GAP-002 + GAP-010 FIX: Infrastructure wiring
import { initPullToRefresh } from '../utils/pull-refresh';
// UX-004 FIX: Haptic feedback for native-app tactile response
import { haptic } from '../utils/haptic';
import { initBackToTop } from '../components/back-to-top';
// GAP-N03 FIX: Global search overlay on inner pages
import { initSearch } from '../utils/search-overlay';
// INC-NEW-01 FIX: Unified page header — eliminates duplicate back-button wiring
import { initPageHeader } from '../components/page-header';
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

    // FORENSIC-C1.7 FIX: Donations API returns 503 when DONATIONS_ENABLED=false.
    // Wallet is a universal page — it must NOT depend on the suspended donation system.
    // When donations are suspended, show zeroed escrow balance gracefully.
    if (!DONATIONS_ENABLED) {
        if (balanceEl) { balanceEl.textContent = formatCents(0); }
        if (lockedEl) { lockedEl.classList.remove('animate-pulse'); lockedEl.textContent = `0 ${t('wallet_locked', 'locked')}`; }
        if (releasedEl) { releasedEl.classList.remove('animate-pulse'); releasedEl.textContent = `0 ${t('wallet_released', 'released')}`; }
        return;
    }

    try {
        const response = await donations.getMyEscrow();
        if (response.success && response.data) {
            // P3-AUD-NEW-003 FIX: Runtime guard — gracefully handle API shape drift
            const summary = response.data as Partial<EscrowSummary>;
            if (typeof summary.total_locked !== 'number') { return; }
            if (balanceEl) { balanceEl.textContent = formatCents(summary.total_locked); }
            // PLAT-UX-003 FIX (Part 2): Clear skeleton animation class after hydration.
            if (lockedEl) { lockedEl.classList.remove('animate-pulse'); lockedEl.textContent = `${summary.locked_count ?? 0} ${t('wallet_locked', 'locked')}`; }
            if (releasedEl) { releasedEl.classList.remove('animate-pulse'); releasedEl.textContent = `${summary.released_count ?? 0} ${t('wallet_released', 'released')}`; }
        }
    } catch (err) {
        reportWarning('[Wallet] Escrow summary load failed', { component: 'wallet', action: 'load_escrow', error: err instanceof Error ? err.message : String(err) });
        if (balanceEl) { balanceEl.textContent = '$0.00'; }
        // PLAT-UX-003 FIX (Part 2): Hydrate locked/released on failure — prevent frozen skeletons.
        if (lockedEl) { lockedEl.classList.remove('animate-pulse'); lockedEl.textContent = `0 ${t('wallet_locked', 'locked')}`; }
        if (releasedEl) { releasedEl.classList.remove('animate-pulse'); releasedEl.textContent = `0 ${t('wallet_released', 'released')}`; }
    }
}

// ─── Render Transaction Item ────────────────────────────────────────────────
function renderTransaction(tx: Transaction): string {
    const statusConfig: Record<string, { icon: string; color: string; label: string }> = {
        locked: { icon: 'lock-simple', color: 'text-trust-blue', label: t('wallet_status_locked', 'Locked') },
        released: { icon: 'check-circle', color: 'text-smoky-jade', label: t('wallet_status_released', 'Released') },
        refunded: { icon: 'arrow-counter-clockwise', color: 'text-warm-earth', label: t('wallet_status_refunded', 'Refunded') },
        completed: { icon: 'check-circle', color: 'text-smoky-jade', label: t('wallet_status_completed', 'Completed') },
        pending: { icon: 'clock', color: 'text-warning-yellow', label: t('wallet_status_pending', 'Pending') },
    };

    const config = statusConfig[tx.status] ?? { icon: 'clock', color: 'text-warning-yellow', label: t('wallet_status_pending', 'Pending') };

    return `
    <div class="bg-surface rounded-xl p-4 flex items-center gap-4 shadow-sm border border-slate-100 animate-fade-in-up dark:border-dark-border">
      <div class="size-10 bg-trust-blue/10 rounded-lg flex items-center justify-center shrink-0">
        <i class="ph ph-${config.icon} ${config.color}" aria-hidden="true"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold truncate">${escapeHtml(tx.material_name ?? tx.project_title ?? t('wallet_transaction', 'Transaction'))}</p>
        <p class="text-3xs text-slate-400 dark:text-slate-500">${formatDate(tx.created_at)}</p>
      </div>
      <div class="text-end shrink-0">
        <p class="text-sm font-bold ${config.color}">${formatCents(tx.amount)}</p>
        <p class="text-3xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">${config.label}</p>
      </div>
    </div>`;
}

// ─── Load Transaction History ───────────────────────────────────────────────
async function loadTransactions(): Promise<void> {
    const listEl = document.getElementById('transaction-list');
    if (!listEl) { return; }

    try {
        // FORENSIC-C1.7 FIX: Only fetch donation history when donations are enabled.
        // Previously this always called donations.getMyHistory() which returns 503
        // when DONATIONS_ENABLED=false on the backend, breaking the entire wallet page.
        const fetches: Promise<unknown>[] = [payments.getMyPayments()];
        if (DONATIONS_ENABLED) {
            fetches.push(donations.getMyHistory());
        }

        const [payRes, donRes] = await Promise.allSettled(fetches) as [
            PromiseSettledResult<Awaited<ReturnType<typeof payments.getMyPayments>>>,
            PromiseSettledResult<Awaited<ReturnType<typeof donations.getMyHistory>>> | undefined,
        ];

        const transactions: Transaction[] = [];

        if (donRes && donRes.status === 'fulfilled' && (donRes.value as { success: boolean; data?: unknown }).success && Array.isArray((donRes.value as { data?: unknown }).data)) {
            transactions.push(...((donRes.value as { data: Transaction[] }).data));
        }
        if (payRes.status === 'fulfilled' && (payRes.value as { success: boolean; data?: unknown }).success && Array.isArray((payRes.value as { data?: unknown }).data)) {
            transactions.push(...((payRes.value as { data: Transaction[] }).data));
        }

        if (transactions.length === 0) {
            // PLT-AUD-W04 FIX: Added animate-fade-in-up for smooth skeleton → empty state transition.
            //    Previous: instant swap — jarring on mobile. Balance card animates but this didn't.
            //    Standard: Material Design 3 (Staggered Entry), Visual Consistency.
            listEl.innerHTML = `
            <div class="text-center py-12 animate-fade-in-up">
              <i class="ph ph-wallet text-slate-300 nm-icon-48" aria-hidden="true"></i>
              <p class="text-slate-500 font-bold mt-4 dark:text-slate-400">${escapeHtml(t('wallet_no_transactions', 'No transactions yet'))}</p>
              <p class="text-slate-400 text-sm mt-1 dark:text-slate-500">${escapeHtml(t('wallet_history_description', 'Your donation and payment history will appear here'))}</p>
            </div>`;
            return;
        }

        // Sort by date descending
        transactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        listEl.innerHTML = transactions.map(renderTransaction).join('');
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[Wallet] Transaction history load failed'), { component: 'wallet', action: 'load_transactions' });
        listEl.innerHTML = `
        <div class="text-center py-8">
          <p class="text-slate-500 text-sm dark:text-slate-400">${escapeHtml(t('wallet_load_failed', 'Unable to load transactions. Please sign in.'))}</p>
          <a href="auth.html" class="btn-primary w-auto px-6 mt-4 inline-flex">${escapeHtml(t('wallet_sign_in', 'Sign In'))}</a>
        </div>`;
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

    // P3-UX-004 FIX: Guard skeleton loaders with timeout fallback
    const cancelSkeletonGuard = guardSkeleton({
        container: 'transaction-list',
        timeoutMs: 15000,
        onRetry: () => {
            cancelSkeletonGuard(); // Reset the guard
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
            depositDialog.showModal();
        });
        // P2-UX-002 FIX: Add "Coming Soon" badge to deposit button so users
        // know before tapping. Prevents the "click → nothing happened" frustration.
        const depositBtnLabel = depositBtn.querySelector('span[data-i18n]');
        if (depositBtnLabel && !depositBtn.querySelector('.nm-coming-soon-badge')) {
            const badge = document.createElement('span');
            badge.className = 'nm-coming-soon-badge text-3xs opacity-60 ms-1';
            badge.textContent = t('coming_soon_short', '(Soon)');
            badge.dataset.i18n = 'coming_soon_short';
            depositBtnLabel.after(badge);
        }
        // Wire dialog cancel button
        depositDialog.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
            depositDialog.close();
        });
        // Wire "Notify Me" button to show toast and close
        document.getElementById('deposit-notify-btn')?.addEventListener('click', () => {
            haptic.light();
            depositDialog.close();
            // Dynamic import: toast is only needed on this interaction path
            import('../utils/toast').then(({ showToast }) => {
                showToast(t('deposit_notify_confirmed', 'We\'ll notify you when deposits are available!'), 'success');
            }).catch(() => {
                /* Intentional: Toast module failed to load (network). Non-critical UX —
                   the deposit dialog already closed, user action was acknowledged. */
            });
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
            // Show inline feedback banner with actionable context
            const parent = addFundsBtn.parentElement;
            if (!parent) { return; }

            // Prevent duplicate banners
            if (parent.querySelector('#add-funds-banner')) { return; }

            const banner = document.createElement('div');
            banner.id = 'add-funds-banner';
            banner.className = 'mt-3 rounded-xl p-3 text-xs font-medium flex items-center gap-2 bg-white/20 text-white backdrop-blur-sm animate-fade-in-up';
            // P2-UX-001 FIX: Replaced auto-dismiss setTimeout with user-controlled dismiss button.
            // Previous: Banner vanished after 5s — slow readers, cognitive disabilities couldn't finish reading.
            // Standard: WCAG 2.2.1 (Timing Adjustable), Nielsen #3 (User Control).
            banner.innerHTML = `
                <i class="ph ph-info shrink-0 text-base" aria-hidden="true"></i>
                <span class="flex-1">${escapeHtml(t('add_funds_coming_soon', 'Direct deposits are coming soon. For now, fund projects directly from the project page.'))}</span>
                <button type="button" class="shrink-0 ms-2 p-1 rounded-full hover:bg-white/20 transition-colors" aria-label="${escapeHtml(t('common_dismiss', 'Dismiss'))}">
                    <i class="ph ph-x text-sm" aria-hidden="true"></i>
                </button>
            `;
            parent.appendChild(banner);

            // Dismiss on button click
            banner.querySelector('button')?.addEventListener('click', () => {
                banner.classList.add('animate-fade-out');
                banner.addEventListener('animationend', () => banner.remove(), { once: true });
            });
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
