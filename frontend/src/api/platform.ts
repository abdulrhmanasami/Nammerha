// ─── Dashboard, Reality Capture, Open Data, Compliance, Translation ─────────
import { request } from './_client';

export const dashboard = {
    getOverview: (projectId: string) => request(`/dashboard/${projectId}/overview`),
    getDailyLogs: (projectId: string) => request(`/dashboard/${projectId}/logs`),
    submitLog: (projectId: string, data: { description: string; work_completed?: string; issues_encountered?: string; weather_conditions?: string; workers_on_site?: number; images?: string[] }) => request(`/dashboard/${projectId}/logs`, { method: 'POST', body: JSON.stringify(data) }),
    createApproval: (projectId: string, data: { item_id?: string; title: string; description?: string; material_sample_url?: string; material_options?: unknown[] }) => request(`/dashboard/${projectId}/approvals`, { method: 'POST', body: JSON.stringify(data) }),
    respondToApproval: (approvalId: string, data: { decision: 'approved' | 'rejected'; note?: string }) => request(`/dashboard/approvals/${approvalId}/respond`, { method: 'POST', body: JSON.stringify(data) }),
    // V-004 FIX: Project activity log (audit trail)
    getActivity: (projectId: string, params?: { limit?: number; offset?: number }) => {
        const qs = new URLSearchParams();
        if (params?.limit) { qs.set('limit', String(params.limit)); }
        if (params?.offset) { qs.set('offset', String(params.offset)); }
        const query = qs.toString();
        return request<{ events: Array<{ id: string; action: string; entity_type: string; entity_id: string; actor: string; details: Record<string, unknown> | null; timestamp: string }>; total: number; limit: number; offset: number }>(
            `/dashboard/${projectId}/activity${query ? `?${query}` : ''}`,
            { skipAntiFlicker: true }
        );
    },
};

export const realityCapture = {
    submitCapture: (projectId: string, data: { capture_type?: 'photo_360' | 'video_360' | 'point_cloud' | 'photo_standard'; construction_phase: 'demolition' | 'foundation' | 'structural' | 'plumbing_pre_concrete' | 'electrical_pre_concrete' | 'concrete_pour' | 'masonry' | 'plastering' | 'finishing' | 'final_inspection'; title?: string; description?: string; file_url: string; thumbnail_url?: string; file_size_bytes?: number; camera_model?: string; horizontal_fov?: number; heading?: number; pitch?: number; gps_lat?: number; gps_lng?: number; gps_accuracy_meters?: number; altitude_meters?: number; floor_plan_id?: string }) => request(`/reality-capture/projects/${projectId}/captures`, { method: 'POST', body: JSON.stringify(data) }),
    getCaptures: (projectId: string) => request(`/reality-capture/projects/${projectId}/captures`),
    verifyCapture: (captureId: string, data: { verified: boolean; notes?: string }) => request(`/reality-capture/captures/${captureId}/verify`, { method: 'POST', body: JSON.stringify(data) }),
    getFloorPlans: (projectId: string) => request(`/reality-capture/projects/${projectId}/floor-plans`),
};

export const openData = {
    getProjectListings: (params?: { limit?: number; offset?: number }) => { const qs = new URLSearchParams(); if (params?.limit) {qs.set('limit', String(params.limit));} if (params?.offset) {qs.set('offset', String(params.offset));} const query = qs.toString(); return request(`/open-data/projects${query ? `?${query}` : ''}`); },
    getProjectCard: (projectId: string) => request(`/open-data/projects/${projectId}`),
    getOCDSRelease: (projectId: string) => request(`/open-data/ocds/${projectId}`),
    getStats: () => request('/open-data/stats'),
    exportReport: (projectId: string, format: 'pdf' | 'xlsx') => request(`/open-data/export/${projectId}?format=${format}`),
};

export const compliance = {
    screenSDN: (data: { full_name: string; country?: string }) => request('/compliance/sdn/screen', { method: 'POST', body: JSON.stringify(data) }),
    getExportControls: () => request('/compliance/export-controls'),
    getSecurityEvents: (params?: { severity?: string; limit?: number }) => { const qs = new URLSearchParams(); if (params?.severity) { qs.set('severity', params.severity); } if (params?.limit) { qs.set('limit', String(params.limit)); } const query = qs.toString(); return request(`/compliance/security-events${query ? `?${query}` : ''}`); },
    getDashboardStats: () => request('/dashboard/compliance/stats'),
    getMetrics: () => request('/compliance/metrics'),
    getEscrowReviews: () => request('/compliance/escrow-reviews'),
    approveReview: (reference: string) => request(`/compliance/escrow-reviews/${reference}/approve`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    flagReview: (reference: string) => request(`/compliance/escrow-reviews/${reference}/flag`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }),
};

export const translation = {
    translate: (data: { text: string; source_lang: string; target_lang: string }) => request('/translation/translate', { method: 'POST', body: JSON.stringify(data) }),
    batchTranslate: (data: { items: string[]; source_lang: string; target_lang: string }) => request('/translation/batch', { method: 'POST', body: JSON.stringify(data) }),
    getGlossary: () => request('/translation/glossary'),
    getSupportedLanguages: () => request('/translation/languages'),
};
