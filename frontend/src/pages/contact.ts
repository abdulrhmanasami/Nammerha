import '../styles/main.css';
import { initPullToRefresh } from '../utils/pull-refresh';
initPullToRefresh();
import { contact } from '../api';
import { escapeHtml } from '../utils/xss';
import { t } from '../utils/i18n';

// ============================================================================
// Nammerha — Contact Page Engine
// PLT-2026-MAR12-003 FIX: Wires the contact form to POST /api/contact.
// SEC-003 FIX: Migrated from raw fetch() to centralized api.ts — gains CSRF,
//              AbortController timeout, and unified error reporting.
// I18N-002 FIX: All user-facing strings wrapped with i18n t().
// FIX-004: i18n interface now from shared utils/i18n.ts
// P1-002 FIX: escapeHtml on showResult message (XSS prevention)
// ============================================================================

// ─── DOM ────────────────────────────────────────────────────────────────────
const form = document.getElementById('contact-form') as HTMLFormElement | null;
const submitBtn = document.getElementById('contact-submit') as HTMLButtonElement | null;
const resultBox = document.getElementById('contact-result') as HTMLElement | null;

form?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    if (!form || !submitBtn) { return; }

    // Gather form values
    const formData = new FormData(form);
    const name = (formData.get('name') as string ?? '').trim();
    const email = (formData.get('email') as string ?? '').trim();
    const subject = (formData.get('subject') as string ?? '').trim();
    const message = (formData.get('message') as string ?? '').trim();
    const category = (formData.get('category') as string ?? 'general');

    // Client-side validation
    if (!name || !email || !subject || !message) {
        showResult('error', t('contact_fill_required', 'Please fill in all required fields.'));
        return;
    }

    // Set loading state
    submitBtn.disabled = true;
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = `<i class="ph ph-spinner-gap ph-spin" aria-hidden="true"></i> ${t('contact_sending', 'Sending...')}`;

    try {
        // SEC-003 FIX: Uses centralized API client.
        // Gains: CSRF token auto-attachment, 30s AbortController timeout,
        // centralized error reporting via reportError().
        const data = await contact.submit({ name, email, subject, message, category });

        if (data.success) {
            showResult('success', data.data?.message ?? data.message ?? t('contact_success', 'Your message has been received. We will respond within our published SLA.'));
            form.reset();
        } else {
            showResult('error', data.error ?? t('contact_failed', 'Failed to send message. Please try again.'));
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : t('contact_network_error', 'Network error. Please check your connection and try again.');
        showResult('error', msg);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

function showResult(type: 'success' | 'error', message: string): void {
    if (!resultBox) { return; }
    resultBox.className = type === 'success'
        ? 'mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700'
        : 'mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700';
    // P1-002 FIX: escapeHtml() prevents XSS from API error messages
    resultBox.innerHTML = `
        <div class="flex items-start gap-3">
            <i class="ph ${type === 'success' ? 'ph-check-circle text-emerald-600' : 'ph-warning-circle text-red-600'} shrink-0 text-xl" aria-hidden="true"></i>
            <p>${escapeHtml(message)}</p>
        </div>`;
    // DEF-VIS-003 FIX: Replaced style.display with classList toggle.
    resultBox.classList.remove('hidden');
}
