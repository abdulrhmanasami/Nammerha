// ============================================================================
// Nammerha Frontend — API Client
// Typed fetch wrapper for all backend endpoints
// ============================================================================
const API_BASE = '/api';
async function request(endpoint, options = {}) {
    const token = localStorage.getItem('nammerha_token');
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    // Development fallback: pass user ID header
    const devUserId = localStorage.getItem('nammerha_dev_user_id');
    if (devUserId && !token) {
        headers['X-User-Id'] = devUserId;
    }
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });
        const body = await res.json();
        if (!res.ok) {
            throw new Error(body.error ?? `Request failed: ${res.status}`);
        }
        return body;
    }
    catch (err) {
        if (err instanceof Error)
            throw err;
        throw new Error('Network error');
    }
}
// ─── Projects (Path 1) ─────────────────────────────────────────────────────
export const projects = {
    create: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
    assignEngineer: (projectId) => request(`/projects/${projectId}/assign-engineer`, { method: 'POST' }),
    addBOQItem: (projectId, data) => request(`/projects/${projectId}/boq`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    publish: (projectId) => request(`/projects/${projectId}/publish`, { method: 'PATCH' }),
    get: (projectId) => request(`/projects/${projectId}`),
    getMyProjects: () => request('/projects/my/list'),
};
// ─── Marketplace (Path 2 — Public) ──────────────────────────────────────────
export const marketplace = {
    getProjects: (params) => {
        const qs = new URLSearchParams();
        if (params?.status)
            qs.set('status', params.status);
        if (params?.limit)
            qs.set('limit', String(params.limit));
        if (params?.offset)
            qs.set('offset', String(params.offset));
        const query = qs.toString();
        return request(`/marketplace/projects${query ? `?${query}` : ''}`);
    },
    getProjectBOQ: (projectId) => request(`/marketplace/projects/${projectId}/boq`),
};
// ─── Donations (Path 2 — Authenticated) ─────────────────────────────────────
export const donations = {
    create: (data) => request('/donations', { method: 'POST', body: JSON.stringify(data) }),
    getMyEscrow: () => request('/donations/escrow/summary'),
    getMyHistory: () => request('/donations/history'),
};
// ─── Spatial Proof (Path 3) ─────────────────────────────────────────────────
export const spatialProof = {
    submit: (data) => request('/spatial-proof', { method: 'POST', body: JSON.stringify(data) }),
    getProjectPOs: (projectId) => request(`/spatial-proof/project/${projectId}`),
};
// ─── Admin (Path 4) ─────────────────────────────────────────────────────────
export const admin = {
    getPendingVerifications: () => request('/admin/verifications/pending'),
    releaseEscrow: (data) => request('/admin/escrow/release', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    flagDiscrepancy: (data) => request('/admin/escrow/flag', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
};
// ─── Notifications (Cross-cutting) ──────────────────────────────────────────
export const notifications = {
    getAll: () => request('/notifications'),
    getUnreadCount: () => request('/notifications/unread-count'),
    markAsRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllAsRead: () => request('/notifications/read-all', { method: 'PATCH' }),
};
// ─── Health Check ───────────────────────────────────────────────────────────
export const health = {
    check: () => fetch('/health').then(r => r.json()),
};
