import '../styles/main.css';
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

    try {
        const response = await donations.getMyEscrow();
        if (response.success && response.data) {
            // P3-AUD-NEW-003 FIX: Runtime guard — gracefully handle API shape drift
            const summary = response.data as Partial<EscrowSummary>;
            if (typeof summary.total_locked !== 'number') { return; }
            if (balanceEl) { balanceEl.textContent = formatCents(summary.total_locked); }
            if (lockedEl) { lockedEl.textContent = `${summary.locked_count ?? 0} ${t('wallet_locked', 'locked')}`; }
            if (releasedEl) { releasedEl.textContent = `${summary.released_count ?? 0} ${t('wallet_released', 'released')}`; }
        }
    } catch (err) {
        reportWarning('[Wallet] Escrow summary load failed', { component: 'wallet', action: 'load_escrow', error: err instanceof Error ? err.message : String(err) });
        if (balanceEl) { balanceEl.textContent = '$0.00'; }
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
    <div class="bg-surface rounded-xl p-4 flex items-center gap-4 shadow-sm border border-slate-100 animate-fade-in-up">
      <div class="size-10 bg-trust-blue/10 rounded-lg flex items-center justify-center shrink-0">
        <i class="ph ph-${config.icon} ${config.color}" aria-hidden="true"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold truncate">${escapeHtml(tx.material_name ?? tx.project_title ?? t('wallet_transaction', 'Transaction'))}</p>
        <p class="text-[10px] text-slate-400">${formatDate(tx.created_at)}</p>
      </div>
      <div class="text-end shrink-0">
        <p class="text-sm font-bold ${config.color}">${formatCents(tx.amount)}</p>
        <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${config.label}</p>
      </div>
    </div>`;
}

// ─── Load Transaction History ───────────────────────────────────────────────
async function loadTransactions(): Promise<void> {
    const listEl = document.getElementById('transaction-list');
    if (!listEl) { return; }

    try {
        const [donRes, payRes] = await Promise.allSettled([
            donations.getMyHistory(),
            payments.getMyPayments(),
        ]);

        const transactions: Transaction[] = [];

        if (donRes.status === 'fulfilled' && donRes.value.success && Array.isArray(donRes.value.data)) {
            transactions.push(...(donRes.value.data as Transaction[]));
        }
        if (payRes.status === 'fulfilled' && payRes.value.success && Array.isArray(payRes.value.data)) {
            transactions.push(...(payRes.value.data as Transaction[]));
        }

        if (transactions.length === 0) {
            // PLT-AUD-W04 FIX: Added animate-fade-in-up for smooth skeleton → empty state transition.
            //    Previous: instant swap — jarring on mobile. Balance card animates but this didn't.
            //    Standard: Material Design 3 (Staggered Entry), Visual Consistency.
            listEl.innerHTML = `
            <div class="text-center py-12 animate-fade-in-up">
              <i class="ph ph-wallet text-slate-300 nm-icon-48"  aria-hidden="true"></i>
              <p class="text-slate-500 font-bold mt-4">${t('wallet_no_transactions', 'No transactions yet')}</p>
              <p class="text-slate-400 text-sm mt-1">${t('wallet_history_description', 'Your donation and payment history will appear here')}</p>
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
          <p class="text-slate-500 text-sm">${t('wallet_load_failed', 'Unable to load transactions. Please sign in.')}</p>
          <a href="auth.html" class="btn-primary w-auto px-6 mt-4 inline-flex">${t('wallet_sign_in', 'Sign In')}</a>
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
            banner.innerHTML = `
                <i class="ph ph-info shrink-0 text-base"  aria-hidden="true"></i>
                <span>${t('add_funds_coming_soon', 'Direct deposits are coming soon. For now, fund projects directly from the project page.')}</span>
            `;
            parent.appendChild(banner);

            // Auto-dismiss after 5s
            setTimeout(() => banner.remove(), 5000);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
