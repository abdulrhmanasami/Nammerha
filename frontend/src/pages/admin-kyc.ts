import '../styles/main.css';
import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';
/* INC-P3-001 FIX: Use shared toast utility instead of inline duplicate.
   Standard: DRY, Code Hygiene. */
import { showToast } from '../utils/toast';

/* ─── KYC Verification Portal — Interactive Controller ─── */

interface KycApplicant {
    name: string;
    role: 'engineer' | 'supplier';
    submitted: string;
    documents: KycDocument[];
}

interface KycDocument {
    name: string;
    type: string;
    icon: string;
    size: string;
}

const APPLICANTS: KycApplicant[] = [
    {
        name: 'Ahmad Al-Khatib',
        role: 'engineer',
        submitted: '2 hours ago',
        documents: [
            { name: 'Engineering Union License', type: 'PDF', icon: 'ph ph-certificate', size: '1.2 MB' },
            { name: 'National ID (Front & Back)', type: 'Image', icon: 'ph ph-identification-card', size: '850 KB' },
        ],
    },
    {
        name: 'Damascus Building Supplies LLC',
        role: 'supplier',
        submitted: '5 hours ago',
        documents: [
            { name: 'Commercial Trade Registration', type: 'PDF', icon: 'ph ph-scroll', size: '2.1 MB' },
            { name: 'Tax Clearance Certificate', type: 'PDF', icon: 'ph ph-stamp', size: '780 KB' },
            { name: 'Company Ownership Deed', type: 'PDF', icon: 'ph ph-buildings', size: '1.5 MB' },
        ],
    },
    {
        name: 'Layla Mansour',
        role: 'engineer',
        submitted: '1 day ago',
        documents: [
            { name: 'Syrian Engineering Syndicate Card', type: 'Image', icon: 'ph ph-identification-badge', size: '640 KB' },
            { name: 'University Degree (Civil Eng.)', type: 'PDF', icon: 'ph ph-graduation-cap', size: '1.8 MB' },
        ],
    },
    {
        name: 'Homs Industrial Metals',
        role: 'supplier',
        submitted: '2 days ago',
        documents: [
            { name: 'Trade License', type: 'PDF', icon: 'ph ph-storefront', size: '990 KB' },
            { name: 'Industrial Zone Permit', type: 'PDF', icon: 'ph ph-factory', size: '1.1 MB' },
        ],
    },
    {
        name: 'Youssef Haddad',
        role: 'engineer',
        submitted: '3 days ago',
        documents: [
            { name: 'Professional License (Structural)', type: 'PDF', icon: 'ph ph-certificate', size: '1.4 MB' },
        ],
    },
];

let selectedIndex = -1;
const resolvedApplicants: Map<number, 'verified' | 'rejected'> = new Map();

document.addEventListener('DOMContentLoaded', () => {
    initRowSelection();
    initDropZone();
    initActionButtons();
});

/* ─── Row Selection ─── */
function initRowSelection(): void {
    const rows = document.querySelectorAll<HTMLElement>('.kyc-row');

    rows.forEach((row) => {
        /* Click handler */
        row.addEventListener('click', () => {
            selectRow(row, rows);
        });

        /* FRIC-P3-003 FIX: Keyboard navigation for WCAG 2.1.1.
           Enter/Space selects the row. ArrowUp/Down moves focus.
           Standard: WCAG 2.1.1 (Keyboard), WAI-ARIA Practices (Listbox). */
        row.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectRow(row, rows);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = row.nextElementSibling as HTMLElement | null;
                if (next?.classList.contains('kyc-row')) {
                    next.focus();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = row.previousElementSibling as HTMLElement | null;
                if (prev?.classList.contains('kyc-row')) {
                    prev.focus();
                }
            }
        });
    });
}

/* ─── Select Row Helper ─── */
function selectRow(row: HTMLElement, rows: NodeListOf<HTMLElement>): void {
    const index = parseInt(row.dataset.index ?? '-1', 10);
    if (index < 0 || index >= APPLICANTS.length) {
        return;
    }

    selectedIndex = index;

    /* Highlight selected — INC-P3-005 FIX: border-l-2 → border-s-2 for RTL.
       Standard: RTL UX, BiDi Correctness. */
    rows.forEach((r) => {
        r.classList.remove('bg-trust-blue/5', 'border-s-2', 'border-trust-blue');
        r.setAttribute('aria-selected', 'false');
    });
    row.classList.add('bg-trust-blue/5', 'border-s-2', 'border-trust-blue');
    row.setAttribute('aria-selected', 'true');

    renderDocumentViewer(index);
}

/* ─── Render Document Viewer ─── */
function renderDocumentViewer(index: number): void {
    const applicant = APPLICANTS[index];
    if (!applicant) {
        return;
    }

    const empty = document.getElementById('viewer-empty');
    const content = document.getElementById('viewer-content');
    const title = document.getElementById('viewer-title');
    const subtitle = document.getElementById('viewer-subtitle');
    const docList = document.getElementById('doc-list');
    const actionButtons = document.getElementById('action-buttons');

    if (empty) {
        empty.classList.add('hidden');
    }
    if (content) {
        content.classList.remove('hidden');
    }
    if (title) {
        title.textContent = applicant.name;
    }
    if (subtitle) {
        const roleLabel = applicant.role === 'engineer' ? t('kyc_role_engineer', 'Engineer') : t('kyc_role_supplier', 'Supplier');
        subtitle.textContent = `${roleLabel} • ${t('kyc_submitted', 'Submitted')} ${applicant.submitted}`;
    }

    /* Render document list */
    if (docList) {
        docList.innerHTML = applicant.documents
            .map(
                (doc) => `
      <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
        <div class="size-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
          <i class="${doc.icon} text-trust-blue" style="font-size:18px" aria-hidden="true"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">${esc(doc.name)}</p>
          <p class="text-[10px] text-slate-400">${esc(doc.type)} • ${esc(doc.size)}</p>
        </div>
        <i class="ph ph-eye text-slate-400 hover:text-trust-blue cursor-pointer transition-colors" style="font-size:16px" aria-hidden="true"></i>
      </div>
    `
            )
            .join('');
    }

    /* Show/hide action buttons */
    if (actionButtons) {
        const resolved = resolvedApplicants.get(index);
        if (resolved) {
            actionButtons.style.display = 'block';
            const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement | null;
            const rejectBtn = document.getElementById('reject-btn') as HTMLButtonElement | null;

            if (resolved === 'verified') {
                if (verifyBtn) {
                    verifyBtn.disabled = true;
                    verifyBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    verifyBtn.innerHTML = `<i class="ph ph-seal-check" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_verified_granted', 'Verified Badge Granted')}`;
                }
                if (rejectBtn) {
                    rejectBtn.disabled = true;
                    rejectBtn.classList.add('opacity-30', 'cursor-not-allowed', 'pointer-events-none');
                }
            } else {
                if (rejectBtn) {
                    rejectBtn.disabled = true;
                    rejectBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    rejectBtn.innerHTML = `<i class="ph ph-x-circle" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_rejected_state', 'Rejected — Resubmission Requested')}`;
                }
                if (verifyBtn) {
                    verifyBtn.disabled = true;
                    verifyBtn.classList.add('opacity-30', 'cursor-not-allowed', 'pointer-events-none');
                }
            }
        } else {
            actionButtons.style.display = 'block';
            const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement | null;
            const rejectBtn = document.getElementById('reject-btn') as HTMLButtonElement | null;

            if (verifyBtn) {
                verifyBtn.disabled = false;
                verifyBtn.classList.remove('opacity-50', 'opacity-30', 'cursor-not-allowed', 'pointer-events-none');
                verifyBtn.innerHTML = `<i class="ph ph-seal-check" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_verify_btn', 'Grant Verified Badge')}`;
            }
            if (rejectBtn) {
                rejectBtn.disabled = false;
                rejectBtn.classList.remove('opacity-50', 'opacity-30', 'cursor-not-allowed', 'pointer-events-none');
                rejectBtn.innerHTML = `<i class="ph ph-x-circle" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_reject_btn', 'Reject & Request Resubmission')}`;
            }
        }
    }
}

/* ─── Drag & Drop Zone ─── */
function initDropZone(): void {
    const zone = document.getElementById('drop-zone');
    if (!zone) {
        return;
    }

    zone.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        zone.classList.add('border-trust-blue', 'bg-trust-blue/5');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('border-trust-blue', 'bg-trust-blue/5');
    });

    zone.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        zone.classList.remove('border-trust-blue', 'bg-trust-blue/5');
        showToast(t('kyc_doc_uploaded', 'Document uploaded successfully'));
    });
}

/* ─── Action Buttons ─── */
function initActionButtons(): void {
    const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement | null;
    const rejectBtn = document.getElementById('reject-btn') as HTMLButtonElement | null;

    // FIX-02: Click-twice-to-confirm replaces blocking confirm() for verification.
    let verifyPending = false;

    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => {
            if (selectedIndex < 0) { return; }
            const applicant = APPLICANTS[selectedIndex];
            if (!applicant) { return; }

            if (!verifyPending) {
                // First click: confirmation state
                verifyPending = true;
                verifyBtn.classList.add('bg-amber-500', 'text-white');
                verifyBtn.classList.remove('bg-smoky-jade/10', 'text-smoky-jade');
                verifyBtn.innerHTML = `<i class="ph ph-warning" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_confirm_verify', 'Click again to grant badge to')} ${esc(applicant.name)}`;
                // Auto-reset after 5s
                setTimeout(() => {
                    if (verifyPending) {
                        verifyPending = false;
                        verifyBtn.classList.remove('bg-amber-500', 'text-white');
                        verifyBtn.classList.add('bg-smoky-jade/10', 'text-smoky-jade');
                        verifyBtn.innerHTML = `<i class="ph ph-seal-check" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_verify_btn', 'Grant Verified Badge')}`;
                    }
                }, 5000);
                return;
            }

            // Second click: execute verification
            verifyPending = false;
            resolvedApplicants.set(selectedIndex, 'verified');
            updateRowBadge(selectedIndex, 'verified');
            updateStats('verify');
            renderDocumentViewer(selectedIndex);
            showToast(`${t('kyc_verified_toast', 'Verified Badge granted to')}: ${esc(applicant.name)}`);
        });
    }

    // FIX-02: Inline reason input replaces blocking prompt() for rejection.
    if (rejectBtn) {
        let rejectInputVisible = false;
        let rejectInput: HTMLInputElement | null = null;

        rejectBtn.addEventListener('click', () => {
            if (selectedIndex < 0) { return; }
            const applicant = APPLICANTS[selectedIndex];
            if (!applicant) { return; }

            if (!rejectInputVisible) {
                // First click: show inline reason input
                rejectInputVisible = true;
                rejectInput = document.createElement('input');
                rejectInput.type = 'text';
                rejectInput.placeholder = t('kyc_reject_placeholder', 'Reason: expired license, illegible scan, missing documents...');
                rejectInput.className = 'w-full mt-2 px-3 py-2 text-sm rounded-lg border border-rose-200 bg-rose-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-300';
                rejectBtn.parentElement?.insertBefore(rejectInput, rejectBtn.nextSibling);
                rejectInput.focus();
                rejectBtn.innerHTML = `<i class="ph ph-x-circle" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_submit_rejection', 'Submit Rejection')}`;
                rejectBtn.classList.add('border-rose-300', 'text-rose-600');
                return;
            }

            // Second click: submit rejection
            const reason = rejectInput?.value.trim() ?? '';
            if (reason === '') {
                showToast(t('kyc_reason_required', 'A reason is required for rejection.'));
                rejectInput?.focus();
                return;
            }

            rejectInputVisible = false;
            rejectInput?.remove();
            resolvedApplicants.set(selectedIndex, 'rejected');
            updateRowBadge(selectedIndex, 'rejected');
            updateStats('reject');
            renderDocumentViewer(selectedIndex);
            showToast(`${t('kyc_rejected_toast', 'Application rejected')}: ${esc(applicant.name)}. ${t('kyc_resubmission', 'Resubmission requested.')}`);
        });
    }
}

/* ─── Update Row Badge ─── */
function updateRowBadge(index: number, status: 'verified' | 'rejected'): void {
    const row = document.querySelector(`.kyc-row[data-index="${index}"]`);
    if (!row) {
        return;
    }

    const badge = row.querySelector('.rounded-full:last-child') as HTMLElement | null;
    if (!badge) {
        return;
    }

    if (status === 'verified') {
        badge.className = 'bg-smoky-jade/10 text-smoky-jade text-[10px] font-bold px-2 py-0.5 rounded-full';
        badge.innerHTML = `<i class="ph ph-check" style="margin-inline-end:3px"></i>${t('kyc_verified', 'Verified')}`;
    } else {
        badge.className = 'bg-rose-50 text-rose-500 text-[10px] font-bold px-2 py-0.5 rounded-full';
        badge.innerHTML = `<i class="ph ph-x" style="margin-inline-end:3px"></i>${t('kyc_rejected', 'Rejected')}`;
    }
}

/* ─── Update Stats ─── */
function updateStats(action: 'verify' | 'reject'): void {
    const pendingEl = document.getElementById('stat-pending');
    const verifiedEl = document.getElementById('stat-verified');
    const rejectedEl = document.getElementById('stat-rejected');

    if (pendingEl) {
        const current = parseInt(pendingEl.textContent ?? '0', 10);
        pendingEl.textContent = String(Math.max(0, current - 1));
    }

    if (action === 'verify' && verifiedEl) {
        const current = parseInt(verifiedEl.textContent ?? '0', 10);
        verifiedEl.textContent = String(current + 1);
    }

    if (action === 'reject' && rejectedEl) {
        const current = parseInt(rejectedEl.textContent ?? '0', 10);
        rejectedEl.textContent = String(current + 1);
    }
}

/* INC-P3-001: Inline showToast() removed — using shared import from utils/toast.ts */
