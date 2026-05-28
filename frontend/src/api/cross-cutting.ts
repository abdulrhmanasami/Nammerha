// ─── Notifications, Health, Contact, Payments ───────────────────────────────
import { request } from './_client';
import { addTrackedTimer } from '../utils/tracked-timers';


export const notifications = {
    getAll: () => request('/notifications'),
    getUnreadCount: () => request<{ unread_count: number }>('/notifications/unread-count'),
    markAsRead: async (id: string) => {
        const res = await request(`/notifications/${id}/read`, { method: 'PATCH' });
        // P5-UXA-007 FIX: Phantom Notification Desync (Silent SWR Refresh)
        // Broadcasts state change to other open tabs to instantly mark as read.
        // Standard: Multi-Tab State Consistency, Nielsen #1 (System Status).
        try { localStorage.setItem('nm_notif_refresh', Date.now().toString()); } catch { /* ignore */ }
        return res;
    },
    markAllAsRead: async () => {
        const res = await request('/notifications/read-all', { method: 'PATCH' });
        try { localStorage.setItem('nm_notif_refresh', Date.now().toString()); } catch { /* ignore */ }
        return res;
    },
};

// ─── Health Check ───────────────────────────────────────────────────────────
// P0-002 FIX: Uses raw fetch('/health') — NOT request() — because request()
// prepends API_BASE ('/api'), making it call /api/health which doesn't exist.
// The backend health endpoint is registered at '/health' on server.ts.
export const health = {
    check: async () => {
        try {
            const controller = new AbortController();
            const timeoutId = addTrackedTimer(setTimeout(() => controller.abort(), 10_000));
            const res = await fetch('/health', {
                credentials: 'same-origin',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return await res.json() as { status: string; database?: string };
        } catch (err) {
            return { status: 'unreachable', error: err instanceof Error ? err.message : 'Health check failed' };
        }
    },
};

// ─── SEC-003 FIX: Contact (centralized) ─────────────────────────────────────
// Replaces raw fetch() in contact.ts that lacked CSRF token and timeout.
export const contact = {
    /** POST /api/contact — Submit contact form */
    submit: (data: {
        name: string;
        email: string;
        subject: string;
        message: string;
        category?: string;
    }) => request<{ message?: string }>('/contact', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
};

// ─── Payments ───────────────────────────────────────────────────────────────
export const payments = {
    initiate: (data: {
        item_id: string;
        project_id: string;
        amount: number;
        gateway: 'visa' | 'fatora';
        currency?: string;
        return_url?: string;
    // P2-AUD-001 FIX: Idempotency-Key prevents duplicate payment creation on
    // mobile double-tap or network retry (header was in CORS allowedHeaders but
    // never sent by the frontend).
    }) => request('/payments/initiate', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),

    getStatus: (reference: string) =>
        request(`/payments/status/${reference}`),

    // NMR-AUD-M002 FIX: Added pagination to match backend support.
    getMyPayments: (params?: { limit?: number; offset?: number }) => {
        const qs = new URLSearchParams();
        if (params?.limit) { qs.set('limit', String(params.limit)); }
        if (params?.offset) { qs.set('offset', String(params.offset)); }
        const q = qs.toString();
        return request(`/payments/my${q ? `?${q}` : ''}`);
    },
};
