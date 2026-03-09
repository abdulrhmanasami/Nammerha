import '../styles/main.css';

/* ─── Admin Dashboard — Command Center Engine ─── */

document.addEventListener('DOMContentLoaded', () => {
    initTimestamp();
    animateKPIs();
});

/* ─── Live Timestamp ─── */
function initTimestamp(): void {
    const el = document.getElementById('live-timestamp');
    if (!el) {
        return;
    }

    const update = (): void => {
        const now = new Date();
        // P2-004 FIX: Respect active i18n locale instead of hardcoding 'en-US'
        const lang = document.documentElement.lang || 'en';
        const locale = lang === 'ar' ? 'ar-SY' : lang === 'tr' ? 'tr-TR' : 'en-US';
        el.textContent = now.toLocaleString(locale, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    update();
    setInterval(update, 1000);
}

/* ─── KPI Counter Animation ─── */
function animateKPIs(): void {
    const kpiElements = document.querySelectorAll<HTMLElement>('[data-kpi]');

    kpiElements.forEach((el) => {
        const target = parseInt(el.dataset.kpi ?? '0', 10);
        const prefix = el.dataset.prefix ?? '';
        const duration = 1500;
        const startTime = performance.now();

        const tick = (now: number): void => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(target * eased);

            if (prefix === '$') {
                el.textContent = '$' + current.toLocaleString();
            } else {
                el.textContent = current.toLocaleString();
            }

            if (progress < 1) {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    });
}
