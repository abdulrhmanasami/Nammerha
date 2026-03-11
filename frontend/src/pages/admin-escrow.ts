import '../styles/main.css';
import { escapeHtml as esc } from '../utils/xss';

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
            releaseBtn.innerHTML = `<i class="ph ph-check-circle" style="font-size:18px" aria-hidden="true"></i> Match Verified: Release Funds to Vendor`;
            releaseBtn.classList.remove('bg-smoky-jade');
            releaseBtn.classList.add('bg-trust-blue');
        }
        if (flagBtn) {
            flagBtn.disabled = false;
            flagBtn.classList.remove('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
            flagBtn.innerHTML = `<i class="ph ph-warning-diamond" style="font-size:18px" aria-hidden="true"></i> Flag Discrepancy`;
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

    if (releaseBtn) {
        releaseBtn.addEventListener('click', () => {
            const c = CASES[currentCaseIndex];
            if (!c) {
                return;
            }

            const confirmed = confirm(
                `Match Verified: Release Funds?\n\n` +
                `PO: ${c.poNumber}\n` +
                `Amount: ${c.amount}\n` +
                `Vendor: ${c.vendorName} (${c.vendorId})\n` +
                `Engineer: ${c.engineerName}\n\n` +
                `This will:\n` +
                `• Release ${c.amount} from escrow to vendor\n` +
                `• Notify all contributing donors\n` +
                `• Create immutable audit trail entry\n\n` +
                `This action is irreversible.`
            );

            if (!confirmed) {
                return;
            }

            resolvedCases.add(currentCaseIndex);
            releaseBtn.disabled = true;
            releaseBtn.classList.remove('bg-trust-blue');
            releaseBtn.classList.add('bg-smoky-jade', 'cursor-not-allowed');
            releaseBtn.innerHTML = `<i class="ph ph-check-circle" style="font-size:18px" aria-hidden="true"></i> ✓ Funds Released — Audit Trail Updated`;

            if (flagBtn) {
                flagBtn.disabled = true;
                flagBtn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
            }

            showToast(`Escrow released: ${c.amount} to ${c.vendorName}`);
        });
    }

    if (flagBtn) {
        flagBtn.addEventListener('click', () => {
            const c = CASES[currentCaseIndex];
            if (!c) {
                return;
            }

            const reason = prompt(
                `Flag Discrepancy — ${c.poNumber}\n\n` +
                `Enter reason (GPS mismatch, photo quality, quantity discrepancy, etc.):`
            );

            if (reason === null) {
                return;
            }
            if (reason.trim() === '') {
                alert('A reason is required to flag a discrepancy.');
                return;
            }

            resolvedCases.add(currentCaseIndex);
            flagBtn.disabled = true;
            flagBtn.classList.remove('border-slate-200', 'text-slate-700');
            flagBtn.classList.add('border-rose-300', 'text-rose-600', 'bg-rose-50', 'cursor-not-allowed');
            flagBtn.innerHTML = `<i class="ph ph-flag" style="font-size:18px" aria-hidden="true"></i> ⚠ Discrepancy Flagged`;

            if (releaseBtn) {
                releaseBtn.disabled = true;
                releaseBtn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
            }

            showToast(`Flagged: "${reason}" — Under investigation`);
        });
    }
}

/* ─── Toast ─── */
function showToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 z-50';
    toast.style.animation = 'slideUp 0.3s ease-out';
    toast.innerHTML = `
    <i class="ph ph-check-circle text-smoky-jade" style="font-size:18px" aria-hidden="true"></i>
    <span class="text-sm font-medium">${esc(message)}</span>
  `;

    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
