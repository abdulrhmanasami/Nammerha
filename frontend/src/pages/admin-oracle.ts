import '../styles/main.css';
import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';
/* INC-P3-001 FIX: Use shared toast utility instead of inline duplicate.
   Standard: DRY, Code Hygiene. */
import { showToast } from '../utils/toast';

/* ─── Pricing Oracle & EPA Engine — Interactive Controller ─── */

document.addEventListener('DOMContentLoaded', () => {
    initApproveButton();
    initTabSwitching();
    initTickerAnimation();
});

/* ─── EPA Adjustment Approval Flow ─── */
function initApproveButton(): void {
    const btn = document.getElementById('approve-btn') as HTMLButtonElement | null;
    if (!btn) {
        return;
    }

    // FIX-04: Click-twice-to-confirm replaces blocking confirm() dialog.
    let pendingConfirm = false;

    btn.addEventListener('click', () => {
        if (!pendingConfirm) {
            // First click: show confirmation state
            pendingConfirm = true;
            btn.classList.remove('bg-trust-blue', 'hover:bg-trust-blue/90');
            btn.classList.add('bg-amber-500', 'hover:bg-amber-600');
            btn.innerHTML = `
                <i class="ph ph-warning" aria-hidden="true"></i>
                ${esc(t('oracle_confirm_prompt', 'Click again to confirm approval'))}
            `;
            // Auto-reset after 5s if not confirmed
            setTimeout(() => {
                if (pendingConfirm) {
                    pendingConfirm = false;
                    btn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
                    btn.classList.add('bg-trust-blue', 'hover:bg-trust-blue/90');
                    btn.innerHTML = `
                        <i class="ph ph-seal-check" aria-hidden="true"></i>
                        ${esc(t('oracle_approve_btn', 'Approve Adjustment'))}
                    `;
                }
            }, 5000);
            return;
        }

        // Second click: execute approval
        pendingConfirm = false;
        btn.disabled = true;
        btn.classList.remove('bg-amber-500', 'hover:bg-amber-600', 'bg-trust-blue', 'hover:bg-trust-blue/90');
        btn.classList.add('bg-smoky-jade', 'cursor-not-allowed');
        btn.innerHTML = `
            <i class="ph ph-check-circle" aria-hidden="true"></i>
            ${esc(t('oracle_approved_btn', 'Adjustment Approved — Contract Updated'))}
        `;

        /* Update badge */
        const badge = document.querySelector('.badge-primary');
        if (badge) {
            badge.textContent = t('oracle_approved', 'Approved');
            badge.classList.remove('badge-primary');
            badge.classList.add('bg-smoky-jade/10', 'text-smoky-jade', 'text-[10px]', 'font-bold', 'px-2', 'py-0.5', 'rounded-full', 'uppercase');
        }

        /* Show notification — INC-P3-001 FIX: Uses shared toast utility */
        showToast(t('oracle_approval_toast', 'EPA adjustment approved. Audit log updated. All stakeholders notified.'), 'success');
    });
}

/* ─── Chart Tab Switching ─── */
function initTabSwitching(): void {
    const tabContainer = document.querySelector('.flex.gap-2.bg-slate-50.p-1.rounded-lg');
    if (!tabContainer) {
        return;
    }

    const tabs = tabContainer.querySelectorAll('button');
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            tabs.forEach((t) => {
                t.classList.remove('bg-white', 'shadow-sm');
                t.classList.add('text-slate-500');
            });
            tab.classList.add('bg-white', 'shadow-sm');
            tab.classList.remove('text-slate-500');
        });
    });
}

/* ─── Ticker Price Animation ─── */
function initTickerAnimation(): void {
    /* FRIC-P3-004 FIX: Respect prefers-reduced-motion.
       Users with vestibular conditions should not see ticker pulse.
       Standard: WCAG 2.3.3 (Animation from Interactions). */
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (prefersReduced.matches) { return; }

    const priceElements = document.querySelectorAll('.ticker-scroll .font-bold');

    /* FRIC-P3-002 FIX: Store interval ID and clear on page unload.
       Prevents ghost interval leaks during SPA-like navigation.
       Standard: Resource Hygiene, Nielsen #7 (Efficiency). */
    const tickerId = setInterval(() => {
        priceElements.forEach((el) => {
            el.classList.add('transition-transform', 'duration-300');
            el.classList.add('scale-105');
            setTimeout(() => {
                el.classList.remove('scale-105');
            }, 300);
        });
    }, 8000);
    window.addEventListener('beforeunload', () => clearInterval(tickerId));
}

/* INC-P3-001: Inline showNotification() removed — using shared showToast() from utils/toast.ts */
