import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { reportError, reportWarning } from '../error-reporter';
import { donations, spatialProof } from '../api';
import { escapeHtml as esc } from '../utils/xss';
import { formatCents } from '../utils/format';
import { formatDateTime } from '../utils/locale';
import { t } from '../utils/i18n';
import { initBreadcrumb } from '../utils/breadcrumb';

// ============================================================================
// Nammerha — Donor Proof of Delivery Page Engine
// P0-001 FIX: Complete implementation replacing empty stub
// ============================================================================

interface DonationRecord {
    transaction_id: string;
    project_id: string;
    item_id: string;
    amount_locked: number;
    payment_status: 'locked' | 'released' | 'refunded';
    material_name?: string;
    project_title?: string;
}

interface ProofData {
    proof_id: string;
    image_url: string;
    gps_coordinates: string;
    captured_at: string;
    verification_status: 'submitted' | 'verified' | 'rejected';
    verified_by_name?: string;
    description?: string;
    image_hash?: string;
}

// ─── DOM References ─────────────────────────────────────────────────────────
const proofTitle = document.querySelector('h2.text-2xl') as HTMLElement | null;
const projectTitle = document.querySelector('h3.font-bold.text-lg') as HTMLElement | null;
const verifiedBy = document.querySelector('.text-sm.text-slate-500') as HTMLElement | null;
const statusBadge = document.querySelector('.badge-primary') as HTMLElement | null;
const descriptionPara = document.querySelector('.text-slate-600.leading-relaxed') as HTMLElement | null;
const timestampBadge = document.querySelector('.bg-black\\/60') as HTMLElement | null;
const blockchainHash = document.querySelector('.text-xs.text-slate-500') as HTMLElement | null;
const photoContainer = document.querySelector('.relative.aspect-video') as HTMLElement | null;

// ─── Parse Parameters ───────────────────────────────────────────────────────
function getParams(): { proofId: string | null; projectId: string | null } {
    const params = new URLSearchParams(window.location.search);
    return {
        proofId: params.get('proof'),
        projectId: params.get('project'),
    };
}

// P1-001 FIX: formatDate() deduplicated — imported as formatDateTime from utils/locale.ts.

// HIGH-001 FIX: formatCents() consolidated — imported from utils/format.ts.

// ─── Update UI with Proof Data ──────────────────────────────────────────────
function renderProofData(proof: ProofData, donation?: DonationRecord): void {
    // Status-based header
    const statusMap: Record<string, { title: string; badge: string; icon: string }> = {
        verified: {
            title: t('proof_status_verified_title', 'Success! Your contribution is on-site'),
            badge: t('proof_badge_verified', 'Verified'),
            icon: 'check-circle',
        },
        submitted: {
            title: t('proof_status_submitted_title', 'Proof Submitted — Awaiting Verification'),
            badge: t('proof_badge_pending', 'Pending'),
            icon: 'clock',
        },
        rejected: {
            title: t('proof_status_rejected_title', 'Proof Flagged — Under Review'),
            badge: t('proof_badge_flagged', 'Flagged'),
            icon: 'warning',
        },
    };

    const status = statusMap[proof.verification_status] ?? {
        title: t('proof_status_submitted_title', 'Proof Submitted — Awaiting Verification'),
        badge: t('proof_badge_pending', 'Pending'),
        icon: 'clock',
    };

    if (proofTitle) { proofTitle.textContent = status.title; }
    if (statusBadge) {
        statusBadge.textContent = status.badge;
        if (proof.verification_status === 'rejected') {
            statusBadge.className = 'badge-warning';
        }
    }

    // Update success icon
    const iconEl = document.querySelector('.ph-check-circle') as HTMLElement | null;
    if (iconEl && proof.verification_status !== 'verified') {
        iconEl.className = `ph ph-${status.icon} text-trust-blue`;
    }

    // Project info
    if (projectTitle) {
        projectTitle.textContent = donation?.project_title ?? `${t('proof_project_label', 'Project')} ${proof.proof_id.slice(0, 8)}`;
    }
    if (verifiedBy && proof.verified_by_name) {
        verifiedBy.innerHTML = `
            <i class="ph ph-shield-check text-trust-blue ph-sm" aria-hidden="true"></i>
            ${esc(t('proof_verified_by', 'Verified by'))} ${esc(proof.verified_by_name)}
        `;
    }

    // Description
    if (descriptionPara) {
        if (donation) {
            const materialName = donation.material_name ?? t('proof_materials', 'materials');
            const amount = formatCents(donation.amount_locked);
            const verifiedText = proof.verification_status === 'verified'
                ? t('proof_received_verified', 'received and verified on-site')
                : t('proof_submitted_for_verification', 'submitted for verification');
            descriptionPara.textContent = `${t('proof_your_contribution', 'Your')} ${amount} ${t('proof_contribution_of', 'contribution of')} ${materialName} ${t('proof_for_project', 'for Project')} ${donation.project_id} ${t('proof_has_been', 'has been')} ${verifiedText}.`;
        }
    }

    // Timestamp
    if (timestampBadge) {
        timestampBadge.innerHTML = `
            <i class="ph ph-clock text-xs"  aria-hidden="true"></i>
            ${formatDateTime(proof.captured_at)}
        `;
    }

    // Proof image
    if (photoContainer && proof.image_url) {
        const img = document.createElement('img');
        img.src = proof.image_url;
        img.alt = t('proof_delivery_photo', 'Delivery proof photo');
        img.className = 'absolute inset-0 w-full h-full object-cover';
        // Replace placeholder icon
        const placeholder = photoContainer.querySelector('.flex.items-center.justify-center');
        if (placeholder) { placeholder.replaceWith(img); }
    }

    // Image hash (blockchain)
    if (blockchainHash && proof.image_hash) {
        const shortHash = proof.image_hash.slice(0, 6) + '...' + proof.image_hash.slice(-4);
        blockchainHash.textContent = `SHA-256: ${shortHash}`;
    }
}

// ─── Load Proof Data from API ───────────────────────────────────────────────
async function loadProof(): Promise<void> {
    const { proofId, projectId } = getParams();

    try {
        // Try to load donor's donation history to find context
        let donation: DonationRecord | undefined;
        try {
            const historyRes = await donations.getMyHistory();
            if (historyRes.success && Array.isArray(historyRes.data)) {
                donation = (historyRes.data as DonationRecord[]).find(
                    (d) => d.project_id === projectId
                );
            }
        } catch (err) {
            reportWarning('[DonorProof] Donation history load failed, continuing without context', { component: 'donor_proof', action: 'load_history', error: err instanceof Error ? err.message : String(err) });
        }

        // Try to load spatial proof data
        if (projectId) {
            const proofRes = await spatialProof.getProjectPOs(projectId);
            if (proofRes.success && Array.isArray(proofRes.data) && proofRes.data.length > 0) {
                const proof = (proofId
                    ? (proofRes.data as ProofData[]).find((p) => p.proof_id === proofId)
                    : proofRes.data[0]) as ProofData | undefined;

                if (proof) {
                    renderProofData(proof, donation);
                    return;
                }
            }
        }

        // If no proof found, show static content (already in HTML)
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[DonorProof] Failed to load proof data'), { component: 'donor_proof', action: 'load_proof' });
    }
}

// ─── Initialize ─────────────────────────────────────────────────────────────
function init(): void {
    initBreadcrumb(); // GAP-007: Breadcrumb navigation
    loadProof();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
