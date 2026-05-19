import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';
import { showToast } from '../utils/toast';
/* GAP-P3-009 FIX: Wire KYC queue to live admin.getKycQueue() API.
   Standard: No hardcoded data, API-Driven Rendering. */
import { admin } from '../api';
import { requireAuth } from '../utils/auth-guard';
// TICK-036: Import shared locale-aware time formatter instead of local hardcoded-English version.
import { relativeTimeAgo } from '../utils/format';
import { renderProgressive } from '../utils/progressive-render';
import { renderErrorWithRetry } from '../utils/error-retry';

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
// TICKET-002: Module-scoped timer for verify confirmation auto-revert.
let verifyRevertTimer: ReturnType<typeof setTimeout> | null = null;
// TICKET-003: Module-scoped reject state to enable cross-applicant reset.
let rejectInputVisible = false;
let rejectInput: HTMLInputElement | null = null;

document.addEventListener('DOMContentLoaded', () => {
  // BLOCKER-1 FIX: Guard all protected content behind auth check.
  if (!requireAuth()) {
    return;
  }

  loadKycStats();
  loadKycQueue();
  initActionButtons();
});

/* ─── Load KYC Stats from API ─── */
async function loadKycStats(): Promise<void> {
  try {
    const res = await admin.getKycStats();
    const stats = res.data;
    if (!stats) {
      return;
    }

    const pendingEl = document.getElementById('stat-pending');
    const verifiedEl = document.getElementById('stat-verified');
    const rejectedEl = document.getElementById('stat-rejected');
    const totalEl = document.getElementById('stat-total');

    if (pendingEl) {
      pendingEl.textContent = String(stats.pending);
    }
    if (verifiedEl) {
      verifiedEl.textContent = String(stats.verified);
    }
    if (rejectedEl) {
      rejectedEl.textContent = String(stats.rejected);
    }
    if (totalEl) {
      totalEl.textContent = String(stats.total);
    }
  } catch {
    showToast(t('kyc_stats_error', 'فشل تحميل الإحصائيات'), 'error');
  }
}

/* ─── Load KYC Queue from API ─── */
async function loadKycQueue(): Promise<void> {
  const container = document.getElementById('kyc-queue-rows');
  if (!container) {
    return;
  }

  try {
    const res = await admin.getKycQueue();
    applicants = (res.data ?? []) as KycEntry[];

    // P1-UXA-002 FIX: Progressive rendering for KYC queue
    renderProgressive({
      items: applicants,
      containerEl: container,
      pageSize: 20,
      renderItem: (entry, index) => {
        const isEngineer = entry.role === 'engineer';
        const iconClass = isEngineer ? 'ph-hard-hat' : 'ph-storefront';
        const bgClass = isEngineer ? 'bg-trust-blue/10' : 'bg-warm-earth/10';
        const textClass = isEngineer ? 'text-trust-blue' : 'text-warm-earth';
        const roleLabel = isEngineer
          ? t('kyc_role_engineer', 'مهندس')
          : t('kyc_role_supplier', 'مورّد');
        const timeAgo = relativeTimeAgo(entry.updated_at);
        const statusLabel =
          entry.kyc_verification_status === 'submitted'
            ? t('kyc_status_submitted', 'تم التقديم')
            : t('kyc_status_pending', 'معلّق');

        return `
                <div class="kyc-row px-4 py-3 flex items-center gap-4 hover:bg-slate-50 cursor-pointer transition-colors"
                     data-index="${index}" data-user-id="${esc(entry.user_id)}"
                     role="option" tabindex="0" aria-selected="false">
                    <div class="size-10 rounded-full ${bgClass} flex items-center justify-center shrink-0">
                        <i class="ph ${iconClass} ${textClass} text-lg" aria-hidden="true"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold truncate">${esc(entry.full_name)}</p>
                        <p class="text-3xs text-slate-400 dark:text-slate-500">${esc(roleLabel)} • ${esc(timeAgo)}</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="bg-warning-yellow/20 text-warning-yellow text-3xs font-bold px-2 py-0.5 rounded-full">
                            ${esc(statusLabel)}
                        </span>
                    </div>
                </div>
            `;
      },
      emptyState: () => `
                <div class="p-8 flex flex-col items-center justify-center text-center">
                    <div class="size-12 rounded-full bg-smoky-jade/10 flex items-center justify-center mb-3">
                        <i class="ph ph-check-circle text-smoky-jade text-2xl dark:text-emerald-400" aria-hidden="true"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-600 dark:text-slate-400">${esc(t('kyc_queue_empty', 'قائمة الانتظار فارغة'))}</p>
                    <p class="text-xs text-slate-400 mt-1 dark:text-slate-500">${esc(t('kyc_no_pending', 'لا توجد طلبات معلقة'))}</p>
                </div>
            `,
    });

    // TICK-035: Event delegation replaces O(N) per-row listeners.
    initRowSelection(container);
  } catch (err) {
    renderErrorWithRetry(
      container,
      loadKycQueue,
      'kyc_load_error',
      'Unable to load KYC queue',
      err,
    );
  }
}

// TICK-036: Local formatTimeAgo() removed — now imported as relativeTimeAgo from utils/format.ts.
// The shared version uses Intl.RelativeTimeFormat for proper Arabic/RTL support.

/* ─── Row Selection (Event Delegation) ─── */
// TICK-035: Replaced O(N) per-element click+keydown listeners with single delegated
// listener on container. O(1) regardless of queue size.
function initRowSelection(container: HTMLElement): void {
  container.addEventListener('click', (e: MouseEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.kyc-row');
    if (!row) {
      return;
    }
    selectRow(row);
  });

  container.addEventListener('keydown', (e: KeyboardEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.kyc-row');
    if (!row) {
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectRow(row);
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
}

/* ─── Select Row Helper ─── */
function selectRow(row: HTMLElement): void {
  const index = parseInt(row.dataset.index ?? '-1', 10);
  if (index < 0 || index >= applicants.length) {
    return;
  }

  selectedIndex = index;

  // TICK-035: Use querySelectorAll only for visual state reset (not listener attachment).
  const rows = document.querySelectorAll<HTMLElement>('.kyc-row');
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
  if (!entry) {
    return;
  }

  const empty = document.getElementById('viewer-empty');
  const content = document.getElementById('viewer-content');
  const title = document.getElementById('viewer-title');
  const subtitle = document.getElementById('viewer-subtitle');
  const docList = document.getElementById('doc-list');
  const actionButtons = document.getElementById('action-buttons');

  if (empty) {
    empty.classList.add('nm-hidden');
  }
  if (content) {
    content.classList.remove('nm-hidden');
  }
  if (title) {
    title.textContent = entry.full_name;
  }
  if (subtitle) {
    const roleLabel =
      entry.role === 'engineer' ? t('kyc_role_engineer', 'مهندس') : t('kyc_role_supplier', 'مورّد');
    subtitle.textContent = `${roleLabel} • ${entry.email}`;
  }

  /* Render credential details */
  if (docList) {
    const credentials: Array<{ name: string; value: string | null; icon: string; url?: string }> =
      [];

    if (entry.engineering_license_number) {
      credentials.push({
        name: t('kyc_eng_license', 'رخصة مهندس'),
        value: entry.engineering_license_number,
        icon: 'ph ph-certificate',
      });
    }
    if (entry.commercial_register_number) {
      credentials.push({
        name: t('kyc_commercial_reg', 'سجل تجاري'),
        value: entry.commercial_register_number,
        icon: 'ph ph-scroll',
      });
    }
    if (entry.guild_membership_id) {
      credentials.push({
        name: t('kyc_guild_membership', 'عضوية النقابة'),
        value: entry.guild_membership_id,
        icon: 'ph ph-identification-badge',
      });
    }
    if (entry.kyc_document_url) {
      credentials.push({
        name: t('kyc_uploaded_doc', 'وثيقة مرفوعة'),
        value: t('kyc_view_doc_action', 'عرض الوثيقة'),
        icon: 'ph ph-file-pdf',
        url: entry.kyc_document_url, // PLATINUM FIX: Passing the actual S3/presigned URL
      });
    }

    if (credentials.length === 0) {
      docList.innerHTML = `
                <div class="p-4 text-center text-sm text-slate-400 italic dark:text-slate-500">
                    ${esc(t('kyc_no_credentials', 'لا توجد وثائق'))}
                </div>
            `;
    } else {
      docList.innerHTML = credentials
        .map((cred) => {
          const valueHtml = cred.url
            ? `<a href="${esc(cred.url)}" target="_blank" rel="noopener noreferrer" class="text-trust-blue hover:underline font-bold flex items-center gap-1">${esc(cred.value ?? '')}</a>`
            : esc(cred.value ?? '—');

          return `
                <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 dark:bg-dark-elevated dark:border-dark-border">
                    <div class="size-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 dark:bg-dark-surface dark:border-dark-border">
                        <i class="${cred.icon} text-trust-blue text-lg" aria-hidden="true"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate">${esc(cred.name)}</p>
                        <p class="text-3xs text-slate-400 dark:text-slate-500">${valueHtml}</p>
                    </div>
                </div>
            `;
        })
        .join('');
    }
  }

  /* Show action buttons (reset state for new selection) */
  if (actionButtons) {
    // P1-SST-001 FIX: CSS class toggle replaces inline style.display.
    actionButtons.classList.remove('nm-hidden');
    const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement | null;
    const rejectBtn = document.getElementById('reject-btn') as HTMLButtonElement | null;

    // TICKET-002: Clear dangling verify confirmation timer on applicant change.
    if (verifyRevertTimer !== null) {
      clearTimeout(verifyRevertTimer);
      verifyRevertTimer = null;
    }

    // TICKET-003: Reset reject state to prevent cross-applicant data contamination.
    if (rejectInputVisible) {
      rejectInputVisible = false;
      rejectInput?.remove();
      rejectInput = null;
    }

    if (
      entry.kyc_verification_status === 'verified' ||
      entry.kyc_verification_status === 'rejected'
    ) {
      /* Already processed — disable buttons */
      if (verifyBtn) {
        verifyBtn.disabled = true;
        verifyBtn.classList.add('opacity-50', 'cursor-not-allowed');
        verifyBtn.innerHTML =
          entry.kyc_verification_status === 'verified'
            ? `<i class="ph ph-seal-check text-lg" aria-hidden="true"></i> ${esc(t('kyc_verified_granted', 'تم منح الاعتماد'))}`
            : `<i class="ph ph-seal-check text-lg" aria-hidden="true"></i> ${esc(t('kyc_verify_btn', 'اعتمد'))}`;
      }
      if (rejectBtn) {
        rejectBtn.disabled = true;
        rejectBtn.classList.add('opacity-50', 'cursor-not-allowed');
        rejectBtn.innerHTML = `<i class="ph ph-x-circle text-lg" aria-hidden="true"></i> ${esc(t('kyc_reject_btn', 'رفض'))}`;
      }
    } else {
      /* Pending — enable buttons */
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.classList.remove(
          'opacity-50',
          'opacity-30',
          'cursor-not-allowed',
          'pointer-events-none',
        );
        verifyBtn.innerHTML = `<i class="ph ph-seal-check text-lg" aria-hidden="true"></i> ${esc(t('kyc_verify_btn', 'اعتمد'))}`;
      }
      if (rejectBtn) {
        rejectBtn.disabled = false;
        rejectBtn.classList.remove(
          'opacity-50',
          'opacity-30',
          'cursor-not-allowed',
          'pointer-events-none',
        );
        rejectBtn.innerHTML = `<i class="ph ph-x-circle text-lg" aria-hidden="true"></i> ${esc(t('kyc_reject_btn', 'رفض'))}`;
      }
    }
  }
}

/* ─── Drag & Drop Zone Purged (Ghost Feature Removed) ─── */

/* ─── Action Buttons (API-Driven) ─── */
function initActionButtons(): void {
  const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement | null;
  const rejectBtn = document.getElementById('reject-btn') as HTMLButtonElement | null;

  let verifyPending = false;

  if (verifyBtn) {
    verifyBtn.addEventListener('click', async () => {
      if (selectedIndex < 0) {
        return;
      }
      const entry = applicants[selectedIndex];
      if (!entry) {
        return;
      }

      if (!verifyPending) {
        verifyPending = true;
        verifyBtn.classList.add('bg-amber-500', 'text-white');
        verifyBtn.classList.remove('bg-smoky-jade/10', 'text-smoky-jade');
        verifyBtn.innerHTML = `<i class="ph ph-warning text-lg" aria-hidden="true"></i> ${esc(t('kyc_confirm_verify', 'هل ترغب في اعتماد هذا الطلب؟'))} ${esc(entry.full_name)}`;
        // TICKET-002: Store timer ID so it can be cleared on applicant change.
        verifyRevertTimer = setTimeout(() => {
          if (verifyPending) {
            verifyPending = false;
            verifyBtn.classList.remove('bg-amber-500', 'text-white');
            verifyBtn.classList.add('bg-smoky-jade/10', 'text-smoky-jade');
            verifyBtn.innerHTML = `<i class="ph ph-seal-check text-lg" aria-hidden="true"></i> ${esc(t('kyc_verify_btn', 'اعتمد'))}`;
          }
          verifyRevertTimer = null;
        }, 5000);
        return;
      }

      /* Second click: API call */
      verifyPending = false;
      // TICKET-002: Clear timer on confirmed action.
      if (verifyRevertTimer !== null) {
        clearTimeout(verifyRevertTimer);
        verifyRevertTimer = null;
      }
      verifyBtn.disabled = true;
      verifyBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg" aria-hidden="true"></i> ${esc(t('kyc_verifying', 'جاري الاعتماد…'))}`;

      try {
        await admin.updateKycStatus(entry.user_id, { decision: 'verified' });
        entry.kyc_verification_status = 'verified';
        updateRowBadge(selectedIndex, 'verified');
        renderDocumentViewer(selectedIndex);
        showToast(
          `${t('kyc_verified_toast', 'تم اعتماد الطلب')}: ${esc(entry.full_name)}`,
          'success',
        );
        /* Refresh stats */
        loadKycStats();
      } catch {
        verifyBtn.disabled = false;
        verifyBtn.classList.remove('bg-amber-500', 'text-white');
        verifyBtn.classList.add('bg-smoky-jade/10', 'text-smoky-jade');
        verifyBtn.innerHTML = `<i class="ph ph-seal-check text-lg" aria-hidden="true"></i> ${esc(t('kyc_verify_btn', 'اعتمد'))}`;
        showToast(t('kyc_verify_error', 'فشل الاعتماد'), 'error');
      }
    });
  }

  // TICKET-003: Reject state (rejectInputVisible, rejectInput) is now module-scoped
  // so renderDocumentViewer() can reset it on applicant change.
  if (rejectBtn) {
    rejectBtn.addEventListener('click', async () => {
      if (selectedIndex < 0) {
        return;
      }
      const entry = applicants[selectedIndex];
      if (!entry) {
        return;
      }

      if (!rejectInputVisible) {
        rejectInputVisible = true;
        rejectInput = document.createElement('input');
        rejectInput.type = 'text';
        rejectInput.placeholder = t('kyc_reject_placeholder', 'اكتب سبب الرفض…');
        rejectInput.className =
          'w-full mt-2 px-3 py-2 text-sm rounded-lg border border-rose-200 bg-rose-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-300';
        rejectBtn.parentElement?.insertBefore(rejectInput, rejectBtn.nextSibling);
        rejectInput.focus();
        rejectBtn.innerHTML = `<i class="ph ph-x-circle text-lg" aria-hidden="true"></i> ${esc(t('kyc_submit_rejection', 'تأكيد الرفض'))}`;
        rejectBtn.classList.add('border-rose-300', 'text-rose-600');
        return;
      }

      /* Second click: API call */
      const reason = rejectInput?.value.trim() ?? '';
      if (reason === '') {
        showToast(t('kyc_reason_required', 'السبب مطلوب'));
        rejectInput?.focus();
        return;
      }

      rejectBtn.disabled = true;
      rejectBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg" aria-hidden="true"></i> ${esc(t('kyc_rejecting', 'جاري الرفض…'))}`;

      try {
        await admin.updateKycStatus(entry.user_id, { decision: 'rejected', reason });
        rejectInputVisible = false;
        rejectInput?.remove();
        rejectInput = null;
        entry.kyc_verification_status = 'rejected';
        updateRowBadge(selectedIndex, 'rejected');
        renderDocumentViewer(selectedIndex);
        showToast(
          `${t('kyc_rejected_toast', 'تم رفض الطلب')}: ${esc(entry.full_name)}. ${t('kyc_resubmission', 'إعادة التقديم مطلوبة')}`,
          'success',
        );
        loadKycStats();
      } catch {
        rejectBtn.disabled = false;
        rejectBtn.innerHTML = `<i class="ph ph-x-circle text-lg" aria-hidden="true"></i> ${esc(t('kyc_submit_rejection', 'تأكيد الرفض'))}`;
        showToast(t('kyc_reject_error', 'فشل الرفض'), 'error');
      }
    });
  }
}

/* ─── Update Row Badge ─── */
function updateRowBadge(index: number, status: 'verified' | 'rejected'): void {
  const row = document.querySelector(`.kyc-row[data-index="${index}"]`);
  if (!row) {
    return;
  }

  const badge = row.querySelector('.rounded-full') as HTMLElement | null;
  if (!badge) {
    return;
  }

  // TICKET-001: Added missing aria-hidden="true" on badge icons.
  if (status === 'verified') {
    badge.className =
      'bg-smoky-jade/10 text-smoky-jade text-3xs font-bold px-2 py-0.5 rounded-full';
    badge.innerHTML = `<i class="ph ph-check nm-icon-gap-end" aria-hidden="true"></i>${esc(t('kyc_verified', '✓ معتمد'))}`;
  } else {
    badge.className = 'bg-rose-50 text-rose-500 text-3xs font-bold px-2 py-0.5 rounded-full';
    badge.innerHTML = `<i class="ph ph-x nm-icon-gap-end" aria-hidden="true"></i>${esc(t('kyc_rejected', '✗ مرفوض'))}`;
  }
}
