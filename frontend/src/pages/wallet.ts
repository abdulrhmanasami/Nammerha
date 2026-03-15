import '../styles/main.css';
import { reportError, reportWarning } from '../error-reporter';
import { donations, payments } from '../api';
import { escapeHtml } from '../utils/xss';
import { formatCents } from '../utils/format';
import { formatDate } from '../utils/locale';
import { t } from '../utils/i18n';

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
    const balanceEl = document.getElementById('escrow-balance');
    const lockedEl = document.getElementById('locked-count');
    const releasedEl = document.getElementById('released-count');

    try {
        const response = await donations.getMyEscrow();
        if (response.success && response.data) {
            const summary = response.data as EscrowSummary;
            if (balanceEl) { balanceEl.textContent = formatCents(summary.total_locked); }
            if (lockedEl) { lockedEl.textContent = `${summary.locked_count} ${t('wallet_locked', 'locked')}`; }
            if (releasedEl) { releasedEl.textContent = `${summary.released_count} ${t('wallet_released', 'released')}`; }
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
    <div class="bg-surface rounded-xl p-4 flex items-center gap-4 shadow-sm border border-slate-100 dark:border-slate-700 animate-fade-in-up">
      <div class="size-10 bg-trust-blue/10 rounded-lg flex items-center justify-center shrink-0">
        <i class="ph ph-${config.icon} ${config.color}" aria-hidden="true"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold truncate">${escapeHtml(tx.material_name ?? tx.project_title ?? t('wallet_transaction', 'Transaction'))}</p>
        <p class="text-[10px] text-slate-400">${formatDate(tx.created_at)}</p>
      </div>
      <div class="text-right shrink-0">
        <p class="text-sm font-bold ${config.color}">${formatCents(tx.amount)}</p>
        <p class="text-[9px] font-bold uppercase tracking-wider text-slate-400">${config.label}</p>
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
            listEl.innerHTML = `
            <div class="text-center py-12">
              <i class="ph ph-wallet text-slate-300" style="font-size:48px" aria-hidden="true"></i>
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
          <a href="auth.html" class="btn-primary !w-auto !px-6 mt-4 inline-flex">${t('wallet_sign_in', 'Sign In')}</a>
        </div>`;
    }
}

// ─── Initialize ─────────────────────────────────────────────────────────────
function init(): void {
    loadEscrowSummary();
    loadTransactions();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
