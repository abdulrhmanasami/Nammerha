import '../styles/main.css';

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

    btn.addEventListener('click', () => {
        /* Confirmation dialog */
        const confirmed = confirm(
            'Approve FIDIC 13.8 Price Adjustment?\n\n' +
            'This will:\n' +
            '• Update contract CT-8892 with +4.2% adjustment\n' +
            '• Generate a formal amendment document\n' +
            '• Notify all stakeholders (engineer, homeowner, donors)\n' +
            '• Log to immutable audit trail\n\n' +
            'Total adjusted cost: $130,250.00'
        );

        if (!confirmed) {
            return;
        }

        /* Success state transition */
        btn.disabled = true;
        btn.classList.remove('bg-trust-blue', 'hover:bg-trust-blue/90');
        btn.classList.add('bg-smoky-jade', 'cursor-not-allowed');
        btn.innerHTML = `
      <i class="ph ph-check-circle" aria-hidden="true"></i>
      Adjustment Approved — Contract Updated
    `;

        /* Update badge */
        const badge = document.querySelector('.badge-primary');
        if (badge) {
            badge.textContent = 'Approved';
            badge.classList.remove('badge-primary');
            badge.classList.add('bg-smoky-jade/10', 'text-smoky-jade', 'text-[10px]', 'font-bold', 'px-2', 'py-0.5', 'rounded-full', 'uppercase');
        }

        /* Show notification */
        showNotification('EPA adjustment approved. Audit log updated. All stakeholders notified.');
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
    const priceElements = document.querySelectorAll('.ticker-scroll .font-bold');

    setInterval(() => {
        priceElements.forEach((el) => {
            el.classList.add('transition-transform', 'duration-300');
            el.classList.add('scale-105');
            setTimeout(() => {
                el.classList.remove('scale-105');
            }, 300);
        });
    }, 8000);
}

/* ─── Notification Toast ─── */
function showNotification(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 z-50 animate-slideUp';
    toast.innerHTML = `
    <i class="ph ph-check-circle text-smoky-jade" style="font-size:18px" aria-hidden="true"></i>
    <span class="text-sm font-medium">${message}</span>
  `;

    /* Add animation keyframes if not present */
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .animate-slideUp { animation: slideUp 0.3s ease-out; }
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
