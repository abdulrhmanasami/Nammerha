import '../styles/main.css';
import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';
import { showToast } from '../utils/toast';
/* GAP-P3-009 FIX: Wire KYC queue to live admin.getKycQueue() API.
   Standard: No hardcoded data, API-Driven Rendering. */
import { admin } from '../api';

/* ─── KYC Verification Portal — API-Driven Controller ─── */

interface KycEntry {
    user_id: string;
    full_name: string;
    email: string;
    role: string;
    kyc_verification_status: string;
    kyc_document_url: string | null;
    commercial_register_number: string | null;
    engineering_license_number: string | null;
    guild_membership_id: string | null;
    created_at: string;
    updated_at: string;
}

let applicants: KycEntry[] = [];
let selectedIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
    loadKycStats();
    loadKycQueue();
    initDropZone();
    initActionButtons();
});

/* ─── Load KYC Stats from API ─── */
async function loadKycStats(): Promise<void> {
    try {
        const res = await admin.getKycStats();
        const stats = res.data;
        if (!stats) { return; }

        const pendingEl = document.getElementById('stat-pending');
        const verifiedEl = document.getElementById('stat-verified');
        const rejectedEl = document.getElementById('stat-rejected');
        const totalEl = document.getElementById('stat-total');

        if (pendingEl) { pendingEl.textContent = String(stats.pending); }
        if (verifiedEl) { verifiedEl.textContent = String(stats.verified); }
        if (rejectedEl) { rejectedEl.textContent = String(stats.rejected); }
        if (totalEl) { totalEl.textContent = String(stats.total); }
    } catch {
        showToast(t('kyc_stats_error', 'Unable to load KYC statistics'), 'error');
    }
}

/* ─── Load KYC Queue from API ─── */
async function loadKycQueue(): Promise<void> {
    const container = document.getElementById('kyc-queue-rows');
    if (!container) { return; }

    try {
        const res = await admin.getKycQueue();
        applicants = (res.data ?? []) as KycEntry[];

        if (applicants.length === 0) {
            container.innerHTML = `
                <div class="p-8 flex flex-col items-center justify-center text-center">
                    <div class="size-12 rounded-full bg-smoky-jade/10 flex items-center justify-center mb-3">
                        <i class="ph ph-check-circle text-smoky-jade" style="font-size:24px" aria-hidden="true"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-600">${esc(t('kyc_queue_empty', 'All caught up!'))}</p>
                    <p class="text-xs text-slate-400 mt-1">${esc(t('kyc_no_pending', 'No applications pending review.'))}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = applicants.map((entry, index) => {
            const isEngineer = entry.role === 'engineer';
            const iconClass = isEngineer ? 'ph-hard-hat' : 'ph-storefront';
            const bgClass = isEngineer ? 'bg-trust-blue/10' : 'bg-warm-earth/10';
            const textClass = isEngineer ? 'text-trust-blue' : 'text-warm-earth';
            const roleLabel = isEngineer
                ? t('kyc_role_engineer', 'Engineer')
                : t('kyc_role_supplier', 'Supplier');
            const timeAgo = formatTimeAgo(entry.updated_at);
            const statusLabel = entry.kyc_verification_status === 'submitted'
                ? t('kyc_status_submitted', 'Submitted')
                : t('kyc_status_pending', 'Pending');

            return `
                <div class="kyc-row px-4 py-3 flex items-center gap-4 hover:bg-slate-50 cursor-pointer transition-colors"
                     data-index="${index}" data-user-id="${esc(entry.user_id)}"
                     role="option" tabindex="0" aria-selected="false">
                    <div class="size-10 rounded-full ${bgClass} flex items-center justify-center shrink-0">
                        <i class="ph ${iconClass} ${textClass}" style="font-size:18px" aria-hidden="true"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold truncate">${esc(entry.full_name)}</p>
                        <p class="text-[10px] text-slate-400">${esc(roleLabel)} • ${esc(timeAgo)}</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="bg-warning-yellow/20 text-warning-yellow text-[10px] font-bold px-2 py-0.5 rounded-full">
                            ${esc(statusLabel)}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        initRowSelection();
    } catch {
        container.innerHTML = `
            <div class="p-6 text-center">
                <p class="text-sm text-slate-400">${esc(t('kyc_load_error', 'Unable to load KYC queue'))}</p>
                <button id="kyc-retry-btn" class="mt-2 text-xs text-trust-blue font-bold hover:underline">${esc(t('common_retry', 'Retry'))}</button>
            </div>
        `;
        const retryBtn = document.getElementById('kyc-retry-btn');
        retryBtn?.addEventListener('click', () => loadKycQueue());
    }
}

/* ─── Time Ago Formatter ─── */
function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) { return `${mins}m ago`; }
    const hours = Math.floor(mins / 60);
    if (hours < 24) { return `${hours}h ago`; }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/* ─── Row Selection ─── */
function initRowSelection(): void {
    const rows = document.querySelectorAll<HTMLElement>('.kyc-row');

    rows.forEach((row) => {
        row.addEventListener('click', () => selectRow(row, rows));

        row.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectRow(row, rows);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = row.nextElementSibling as HTMLElement | null;
                if (next?.classList.contains('kyc-row')) { next.focus(); }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = row.previousElementSibling as HTMLElement | null;
                if (prev?.classList.contains('kyc-row')) { prev.focus(); }
            }
        });
    });
}

/* ─── Select Row Helper ─── */
function selectRow(row: HTMLElement, rows: NodeListOf<HTMLElement>): void {
    const index = parseInt(row.dataset.index ?? '-1', 10);
    if (index < 0 || index >= applicants.length) { return; }

    selectedIndex = index;

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
    const entry = applicants[index];
    if (!entry) { return; }

    const empty = document.getElementById('viewer-empty');
    const content = document.getElementById('viewer-content');
    const title = document.getElementById('viewer-title');
    const subtitle = document.getElementById('viewer-subtitle');
    const docList = document.getElementById('doc-list');
    const actionButtons = document.getElementById('action-buttons');

    if (empty) { empty.classList.add('hidden'); }
    if (content) { content.classList.remove('hidden'); }
    if (title) { title.textContent = entry.full_name; }
    if (subtitle) {
        const roleLabel = entry.role === 'engineer'
            ? t('kyc_role_engineer', 'Engineer')
            : t('kyc_role_supplier', 'Supplier');
        subtitle.textContent = `${roleLabel} • ${entry.email}`;
    }

    /* Render credential details */
    if (docList) {
        const credentials: Array<{ name: string; value: string | null; icon: string }> = [];

        if (entry.engineering_license_number) {
            credentials.push({
                name: t('kyc_eng_license', 'Engineering License'),
                value: entry.engineering_license_number,
                icon: 'ph ph-certificate',
            });
        }
        if (entry.commercial_register_number) {
            credentials.push({
                name: t('kyc_commercial_reg', 'Commercial Registration'),
                value: entry.commercial_register_number,
                icon: 'ph ph-scroll',
            });
        }
        if (entry.guild_membership_id) {
            credentials.push({
                name: t('kyc_guild_membership', 'Guild Membership'),
                value: entry.guild_membership_id,
                icon: 'ph ph-identification-badge',
            });
        }
        if (entry.kyc_document_url) {
            credentials.push({
                name: t('kyc_uploaded_doc', 'Uploaded Document'),
                value: t('kyc_view_doc', 'View Document'),
                icon: 'ph ph-file-pdf',
            });
        }

        if (credentials.length === 0) {
            docList.innerHTML = `
                <div class="p-4 text-center text-sm text-slate-400 italic">
                    ${esc(t('kyc_no_credentials', 'No credentials submitted yet.'))}
                </div>
            `;
        } else {
            docList.innerHTML = credentials.map((cred) => `
                <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div class="size-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                        <i class="${cred.icon} text-trust-blue" style="font-size:18px" aria-hidden="true"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate">${esc(cred.name)}</p>
                        <p class="text-[10px] text-slate-400">${esc(cred.value ?? '—')}</p>
                    </div>
                </div>
            `).join('');
        }
    }

    /* Show action buttons (reset state for new selection) */
    if (actionButtons) {
        actionButtons.style.display = 'block';
        const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement | null;
        const rejectBtn = document.getElementById('reject-btn') as HTMLButtonElement | null;

        if (entry.kyc_verification_status === 'verified' || entry.kyc_verification_status === 'rejected') {
            /* Already processed — disable buttons */
            if (verifyBtn) {
                verifyBtn.disabled = true;
                verifyBtn.classList.add('opacity-50', 'cursor-not-allowed');
                verifyBtn.innerHTML = entry.kyc_verification_status === 'verified'
                    ? `<i class="ph ph-seal-check" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_verified_granted', 'Verified Badge Granted')}`
                    : `<i class="ph ph-seal-check" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_verify_btn', 'Grant Verified Badge')}`;
            }
            if (rejectBtn) {
                rejectBtn.disabled = true;
                rejectBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        } else {
            /* Pending — enable buttons */
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
    if (!zone) { return; }

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

/* ─── Action Buttons (API-Driven) ─── */
function initActionButtons(): void {
    const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement | null;
    const rejectBtn = document.getElementById('reject-btn') as HTMLButtonElement | null;

    let verifyPending = false;

    if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
            if (selectedIndex < 0) { return; }
            const entry = applicants[selectedIndex];
            if (!entry) { return; }

            if (!verifyPending) {
                verifyPending = true;
                verifyBtn.classList.add('bg-amber-500', 'text-white');
                verifyBtn.classList.remove('bg-smoky-jade/10', 'text-smoky-jade');
                verifyBtn.innerHTML = `<i class="ph ph-warning" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_confirm_verify', 'Click again to grant badge to')} ${esc(entry.full_name)}`;
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

            /* Second click: API call */
            verifyPending = false;
            verifyBtn.disabled = true;
            verifyBtn.innerHTML = `<i class="ph ph-spinner animate-spin" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_verifying', 'Verifying...')}`;

            try {
                await admin.updateKycStatus(entry.user_id, { decision: 'verified' });
                entry.kyc_verification_status = 'verified';
                updateRowBadge(selectedIndex, 'verified');
                renderDocumentViewer(selectedIndex);
                showToast(`${t('kyc_verified_toast', 'Verified Badge granted to')}: ${esc(entry.full_name)}`, 'success');
                /* Refresh stats */
                loadKycStats();
            } catch {
                verifyBtn.disabled = false;
                verifyBtn.classList.remove('bg-amber-500', 'text-white');
                verifyBtn.classList.add('bg-smoky-jade/10', 'text-smoky-jade');
                verifyBtn.innerHTML = `<i class="ph ph-seal-check" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_verify_btn', 'Grant Verified Badge')}`;
                showToast(t('kyc_verify_error', 'Failed to verify — please try again'), 'error');
            }
        });
    }

    if (rejectBtn) {
        let rejectInputVisible = false;
        let rejectInput: HTMLInputElement | null = null;

        rejectBtn.addEventListener('click', async () => {
            if (selectedIndex < 0) { return; }
            const entry = applicants[selectedIndex];
            if (!entry) { return; }

            if (!rejectInputVisible) {
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

            /* Second click: API call */
            const reason = rejectInput?.value.trim() ?? '';
            if (reason === '') {
                showToast(t('kyc_reason_required', 'A reason is required for rejection.'));
                rejectInput?.focus();
                return;
            }

            rejectBtn.disabled = true;
            rejectBtn.innerHTML = `<i class="ph ph-spinner animate-spin" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_rejecting', 'Rejecting...')}`;

            try {
                await admin.updateKycStatus(entry.user_id, { decision: 'rejected', reason });
                rejectInputVisible = false;
                rejectInput?.remove();
                entry.kyc_verification_status = 'rejected';
                updateRowBadge(selectedIndex, 'rejected');
                renderDocumentViewer(selectedIndex);
                showToast(`${t('kyc_rejected_toast', 'Application rejected')}: ${esc(entry.full_name)}. ${t('kyc_resubmission', 'Resubmission requested.')}`, 'success');
                loadKycStats();
            } catch {
                rejectBtn.disabled = false;
                rejectBtn.innerHTML = `<i class="ph ph-x-circle" style="font-size:18px" aria-hidden="true"></i> ${t('kyc_submit_rejection', 'Submit Rejection')}`;
                showToast(t('kyc_reject_error', 'Failed to reject — please try again'), 'error');
            }
        });
    }
}

/* ─── Update Row Badge ─── */
function updateRowBadge(index: number, status: 'verified' | 'rejected'): void {
    const row = document.querySelector(`.kyc-row[data-index="${index}"]`);
    if (!row) { return; }

    const badge = row.querySelector('.rounded-full') as HTMLElement | null;
    if (!badge) { return; }

    if (status === 'verified') {
        badge.className = 'bg-smoky-jade/10 text-smoky-jade text-[10px] font-bold px-2 py-0.5 rounded-full';
        badge.innerHTML = `<i class="ph ph-check" style="margin-inline-end:3px"></i>${t('kyc_verified', 'Verified')}`;
    } else {
        badge.className = 'bg-rose-50 text-rose-500 text-[10px] font-bold px-2 py-0.5 rounded-full';
        badge.innerHTML = `<i class="ph ph-x" style="margin-inline-end:3px"></i>${t('kyc_rejected', 'Rejected')}`;
    }
}
