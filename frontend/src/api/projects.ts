// ─── Projects (Path 1) ─────────────────────────────────────────────────────
import { request } from './_client';

export const projects = {
    create: (data: {
        title: string;
        damage_type: 'structural' | 'plumbing' | 'electrical' | 'mixed' | 'general';
        damage_severity?: 'minor' | 'moderate' | 'severe' | 'total_destruction';
        description?: string;
        gps_lat: number;
        gps_lng: number;
        address_text?: string;
        cover_image_url?: string;
        images?: string[]; // P1-FIX-007: Added support for array of uploaded image URLs
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
        // TICKET-011 FIX: Idempotency-Key prevents duplicate BOQ items on
        // degraded-network retry during parallel Promise.allSettled submission.
        headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),

    publish: (projectId: string) =>
        request(`/projects/${projectId}/publish`, { method: 'PATCH' }),

    get: (projectId: string) =>
        request(`/projects/${projectId}`),

    getMyProjects: () =>
        request('/projects/my/list'),
};
