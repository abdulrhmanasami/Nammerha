// ============================================================================
// Nammerha Frontend — API Client
// Typed fetch wrapper for all backend endpoints
// ============================================================================

const API_BASE = '/api';

interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const token = localStorage.getItem('nammerha_token');

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> ?? {}),
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

        const body = await res.json() as ApiResponse<T>;

        if (!res.ok) {
            throw new Error(body.error ?? `Request failed: ${res.status}`);
        }

        return body;
    } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error('Network error');
    }
}

// ─── Projects (Path 1) ─────────────────────────────────────────────────────
export const projects = {
    create: (data: {
        title: string;
        damage_type: string;
        description?: string;
        gps_lat: number;
        gps_lng: number;
        address_text?: string;
    }) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),

    assignEngineer: (projectId: string) =>
        request(`/projects/${projectId}/assign-engineer`, { method: 'POST' }),

    addBOQItem: (projectId: string, data: {
        material_name: string;
        material_category?: string;
        unit: string;
        unit_price: number;
        required_quantity: number;
    }) => request(`/projects/${projectId}/boq`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    publish: (projectId: string) =>
        request(`/projects/${projectId}/publish`, { method: 'PATCH' }),

    get: (projectId: string) =>
        request(`/projects/${projectId}`),

    getMyProjects: () =>
        request('/projects/my/list'),
};

// ─── Marketplace (Path 2 — Public) ──────────────────────────────────────────
export const marketplace = {
    getProjects: (params?: { status?: string; limit?: number; offset?: number }) => {
        const qs = new URLSearchParams();
        if (params?.status) qs.set('status', params.status);
        if (params?.limit) qs.set('limit', String(params.limit));
        if (params?.offset) qs.set('offset', String(params.offset));
        const query = qs.toString();
        return request(`/marketplace/projects${query ? `?${query}` : ''}`);
    },

    getProjectBOQ: (projectId: string) =>
        request(`/marketplace/projects/${projectId}/boq`),
};

// ─── Donations (Path 2 — Authenticated) ─────────────────────────────────────
export const donations = {
    create: (data: {
        item_id: string;
        project_id: string;
        amount: number;
        payment_method?: string;
    }) => request('/donations', { method: 'POST', body: JSON.stringify(data) }),

    getMyEscrow: () => request('/donations/escrow/summary'),

    getMyHistory: () => request('/donations/history'),
};

// ─── Spatial Proof (Path 3) ─────────────────────────────────────────────────
export const spatialProof = {
    submit: (data: {
        item_id: string;
        project_id: string;
        image_url: string;
        gps_lat: number;
        gps_lng: number;
        gps_accuracy_meters?: number;
        description?: string;
    }) => request('/spatial-proof', { method: 'POST', body: JSON.stringify(data) }),

    getProjectPOs: (projectId: string) =>
        request(`/spatial-proof/project/${projectId}`),
};

// ─── Admin (Path 4) ─────────────────────────────────────────────────────────
export const admin = {
    getPendingVerifications: () =>
        request('/admin/verifications/pending'),

    releaseEscrow: (data: { proof_id: string; item_id: string }) =>
        request('/admin/escrow/release', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    flagDiscrepancy: (data: { proof_id: string; reason: string }) =>
        request('/admin/escrow/flag', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};

// ─── Notifications (Cross-cutting) ──────────────────────────────────────────
export const notifications = {
    getAll: () => request('/notifications'),
    getUnreadCount: () => request<{ unread_count: number }>('/notifications/unread-count'),
    markAsRead: (id: string) =>
        request(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllAsRead: () =>
        request('/notifications/read-all', { method: 'PATCH' }),
};

// ─── Health Check ───────────────────────────────────────────────────────────
export const health = {
    check: () => fetch('/health').then(r => r.json()),
};
