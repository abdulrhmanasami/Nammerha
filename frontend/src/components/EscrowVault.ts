import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';

export interface EscrowState {
  depositedAmountCents: number;
  releasedAmountCents: number;
  currency: string;
  projectId: string;
}

/**
 * EscrowVault Component
 * A highly-trusted visual representation of the financial escrow state.
 * Uses psychological trust anchors (Lock icons, Shield icons, precise typography).
 */
export class EscrowVault {
  private container: HTMLElement | null = null;

  constructor(
    private containerId: string,
    private state: EscrowState,
  ) {}

  public render(): void {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {return;}

    const totalStr = this.formatCurrency(this.state.depositedAmountCents);
    const releasedStr = this.formatCurrency(this.state.releasedAmountCents);
    const heldCents = this.state.depositedAmountCents - this.state.releasedAmountCents;
    const heldStr = this.formatCurrency(heldCents);

    // Calculate percentage for progress bar
    const progressPct =
      this.state.depositedAmountCents > 0
        ? (this.state.releasedAmountCents / this.state.depositedAmountCents) * 100
        : 0;

    this.container.innerHTML = `
      <div class="bg-white dark:bg-dark-surface border border-trust-blue/20 rounded-2xl p-6 shadow-sm relative overflow-hidden transition-all duration-300">
        <!-- Background Shield Watermark -->
        <i class="ph ph-shield-check absolute -end-6 -bottom-6 text-[12rem] text-trust-blue/5 pointer-events-none" aria-hidden="true"></i>

        <div class="flex items-center gap-4 mb-6 relative z-10">
          <div class="size-14 rounded-full bg-trust-blue/10 flex items-center justify-center text-trust-blue shrink-0 shadow-inner">
            <i class="ph ph-lock-key text-2xl animate-[pulse_3s_ease-in-out_infinite]" aria-hidden="true"></i>
          </div>
          <div>
            <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">${esc(t('ho_escrow_guarantee', 'ضمان الأمانة'))}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">${esc(t('homeowner_escrow_hint', 'أموالك محفوظة بأمان في الضمان'))}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-6 relative z-10">
          <div class="bg-slate-50 dark:bg-dark-bg rounded-xl p-4 border border-slate-100 dark:border-dark-border/50">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1 dark:text-slate-400">${esc(t('ho_held_in_escrow', 'محتجز في الضمان'))}</span>
            <span class="text-2xl font-bold text-trust-blue font-mono tabular-nums">${esc(heldStr)}</span>
          </div>
          <div class="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-4 border border-emerald-100 dark:border-emerald-900/30">
            <span class="text-xs font-bold text-smoky-jade uppercase tracking-widest block mb-1 dark:text-emerald-400">${esc(t('ho_released', 'تم الإفراج'))}</span>
            <span class="text-2xl font-bold text-smoky-jade font-mono tabular-nums dark:text-emerald-400">${esc(releasedStr)}</span>
          </div>
        </div>

        <!-- Escrow Release Track -->
        <div class="relative z-10 mt-2">
          <div class="flex justify-between text-xs font-bold text-slate-500 mb-2 dark:text-slate-400">
            <span>${esc(t('ho_total_deposited', 'إجمالي المودع'))}</span>
            <span class="font-mono tabular-nums">${esc(totalStr)}</span>
          </div>
          <div class="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden" dir="ltr">
            <div class="h-full bg-gradient-to-r from-trust-blue to-smoky-jade transition-all duration-1000 ease-out" style="width: ${esc(progressPct)}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  private formatCurrency(cents: number): string {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: this.state.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  public updateState(newState: Partial<EscrowState>): void {
    this.state = { ...this.state, ...newState };
    this.render();
  }
}
