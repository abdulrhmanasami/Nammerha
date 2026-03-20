import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';
/* INC-P3-001 FIX: Use shared toast utility instead of inline duplicate.
   Standard: DRY, Code Hygiene. */
import { showToast } from '../utils/toast';

/* ─── Concierge Escrow — Interactive Controller ─── */

interface EscrowCase {
    poNumber: string;
    amount: string;
    itemDesc: string;
    vendorId: string;
    vendorName: string;
    vendorAddress: string;
    invoiceNumber: string;
    gpsCoords: string;
    gpsAccuracy: string;
    timestamp: string;
    engineerName: string;
    engineerLicense: string;
}

const CASES: EscrowCase[] = [
    {
        poNumber: 'PO #PO-8821',
        amount: '$500.00',
        itemDesc: '50 Bags of Cement (Portland Type I)',
        vendorId: 'ALM-MAJID-CON-99',
        vendorName: 'Al-Majid Construction Materials',
        vendorAddress: 'Street 12, Industrial Area, Aleppo',
        invoiceNumber: '#INV-99022-A',
        gpsCoords: '33.8938° N, 35.5018° E',
        gpsAccuracy: 'Signal strength: High (Accuracy 1.2m)',
        timestamp: 'March 8, 2026 — 10:45 AST',
        engineerName: 'Khalid Al-Ahmad',
        engineerLicense: 'License: SYR-ENG-88221',
    },
    {
        poNumber: 'PO #PO-8834',
        amount: '$920.00',
        itemDesc: '8 Flush Doors (Standard 80×200cm)',
        vendorId: 'DMS-WOOD-SYR-12',
        vendorName: 'Damascus Woodworks Co.',
        vendorAddress: 'Al-Midan District, Damascus',
        invoiceNumber: '#INV-99035-B',
        gpsCoords: '33.5024° N, 36.2874° E',
        gpsAccuracy: 'Signal strength: High (Accuracy 0.8m)',
        timestamp: 'March 7, 2026 — 14:30 AST',
        engineerName: 'Fatima Nouri',
        engineerLicense: 'License: SYR-ENG-71104',
    },
    {
        poNumber: 'PO #PO-8901',
        amount: '$1,340.00',
        itemDesc: '20 Steel Reinforcement Bars (Ø12mm × 12m)',
        vendorId: 'ALP-STEEL-07',
        vendorName: 'Aleppo Steel Trading',
        vendorAddress: 'Sheikh Najjar Industrial City, Aleppo',
        invoiceNumber: '#INV-99041-C',
        gpsCoords: '36.2021° N, 37.1343° E',
        gpsAccuracy: 'Signal strength: Medium (Accuracy 3.5m)',
        timestamp: 'March 6, 2026 — 09:15 AST',
        engineerName: 'Omar Darwish',
        engineerLicense: 'License: SYR-ENG-55092',
    },
];

let currentCaseIndex = 0;
const resolvedCases: Set<number> = new Set();

document.addEventListener('DOMContentLoaded', () => {
    renderCase(currentCaseIndex);
    initNavigation();
    initActionButtons();
});

/* ─── Render Case Data ─── */
function renderCase(index: number): void {
    const c = CASES[index];
    if (!c) {
        return;
    }

    setText('po-number', c.poNumber);
    setText('po-amount', c.amount);
    setText('item-desc', c.itemDesc);
    setText('vendor-id', c.vendorId);
    setText('vendor-name', c.vendorName);
    setText('vendor-address', c.vendorAddress);
    setText('invoice-number', c.invoiceNumber);
    setText('invoice-total', `Total: ${c.amount}`);
    setText('gps-coords', c.gpsCoords);
    setText('gps-accuracy', c.gpsAccuracy);
    setText('timestamp', c.timestamp);
    setText('engineer-name', c.engineerName);
    setText('engineer-license', c.engineerLicense);
    setText('current-case', String(index + 1));

    /* Reset or disable buttons based on resolved state */
    const releaseBtn = document.getElementById('release-btn') as HTMLButtonElement | null;
    const flagBtn = document.getElementById('flag-btn') as HTMLButtonElement | null;

    if (resolvedCases.has(index)) {
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
            releaseBtn.innerHTML = `<i class="ph ph-check-circle text-lg" aria-hidden="true"></i> ${t('esc_release_funds', 'Match Verified: Release Funds to Vendor')}`;
            releaseBtn.classList.remove('bg-smoky-jade');
            releaseBtn.classList.add('bg-trust-blue');
        }
        if (flagBtn) {
            flagBtn.disabled = false;
            flagBtn.classList.remove('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
            flagBtn.innerHTML = `<i class="ph ph-warning-diamond text-lg" aria-hidden="true"></i> ${t('esc_flag_discrepancy', 'Flag Discrepancy')}`;
            flagBtn.classList.remove('border-rose-300', 'text-rose-600', 'bg-rose-50');
            flagBtn.classList.add('border-slate-200', 'text-slate-700');
        }
    }
}

function setText(id: string, value: string): void {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

/* ─── Case Navigation ─── */
function initNavigation(): void {
    const prevBtn = document.getElementById('prev-case') as HTMLButtonElement | null;
    const nextBtn = document.getElementById('next-case') as HTMLButtonElement | null;

    if (!prevBtn || !nextBtn) {
        return;
    }

    const updateNav = (): void => {
        prevBtn.disabled = currentCaseIndex === 0;
        nextBtn.disabled = currentCaseIndex === CASES.length - 1;
    };

    prevBtn.addEventListener('click', () => {
        if (currentCaseIndex > 0) {
            currentCaseIndex--;
            renderCase(currentCaseIndex);
            updateNav();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentCaseIndex < CASES.length - 1) {
            currentCaseIndex++;
            renderCase(currentCaseIndex);
            updateNav();
        }
    });

    updateNav();
}

/* ─── Action Buttons ─── */
function initActionButtons(): void {
    const releaseBtn = document.getElementById('release-btn') as HTMLButtonElement | null;
    const flagBtn = document.getElementById('flag-btn') as HTMLButtonElement | null;

    // FIX-03: Click-twice-to-confirm replaces blocking confirm() for release.
    let releasePending = false;

    if (releaseBtn) {
        releaseBtn.addEventListener('click', () => {
            const c = CASES[currentCaseIndex];
            if (!c) { return; }

            if (!releasePending) {
                // First click: confirmation state
                releasePending = true;
                releaseBtn.classList.remove('bg-trust-blue');
                releaseBtn.classList.add('bg-amber-500');
                releaseBtn.innerHTML = `<i class="ph ph-warning text-lg" aria-hidden="true"></i> ${t('esc_confirm_release', 'Click again to release')} ${esc(c.amount)}`;
                // Auto-reset after 5s
                setTimeout(() => {
                    if (releasePending) {
                        releasePending = false;
                        releaseBtn.classList.remove('bg-amber-500');
                        releaseBtn.classList.add('bg-trust-blue');
                        releaseBtn.innerHTML = `<i class="ph ph-check-circle text-lg" aria-hidden="true"></i> ${t('esc_release_funds', 'Match Verified: Release Funds to Vendor')}`;
                    }
                }, 5000);
                return;
            }

            // Second click: execute release
            releasePending = false;
            resolvedCases.add(currentCaseIndex);
            releaseBtn.disabled = true;
            releaseBtn.classList.remove('bg-trust-blue', 'bg-amber-500');
            releaseBtn.classList.add('bg-smoky-jade', 'cursor-not-allowed');
            releaseBtn.innerHTML = `<i class="ph ph-check-circle text-lg" aria-hidden="true"></i> ${t('esc_funds_released', 'Funds Released — Audit Trail Updated')}`;

            if (flagBtn) {
                flagBtn.disabled = true;
                flagBtn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
            }

            showToast(`${t('esc_released_toast', 'Escrow released')}: ${c.amount} → ${c.vendorName}`, 'success');
        });
    }

    // FIX-03: Inline reason input replaces blocking prompt() for flagging.
    if (flagBtn) {
        let flagInputVisible = false;
        let flagInput: HTMLInputElement | null = null;

        flagBtn.addEventListener('click', () => {
            const c = CASES[currentCaseIndex];
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
                flagBtn.innerHTML = `<i class="ph ph-flag text-lg" aria-hidden="true"></i> ${t('esc_submit_flag', 'Submit Flag')}`;
                flagBtn.classList.add('border-rose-300', 'text-rose-600');
                return;
            }

            // Second click: submit flag
            const reason = flagInput?.value.trim() ?? '';
            if (reason === '') {
                showToast(t('esc_reason_required', 'A reason is required to flag a discrepancy.'));
                flagInput?.focus();
                return;
            }

            flagInputVisible = false;
            flagInput?.remove();
            resolvedCases.add(currentCaseIndex);
            flagBtn.disabled = true;
            flagBtn.classList.remove('border-slate-200', 'text-slate-700');
            flagBtn.classList.add('border-rose-300', 'text-rose-600', 'bg-rose-50', 'cursor-not-allowed');
            flagBtn.innerHTML = `<i class="ph ph-flag text-lg" aria-hidden="true"></i> ${t('esc_discrepancy_flagged', '⚠ Discrepancy Flagged')}`;

            if (releaseBtn) {
                releaseBtn.disabled = true;
                releaseBtn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
            }

            showToast(`${t('esc_flagged_toast', 'Flagged')}: "${esc(reason)}" — ${t('esc_under_investigation', 'Under investigation')}`);
        });
    }
}

/* INC-P3-001: Inline showToast() removed — using shared import from utils/toast.ts */
