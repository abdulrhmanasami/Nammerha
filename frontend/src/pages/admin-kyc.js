import '../styles/main.css';
const APPLICANTS = [
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
const resolvedApplicants = new Map();
document.addEventListener('DOMContentLoaded', () => {
    initRowSelection();
    initDropZone();
    initActionButtons();
});
/* ─── Row Selection ─── */
function initRowSelection() {
    const rows = document.querySelectorAll('.kyc-row');
    rows.forEach((row) => {
        row.addEventListener('click', () => {
            const index = parseInt(row.dataset.index ?? '-1', 10);
            if (index < 0 || index >= APPLICANTS.length) {
                return;
            }
            selectedIndex = index;
            /* Highlight selected */
            rows.forEach((r) => r.classList.remove('bg-trust-blue/5', 'border-l-2', 'border-trust-blue'));
            row.classList.add('bg-trust-blue/5', 'border-l-2', 'border-trust-blue');
            renderDocumentViewer(index);
        });
    });
}
/* ─── Render Document Viewer ─── */
function renderDocumentViewer(index) {
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
        const roleLabel = applicant.role === 'engineer' ? 'Engineer' : 'Supplier';
        subtitle.textContent = `${roleLabel} • Submitted ${applicant.submitted}`;
    }
    /* Render document list */
    if (docList) {
        docList.innerHTML = applicant.documents
            .map((doc) => `
      <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
        <div class="size-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
          <i class="${doc.icon} text-trust-blue" style="font-size:18px" aria-hidden="true"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">${doc.name}</p>
          <p class="text-[10px] text-slate-400">${doc.type} • ${doc.size}</p>
        </div>
        <i class="ph ph-eye text-slate-400 hover:text-trust-blue cursor-pointer transition-colors" style="font-size:16px" aria-hidden="true"></i>
      </div>
    `)
            .join('');
    }
    /* Show/hide action buttons */
    if (actionButtons) {
        const resolved = resolvedApplicants.get(index);
        if (resolved) {
            actionButtons.style.display = 'block';
            const verifyBtn = document.getElementById('verify-btn');
            const rejectBtn = document.getElementById('reject-btn');
            if (resolved === 'verified') {
                if (verifyBtn) {
                    verifyBtn.disabled = true;
                    verifyBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    verifyBtn.innerHTML = '<i class="ph ph-seal-check" style="font-size:18px" aria-hidden="true"></i> ✓ Verified Badge Granted';
                }
                if (rejectBtn) {
                    rejectBtn.disabled = true;
                    rejectBtn.classList.add('opacity-30', 'cursor-not-allowed', 'pointer-events-none');
                }
            }
            else {
                if (rejectBtn) {
                    rejectBtn.disabled = true;
                    rejectBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    rejectBtn.innerHTML = '<i class="ph ph-x-circle" style="font-size:18px" aria-hidden="true"></i> ✗ Rejected — Resubmission Requested';
                }
                if (verifyBtn) {
                    verifyBtn.disabled = true;
                    verifyBtn.classList.add('opacity-30', 'cursor-not-allowed', 'pointer-events-none');
                }
            }
        }
        else {
            actionButtons.style.display = 'block';
            const verifyBtn = document.getElementById('verify-btn');
            const rejectBtn = document.getElementById('reject-btn');
            if (verifyBtn) {
                verifyBtn.disabled = false;
                verifyBtn.classList.remove('opacity-50', 'opacity-30', 'cursor-not-allowed', 'pointer-events-none');
                verifyBtn.innerHTML = '<i class="ph ph-seal-check" style="font-size:18px" aria-hidden="true"></i> Grant Verified Badge';
            }
            if (rejectBtn) {
                rejectBtn.disabled = false;
                rejectBtn.classList.remove('opacity-50', 'opacity-30', 'cursor-not-allowed', 'pointer-events-none');
                rejectBtn.innerHTML = '<i class="ph ph-x-circle" style="font-size:18px" aria-hidden="true"></i> Reject & Request Resubmission';
            }
        }
    }
}
/* ─── Drag & Drop Zone ─── */
function initDropZone() {
    const zone = document.getElementById('drop-zone');
    if (!zone) {
        return;
    }
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('border-trust-blue', 'bg-trust-blue/5');
    });
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('border-trust-blue', 'bg-trust-blue/5');
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('border-trust-blue', 'bg-trust-blue/5');
        showToast('Document uploaded successfully');
    });
}
/* ─── Action Buttons ─── */
function initActionButtons() {
    const verifyBtn = document.getElementById('verify-btn');
    const rejectBtn = document.getElementById('reject-btn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => {
            if (selectedIndex < 0) {
                return;
            }
            const applicant = APPLICANTS[selectedIndex];
            if (!applicant) {
                return;
            }
            const confirmed = confirm(`Grant Verified Badge?\n\n` +
                `Applicant: ${applicant.name}\n` +
                `Role: ${applicant.role === 'engineer' ? 'Engineer' : 'Supplier'}\n` +
                `Documents: ${applicant.documents.length} reviewed\n\n` +
                `This will:\n` +
                `• Activate their account for platform operations\n` +
                `• Display "✓ Verified" badge on their profile\n` +
                `• Allow them to receive project assignments / purchase orders\n` +
                `• Log to immutable audit trail`);
            if (!confirmed) {
                return;
            }
            resolvedApplicants.set(selectedIndex, 'verified');
            updateRowBadge(selectedIndex, 'verified');
            updateStats('verify');
            renderDocumentViewer(selectedIndex);
            showToast(`Verified Badge granted to: ${applicant.name}`);
        });
    }
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
            if (selectedIndex < 0) {
                return;
            }
            const applicant = APPLICANTS[selectedIndex];
            if (!applicant) {
                return;
            }
            const reason = prompt(`Reject Application — ${applicant.name}\n\n` +
                `Enter reason for rejection (e.g., expired license, illegible scan, missing documents):`);
            if (reason === null) {
                return;
            }
            if (reason.trim() === '') {
                alert('A reason is required for rejection.');
                return;
            }
            resolvedApplicants.set(selectedIndex, 'rejected');
            updateRowBadge(selectedIndex, 'rejected');
            updateStats('reject');
            renderDocumentViewer(selectedIndex);
            showToast(`Application rejected: ${applicant.name}. Resubmission requested.`);
        });
    }
}
/* ─── Update Row Badge ─── */
function updateRowBadge(index, status) {
    const row = document.querySelector(`.kyc-row[data-index="${index}"]`);
    if (!row) {
        return;
    }
    const badge = row.querySelector('.rounded-full:last-child');
    if (!badge) {
        return;
    }
    if (status === 'verified') {
        badge.className = 'bg-smoky-jade/10 text-smoky-jade text-[10px] font-bold px-2 py-0.5 rounded-full';
        badge.textContent = '✓ Verified';
    }
    else {
        badge.className = 'bg-rose-50 text-rose-500 text-[10px] font-bold px-2 py-0.5 rounded-full';
        badge.textContent = '✗ Rejected';
    }
}
/* ─── Update Stats ─── */
function updateStats(action) {
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
/* ─── Toast ─── */
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 z-50';
    toast.style.animation = 'slideUp 0.3s ease-out';
    toast.innerHTML = `
    <i class="ph ph-check-circle text-smoky-jade" style="font-size:18px" aria-hidden="true"></i>
    <span class="text-sm font-medium">${message}</span>
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
