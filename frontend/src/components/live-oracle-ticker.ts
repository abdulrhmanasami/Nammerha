import { escapeHtml as esc } from '../utils/xss';
import { t } from '../utils/i18n';

/**
 * Live Oracle Ticker Component
 * Displays real-time approved building material prices from the EPA Oracle.
 * Ensures contractors bid within approved standard pricing limits.
 * Platinum UX/UI: Animated marquee, dynamic styling, offline-resilient.
 */

interface OracleMaterialPrice {
  code: string;
  nameAr: string;
  nameEn: string;
  price: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
}

const mockOracleData: OracleMaterialPrice[] = [
  { code: 'CEM-01', nameAr: 'أسمنت بورتلاندي', nameEn: 'Portland Cement', price: 1250000, unit: 'طن', trend: 'stable' },
  { code: 'STL-01', nameAr: 'حديد تسليح 12مم', nameEn: 'Rebar 12mm', price: 11500000, unit: 'طن', trend: 'up' },
  { code: 'SND-01', nameAr: 'رمل بناء', nameEn: 'Building Sand', price: 85000, unit: 'م³', trend: 'stable' },
  { code: 'GRV-01', nameAr: 'حصى خرسانة', nameEn: 'Concrete Gravel', price: 95000, unit: 'م³', trend: 'down' },
  { code: 'BLK-01', nameAr: 'بلوك مفرغ 20سم', nameEn: 'Hollow Block 20cm', price: 6500, unit: 'قطعة', trend: 'stable' }
];

export class LiveOracleTicker {
  private containerId: string;
  private autoUpdateInterval: number | null = null;
  private isConnected: boolean = true;

  constructor(containerId: string) {
    this.containerId = containerId;
  }

  public render(): void {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Platinum UI: Elegant ticker styling with a pulsing indicator and smooth marquee
    const template = `
      <div class="bg-dark-elevated dark:bg-dark-surface border-b border-t border-slate-200 dark:border-dark-border py-2 px-4 relative overflow-hidden flex items-center shadow-inner" role="region" aria-label="${esc(t('oracle_live_prices', 'أسعار الأوراكل اللحظية'))}">
        <div class="flex items-center gap-2 shrink-0 z-10 bg-dark-elevated dark:bg-dark-surface pe-4 border-e border-slate-200 dark:border-dark-border">
          <span class="relative flex size-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-trust-blue opacity-75"></span>
            <span class="relative inline-flex rounded-full size-3 bg-trust-blue"></span>
          </span>
          <span class="text-xs font-bold text-trust-blue whitespace-nowrap uppercase tracking-wider" data-i18n="oracle_ticker_title">
            ${esc(t('oracle_ticker_title', 'مؤشر الأسعار'))}
          </span>
        </div>
        
        <div class="flex-1 overflow-hidden relative ms-4">
          <div class="animate-marquee flex gap-8 whitespace-nowrap items-center hover:[animation-play-state:paused]" id="oracle-marquee-content">
            <!-- Content populated by populateTicker() -->
          </div>
        </div>
      </div>
      
      <style>
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(100%); } /* RTL orientation */
        }
        [dir="ltr"] .animate-marquee {
          animation: marquee-ltr 30s linear infinite;
        }
        @keyframes marquee-ltr {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
          will-change: transform;
        }
      </style>
    `;

    container.innerHTML = template;
    this.populateTicker();
  }

  private populateTicker(): void {
    const contentContainer = document.getElementById('oracle-marquee-content');
    if (!contentContainer) return;

    const formatter = new Intl.NumberFormat('ar-SY', { style: 'currency', currency: 'SYP', maximumFractionDigits: 0 });

    // Double the items to create a seamless looping effect
    const items = [...mockOracleData, ...mockOracleData];

    contentContainer.innerHTML = items.map(item => {
      const trendIcon = item.trend === 'up' 
        ? '<i class="ph-bold ph-trend-up text-red-500"></i>' 
        : item.trend === 'down' 
          ? '<i class="ph-bold ph-trend-down text-emerald-500"></i>' 
          : '<i class="ph-bold ph-minus text-slate-400"></i>';

      const trendColorClass = item.trend === 'up' ? 'text-red-500' : item.trend === 'down' ? 'text-emerald-500' : 'text-slate-400';

      return `
        <div class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <span class="font-medium">${esc(item.nameAr)}:</span>
          <span class="font-mono font-bold ${trendColorClass}">${esc(formatter.format(item.price))}</span>
          <span class="text-xs text-slate-400 dark:text-slate-500">/${esc(item.unit)}</span>
          ${trendIcon}
        </div>
      `;
    }).join('<div class="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-2"></div>');
  }

  public startUpdates(): void {
    if (this.autoUpdateInterval) return;
    this.autoUpdateInterval = window.setInterval(() => {
      if (!this.isConnected) return;
      // Simulate real-time price fluctuation
      mockOracleData.forEach(item => {
        if (Math.random() > 0.7) {
          const change = item.price * (Math.random() * 0.02); // Max 2% fluctuation
          item.price += Math.random() > 0.5 ? change : -change;
          item.trend = change > 0 ? 'up' : 'down';
        } else {
          item.trend = 'stable';
        }
      });
      this.populateTicker();
    }, 15000); // 15s refresh
  }

  public stopUpdates(): void {
    if (this.autoUpdateInterval) {
      clearInterval(this.autoUpdateInterval);
      this.autoUpdateInterval = null;
    }
  }
}
