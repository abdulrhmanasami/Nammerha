import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { reportError, reportWarning } from '../error-reporter';
import { donations, spatialProof } from '../api';
import { formatCents } from '../utils/format';
import { formatDateTime } from '../utils/locale';
import { t } from '../utils/i18n';
import { showToast } from '../utils/toast';
import { escapeHtml as esc } from '../utils/xss';
import { initBreadcrumb } from '../utils/breadcrumb';
// W6-002 FIX: Auth guard — was missing on this donor page.
import { requireAuth } from '../utils/auth-guard';

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

// ─── DOM References (PLT-G001: Updated to id-based selectors) ───────────────
// Previous: fragile class-based querySelector chains that broke on Tailwind changes.
// Now: id-based selectors matching the G-001 HTML overhaul skeleton structure.
const proofTitle = document.getElementById('proof-page-title');
const projectTitle = document.getElementById('proof-project-name');
const verifierEl = document.getElementById('proof-verifier');
const statusBadge = document.getElementById('proof-status-badge');
const descriptionEl = document.getElementById('proof-description');
const timestampEl = document.getElementById('proof-timestamp');
const txHashEl = document.getElementById('proof-tx-hash');
const photoContainer = document.getElementById('proof-photo-container');
const projectLink = document.getElementById('proof-project-link') as HTMLAnchorElement | null;
const shareBtn = document.getElementById('share-proof-btn');
const verifyBtn = document.getElementById('verify-hash-btn');

// ─── Skeleton Removal Helper ────────────────────────────────────────────────
// PLT-G001: Remove [data-skeleton] elements inside a container after hydration
function removeSkeleton(container: HTMLElement | null): void {
    if (!container) { return; }
    container.querySelectorAll('[data-skeleton]').forEach((el) => el.remove());
}

// ─── FIX-003: Empty Proof State ─────────────────────────────────────────────
// Replaces skeleton loaders when no proof data is available.
// Previous: Skeletons remained forever — infinite loading with no recovery path.
// Standard: Nielsen #1 (System Status Visibility), Material Design 3 (Empty States).
// ─────────────────────────────────────────────────────────────────────────────
function renderEmptyProofState(): void {
    // Clear page title to reflect empty state
    if (proofTitle) {
        proofTitle.textContent = t('proof_not_found_title', 'No Proof Available');
    }

    // Replace skeleton loaders across all dynamic elements
    [projectTitle, verifierEl, statusBadge, descriptionEl, timestampEl, txHashEl].forEach(el => {
        removeSkeleton(el);
    });

    // Replace description area with informative empty state
    if (descriptionEl) {
        descriptionEl.innerHTML = `
            <div class="text-center py-4">
                <i class="ph ph-binoculars text-slate-300 nm-icon-40" aria-hidden="true"></i>
                <p class="text-slate-500 text-sm font-medium mt-3 dark:text-slate-400">${esc(t('proof_not_found', 'No proof of delivery found for this project.'))}</p>
                <p class="text-slate-400 text-xs mt-1 dark:text-slate-500">${esc(t('proof_not_found_hint', 'The proof may not have been submitted yet, or the link is incorrect.'))}</p>
                <a href="/donor-portal.html" class="inline-block mt-4 btn-primary nm-btn-sm">
                    <span>${esc(t('proof_back_to_portal', 'Back to Portal'))}</span>
                </a>
            </div>`;
    }

    // Clear stale skeleton content
    if (projectTitle) { projectTitle.textContent = '—'; }
    if (timestampEl) { timestampEl.textContent = '—'; }
    if (txHashEl) { txHashEl.textContent = '—'; }
    if (statusBadge) { statusBadge.textContent = t('proof_badge_none', 'N/A'); }
}

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
        removeSkeleton(statusBadge);
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
        removeSkeleton(projectTitle);
        projectTitle.textContent = donation?.project_title ?? `${t('proof_project_label', 'Project')} ${proof.proof_id.slice(0, 8)}`;
    }
    if (verifierEl && proof.verified_by_name) {
        removeSkeleton(verifierEl);
        verifierEl.textContent = `${t('proof_verified_by', 'Verified by')} ${proof.verified_by_name}`;
    }

    // Description
    if (descriptionEl) {
        removeSkeleton(descriptionEl);
        if (donation) {
            const materialName = donation.material_name ?? t('proof_materials', 'materials');
            const amount = formatCents(donation.amount_locked);
            const verifiedText = proof.verification_status === 'verified'
                ? t('proof_received_verified', 'received and verified on-site')
                : t('proof_submitted_for_verification', 'submitted for verification');
            descriptionEl.textContent = `${t('proof_your_contribution', 'Your')} ${amount} ${t('proof_contribution_of', 'contribution of')} ${materialName} ${t('proof_for_project', 'for Project')} ${donation.project_id} ${t('proof_has_been', 'has been')} ${verifiedText}.`;
        }
    }

    // Timestamp
    if (timestampEl) {
        removeSkeleton(timestampEl);
        timestampEl.textContent = formatDateTime(proof.captured_at);
    }

    // Proof image
    if (photoContainer && proof.image_url) {
        const img = document.createElement('img');
        img.src = proof.image_url;
        img.alt = t('proof_delivery_photo', 'Delivery proof photo');
        img.className = 'absolute inset-0 w-full h-full object-cover';
        img.loading = 'lazy';
        // Replace placeholder icon
        const placeholder = photoContainer.querySelector('[data-skeleton]');
        if (placeholder) { placeholder.replaceWith(img); }
    }

    // Blockchain hash
    if (txHashEl && proof.image_hash) {
        removeSkeleton(txHashEl);
        const shortHash = proof.image_hash.slice(0, 6) + '...' + proof.image_hash.slice(-4);
        txHashEl.textContent = shortHash;
        // Store full hash for verify button
        txHashEl.dataset.fullHash = proof.image_hash;
    }

    // Update project link with query context
    if (projectLink && donation?.project_id) {
        projectLink.href = `project-details.html?id=${encodeURIComponent(donation.project_id)}`;
    }
}

// ─── Share Button Handler (PLT-G003) ────────────────────────────────────────
function initShareButton(): void {
    if (!shareBtn) { return; }
    shareBtn.addEventListener('click', async () => {
        const shareData: ShareData = {
            title: t('proof_share_title', 'My Impact — Nammerha'),
            text: t('proof_share_text', 'I verified my contribution was delivered on-site via GPS proof. Transparent reconstruction!'),
            url: window.location.href,
        };

        try {
            if (navigator.share && navigator.canShare?.(shareData)) {
                await navigator.share(shareData);
            } else {
                // Fallback: copy URL to clipboard
                await navigator.clipboard.writeText(window.location.href);
                // Brief visual feedback
                const icon = shareBtn.querySelector('i');
                if (icon) {
                    icon.className = 'ph ph-check';
                    setTimeout(() => { icon.className = 'ph ph-share-network'; }, 1500);
                }
            }
        } catch (err) {
            // User cancelled share — not an error
            if ((err as DOMException)?.name !== 'AbortError') {
                reportWarning('[DonorProof] Share failed', { component: 'donor_proof', action: 'share', error: err instanceof Error ? err.message : String(err) });
                // W13-001 FIX: Show user-facing error on share failure.
                showToast(t('proof_share_failed', 'Failed to share. Please try again.'));
            }
        }
    });
}

// ─── Verify Button Handler (PLT-G002) ───────────────────────────────────────
function initVerifyButton(): void {
    if (!verifyBtn) { return; }
    verifyBtn.addEventListener('click', () => {
        const hashEl = document.getElementById('proof-tx-hash');
        const fullHash = hashEl?.dataset.fullHash;
        if (fullHash) {
            // Open blockchain explorer in new tab
            window.open(`https://etherscan.io/tx/${fullHash}`, '_blank', 'noopener,noreferrer');
        } else {
            // No hash available yet — visual feedback
            verifyBtn.textContent = t('proof_no_hash', 'Pending…');
            setTimeout(() => { verifyBtn.textContent = t('verify_btn', 'Verify'); }, 2000);
        }
    });
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

        // FIX-003: Infinite Skeleton Resolution.
        // Previous: "skeleton loaders remain (graceful degradation)" — infinite loading
        // with no timeout is NOT graceful. It's a silent dead end.
        // Now: Explicit empty state replaces skeletons so the user knows no proof exists.
        // Standard: Nielsen #1 (System Status Visibility), Material Design 3 (Empty States).
        renderEmptyProofState();
    } catch (err) {
        reportError(err instanceof Error ? err : new Error('[DonorProof] Failed to load proof data'), { component: 'donor_proof', action: 'load_proof' });
        // W13-001 FIX: Show error in proof container instead of leaving skeleton.
        // W14-001 FIX: Replaced inline onclick with addEventListener for CSP compliance.
        const container = document.getElementById('proof-content');
        if (container) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400 dark:text-slate-500">
                <i class="ph ph-warning-circle nm-icon-32" aria-hidden="true"></i>
                <p class="mt-2 text-sm font-medium">${esc(t('proof_load_error', 'Failed to load proof data'))}</p>
                <button type="button" id="proof-retry-btn" class="mt-3 px-4 py-2 bg-trust-blue text-white text-xs font-bold rounded-lg hover:bg-trust-blue/90 transition-colors">${esc(t('common_retry', 'Try Again'))}</button>
            </div>`;
            document.getElementById('proof-retry-btn')?.addEventListener('click', () => { location.reload(); });
        }
    }
}

// ─── Initialize ─────────────────────────────────────────────────────────────
function init(): void {
    // W6-002 FIX: Guard all protected content behind auth check.
    if (!requireAuth()) { return; }
    initBreadcrumb(); // GAP-007: Breadcrumb navigation
    initShareButton(); // PLT-G003: Web Share API
    initVerifyButton(); // PLT-G002: Blockchain explorer redirect
    loadProof();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

