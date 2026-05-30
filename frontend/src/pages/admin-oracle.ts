import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';
import { showToast } from '../utils/toast';
/* GAP-P3-008 FIX: Wire oracle ticker to live API data.
   Standard: No hardcoded data, API-Driven Rendering. */
import { epaOracle } from '../api';
import { requireAuth } from '../utils/auth-guard';
import { addTrackedTimer } from '../utils/tracked-timers';


/* ─── Pricing Oracle & EPA Engine — Interactive Controller ─── */

document.addEventListener('DOMContentLoaded', () => {
  // BLOCKER-1 FIX: Guard all protected content behind auth check.
  if (!requireAuth()) {
    return;
  }

  loadTickerData();
  initApproveButton();
  initTabSwitching();
});

/* ─── Load Live Ticker Data from API ─── */
async function loadTickerData(): Promise<void> {
  const tickerContainer = document.getElementById('ticker-prices');
  if (!tickerContainer) {
    return;
  }

  try {
    const res = await epaOracle.getPrices();
    const entries = (res.data ?? []) as Array<{
      material_name: string;
      current_price: number;
      unit: string;
      price_change_pct: number;
    }>;

    if (entries.length === 0) {
      tickerContainer.innerHTML = `
                <span class="text-sm text-slate-400 italic dark:text-slate-500">${esc(t('oracle_no_prices', 'لا توجد بيانات أسعار'))}</span>
            `;
      return;
    }

    tickerContainer.innerHTML = entries
      .map((entry) => {
        const isPositive = entry.price_change_pct >= 0;
        const colorClass = isPositive ? 'text-smoky-jade' : 'text-rose-600';
        const icon = isPositive ? 'ph-trend-up' : 'ph-trend-down';
        const sign = isPositive ? '+' : '';
        /* Backend stores prices in cents — convert to dollars for display */
        const displayPrice = (entry.current_price / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        });

        return `
                <div class="flex items-center gap-4 text-sm">
                    <span class="font-medium text-slate-700 dark:text-slate-300">${esc(entry.material_name)}:</span>
                    <span class="font-bold">${displayPrice}/${esc(entry.unit)}</span>
                    <span class="${colorClass} flex items-center font-semibold">
                        <i class="ph ${icon} nm-icon-gap-end" aria-hidden="true"></i>(${sign}${entry.price_change_pct.toFixed(1)}%)
                    </span>
                </div>
            `;
      })
      .join('');

    /* Initialize ticker animation AFTER data is loaded */
    initTickerAnimation();
  } catch {
    tickerContainer.innerHTML = `
            <span class="text-sm text-slate-400 italic dark:text-slate-500">${esc(t('oracle_price_error', 'فشل تحميل الأسعار'))}</span>
        `;
    showToast(t('oracle_price_error', 'فشل تحميل الأسعار'), 'error');
  }
}

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
                ${esc(t('oracle_confirm_prompt', 'هل تريد اعتماد هذا السعر؟'))}
            `;
      // Auto-reset after 5s if not confirmed
      addTrackedTimer(setTimeout(() => {
        if (pendingConfirm) {
          pendingConfirm = false;
          btn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
          btn.classList.add('bg-trust-blue', 'hover:bg-trust-blue/90');
          btn.innerHTML = `
                        <i class="ph ph-seal-check" aria-hidden="true"></i>
                        ${esc(t('oracle_approve_btn', 'اعتماد السعر'))}
                    `;
        }
      }, 5000));
      return;
    }

    // Second click: execute approval
    pendingConfirm = false;
    btn.disabled = true;
    btn.classList.remove(
      'bg-amber-500',
      'hover:bg-amber-600',
      'bg-trust-blue',
      'hover:bg-trust-blue/90',
    );
    btn.classList.add('bg-smoky-jade', 'cursor-not-allowed');
    btn.innerHTML = `
            <i class="ph ph-check-circle" aria-hidden="true"></i>
            ${esc(t('oracle_approved_btn', 'تم الاعتماد'))}
        `;

    /* Update badge */
    const badge = document.querySelector('.badge-primary');
    if (badge) {
      badge.textContent = t('oracle_approved', 'مُعتمد');
      badge.classList.remove('badge-primary');
      badge.classList.add(
        'bg-smoky-jade/10',
        'text-smoky-jade',
        'text-3xs',
        'font-bold',
        'px-2',
        'py-0.5',
        'rounded-full',
        'uppercase',
      );
    }

    showToast(t('oracle_approval_toast', 'تم اعتماد السعر'), 'success');
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
      // TICK-W4-005 FIX: Callback used `t` as parameter name, shadowing
      // the imported i18n `t()` function. Renamed to `tab` for clarity.
      tabs.forEach((otherTab) => {
        otherTab.classList.remove('bg-white', 'shadow-sm');
        otherTab.classList.add('text-slate-500');
      });
      tab.classList.add('bg-white', 'shadow-sm');
      tab.classList.remove('text-slate-500');
    });
  });
}

/* ─── Ticker Price Animation ─── */
function initTickerAnimation(): void {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (prefersReduced.matches) {
    return;
  }

  const priceElements = document.querySelectorAll('#ticker-prices .font-bold');
  if (priceElements.length === 0) {
    return;
  }

  const tickerId = addTrackedTimer(setInterval(() => {
    priceElements.forEach((el) => {
      el.classList.add('transition-transform', 'duration-300');
      el.classList.add('scale-105');
      addTrackedTimer(setTimeout(() => {
        el.classList.remove('scale-105');
      }, 300));
    });
  }, 8000));
  window.addEventListener('pagehide', () => clearInterval(tickerId));
}
