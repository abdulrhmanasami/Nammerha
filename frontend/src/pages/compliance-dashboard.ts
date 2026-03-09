import '../styles/main.css';

/* ─── Compliance Dashboard — OCDS Audit & Financial Transparency Engine ─── */

const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    initTimestamp();
    loadKPIs();
    loadComplianceMetrics();
    loadEscrowReviewQueue();
});

/* ─── Live Timestamp ─── */
function initTimestamp(): void {
    const el = document.getElementById('live-timestamp');
    if (!el) { return; }

    const update = (): void => {
        const now = new Date();
        const lang = document.documentElement.lang || 'en';
        const locale = lang === 'ar' ? 'ar-SY' : lang === 'tr' ? 'tr-TR' : 'en-US';
        el.textContent = now.toLocaleString(locale, {
            weekday: 'short', month: 'short', day: 'numeric',
            year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };
    update();
    setInterval(update, 1000);
}

/* ─── Load KPIs from API ─── */
async function loadKPIs(): Promise<void> {
    try {
        const res = await fetch(`${API_BASE}/dashboard/compliance/stats`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        if (!res.ok) { return; }
        const data = await res.json() as Record<string, number>;

        setKPI('total-audited', data['total_audited'] ?? 0, '$');
        setKPI('pending-reviews', data['pending_reviews'] ?? 0);
        setKPI('approved-releases', data['approved_releases'] ?? 0);
        setKPI('flagged-issues', data['flagged_issues'] ?? 0);

        // Badge count
        const reviewCount = document.getElementById('review-count');
        if (reviewCount) { reviewCount.textContent = String(data['pending_reviews'] ?? 0); }
    } catch (err) {
        console.warn('[Compliance] KPI load failed, showing defaults:', err);
    }
}

/* ─── Load OCDS Compliance Metrics ─── */
async function loadComplianceMetrics(): Promise<void> {
    try {
        const res = await fetch(`${API_BASE}/compliance/metrics`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        if (!res.ok) { return; }
        const data = await res.json() as Record<string, number | string>;

        // OCDS compliance bar
        const ocdsBar = document.getElementById('ocds-bar');
        const ocdsPercent = document.getElementById('ocds-percent');
        const complianceRate = Number(data['ocds_compliance_rate'] ?? 0);
        if (ocdsBar) { ocdsBar.style.width = `${complianceRate}%`; }
        if (ocdsPercent) { ocdsPercent.textContent = `${complianceRate}%`; }

        // Audit trail integrity
        const auditIntegrity = document.getElementById('audit-integrity');
        if (auditIntegrity) {
            auditIntegrity.textContent = String(data['audit_integrity'] ?? '✓ Intact');
        }

        // Spatial accuracy
        const spatialAccuracy = document.getElementById('spatial-accuracy');
        if (spatialAccuracy) {
            spatialAccuracy.textContent = `${data['spatial_accuracy'] ?? 0}%`;
        }
    } catch (err) {
        console.warn('[Compliance] Metrics load failed, keeping dashes:', err);
    }
}

/* ─── Load Escrow Review Queue ─── */
async function loadEscrowReviewQueue(): Promise<void> {
    const tbody = document.getElementById('escrow-review-body');
    if (!tbody) { return; }

    try {
        const res = await fetch(`${API_BASE}/compliance/escrow-reviews`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
        const reviews = await res.json() as Array<Record<string, string | number>>;

        if (reviews.length === 0) {
            tbody.innerHTML = `<tr class="border-t border-slate-100">
                <td colspan="7" class="px-5 py-8 text-center text-slate-400">
                    <i class="ph ph-check-circle" style="font-size:24px" aria-hidden="true"></i>
                    <p class="mt-2 text-xs">All escrow releases reviewed</p>
                </td>
            </tr>`;
            return;
        }

        tbody.innerHTML = reviews.map((r) => `
            <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-5 py-3 font-mono text-xs">${esc(String(r['reference'] ?? ''))}</td>
                <td class="px-5 py-3 font-medium">${esc(String(r['project_title'] ?? ''))}</td>
                <td class="px-5 py-3 font-mono">$${Number(r['amount'] ?? 0).toLocaleString()}</td>
                <td class="px-5 py-3 text-slate-500">${esc(String(r['donor_name'] ?? 'Anonymous'))}</td>
                <td class="px-5 py-3">
                    ${r['has_spatial_proof']
                ? '<span class="text-[10px] font-bold text-smoky-jade bg-smoky-jade/10 px-2 py-0.5 rounded-full">Verified</span>'
                : '<span class="text-[10px] font-bold text-warning-yellow bg-warning-yellow/10 px-2 py-0.5 rounded-full">Pending</span>'}
                </td>
                <td class="px-5 py-3 text-slate-500 text-xs">${esc(String(r['submitted_at'] ?? '—'))}</td>
                <td class="px-5 py-3 flex gap-2">
                    <button class="text-xs font-semibold text-smoky-jade hover:underline" data-action="approve" data-ref="${esc(String(r['reference'] ?? ''))}">Approve</button>
                    <button class="text-xs font-semibold text-danger-red hover:underline" data-action="flag" data-ref="${esc(String(r['reference'] ?? ''))}">Flag</button>
                </td>
            </tr>
        `).join('');

        // Attach action handlers
        tbody.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => handleReviewAction(
                btn.dataset['action'] as 'approve' | 'flag',
                btn.dataset['ref'] ?? ''
            ));
        });

        applyI18n();
    } catch (err) {
        console.error('[Compliance] Escrow review queue load failed:', err);
    }
}

/* ─── Review Action Handler ─── */
async function handleReviewAction(action: 'approve' | 'flag', reference: string): Promise<void> {
    try {
        const endpoint = action === 'approve'
            ? `${API_BASE}/compliance/escrow-reviews/${reference}/approve`
            : `${API_BASE}/compliance/escrow-reviews/${reference}/flag`;

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
            },
        });

        if (res.ok) {
            // Refresh the queue
            await loadEscrowReviewQueue();
            await loadKPIs();
        }
    } catch (err) {
        console.error('[Compliance] Review action failed:', err);
    }
}

/* ─── Utilities ─── */
function setKPI(name: string, value: number, prefix = ''): void {
    const el = document.querySelector<HTMLElement>(`[data-kpi="${name}"]`);
    if (!el) { return; }

    const duration = 1200;
    const start = performance.now();
    const tick = (now: number): void => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(value * eased);
        el.textContent = prefix === '$'
            ? `$${current.toLocaleString()}`
            : current.toLocaleString();
        if (progress < 1) { requestAnimationFrame(tick); }
    };
    requestAnimationFrame(tick);
}

function esc(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getToken(): string {
    return localStorage.getItem('nammerha_token') ?? '';
}

function applyI18n(): void {
    if (typeof (window as Record<string, unknown>)['applyI18n'] === 'function') {
        ((window as Record<string, unknown>)['applyI18n'] as () => void)();
    }
}
