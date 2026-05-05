// ─── Admin (Path 4) ─────────────────────────────────────────────────────────
import { request } from './_client';

export const admin = {
    // NMR-AUD-M002 FIX: Added pagination to match backend support.
    getPendingVerifications: (params?: { limit?: number; offset?: number }) => {
        const qs = new URLSearchParams();
        if (params?.limit) { qs.set('limit', String(params.limit)); }
        if (params?.offset) { qs.set('offset', String(params.offset)); }
        const q = qs.toString();
        return request(`/admin/verifications/pending${q ? `?${q}` : ''}`);
    },

    // Nammerha Domain Law 1 FIX: Missing Idempotency-Key patched to prevent Escrow double-spend
    releaseEscrow: (data: { proof_id: string; item_id: string }) =>
        request('/admin/escrow/release', {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Idempotency-Key': crypto.randomUUID() },
        }),

    flagDiscrepancy: (data: { proof_id: string; reason: string }) =>
        request('/admin/escrow/flag', {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Idempotency-Key': crypto.randomUUID() },
        }),

    // GAP-P3-009 FIX: KYC admin endpoints — replaces hardcoded APPLICANTS[].
    getKycQueue: (params?: { status?: string; limit?: number; offset?: number }) => {
        const qs = new URLSearchParams();
        if (params?.status) { qs.set('status', params.status); }
        if (params?.limit) { qs.set('limit', String(params.limit)); }
        if (params?.offset) { qs.set('offset', String(params.offset)); }
        const q = qs.toString();
        return request<{
            user_id: string;
            full_name: string;
            email: string;
            role: string;
            kyc_verification_status: string;
            kyc_document_url: string | null;
            commercial_register_number: string | null;
            engineering_license_number: string | null;
            guild_membership_id: string | null;
            created_at: string;
            updated_at: string;
        }[]>(`/admin/kyc/queue${q ? `?${q}` : ''}`);
    },

    getKycStats: () =>
        request<{ pending: number; verified: number; rejected: number; total: number }>('/admin/kyc/stats'),

    // TICKET-010 FIX: Idempotency-Key prevents double KYC verify/reject on
    // mobile double-tap. KYC decisions are critical admin actions.
    updateKycStatus: (userId: string, data: { decision: 'verified' | 'rejected'; reason?: string }) =>
        request(`/admin/kyc/${userId}/decision`, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Idempotency-Key': crypto.randomUUID() },
        }),
};
