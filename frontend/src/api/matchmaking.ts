// ─── Matchmaking + EPA Oracle ───────────────────────────────────────────────
import { request } from './_client';

export const matchmaking = {
    searchEngineers: (params?: { lat?: number; lng?: number; max_distance_km?: number; specialty?: string; query?: string; min_score?: number; limit?: number }) => {
        const qs = new URLSearchParams();
        if (params) { Object.entries(params).forEach(([k, v]) => { if (v !== undefined) {qs.set(k, String(v));} }); }
        const query = qs.toString();
        return request(`/matchmaking/search${query ? `?${query}` : ''}`);
    },
    matchProject: (projectId: string) => request(`/matchmaking/match/${projectId}`),
    submitBid: (projectId: string, data: { proposed_cost: number; estimated_days: number; cover_letter?: string; methodology?: string }) => request(`/matchmaking/projects/${projectId}/bid`, { method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getProjectBids: (projectId: string) => request(`/matchmaking/projects/${projectId}/bids`),
    acceptBid: (bidId: string) => request(`/matchmaking/bids/${bidId}/accept`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }),
    getScoreBreakdown: (engineerId: string) => request(`/matchmaking/engineers/${engineerId}/score`),
};

export const epaOracle = {
    getPrices: (materialCode?: string) => { const qs = materialCode ? `?material_code=${encodeURIComponent(materialCode)}` : ''; return request(`/oracle/prices${qs}`); },
    upsertPrice: (data: { material_code: string; material_name: string; unit: string; base_price: number; current_price: number }) => request('/oracle/prices', { method: 'POST', body: JSON.stringify(data) }),
    calculateAdjustment: (data: { project_id: string; milestone_id?: string; fidic_params: { a: number; b: number; c: number; d: number; Ln: number; En: number; Mn: number; Lo: number; Eo: number; Mo: number }; original_amount: number }) => request('/oracle/calculate', { method: 'POST', body: JSON.stringify(data) }),
    getHistory: (projectId: string) => request(`/oracle/history/${projectId}`),
};
