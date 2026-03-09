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

    // MED-AUD-009 FIX: AbortController with 30s timeout to prevent indefinite
    // hangs on degraded Syrian networks. Without this, fetch() blocks forever.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const body = await res.json() as ApiResponse<T>;

        if (!res.ok) {
            throw new Error(body.error ?? `Request failed: ${res.status}`);
        }

        return body;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
            throw new Error('Request timed out — please check your network connection and try again.');
        }
        if (err instanceof Error) throw err;
        throw new Error('Network error');
    }
}

// ─── Projects (Path 1) ─────────────────────────────────────────────────────
export const projects = {
    create: (data: {
        title: string;
        damage_type: 'structural' | 'plumbing' | 'electrical' | 'mixed';
        damage_severity?: 'minor' | 'moderate' | 'severe' | 'total_destruction';
        description?: string;
        gps_lat: number;
        gps_lng: number;
        address_text?: string;
        cover_image_url?: string;
    }) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),

    assignEngineer: (projectId: string) =>
        request(`/projects/${projectId}/assign-engineer`, { method: 'POST' }),

    // P1-001 FIX: Schema now mirrors backend AddBOQItemDTO exactly.
    // preferred_supplier_id is REQUIRED — backend INSERT fails without it.
    addBOQItem: (projectId: string, data: {
        material_name: string;
        material_category?: string;
        description?: string;
        unit: string;
        unit_price: number;              // in cents (BIGINT)
        required_quantity: number;
        image_url?: string;
        preferred_supplier_id: string;   // Required: pre-assigned verified supplier
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
    getProjects: (params?: { damage_type?: string; sort_by?: 'funded_percentage' | 'published_at'; limit?: number; offset?: number }) => {
        const qs = new URLSearchParams();
        if (params?.damage_type) qs.set('damage_type', params.damage_type);
        if (params?.sort_by) qs.set('sort_by', params.sort_by);
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
        items: Array<{ item_id: string; amount: number }>;
        payment_method?: string;
    }) => request('/donations', { method: 'POST', body: JSON.stringify(data) }),

    getMyEscrow: () => request('/donations/my/summary'),

    getMyHistory: () => request('/donations/my/history'),
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
    check: async () => {
        try {
            const res = await fetch('/health');
            return await res.json();
        } catch (err) {
            return { status: 'unreachable', error: err instanceof Error ? err.message : 'Health check failed' };
        }
    },
};

// ─── P2-NEW-002 FIX: Complete API client coverage for all backend routes ────

// ─── Auth ───────────────────────────────────────────────────────────────────
export const auth = {
    register: (data: {
        email: string;
        password: string;
        full_name: string;
        role: 'homeowner' | 'engineer' | 'donor' | 'supplier' | 'contractor' | 'tradesperson';
    }) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

    login: (data: { email: string; password: string }) =>
        request<{ token: string; user: unknown }>('/auth/login', {
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
    }) => request('/payments/initiate', { method: 'POST', body: JSON.stringify(data) }),

    getStatus: (reference: string) =>
        request(`/payments/status/${reference}`),

    getMyPayments: () =>
        request('/payments/my'),
};

// ─── Matchmaking ────────────────────────────────────────────────────────────
export const matchmaking = {
    searchEngineers: (params?: {
        lat?: number;
        lng?: number;
        max_distance_km?: number;
        specialty?: string;
        query?: string;
        min_score?: number;
        limit?: number;
    }) => {
        const qs = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined) qs.set(k, String(v));
            });
        }
        const query = qs.toString();
        return request(`/matchmaking/search${query ? `?${query}` : ''}`);
    },

    matchProject: (projectId: string) =>
        request(`/matchmaking/match/${projectId}`),

    submitBid: (projectId: string, data: {
        proposed_cost: number;
        estimated_days: number;
        cover_letter?: string;
        methodology?: string;
    }) => request(`/matchmaking/projects/${projectId}/bid`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    getProjectBids: (projectId: string) =>
        request(`/matchmaking/projects/${projectId}/bids`),

    acceptBid: (bidId: string) =>
        request(`/matchmaking/bids/${bidId}/accept`, { method: 'POST' }),

    getScoreBreakdown: (engineerId: string) =>
        request(`/matchmaking/engineers/${engineerId}/score`),
};

// ─── EPA Oracle ─────────────────────────────────────────────────────────────
export const epaOracle = {
    getPrices: (materialCode?: string) => {
        const qs = materialCode ? `?material_code=${encodeURIComponent(materialCode)}` : '';
        return request(`/oracle/prices${qs}`);
    },

    upsertPrice: (data: {
        material_code: string;
        material_name: string;
        unit: string;
        base_price: number;
        current_price: number;
    }) => request('/oracle/prices', { method: 'POST', body: JSON.stringify(data) }),

    // P2-006 FIX: Schema now mirrors backend CalculateEPADTO + FIDICParams.
    calculateAdjustment: (data: {
        project_id: string;
        milestone_id?: string;
        fidic_params: {
            a: number; b: number; c: number; d: number;  // coefficients (a+b+c+d=1.0)
            Ln: number; En: number; Mn: number;           // current indices
            Lo: number; Eo: number; Mo: number;           // base indices
        };
        original_amount: number;       // in cents
    }) => request('/oracle/calculate', { method: 'POST', body: JSON.stringify(data) }),

    getHistory: (projectId: string) =>
        request(`/oracle/history/${projectId}`),
};

// ─── Project Dashboard ──────────────────────────────────────────────────────
export const dashboard = {
    getOverview: (projectId: string) =>
        request(`/dashboard/${projectId}/overview`),

    getDailyLogs: (projectId: string) =>
        request(`/dashboard/${projectId}/logs`),

    // P2-006 FIX: Schema now mirrors backend CreateDailyLogDTO.
    submitLog: (projectId: string, data: {
        description: string;
        work_completed?: string;
        issues_encountered?: string;
        weather_conditions?: string;
        workers_on_site?: number;
        images?: string[];
    }) => request(`/dashboard/${projectId}/logs`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    // P2-006 FIX: Schema now mirrors backend CreateApprovalDTO.
    createApproval: (projectId: string, data: {
        item_id?: string;
        title: string;
        description?: string;
        material_sample_url?: string;
        material_options?: unknown[];
    }) => request(`/dashboard/${projectId}/approvals`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    // P2-006 FIX: Parameter name matches backend respondToApproval.
    respondToApproval: (approvalId: string, data: {
        decision: 'approved' | 'rejected';
        note?: string;
    }) => request(`/dashboard/approvals/${approvalId}/respond`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),
};

// ─── Reality Capture ────────────────────────────────────────────────────────
export const realityCapture = {
    // P2-006 FIX: Schema now mirrors backend SubmitCaptureDTO.
    // construction_phase is REQUIRED. Removed phantom floor_level/room_tag.
    submitCapture: (projectId: string, data: {
        capture_type?: 'photo_360' | 'video_360' | 'point_cloud' | 'photo_standard';
        construction_phase: 'demolition' | 'foundation' | 'structural'
        | 'plumbing_pre_concrete' | 'electrical_pre_concrete' | 'concrete_pour'
        | 'masonry' | 'plastering' | 'finishing' | 'final_inspection';
        title?: string;
        description?: string;
        file_url: string;
        thumbnail_url?: string;
        file_size_bytes?: number;
        camera_model?: string;
        horizontal_fov?: number;
        heading?: number;
        pitch?: number;
        gps_lat?: number;
        gps_lng?: number;
        gps_accuracy_meters?: number;
        altitude_meters?: number;
        floor_plan_id?: string;
    }) => request(`/reality-capture/projects/${projectId}/captures`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    getCaptures: (projectId: string) =>
        request(`/reality-capture/projects/${projectId}/captures`),

    verifyCapture: (captureId: string, data: {
        verified: boolean;
        notes?: string;
    }) => request(`/reality-capture/captures/${captureId}/verify`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    getFloorPlans: (projectId: string) =>
        request(`/reality-capture/projects/${projectId}/floor-plans`),
};

// ─── Open Data (Public) ─────────────────────────────────────────────────────
export const openData = {
    getProjectListings: (params?: { limit?: number; offset?: number }) => {
        const qs = new URLSearchParams();
        if (params?.limit) qs.set('limit', String(params.limit));
        if (params?.offset) qs.set('offset', String(params.offset));
        const query = qs.toString();
        return request(`/open-data/projects${query ? `?${query}` : ''}`);
    },

    getProjectCard: (projectId: string) =>
        request(`/open-data/projects/${projectId}`),

    getOCDSRelease: (projectId: string) =>
        request(`/open-data/ocds/${projectId}`),

    getStats: () =>
        request('/open-data/stats'),

    exportReport: (projectId: string, format: 'pdf' | 'xlsx') =>
        request(`/open-data/export/${projectId}?format=${format}`),
};

// ─── Compliance ─────────────────────────────────────────────────────────────
export const compliance = {
    screenSDN: (data: { full_name: string; country?: string }) =>
        request('/compliance/sdn/screen', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    getExportControls: () =>
        request('/compliance/export-controls'),

    getSecurityEvents: (params?: { severity?: string; limit?: number }) => {
        const qs = new URLSearchParams();
        if (params?.severity) qs.set('severity', params.severity);
        if (params?.limit) qs.set('limit', String(params.limit));
        const query = qs.toString();
        return request(`/compliance/security-events${query ? `?${query}` : ''}`);
    },
};

// ─── Translation ────────────────────────────────────────────────────────────
export const translation = {
    translate: (data: {
        text: string;
        source_lang: string;
        target_lang: string;
    }) => request('/translation/translate', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    batchTranslate: (data: {
        items: string[];
        source_lang: string;
        target_lang: string;
    }) => request('/translation/batch', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    getGlossary: () =>
        request('/translation/glossary'),

    getSupportedLanguages: () =>
        request('/translation/languages'),
};

// ─── Tradesperson Portal (أصحاب المهن) ──────────────────────────────────────
// P2-FE-004 FIX: Centralized typed wrappers for all tradesperson endpoints.
// Mirrors backend routes from tradesperson.routes.ts exactly.

interface TradespersonStats {
    active_jobs: number;
    completed_jobs: number;
    pending_requests: number;
    active_assignments: number;
    total_earnings: number;
    average_rating: number | null;
}

interface TradespersonProfile {
    trade: string | null;
    hourly_rate: number | null;
    daily_rate: number | null;
    availability: string;
    years_experience: number | null;
    completed_jobs_count: number;
    average_rating: number | null;
    dynamic_score: number;
    full_name: string;
}

interface ServiceRequest {
    request_id: string;
    homeowner_name: string;
    trade_needed: string;
    title: string;
    description: string | null;
    address_text: string | null;
    urgency: string;
    budget_min: number | null;
    budget_max: number | null;
    created_at: string;
}

interface Assignment {
    assignment_id: string;
    contractor_name: string;
    project_title: string;
    trade_required: string;
    scope_description: string;
    agreed_rate: number;
    rate_type: string;
    estimated_days: number | null;
    status: string;
    created_at: string;
}

interface Earning {
    source_type: string;
    source_id: string;
    title: string;
    amount: number;
    rate_type: string | null;
    completed_at: string | null;
}

export const tradesperson = {
    /** GET /api/tradesperson/profile — My trade profile */
    getProfile: () =>
        request<TradespersonProfile>('/tradesperson/profile'),

    /** GET /api/tradesperson/stats — Dashboard KPIs */
    getStats: () =>
        request<TradespersonStats>('/tradesperson/stats'),

    /** GET /api/tradesperson/requests — Available service requests (Thumbtack mode) */
    getRequests: () =>
        request<ServiceRequest[]>('/tradesperson/requests'),

    /** POST /api/tradesperson/requests/:id/accept — Accept a direct request */
    acceptRequest: (requestId: string) =>
        request(`/tradesperson/requests/${requestId}/accept`, { method: 'POST' }),

    /** GET /api/tradesperson/assignments — Contractor assignments (Subcontractor mode) */
    getAssignments: (status?: string) => {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        return request<Assignment[]>(`/tradesperson/assignments${qs}`);
    },

    /** POST /api/tradesperson/assignments/:id/respond — Accept or decline assignment */
    respondToAssignment: (assignmentId: string, accept: boolean) =>
        request(`/tradesperson/assignments/${assignmentId}/respond`, {
            method: 'POST',
            body: JSON.stringify({ accept }),
        }),

    /** GET /api/tradesperson/earnings — Payment history */
    getEarnings: () =>
        request<Earning[]>('/tradesperson/earnings'),

    /** PATCH /api/tradesperson/availability — Toggle availability status */
    updateAvailability: (status: 'available' | 'busy' | 'offline') =>
        request('/tradesperson/availability', {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        }),
};
