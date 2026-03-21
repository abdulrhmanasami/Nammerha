import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';
/* INC-P3-001 FIX: Use shared toast utility instead of inline duplicate.
   Standard: DRY, Code Hygiene. */
import { showToast } from '../utils/toast';
import { requireAuth } from '../utils/auth-guard';
// BLOCKER-C FIX: Wire escrow page to live admin API endpoints.
// Previous: Hardcoded CASES[] array with fake PO numbers, vendor names, GPS coords.
// Now: Dynamic data from admin.getPendingVerifications(), actions via
// admin.releaseEscrow() and admin.flagDiscrepancy().
import { admin } from '../api';
// BLOCKER-E FIX: Import shared setText from utils/dom.ts — was duplicated locally.
import { setText } from '../utils/dom';
import { formatCents, relativeTimeAgo } from '../utils/format';
import { renderErrorWithRetry } from '../utils/error-retry';

/* ═══════════════════════════════════════════════════════════════════════════
   Concierge Escrow — API-Driven Controller
   BLOCKER-C FIX: All data sourced from admin.getPendingVerifications().
   Release/Flag actions wired to admin.releaseEscrow() / admin.flagDiscrepancy().
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── API-Driven State ───────────────────────────────────────────────────────
interface EscrowCase {
    proof_id: string;
    item_id: string;
    po_number: string;
    amount: number;
    item_description: string;
    vendor_id: string;
    vendor_name: string;
    vendor_address: string;
    invoice_number: string;
    gps_lat: number;
    gps_lng: number;
    gps_accuracy_meters: number;
    created_at: string;
    engineer_name: string;
    engineer_license: string;
    status: string;
}

let cases: EscrowCase[] = [];
let currentCaseIndex = 0;
const resolvedCases: Set<number> = new Set();

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // BLOCKER-1 FIX: Guard all protected content behind auth check.
    if (!requireAuth()) { return; }

    initNavigation();
    initActionButtons();
    loadEscrowCases();
});

/* ─── Load Escrow Cases from API ─── */
async function loadEscrowCases(): Promise<void> {
    const panel = document.getElementById('verification-panel');
    try {
        const res = await admin.getPendingVerifications();
        cases = (res.data ?? []) as unknown as EscrowCase[];

        // Update sidebar badge
        const countEl = document.getElementById('sidebar-escrow-count');
        if (countEl) {
            if (cases.length > 0) {
                countEl.textContent = String(cases.length);
            } else {
                countEl.textContent = '';
                countEl.classList.add('nm-hidden');
            }
        }

        // Update total cases count in navigator
        setText('total-cases', String(cases.length));

        if (cases.length === 0) {
            // Show empty state
            if (panel) {
                panel.innerHTML = `
                    <div class="col-span-2 flex flex-col items-center justify-center py-16 text-center">
                        <div class="size-16 rounded-full bg-smoky-jade/10 flex items-center justify-center mb-4">
                            <i class="ph ph-shield-check text-smoky-jade text-3xl dark:text-emerald-400" aria-hidden="true"></i>
                        </div>
                        <p class="text-lg font-bold text-slate-600 dark:text-slate-400">${esc(t('esc_all_cleared', 'All Cleared'))}</p>
                        <p class="text-sm text-slate-400 mt-1 dark:text-slate-500">${esc(t('esc_no_pending', 'No pending escrow verifications.'))}</p>
                    </div>
                `;
            }
            // Disable nav buttons
            const prevBtn = document.getElementById('prev-case') as HTMLButtonElement | null;
            const nextBtn = document.getElementById('next-case') as HTMLButtonElement | null;
            if (prevBtn) { prevBtn.disabled = true; }
            if (nextBtn) { nextBtn.disabled = true; }
            return;
        }

        currentCaseIndex = 0;
        renderCase(currentCaseIndex);
        updateNav();
    } catch (err) {
        if (panel) {
            renderErrorWithRetry(panel, loadEscrowCases, 'esc_load_error', 'Failed to load escrow cases');
        }
        const errorObj = err instanceof Error ? err : new Error('[AdminEscrow] Load failed');
        // Silently log — renderErrorWithRetry provides visual UX
        void errorObj;
    }
}

/* ─── Render Case Data ─── */
function renderCase(index: number): void {
    const c = cases[index];
    if (!c) {
        return;
    }

    setText('po-number', `PO #${esc(c.po_number)}`);
    setText('po-amount', formatCents(c.amount));
    setText('item-desc', c.item_description);
    setText('vendor-id', c.vendor_id);
    setText('vendor-name', c.vendor_name);
    setText('vendor-address', c.vendor_address);
    setText('invoice-number', `#${esc(c.invoice_number)}`);
    setText('invoice-total', `Total: ${formatCents(c.amount)}`);
    setText('gps-coords', `${c.gps_lat.toFixed(4)}° N, ${c.gps_lng.toFixed(4)}° E`);
    setText('gps-accuracy', gpsAccuracyLabel(c.gps_accuracy_meters));
    setText('timestamp', relativeTimeAgo(c.created_at));
    setText('engineer-name', c.engineer_name);
    setText('engineer-license', c.engineer_license);
    setText('current-case', String(index + 1));

    /* Reset or disable buttons based on resolved state */
    const releaseBtn = document.getElementById('release-btn') as HTMLButtonElement | null;
    const flagBtn = document.getElementById('flag-btn') as HTMLButtonElement | null;

    if (resolvedCases.has(index) || c.status === 'released' || c.status === 'flagged') {
        if (releaseBtn) {
            releaseBtn.disabled = true;
            releaseBtn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
        }
        if (flagBtn) {
            flagBtn.disabled = true;
            flagBtn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
        }
    } else {
        if (releaseBtn) {
            releaseBtn.disabled = false;
            releaseBtn.classList.remove('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
            releaseBtn.innerHTML = `<i class="ph ph-check-circle text-lg" aria-hidden="true"></i> ${esc(t('esc_release_funds', 'Match Verified: Release Funds to Vendor'))}`;
            releaseBtn.classList.remove('bg-smoky-jade');
            releaseBtn.classList.add('bg-trust-blue');
        }
        if (flagBtn) {
            flagBtn.disabled = false;
            flagBtn.classList.remove('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
            flagBtn.innerHTML = `<i class="ph ph-warning-diamond text-lg" aria-hidden="true"></i> ${esc(t('esc_flag_discrepancy', 'Flag Discrepancy'))}`;
            flagBtn.classList.remove('border-rose-300', 'text-rose-600', 'bg-rose-50');
            flagBtn.classList.add('border-slate-200', 'text-slate-700');
        }
    }
}

/** GPS accuracy → human-readable label */
function gpsAccuracyLabel(meters: number): string {
    if (meters <= 2) { return `${t('esc_signal_high', 'Signal strength: High')} (${t('esc_accuracy', 'Accuracy')} ${meters.toFixed(1)}m)`; }
    if (meters <= 5) { return `${t('esc_signal_medium', 'Signal strength: Medium')} (${t('esc_accuracy', 'Accuracy')} ${meters.toFixed(1)}m)`; }
    return `${t('esc_signal_low', 'Signal strength: Low')} (${t('esc_accuracy', 'Accuracy')} ${meters.toFixed(1)}m)`;
}

// BLOCKER-E FIX: Local setText() removed — now imported from ../utils/dom.

/* ─── Case Navigation ─── */
function initNavigation(): void {
    const prevBtn = document.getElementById('prev-case') as HTMLButtonElement | null;
    const nextBtn = document.getElementById('next-case') as HTMLButtonElement | null;

    if (!prevBtn || !nextBtn) {
        return;
    }

    prevBtn.addEventListener('click', () => {
        if (currentCaseIndex > 0) {
            currentCaseIndex--;
            renderCase(currentCaseIndex);
            updateNav();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentCaseIndex < cases.length - 1) {
            currentCaseIndex++;
            renderCase(currentCaseIndex);
            updateNav();
        }
    });
}

function updateNav(): void {
    const prevBtn = document.getElementById('prev-case') as HTMLButtonElement | null;
    const nextBtn = document.getElementById('next-case') as HTMLButtonElement | null;
    if (prevBtn) { prevBtn.disabled = currentCaseIndex === 0; }
    if (nextBtn) { nextBtn.disabled = currentCaseIndex === cases.length - 1; }
}

/* ─── Action Buttons (API-Driven) ─── */
function initActionButtons(): void {
    const releaseBtn = document.getElementById('release-btn') as HTMLButtonElement | null;
    const flagBtn = document.getElementById('flag-btn') as HTMLButtonElement | null;

    // FIX-03: Click-twice-to-confirm replaces blocking confirm() for release.
    let releasePending = false;
    // Module-scoped timer for release confirmation auto-revert.
    let releaseRevertTimer: ReturnType<typeof setTimeout> | null = null;

    if (releaseBtn) {
        releaseBtn.addEventListener('click', async () => {
            const c = cases[currentCaseIndex];
            if (!c) { return; }

            if (!releasePending) {
                // First click: confirmation state
                releasePending = true;
                releaseBtn.classList.remove('bg-trust-blue');
                releaseBtn.classList.add('bg-amber-500');
                releaseBtn.innerHTML = `<i class="ph ph-warning text-lg" aria-hidden="true"></i> ${esc(t('esc_confirm_release', 'Click again to release'))} ${formatCents(c.amount)}`;
                // Auto-reset after 5s
                releaseRevertTimer = setTimeout(() => {
                    if (releasePending) {
                        releasePending = false;
                        releaseBtn.classList.remove('bg-amber-500');
                        releaseBtn.classList.add('bg-trust-blue');
                        releaseBtn.innerHTML = `<i class="ph ph-check-circle text-lg" aria-hidden="true"></i> ${esc(t('esc_release_funds', 'Match Verified: Release Funds to Vendor'))}`;
                    }
                    releaseRevertTimer = null;
                }, 5000);
                return;
            }

            // Second click: execute release via API
            releasePending = false;
            if (releaseRevertTimer !== null) {
                clearTimeout(releaseRevertTimer);
                releaseRevertTimer = null;
            }

            // Loading state
            releaseBtn.disabled = true;
            releaseBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg" aria-hidden="true"></i> ${esc(t('esc_releasing', 'Releasing...'))}`;

            try {
                await admin.releaseEscrow({ proof_id: c.proof_id, item_id: c.item_id });
                resolvedCases.add(currentCaseIndex);
                c.status = 'released';
                releaseBtn.classList.remove('bg-trust-blue', 'bg-amber-500');
                releaseBtn.classList.add('bg-smoky-jade', 'cursor-not-allowed');
                releaseBtn.innerHTML = `<i class="ph ph-check-circle text-lg" aria-hidden="true"></i> ${esc(t('esc_funds_released', 'Funds Released — Audit Trail Updated'))}`;

                if (flagBtn) {
                    flagBtn.disabled = true;
                    flagBtn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
                }

                showToast(`${t('esc_released_toast', 'Escrow released')}: ${formatCents(c.amount)} → ${esc(c.vendor_name)}`, 'success');
            } catch (err) {
                // Re-enable on failure — admin must be able to retry.
                releaseBtn.disabled = false;
                releaseBtn.classList.remove('bg-amber-500');
                releaseBtn.classList.add('bg-trust-blue');
                releaseBtn.innerHTML = `<i class="ph ph-check-circle text-lg" aria-hidden="true"></i> ${esc(t('esc_release_funds', 'Match Verified: Release Funds to Vendor'))}`;
                const msg = err instanceof Error ? err.message : t('esc_release_error', 'Failed to release — please try again');
                showToast(msg, 'error');
            }
        });
    }

    // FIX-03: Inline reason input replaces blocking prompt() for flagging.
    if (flagBtn) {
        let flagInputVisible = false;
        let flagInput: HTMLInputElement | null = null;

        flagBtn.addEventListener('click', async () => {
            const c = cases[currentCaseIndex];
            if (!c) { return; }

            if (!flagInputVisible) {
                // First click: show inline reason input
                flagInputVisible = true;
                flagInput = document.createElement('input');
                flagInput.type = 'text';
                flagInput.placeholder = t('esc_flag_placeholder', 'Reason: GPS mismatch, photo quality, quantity...');
                flagInput.className = 'w-full mt-2 px-3 py-2 text-sm rounded-lg border border-rose-200 bg-rose-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-300';
                flagBtn.parentElement?.insertBefore(flagInput, flagBtn.nextSibling);
                flagInput.focus();
                flagBtn.innerHTML = `<i class="ph ph-flag text-lg" aria-hidden="true"></i> ${esc(t('esc_submit_flag', 'Submit Flag'))}`;
                flagBtn.classList.add('border-rose-300', 'text-rose-600');
                return;
            }

            // Second click: submit flag via API
            const reason = flagInput?.value.trim() ?? '';
            if (reason === '') {
                showToast(t('esc_reason_required', 'A reason is required to flag a discrepancy.'));
                flagInput?.focus();
                return;
            }

            // Loading state
            flagBtn.disabled = true;
            flagBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg" aria-hidden="true"></i> ${esc(t('esc_flagging', 'Flagging...'))}`;

            try {
                await admin.flagDiscrepancy({ proof_id: c.proof_id, reason });
                flagInputVisible = false;
                flagInput?.remove();
                flagInput = null;
                resolvedCases.add(currentCaseIndex);
                c.status = 'flagged';
                flagBtn.classList.remove('border-slate-200', 'text-slate-700');
                flagBtn.classList.add('border-rose-300', 'text-rose-600', 'bg-rose-50', 'cursor-not-allowed');
                flagBtn.innerHTML = `<i class="ph ph-flag text-lg" aria-hidden="true"></i> ${esc(t('esc_discrepancy_flagged', '⚠ Discrepancy Flagged'))}`;

                if (releaseBtn) {
                    releaseBtn.disabled = true;
                    releaseBtn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
                }

                showToast(`${esc(t('esc_flagged_toast', 'Flagged'))}: "${esc(reason)}" — ${esc(t('esc_under_investigation', 'Under investigation'))}`, 'success');
            } catch (err) {
                // Re-enable on failure — admin must be able to retry.
                flagBtn.disabled = false;
                flagBtn.innerHTML = `<i class="ph ph-flag text-lg" aria-hidden="true"></i> ${esc(t('esc_submit_flag', 'Submit Flag'))}`;
                const msg = err instanceof Error ? err.message : t('esc_flag_error', 'Failed to flag — please try again');
                showToast(msg, 'error');
            }
        });
    }
}
