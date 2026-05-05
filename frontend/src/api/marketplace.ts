// ─── Marketplace (Path 2 — Public) ──────────────────────────────────────────
import { request } from './_client';

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
