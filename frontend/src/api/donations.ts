// ─── Donations (Path 2 — Authenticated) ─────────────────────────────────────
import { request } from './_client';

export const donations = {
    // NMR-AUD-M003 FIX: Added return_url to match backend CreateDonationDTO.
    create: (data: {
        items: Array<{ item_id: string; amount: number }>;
        // F-001 FIX: Typed to match CreateDonationDTO.payment_method (backend)
        payment_method?: 'visa' | 'fatora';
        /** NMR-AUD-M003: Payment gateway redirect URL (falls back to server default) */
        return_url?: string;
        // F4-3 FIX: ENH-4 gift donation metadata (was missing → features unreachable)
        gift_recipient_name?: string;
        gift_message?: string;
        // F4-3 FIX: ENH-5 Islamic charitable intent (was missing → feature unreachable)
        donation_intent?: 'zakat' | 'sadaqah' | 'general';
    // N-2 FIX: Idempotency-Key is now MANDATORY — prevents duplicate escrow
    // entries on mobile double-tap or degraded-network retry. Matches the
    // pattern already used by payments.initiate().
    }) => request('/donations', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),

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
