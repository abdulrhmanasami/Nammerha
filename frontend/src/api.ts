// ============================================================================
// Nammerha Frontend — API Client
// Typed fetch wrapper for all backend endpoints
// ============================================================================

import { reportError } from './error-reporter';

const API_BASE = '/api';

// ─── P1-NEW-002 FIX: CSRF Token Management ─────────────────────────────────
// The backend has a complete double-submit cookie CSRF implementation.
// JWT Bearer tokens are inherently CSRF-safe (not auto-attached like cookies),
// so the CSRF middleware correctly short-circuits for Bearer requests.
// This utility provides defense-in-depth for any future cookie-based auth flows.
async function ensureCsrfToken(): Promise<string | null> {
    // Check if a CSRF token cookie already exists
    const existing = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/)?.[1];
    if (existing) {
        return existing;
    }

    // Fetch a new CSRF token from the backend
    try {
        const res = await fetch(`${API_BASE}/csrf-token`, { credentials: 'same-origin' });
        if (!res.ok) {
            return null;
        }
        const data = await res.json() as { csrfToken?: string };
        return data.csrfToken ?? null;
    } catch {
        // CSRF fetch failure is non-fatal — Bearer auth still works
        return null;
    }
}

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
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> ?? {}),
    };

    // V1-AUDIT FIX: JWT is now in an httpOnly cookie — no localStorage access.
    // The browser sends the cookie automatically with credentials: 'same-origin'.
    // CSRF protection is required for all state-changing (non-GET) requests.
    const method = options.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        const csrfToken = await ensureCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }
    }

    // P3-NEW-001 FIX: Guard dev header with Vite env check.
    // import.meta.env.DEV is tree-shaken in production builds,
    // eliminating unnecessary localStorage probing and header pollution.
    if (import.meta.env.DEV) {
        const devUserId = localStorage.getItem('nammerha_dev_user_id');
        if (devUserId) {
            headers['X-User-Id'] = devUserId;
        }
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
            credentials: 'same-origin', // V1-AUDIT: Send httpOnly cookie
        });

        clearTimeout(timeoutId);

        const body = await res.json() as ApiResponse<T>;

        if (!res.ok) {
            throw new Error(body.error ?? `Request failed: ${res.status}`);
        }

        return body;
    } catch (err) {
        clearTimeout(timeoutId);

        // PLT-FE-002 FIX: Route ALL API failures through centralized error reporter.
        // This ensures every timeout, network error, and server error across all portals
        // is captured in backend telemetry — not just uncaught global errors.
        const reportedError = err instanceof DOMException && err.name === 'AbortError'
            ? new Error(`API Timeout: ${endpoint}`)
            : err instanceof Error ? err : new Error('Network error');

        reportError(reportedError, { endpoint, method: options?.method ?? 'GET' });

        if (err instanceof DOMException && err.name === 'AbortError') {
            throw new Error('Request timed out — please check your network connection and try again.');
        }
        if (err instanceof Error) { throw err; }
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
        if (params?.damage_type) {qs.set('damage_type', params.damage_type);}
        if (params?.sort_by) {qs.set('sort_by', params.sort_by);}
        if (params?.limit) {qs.set('limit', String(params.limit));}
        if (params?.offset) {qs.set('offset', String(params.offset));}
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

    // PLT-MAR11-004 FIX: Centralized forgotPassword — replaces raw fetch in auth.ts
    forgotPassword: (data: { email: string }) =>
        request('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // PLT-MAR11-006 FIX: Centralized verifyEmail — replaces raw fetch in verify-email.ts
    verifyEmail: (token: string) =>
        request(`/auth/verify-email/${encodeURIComponent(token)}`),

    // PLT-MAR11-006 FIX: Centralized resetPassword — replaces raw fetch in reset-password.ts
    resetPassword: (data: { token: string; new_password: string }) =>
        request('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Resend verification email (requires auth)
    resendVerification: () =>
        request('/auth/resend-verification', { method: 'POST' }),
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
                if (v !== undefined) {qs.set(k, String(v));}
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
        if (params?.limit) {qs.set('limit', String(params.limit));}
        if (params?.offset) {qs.set('offset', String(params.offset));}
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
        if (params?.severity) { qs.set('severity', params.severity); }
        if (params?.limit) { qs.set('limit', String(params.limit)); }
        const query = qs.toString();
        return request(`/compliance/security-events${query ? `?${query}` : ''}`);
    },

    // PLT-RE-002 FIX: Dashboard-specific endpoints for compliance-dashboard.ts
    getDashboardStats: () =>
        request('/dashboard/compliance/stats'),

    getMetrics: () =>
        request('/compliance/metrics'),

    getEscrowReviews: () =>
        request('/compliance/escrow-reviews'),

    approveReview: (reference: string) =>
        request(`/compliance/escrow-reviews/${reference}/approve`, { method: 'POST' }),

    flagReview: (reference: string) =>
        request(`/compliance/escrow-reviews/${reference}/flag`, { method: 'POST' }),
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

// ─── P2-NEW-002 FIX: Supplier Portal (الموردين) ─────────────────────────────
// Typed wrappers for all supplier endpoints — mirrors supplier.routes.ts exactly.

interface CatalogItem {
    catalog_item_id: string;
    supplier_id: string;
    material_name: string;
    material_category: string;
    unit: string;
    unit_price_guide: number;
    lead_time_days: number | null;
    minimum_order: number | null;
    is_active: boolean;
    created_at: string;
}

interface PurchaseOrder {
    order_id: string;
    project_id: string;
    project_title: string;
    material_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    status: string;
    created_at: string;
}

// ─── PLT-FE-001 FIX: Donor Portal (المانحين / المتبرعين) ─────────────────────
// Typed wrappers for all donor endpoints — mirrors donor.routes.ts exactly.

interface DonorStats {
    total_donated: number;
    projects_supported: number;
    items_funded: number;
    escrow_locked: number;
    escrow_released: number;
    impact_score: number;
}

interface DonorDonation {
    escrow_id: string;
    project_title: string;
    material_name: string;
    amount_locked: number;
    status: string;
    locked_at: string;
}

interface DonorFundedProject {
    project_id: string;
    title: string;
    damage_type: string;
    region: string | null;
    status: string;
    my_total_donated: number;
    funded_percentage: number;
    items_i_funded: number;
}

interface DonorMarketProject {
    project_id: string;
    title: string;
    damage_type: string;
    region: string | null;
    total_cost: number;
    total_funded: number;
    funded_percentage: number;
    items_count: number;
}

interface DonorProof {
    proof_id: string;
    project_title: string;
    material_name: string;
    photo_url: string | null;
    gps_lat: number | null;
    gps_lng: number | null;
    verified_by: string | null;
    verified_at: string | null;
    description: string | null;
}

export const donor = {
    /** GET /api/donor/stats — Dashboard KPIs */
    getStats: () =>
        request<DonorStats>('/donor/stats'),

    /** GET /api/donor/donations — Full donation history */
    getDonations: (limit?: number) => {
        const qs = limit ? `?limit=${limit}` : '';
        return request<DonorDonation[]>(`/donor/donations${qs}`);
    },

    /** GET /api/donor/impact — Projects I funded */
    getImpact: () =>
        request<DonorFundedProject[]>('/donor/impact'),

    /** GET /api/donor/marketplace — Browse projects for funding */
    getMarketplace: () =>
        request<DonorMarketProject[]>('/donor/marketplace'),

    /** GET /api/donor/projects/:id/funding — My contributions to a project */
    getProjectFunding: (projectId: string) =>
        request(`/donor/projects/${projectId}/funding`),

    /** GET /api/donor/proofs — GPS proof gallery */
    getProofs: () =>
        request<DonorProof[]>('/donor/proofs'),
};

// ─── Supplier Portal (الموردين) ─────────────────────────────────────────────

interface SupplierStats {
    active_catalog_items: number;
    total_orders: number;
    pending_orders: number;
    total_revenue: number;
}

export const supplier = {
    /** POST /api/supplier/catalog — Add material to catalog */
    addCatalogItem: (data: {
        material_name: string;
        material_category: string;
        unit: string;
        unit_price_guide: number;
        lead_time_days?: number;
        minimum_order?: number;
    }) => request<CatalogItem>('/supplier/catalog', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    /** GET /api/supplier/catalog — View my catalog */
    getCatalog: () =>
        request<CatalogItem[]>('/supplier/catalog'),

    /** PATCH /api/supplier/catalog/:id — Update catalog item */
    updateCatalogItem: (itemId: string, data: {
        material_name?: string;
        material_category?: string;
        unit?: string;
        unit_price_guide?: number;
        lead_time_days?: number;
        minimum_order?: number;
    }) => request<CatalogItem>(`/supplier/catalog/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),

    /** DELETE /api/supplier/catalog/:id — Deactivate catalog item */
    deactivateItem: (itemId: string) =>
        request(`/supplier/catalog/${itemId}`, { method: 'DELETE' }),

    /** GET /api/supplier/orders — My purchase orders */
    getOrders: (status?: string) => {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        return request<PurchaseOrder[]>(`/supplier/orders${qs}`);
    },

    /** PATCH /api/supplier/orders/:id/status — Update PO status */
    updateOrderStatus: (orderId: string, status: 'acknowledged' | 'shipped' | 'delivered') =>
        request<PurchaseOrder>(`/supplier/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        }),

    /** GET /api/supplier/stats — Dashboard KPIs */
    getStats: () =>
        request<SupplierStats>('/supplier/stats'),
};

// ─── P2-NEW-002 FIX: Engineer Portal (المهندسين) ────────────────────────────
// Typed wrappers for all engineer endpoints — mirrors engineer.routes.ts exactly.

interface EngineerProject {
    project_id: string;
    title: string;
    status: string;
    damage_type: string;
    homeowner_name: string;
    created_at: string;
}

interface EngineerProfile {
    full_name: string;
    specialty: string | null;
    years_experience: number | null;
    score: number;
    completed_projects: number;
    average_rating: number | null;
}

interface EngineerBid {
    bid_id: string;
    project_title: string;
    proposed_cost: number;
    estimated_days: number;
    status: string;
    created_at: string;
}

interface EngineerStats {
    assigned_projects: number;
    completed_projects: number;
    active_bids: number;
    average_score: number;
}

export const engineer = {
    /** GET /api/engineer/projects — My assigned projects */
    getProjects: (status?: string) => {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        return request<EngineerProject[]>(`/engineer/projects${qs}`);
    },

    /** GET /api/engineer/stats — Dashboard KPIs */
    getStats: () =>
        request<EngineerStats>('/engineer/stats'),

    /** GET /api/engineer/bids — My bid history */
    getBids: (status?: string) => {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        return request<EngineerBid[]>(`/engineer/bids${qs}`);
    },

    /** GET /api/engineer/profile — My score + performance */
    getProfile: () =>
        request<EngineerProfile>('/engineer/profile'),

    /** GET /api/engineer/captures — My recent captures */
    getCaptures: (limit?: number) => {
        const qs = limit ? `?limit=${limit}` : '';
        return request(`/engineer/captures${qs}`);
    },

    /** POST /api/engineer/camera/capture — Submit reality capture */
    submitCapture: (data: {
        project_id: string;
        file_url: string;
        construction_phase: string;
        capture_type?: string;
        title?: string;
        description?: string;
        thumbnail_url?: string;
        gps_lat?: number;
        gps_lng?: number;
        gps_accuracy_meters?: number;
    }) => request('/engineer/camera/capture', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    /** POST /api/engineer/camera/spatial-proof — Submit GPS spatial proof */
    submitSpatialProof: (data: {
        item_id: string;
        project_id: string;
        image_url: string;
        gps_lat: number;
        gps_lng: number;
        gps_accuracy_meters?: number;
        description?: string;
    }) => request('/engineer/camera/spatial-proof', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
};

// ─── P2-NEW-002 FIX: Contractor Portal (المقاولين) ──────────────────────────
// Typed wrappers for all contractor endpoints — mirrors contractor.routes.ts.

interface ContractorProject {
    project_id: string;
    title: string;
    status: string;
    damage_type: string;
    homeowner_name: string;
    created_at: string;
}

interface ContractorBid {
    bid_id: string;
    project_title: string;
    proposed_cost: number;
    estimated_days: number;
    status: string;
    created_at: string;
}

interface ContractorProfile {
    full_name: string;
    specialty: string | null;
    years_experience: number | null;
    score: number;
    completed_projects: number;
    average_rating: number | null;
}

interface ContractorStats {
    assigned_projects: number;
    completed_projects: number;
    active_bids: number;
    total_earnings: number;
}

interface ContractorPayment {
    payment_id: string;
    project_title: string;
    amount: number;
    status: string;
    released_at: string | null;
}

export const contractor = {
    /** GET /api/contractor/projects — My assigned projects */
    getProjects: (status?: string) => {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        return request<ContractorProject[]>(`/contractor/projects${qs}`);
    },

    /** GET /api/contractor/stats — Dashboard KPIs */
    getStats: () =>
        request<ContractorStats>('/contractor/stats'),

    /** GET /api/contractor/bids — My bid history */
    getBids: (status?: string) => {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        return request<ContractorBid[]>(`/contractor/bids${qs}`);
    },

    /** GET /api/contractor/marketplace — Available projects for bidding */
    getMarketplace: () =>
        request<ContractorProject[]>('/contractor/marketplace'),

    /** GET /api/contractor/profile — My score + performance */
    getProfile: () =>
        request<ContractorProfile>('/contractor/profile'),

    /** GET /api/contractor/payments — My escrow payments */
    getPayments: () =>
        request<ContractorPayment[]>('/contractor/payments'),

    /** POST /api/contractor/bids — Submit a competitive bid */
    submitBid: (data: {
        project_id: string;
        proposed_cost: number;
        estimated_days: number;
        cover_letter?: string;
        methodology?: string;
    }) => request('/contractor/bids', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
};

// ─── P2-NEW-002 FIX: Homeowner Portal (أصحاب المنازل / المتضررين) ────────────
// Typed wrappers for all homeowner endpoints — mirrors homeowner.routes.ts.

interface HomeownerProject {
    project_id: string;
    title: string;
    status: string;
    damage_type: string;
    damage_severity: string;
    funded_percentage: number;
    created_at: string;
}

interface HomeownerStats {
    total_projects: number;
    active_projects: number;
    total_funded: number;
    pending_approvals: number;
}

interface HomeownerServiceRequest {
    request_id: string;
    trade_needed: string;
    title: string;
    description: string | null;
    urgency: string;
    status: string;
    created_at: string;
}

interface HomeownerApproval {
    approval_id: string;
    project_title: string;
    title: string;
    description: string | null;
    status: string;
    created_at: string;
}

interface HomeownerEscrowSummary {
    total_escrowed: number;
    total_released: number;
    pending_release: number;
}

export const homeowner = {
    /** GET /api/homeowner/projects — My projects */
    getProjects: () =>
        request<HomeownerProject[]>('/homeowner/projects'),

    /** GET /api/homeowner/stats — Dashboard KPIs */
    getStats: () =>
        request<HomeownerStats>('/homeowner/stats'),

    /** GET /api/homeowner/projects/:id/bids — Bid comparison */
    getProjectBids: (projectId: string) =>
        request(`/homeowner/projects/${projectId}/bids`),

    /** POST /api/homeowner/service-requests — Create Thumbtack request */
    createServiceRequest: (data: {
        trade_needed: string;
        title: string;
        description?: string;
        address_text?: string;
        urgency?: 'low' | 'medium' | 'high' | 'emergency';
        budget_min?: number;
        budget_max?: number;
    }) => request<HomeownerServiceRequest>('/homeowner/service-requests', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    /** GET /api/homeowner/service-requests — My service requests */
    getServiceRequests: () =>
        request<HomeownerServiceRequest[]>('/homeowner/service-requests'),

    /** POST /api/homeowner/service-requests/:id/cancel — Cancel request */
    cancelServiceRequest: (requestId: string) =>
        request(`/homeowner/service-requests/${requestId}/cancel`, { method: 'POST' }),

    /** GET /api/homeowner/approvals — Pending approvals */
    getApprovals: (status?: string) => {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        return request<HomeownerApproval[]>(`/homeowner/approvals${qs}`);
    },

    /** GET /api/homeowner/escrow — Escrow summary */
    getEscrow: () =>
        request<HomeownerEscrowSummary>('/homeowner/escrow'),

    /** PATCH /api/dashboard/approvals/:id — Approve or reject an approval */
    respondToApproval: (approvalId: string, decision: 'approved' | 'rejected') =>
        request(`/dashboard/approvals/${approvalId}`, {
            method: 'PATCH',
            body: JSON.stringify({ decision }),
        }),
};
